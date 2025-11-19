import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { Loader2, Save, CheckCircle, AlertCircle } from 'lucide-react';

const notificationOptions = [
  { id: 'new_lead', label: 'New lead assigned' },
  { id: 'stage_change', label: 'Deal moved to a new stage' },
  { id: 'reminders', label: 'Task & follow-up reminders' },
  { id: 'analytics', label: 'Weekly pipeline summary' }
] as const;

type NotificationOptionId = typeof notificationOptions[number]['id'];

type NotificationPrefs = Record<NotificationOptionId, boolean>;

const defaultPrefs: NotificationPrefs = {
  new_lead: true,
  stage_change: true,
  reminders: true,
  analytics: false
};

export default function NotificationSettings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!user?.user_metadata?.notifications) return;
    setPrefs({ ...defaultPrefs, ...user.user_metadata.notifications });
  }, [user?.user_metadata?.notifications]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        notifications: prefs
      }
    });

    if (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to update notifications.' });
    } else {
      setMessage({ type: 'success', text: 'Notification preferences saved.' });
    }

    setSaving(false);
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="hig-text-heading mb-2">Notifications</h2>
        <p className="text-sm text-gray-600">
          Choose which alerts to receive. These preferences only affect your PipelineIQ account.
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-4">
          {notificationOptions.map((option) => (
            <label
              key={option.id}
              className="flex items-center justify-between rounded-2xl border border-gray-200/70 bg-white/90 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{option.label}</p>
                <p className="text-xs text-gray-500">Delivered via email &amp; in-app</p>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-gray-300 text-[var(--app-accent)] focus:ring-[var(--app-accent)]"
                checked={prefs[option.id] ?? false}
                onChange={(e) => setPrefs((prev) => ({ ...prev, [option.id]: e.target.checked }))}
              />
            </label>
          ))}
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

        <button onClick={handleSave} className="hig-btn-primary" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
              <span>Saving…</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" strokeWidth={2} />
              <span>Save Preferences</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
