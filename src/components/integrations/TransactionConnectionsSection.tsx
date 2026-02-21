import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { listTransactionIntegrations, disconnectTransactionIntegration, startDocuSignOAuth, startDotloopOAuth } from '../../services/transactionIntegrations.service';
import { Unplug, RefreshCw, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useState } from 'react';

const TRANSACTION_PROVIDERS: Array<{ key: 'docusign' | 'dotloop'; label: string; desc: string; available: boolean }> = [
  { key: 'docusign', label: 'DocuSign', desc: 'Send and track e-signatures. Link signed documents to deals and automate follow-ups.', available: true },
  { key: 'dotloop', label: 'Dotloop', desc: 'Sync transactions and documents from Dotloop. Keep deals and loop status in sync with your pipeline.', available: true },
];

export function TransactionConnectionsSection() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const qc = useQueryClient();
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<'docusign' | 'dotloop' | null>(null);

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['transaction', 'integrations', userId],
    queryFn: () => listTransactionIntegrations(userId),
    enabled: !!userId,
  });

  const disconnectMutation = useMutation({
    mutationFn: (integrationId: string) => disconnectTransactionIntegration(userId, integrationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transaction'] });
      toast.success('Account disconnected');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleConnect = async (provider: 'docusign' | 'dotloop') => {
    setConnectingProvider(provider);
    try {
      const startOAuth = provider === 'docusign' ? startDocuSignOAuth : startDotloopOAuth;
      const { auth_url } = await startOAuth();
      window.location.href = auth_url;
    } catch (err) {
      const label = provider === 'docusign' ? 'DocuSign' : 'Dotloop';
      toast.error(err instanceof Error ? err.message : `Failed to start ${label} connection`);
      setConnectingProvider(null);
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

  return (
    <section className="space-y-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#1e3a5f] mb-1">Transaction & E-sign</h2>
        <p className="text-sm text-gray-500">
          Connect transaction and document tools to keep deals and signatures in sync.
        </p>
      </div>
      <div className="space-y-4">
        {TRANSACTION_PROVIDERS.map(({ key, label, desc, available }) => {
          const integration = integrations.find((i) => i.provider === key);
          const isConnected = !!integration;
          return (
            <div
              key={key}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm"
            >
              <div>
                <p className="text-base font-semibold text-[#1e3a5f]">{label}</p>
                <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
                {integration && (
                  <p className="text-xs text-gray-500 mt-1">
                    Connected
                    {integration.external_account_name && ` · ${integration.external_account_name}`}
                    {integration.last_sync_at && ` · Last sync: ${new Date(integration.last_sync_at).toLocaleString()}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <span className="text-sm text-gray-500">
                  {!available ? 'Coming soon' : isConnected ? 'Connected' : 'Not connected'}
                </span>
                {available && (key === 'docusign' || key === 'dotloop') && (
                  <>
                    {integration && (
                      <button
                        type="button"
                        onClick={() => handleDisconnect(integration.id)}
                        disabled={disconnecting === integration.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Unplug className="w-4 h-4" />
                        Disconnect
                      </button>
                    )}
                    {!isConnected && (
                      <button
                        type="button"
                        onClick={() => void handleConnect(key)}
                        disabled={connectingProvider === key}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-[#1e3a5f] hover:bg-gray-100 disabled:opacity-50"
                      >
                        <Link2 className="w-4 h-4" />
                        {connectingProvider === key ? 'Redirecting…' : 'Connect'}
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
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        )}
      </div>
    </section>
  );
}
