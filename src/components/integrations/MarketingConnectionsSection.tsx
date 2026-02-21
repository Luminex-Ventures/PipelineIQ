import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { listIntegrations, disconnectIntegration, createIntegration, getChannels, startMarketingOAuth } from '../../services/marketing.service';
import { Unplug, RefreshCw, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { MarketingIntegrationProvider } from '../../types/marketing';

type AdProviderKey = MarketingIntegrationProvider;

const AD_PROVIDERS: Array<{
  key: AdProviderKey;
  label: string;
  desc: string;
  available: boolean;
  useManualConnect: boolean;
}> = [
  { key: 'google_ads', label: 'Google Ads', desc: 'Connect your Google Ads account to sync campaigns, spend, and conversions. Required for Google lead attribution.', available: true, useManualConnect: false },
  { key: 'meta_ads', label: 'Meta Ads (Facebook & Instagram)', desc: 'Connect your Meta Business account to sync ad spend and performance. Required for Meta lead attribution.', available: true, useManualConnect: false },
  { key: 'zillow', label: 'Zillow', desc: 'Connect your Zillow Premier Agent or advertising account for lead attribution and spend tracking.', available: true, useManualConnect: true },
  { key: 'realtor_com', label: 'Realtor.com', desc: 'Connect your Realtor.com lead source and advertising for attribution and budget allocation.', available: true, useManualConnect: true },
  { key: 'homes_com', label: 'Homes.com', desc: 'Connect your Homes.com advertising and lead source for spend and attribution.', available: true, useManualConnect: true },
  { key: 'redfin', label: 'Redfin', desc: 'Connect your Redfin partner or advertising account for lead and spend tracking.', available: true, useManualConnect: true },
];

export function MarketingConnectionsSection() {
  const { user, roleInfo } = useAuth();
  const userId = user?.id ?? '';
  const qc = useQueryClient();
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connectProvider, setConnectProvider] = useState<AdProviderKey | null>(null);
  const [connectAccountName, setConnectAccountName] = useState('');
  const [leadSourcePrompt, setLeadSourcePrompt] = useState<{ provider: AdProviderKey; label: string } | null>(null);
  const [leadSourceName, setLeadSourceName] = useState('');
  const [creatingLeadSource, setCreatingLeadSource] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState<AdProviderKey | null>(null);

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['marketing', 'integrations', userId],
    queryFn: () => listIntegrations(userId),
    enabled: !!userId,
  });

  const { data: channels = [] } = useQuery({
    queryKey: ['marketing', 'channels'],
    queryFn: () => getChannels(),
  });

  const disconnectMutation = useMutation({
    mutationFn: (integrationId: string) => disconnectIntegration(userId, integrationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing'] });
      toast.success('Account disconnected');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createMutation = useMutation({
    mutationFn: (params: { provider: MarketingIntegrationProvider; external_account_name?: string | null }) =>
      createIntegration(userId, params),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['marketing'] });
      setConnectProvider(null);
      setConnectAccountName('');
      const label = AD_PROVIDERS.find((p) => p.key === variables.provider)?.label ?? variables.provider;
      toast.success(`${label} connected`);
      const prov = AD_PROVIDERS.find((p) => p.key === variables.provider);
      if (prov?.useManualConnect) {
        setLeadSourcePrompt({ provider: variables.provider, label });
        setLeadSourceName(label);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const integrationsForProvider = (provider: string) =>
    integrations.filter((i) => i.provider === provider);

  const handleConnect = async (key: AdProviderKey, useManualConnect: boolean) => {
    if (useManualConnect) {
      setConnectProvider(key);
      setConnectAccountName('');
      return;
    }
    if (key !== 'google_ads' && key !== 'meta_ads') return;
    setOauthConnecting(key);
    try {
      const { auth_url } = await startMarketingOAuth(key);
      window.location.href = auth_url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start connection');
      setOauthConnecting(null);
    }
  };

  const handleDisconnect = async (integrationId: string) => {
    setDisconnecting(integrationId);
    try {
      await disconnectMutation.mutateAsync(integrationId);
    } finally {
      setDisconnecting(null);
    }
  };

  const handleCreateLeadSource = async () => {
    if (!leadSourcePrompt || !userId || !leadSourceName.trim()) return;
    const channel = channels.find((c) => c.slug === leadSourcePrompt.provider);
    if (!channel) {
      toast.error('Marketing channel not found. Create the lead source from Settings if needed.');
      return;
    }
    setCreatingLeadSource(true);
    try {
      const { data: existing } = await supabase
        .from('lead_sources')
        .select('sort_order')
        .eq('user_id', userId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      const maxSort = (existing?.sort_order ?? 0) + 1;
      const { error } = await supabase.from('lead_sources').insert({
        user_id: userId,
        name: leadSourceName.trim(),
        marketing_channel_id: channel.id,
        sort_order: maxSort,
        brokerage_split_rate: 0.2,
        payout_structure: 'standard',
        team_id: roleInfo?.teamId ?? null,
        workspace_id: roleInfo?.workspaceId ?? null,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['marketing'] });
      qc.invalidateQueries({ queryKey: ['lead_sources'] });
      setLeadSourcePrompt(null);
      setLeadSourceName('');
      toast.success('Lead source created and linked for ROI tracking.');
    } catch (err) {
      console.error('[MarketingConnectionsSection] Create lead source:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create lead source');
    } finally {
      setCreatingLeadSource(false);
    }
  };

  const handleSkipLeadSource = () => {
    setLeadSourcePrompt(null);
    setLeadSourceName('');
  };

  const connectProviderLabel = connectProvider
    ? AD_PROVIDERS.find((p) => p.key === connectProvider)?.label ?? connectProvider
    : '';

  return (
    <section className="space-y-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#1e3a5f] mb-1">Marketing (Growth Engine)</h2>
        <p className="text-sm text-gray-500">
          Connect ad platforms and lead sources. Only connected channels appear in budget allocation and attribution.
        </p>
      </div>
      <div className="space-y-4">
        {AD_PROVIDERS.map(({ key, label, desc, available, useManualConnect }) => {
          const list = integrationsForProvider(key);
          const isConnected = list.length > 0;
          return (
            <div
              key={key}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm"
            >
              <div>
                <p className="text-base font-semibold text-[#1e3a5f]">{label}</p>
                <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
                {list.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {list.map((integration) => (
                      <p key={integration.id} className="text-xs text-gray-500">
                        Connected
                        {integration.external_account_name && ` · ${integration.external_account_name}`}
                        {integration.last_sync_at &&
                          ` · Last sync: ${new Date(integration.last_sync_at).toLocaleString()}`}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 flex-shrink-0">
                <span className="text-sm text-gray-500">
                  {!available ? 'Coming soon' : isConnected ? 'Connected' : 'Not connected'}
                </span>
                {!available ? null : (
                  <>
                    {list.map((integration) => (
                      <button
                        key={integration.id}
                        type="button"
                        onClick={() => handleDisconnect(integration.id)}
                        disabled={disconnecting === integration.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Unplug className="w-4 h-4" />
                        Disconnect
                        {integration.external_account_name ? ` ${integration.external_account_name}` : ''}
                      </button>
                    ))}
                    {(!isConnected || useManualConnect) && (
                      <button
                        type="button"
                        onClick={() => void handleConnect(key, useManualConnect)}
                        disabled={oauthConnecting === key}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-[#1e3a5f] hover:bg-gray-100 disabled:opacity-50"
                      >
                        <Link2 className="w-4 h-4" />
                        {oauthConnecting === key ? 'Redirecting…' : isConnected ? 'Add account' : 'Connect'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}
      </div>

      <Modal
        isOpen={connectProvider !== null}
        onClose={() => { setConnectProvider(null); setConnectAccountName(''); }}
        title={`Connect ${connectProviderLabel}`}
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!connectProvider) return;
            createMutation.mutate({ provider: connectProvider, external_account_name: connectAccountName.trim() || null });
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="connect-account-name" className="block text-sm font-medium text-gray-700 mb-1">Account name (optional)</label>
            <input
              id="connect-account-name"
              type="text"
              value={connectAccountName}
              onChange={(e) => setConnectAccountName(e.target.value)}
              placeholder="e.g. Premier Agent, Listing Ads"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]"
            />
            <p className="mt-1 text-sm text-gray-500">Add a label so you can tell multiple {connectProviderLabel} accounts apart.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setConnectProvider(null); setConnectAccountName(''); }} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 rounded-lg bg-[#1e3a5f] text-white font-medium hover:opacity-90 disabled:opacity-50">{createMutation.isPending ? 'Connecting…' : 'Connect'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={leadSourcePrompt !== null} onClose={handleSkipLeadSource} title="Create a lead source for this connection?" size="sm">
        {leadSourcePrompt && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Link a lead source to this connection so leads and deals can be attributed for ROI tracking. You can change the name below.
            </p>
            <div>
              <label htmlFor="lead-source-name" className="block text-sm font-medium text-gray-700 mb-1">Lead source name</label>
              <input
                id="lead-source-name"
                type="text"
                value={leadSourceName}
                onChange={(e) => setLeadSourceName(e.target.value)}
                placeholder={leadSourcePrompt.label}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={handleSkipLeadSource} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">Skip</button>
              <button type="button" onClick={handleCreateLeadSource} disabled={!leadSourceName.trim() || creatingLeadSource} className="px-4 py-2 rounded-lg bg-[#1e3a5f] text-white font-medium hover:opacity-90 disabled:opacity-50">{creatingLeadSource ? 'Creating…' : 'Create lead source'}</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
