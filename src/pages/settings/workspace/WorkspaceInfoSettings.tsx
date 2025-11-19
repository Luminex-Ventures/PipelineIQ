import { useState, useEffect } from 'react';
import { useWorkspaceSettings } from '../../../hooks/useWorkspaceSettings';
import { Loader2, Save, AlertCircle, CheckCircle } from 'lucide-react';

interface WorkspaceInfoSettingsProps {
  canEdit: boolean;
}

export default function WorkspaceInfoSettings({ canEdit }: WorkspaceInfoSettingsProps) {
  const { workspace, loading, updateWorkspace } = useWorkspaceSettings();
  const [form, setForm] = useState({
    name: '',
    company_name: '',
    timezone: 'America/Los_Angeles',
    locale: 'en-US'
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (workspace) {
      setForm({
        name: workspace.name || '',
        company_name: workspace.company_name || '',
        timezone: workspace.timezone || 'America/Los_Angeles',
        locale: workspace.locale || 'en-US'
      });
    }
  }, [workspace]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setMessage(null);
    const { error } = await updateWorkspace(form);
    if (error) {
      setMessage({ type: 'error', text: 'Unable to update workspace info.' });
    } else {
      setMessage({ type: 'success', text: 'Workspace updated.' });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--app-accent)]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="hig-text-heading mb-2">Workspace Info</h2>
        <p className="text-sm text-gray-600">
          Identity, locale, and defaults shared across your workspace.
        </p>
        {!canEdit && (
          <p className="text-xs text-gray-500 mt-1">
            Workspace details are managed by admins. You can view but not edit.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="hig-label">Workspace Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="hig-input"
            disabled={!canEdit}
            placeholder="Northern Virginia Team"
          />
        </div>

        <div>
          <label className="hig-label">Company / Team</label>
          <input
            type="text"
            value={form.company_name}
            onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
            className="hig-input"
            disabled={!canEdit}
            placeholder="Luminex Ventures Realestate Group"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="hig-label">Timezone</label>
            <select
              value={form.timezone}
              onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
              className="hig-input"
              disabled={!canEdit}
            >
              <option value="America/Los_Angeles">Pacific (PT)</option>
              <option value="America/Denver">Mountain (MT)</option>
              <option value="America/Chicago">Central (CT)</option>
              <option value="America/New_York">Eastern (ET)</option>
            </select>
          </div>
          <div>
            <label className="hig-label">Locale</label>
            <select
              value={form.locale}
              onChange={(e) => setForm((prev) => ({ ...prev, locale: e.target.value }))}
              className="hig-input"
              disabled={!canEdit}
            >
              <option value="en-US">English (US)</option>
              <option value="en-CA">English (Canada)</option>
              <option value="es-US">Español</option>
            </select>
          </div>
        </div>

        {message && (
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border-red-200/60'
              : 'bg-green-50 text-green-700 border-green-200/60'
          }`}>
            {message.type === 'error' ? (
              <AlertCircle className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
            ) : (
              <CheckCircle className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
            )}
            <span className="text-sm font-medium">{message.text}</span>
          </div>
        )}

        {canEdit && (
          <button type="submit" className="hig-btn-primary" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" strokeWidth={2} />
                <span>Save Workspace</span>
              </>
            )}
          </button>
        )}
      </form>
    </div>
  );
}
