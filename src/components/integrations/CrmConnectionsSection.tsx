import { useState, useEffect } from 'react';
import { useWorkspaceSettings } from '../../hooks/useWorkspaceSettings';
import { Link2, Unplug } from 'lucide-react';

interface CrmConnectionsSectionProps {
  canEdit: boolean;
}

type IntegrationState = {
  provider: string;
  description: string;
  status: 'connected' | 'not_connected';
  lastSync?: string;
};

const defaultIntegrations: Record<string, IntegrationState> = {
  crm: {
    provider: 'Follow Up Boss',
    description: 'Sync contacts + deals bi-directionally.',
    status: 'not_connected'
  }
};

export function CrmConnectionsSection({ canEdit }: CrmConnectionsSectionProps) {
  const { workspace, updateWorkspace } = useWorkspaceSettings();
  const [integrations, setIntegrations] = useState<Record<string, IntegrationState>>(defaultIntegrations);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (workspace?.integration_settings) {
      const stored = workspace.integration_settings as Record<string, IntegrationState>;
      const { email: _e, marketing: _m, ...rest } = stored;
      setIntegrations({ ...defaultIntegrations, ...rest });
    }
  }, [workspace?.integration_settings]);

  const toggleIntegration = async (key: string) => {
    if (!canEdit) return;
    setSavingKey(key);
    const nextState = integrations[key].status === 'connected' ? 'not_connected' : 'connected';
    const payload = {
      ...integrations,
      [key]: {
        ...integrations[key],
        status: nextState,
        lastSync: nextState === 'connected' ? new Date().toISOString() : undefined
      }
    };
    setIntegrations(payload as Record<string, IntegrationState>);
    await updateWorkspace({ integration_settings: payload });
    setSavingKey(null);
  };

  return (
    <section className="space-y-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#1e3a5f] mb-1">CRM</h2>
        <p className="text-sm text-gray-500">
          Sync contacts and deals with your CRM.
        </p>
      </div>
      <div className="space-y-4">
        {Object.entries(integrations).map(([key, integration]) => (
          <div
            key={key}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm"
          >
            <div>
              <p className="text-base font-semibold text-[#1e3a5f]">{integration.provider}</p>
              <p className="text-sm text-gray-500 mt-0.5">{integration.description}</p>
              {integration.lastSync && (
                <p className="text-xs text-gray-400 mt-1">
                  Last sync {new Date(integration.lastSync).toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              <span className="text-sm text-gray-500">
                {integration.status === 'connected' ? 'Connected' : 'Not connected'}
              </span>
              <button
                type="button"
                onClick={() => toggleIntegration(key)}
                disabled={!canEdit || savingKey === key}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  integration.status === 'connected'
                    ? 'border-rose-200 text-rose-600 bg-white hover:bg-rose-50'
                    : 'border-gray-200 text-[#1e3a5f] bg-gray-50 hover:bg-gray-100'
                } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {integration.status === 'connected' ? (
                  <>
                    <Unplug className="w-4 h-4" />
                    Disconnect
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    Connect
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
