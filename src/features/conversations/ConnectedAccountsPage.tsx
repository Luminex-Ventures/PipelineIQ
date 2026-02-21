import { useEffect } from 'react';
import { Mail, MessageSquare, RefreshCw, Unplug } from 'lucide-react';
import { PageShell } from '../../ui/PageShell';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';
import { useConnectedAccounts } from '../../hooks/useConversations';
import { startOAuth, syncEmailMessages, connectTwilioViaApi, disconnectAccount } from '../../services/conversationsApi';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useState } from 'react';

const PROVIDERS = [
  { key: 'gmail' as const, label: 'Gmail', icon: Mail, desc: 'Read and send email from your Gmail account. We only access mail needed for your inbox and sending.' },
  { key: 'microsoft' as const, label: 'Microsoft 365 / Outlook', icon: Mail, desc: 'Read and send email from your Outlook/Microsoft 365 account.' },
  { key: 'twilio' as const, label: 'SMS (Twilio)', icon: MessageSquare, desc: 'Send and receive SMS using your own Twilio number. Enter your Account SID, Auth Token, and From number.' },
];

export function ConnectedAccountsPage() {
  const { data: accounts, isLoading } = useConnectedAccounts();
  const qc = useQueryClient();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [twilioSid, setTwilioSid] = useState('');
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioFrom, setTwilioFrom] = useState('');
  const [twilioSubmitting, setTwilioSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const error = params.get('error');
    if (connected) {
      toast.success(`${connected === 'gmail' ? 'Gmail' : connected === 'microsoft' ? 'Microsoft' : 'SMS'} connected.`);
      qc.invalidateQueries({ queryKey: ['conversations', 'connected-accounts'] });
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (error) {
      toast.error(`Connection failed: ${error}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [qc]);

  const byProvider = (provider: string) => accounts?.find((a) => a.provider === provider);

  const handleConnectOAuth = async (provider: 'gmail' | 'microsoft') => {
    try {
      const { auth_url } = await startOAuth(provider);
      window.location.href = auth_url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start OAuth');
    }
  };

  const handleSync = async (accountId: string) => {
    setSyncingId(accountId);
    try {
      const { synced } = await syncEmailMessages(accountId);
      toast.success(`Synced ${synced} messages.`);
      qc.invalidateQueries({ queryKey: ['conversations', 'connected-accounts'] });
      qc.invalidateQueries({ queryKey: ['conversations', 'threads'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDisconnect = async (provider: 'gmail' | 'microsoft' | 'twilio') => {
    setDisconnecting(provider);
    try {
      await disconnectAccount(provider);
      toast.success('Disconnected.');
      qc.invalidateQueries({ queryKey: ['conversations', 'connected-accounts'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setDisconnecting(null);
    }
  };

  const handleConnectTwilio = async () => {
    if (!twilioSid.trim() || !twilioToken.trim() || !twilioFrom.trim()) {
      toast.error('Please enter Account SID, Auth Token, and From number.');
      return;
    }
    setTwilioSubmitting(true);
    try {
      await connectTwilioViaApi({
        account_sid: twilioSid.trim(),
        auth_token: twilioToken.trim(),
        from_phone: twilioFrom.trim(),
      });
      toast.success('Twilio connected.');
      setTwilioSid('');
      setTwilioToken('');
      setTwilioFrom('');
      qc.invalidateQueries({ queryKey: ['conversations', 'connected-accounts'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to connect Twilio');
    } finally {
      setTwilioSubmitting(false);
    }
  };

  const header = (
    <PageHeader
      label="Conversations"
      title="Connected accounts"
      subtitle="Connect your email and SMS so messages are sent from your accounts and appear in the unified inbox."
    />
  );

  return (
    <PageShell title={header}>
      <div className="space-y-6 animate-fade-in">
        {PROVIDERS.map(({ key, label, icon: Icon, desc }) => {
          const acc = byProvider(key);
          const isConnected = acc?.status === 'connected';
          return (
            <Card key={key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-gray-100 p-2.5">
                  <Icon className="h-5 w-5 text-[#1e3a5f]" />
                </div>
                <div>
                  <Text as="h2" variant="h2" className="mb-1">
                    {label}
                  </Text>
                  <Text variant="muted" className="text-sm">
                    {desc}
                  </Text>
                  {isConnected && (
                    <Text variant="micro" className="mt-2 text-emerald-600">
                      Connected {typeof acc.metadata === 'object' && acc.metadata && 'email' in acc.metadata
                        ? (acc.metadata as { email?: string }).email
                        : acc.external_account_id
                        ? ` · ${acc.external_account_id}`
                        : ''}
                      {acc.last_sync_at && ` · Last sync: ${new Date(acc.last_sync_at).toLocaleString()}`}
                    </Text>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {key !== 'twilio' && (
                  <>
                    {!isConnected ? (
                      <button
                        type="button"
                        onClick={() => handleConnectOAuth(key)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--app-accent)] text-white font-medium text-sm hover:opacity-90"
                      >
                        Connect {label.split(' ')[0]}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => acc && handleSync(acc.id)}
                          disabled={syncingId === acc?.id}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-[#1e3a5f] hover:bg-gray-50 disabled:opacity-50"
                        >
                          <RefreshCw className={`h-4 w-4 ${syncingId === acc?.id ? 'animate-spin' : ''}`} />
                          Sync
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisconnect(key)}
                          disabled={disconnecting === key}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Unplug className="h-4 w-4" />
                          Disconnect
                        </button>
                      </>
                    )}
                  </>
                )}
                {key === 'twilio' && (
                  <>
                    {!isConnected ? (
                      <div className="flex flex-col gap-2 w-full sm:w-auto">
                        <input
                          placeholder="Account SID"
                          value={twilioSid}
                          onChange={(e) => setTwilioSid(e.target.value)}
                          className="w-full sm:w-48 px-3 py-2 text-sm border border-gray-200 rounded-lg"
                        />
                        <input
                          type="password"
                          placeholder="Auth Token"
                          value={twilioToken}
                          onChange={(e) => setTwilioToken(e.target.value)}
                          className="w-full sm:w-48 px-3 py-2 text-sm border border-gray-200 rounded-lg"
                        />
                        <input
                          placeholder="From number (+1...)"
                          value={twilioFrom}
                          onChange={(e) => setTwilioFrom(e.target.value)}
                          className="w-full sm:w-48 px-3 py-2 text-sm border border-gray-200 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={handleConnectTwilio}
                          disabled={twilioSubmitting}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--app-accent)] text-white font-medium text-sm hover:opacity-90 disabled:opacity-50"
                        >
                          Connect SMS
                        </button>
                      </div>
                    ) : (
                      <>
                        <Text variant="micro" className="text-emerald-600">
                          {acc?.external_account_id ?? 'Connected'}
                        </Text>
                        <button
                          type="button"
                          onClick={() => handleDisconnect(key)}
                          disabled={disconnecting === key}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Unplug className="h-4 w-4" />
                          Disconnect
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </Card>
          );
        })}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading accounts…
          </div>
        )}
      </div>
    </PageShell>
  );
}
