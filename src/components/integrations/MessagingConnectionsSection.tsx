import { useEffect } from 'react';
import { RefreshCw, Unplug, Link2 } from 'lucide-react';
import { useConnectedAccounts } from '../../hooks/useConversations';
import { startOAuth, syncEmailMessages, connectTwilioViaApi, disconnectAccount } from '../../services/conversationsApi';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useState } from 'react';

const PROVIDERS = [
  { key: 'gmail' as const, label: 'Gmail / Google Workspace', desc: 'Read and send email from your Gmail or Google Workspace account. Powers the inbox and can log emails to deals and trigger automations.' },
  { key: 'microsoft' as const, label: 'Microsoft 365 / Outlook', desc: 'Read and send email from your Outlook/Microsoft 365 account.' },
  { key: 'twilio' as const, label: 'SMS (Twilio)', desc: 'Send and receive SMS using your own Twilio number. Enter your Account SID, Auth Token, and From number.' },
];

export function MessagingConnectionsSection() {
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

  return (
    <section className="space-y-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#1e3a5f] mb-1">Messaging & Inbox</h2>
        <p className="text-sm text-gray-500">
          Connect email and SMS so messages are sent from your accounts and appear in the unified inbox.
        </p>
      </div>
      <div className="space-y-4">
        {PROVIDERS.map(({ key, label, desc }) => {
          const acc = byProvider(key);
          const isConnected = acc?.status === 'connected';
          return (
            <div
              key={key}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm"
            >
              <div>
                <p className="text-base font-semibold text-[#1e3a5f]">{label}</p>
                <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
                {isConnected && (
                  <p className="text-xs text-gray-500 mt-1">
                    Connected{typeof acc?.metadata === 'object' && acc?.metadata && 'email' in acc.metadata
                      ? ` · ${(acc.metadata as { email?: string }).email}`
                      : acc?.external_account_id
                      ? ` · ${acc.external_account_id}`
                      : ''}
                    {acc?.last_sync_at && ` · Last sync: ${new Date(acc.last_sync_at).toLocaleString()}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <span className="text-sm text-gray-500">
                  {isConnected ? 'Connected' : 'Not connected'}
                </span>
                {key !== 'twilio' && (
                  <>
                    {!isConnected ? (
                      <button
                        type="button"
                        onClick={() => handleConnectOAuth(key)}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-[#1e3a5f] hover:bg-gray-100 transition"
                      >
                        <Link2 className="w-4 h-4" />
                        Connect
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => acc && handleSync(acc.id)}
                          disabled={syncingId === acc?.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-[#1e3a5f] hover:bg-gray-100 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-4 h-4 ${syncingId === acc?.id ? 'animate-spin' : ''}`} />
                          Sync
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisconnect(key)}
                          disabled={disconnecting === key}
                          className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Unplug className="w-4 h-4" />
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
                          className="w-full sm:w-48 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                        />
                        <input
                          type="password"
                          placeholder="Auth Token"
                          value={twilioToken}
                          onChange={(e) => setTwilioToken(e.target.value)}
                          className="w-full sm:w-48 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                        />
                        <input
                          placeholder="From number (+1...)"
                          value={twilioFrom}
                          onChange={(e) => setTwilioFrom(e.target.value)}
                          className="w-full sm:w-48 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                        />
                        <button
                          type="button"
                          onClick={handleConnectTwilio}
                          disabled={twilioSubmitting}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-[#1e3a5f] hover:bg-gray-100"
                        >
                          <Link2 className="w-4 h-4" />
                          Connect
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDisconnect(key)}
                          disabled={disconnecting === key}
                          className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Unplug className="w-4 h-4" />
                          Disconnect
                        </button>
                      </>
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
    </section>
  );
}
