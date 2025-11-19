import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { Loader2, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { getRoleLabel } from '../../../lib/rbac';

export default function ProfileSettings() {
  const { user, roleInfo } = useAuth();
  const [name, setName] = useState(user?.user_metadata?.name || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        name: name.trim() || user.email
      }
    });

    if (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to update profile.' });
    } else {
      setMessage({ type: 'success', text: 'Profile updated.' });
    }

    setSaving(false);
  };

  const initials = (name || user?.email || 'PI').split(' ').map(part => part.charAt(0).toUpperCase()).slice(0, 2).join('');
  const roleLabel = getRoleLabel(roleInfo?.globalRole);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="hig-text-heading mb-2">Profile</h2>
        <p className="text-sm text-gray-600">
          Manage your display name, login email, and view the role assigned by your workspace admin.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-[var(--app-accent)] text-white flex items-center justify-center text-xl font-semibold">
            {initials}
          </div>
          <div>
            <p className="text-sm text-gray-500">Signed in as</p>
          <p className="text-lg font-semibold text-gray-900">{user?.email}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label className="hig-label">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="hig-input"
            placeholder="Jane Agent"
          />
        </div>

        <div>
          <label className="hig-label">Primary Email</label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="hig-input bg-gray-50 text-gray-500"
          />
          <p className="text-xs text-gray-500 mt-1">Contact support to change your login email.</p>
        </div>

        <div>
          <label className="hig-label">Role</label>
          <div className="hig-input bg-gray-50 text-gray-700 flex items-center gap-2">
            <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-gray-500">{roleLabel}</span>
            <span className="text-sm text-gray-600">Workspace permissions are managed by your admin.</span>
          </div>
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

        <div className="flex gap-3">
          <button
            type="submit"
            className="hig-btn-primary"
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" strokeWidth={2} />
                <span>Save Profile</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
