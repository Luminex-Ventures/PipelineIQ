import { useState, useEffect } from 'react';
import { useWorkspaceSettings } from '../../../hooks/useWorkspaceSettings';
import { ToggleLeft, ToggleRight } from 'lucide-react';

interface IntegrationsSettingsProps {
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
  },
  email: {
    provider: 'Google Workspace',
    description: 'Log emails to deals and trigger automations.',
    status: 'not_connected'
  },
  marketing: {
    provider: 'Zapier',
    description: 'Push new leads into Luma-IQ automatically.',
    status: 'not_connected'
  }
};

export default function IntegrationsSettings({ canEdit }: IntegrationsSettingsProps) {
  const { workspace, updateWorkspace } = useWorkspaceSettings();
  const [integrations, setIntegrations] = useState<Record<string, IntegrationState>>(defaultIntegrations);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (workspace?.integration_settings) {
      const stored = workspace.integration_settings as Record<string, IntegrationState>;
      setIntegrations({ ...defaultIntegrations, ...stored });
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
    <div>
      <div className="mb-6">
        <h2 className="hig-text-heading mb-2">Integrations</h2>
        <p className="text-sm text-gray-600">
          Connect your CRM, email, and marketing tools so deals stay in sync.
        </p>
        {!canEdit && (
          <p className="text-xs text-gray-500 mt-1">
            Only workspace admins can manage integrations.
          </p>
        )}
      </div>

      <div className="space-y-4">
        {Object.entries(integrations).map(([key, integration]) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-2xl border border-gray-200/70 bg-white/80 px-4 py-4"
          >
            <div>
              <p className="text-sm font-semibold text-gray-900">{integration.provider}</p>
              <p className="text-xs text-gray-500">{integration.description}</p>
              {integration.lastSync && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Last sync {new Date(integration.lastSync).toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span
                className={`text-xs font-semibold ${
                  integration.status === 'connected' ? 'text-emerald-600' : 'text-gray-500'
                }`}
              >
                {integration.status === 'connected' ? 'Connected' : 'Not connected'}
              </span>
              <button
                type="button"
                onClick={() => toggleIntegration(key)}
                disabled={!canEdit || savingKey === key}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  integration.status === 'connected'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-gray-50 text-gray-600 border-gray-200'
                } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {integration.status === 'connected' ? (
                  <span className="flex items-center gap-2">
                    <ToggleRight className="w-4 h-4" />
                    Disconnect
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ToggleLeft className="w-4 h-4" />
                    Connect
                  </span>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
