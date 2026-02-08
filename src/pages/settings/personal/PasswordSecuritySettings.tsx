import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function PasswordSecuritySettings() {
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.newPassword || form.newPassword !== form.confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords must match.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({ password: form.newPassword });

    if (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to update password.' });
    } else {
      setMessage({ type: 'success', text: 'Password updated successfully.' });
      setForm({ newPassword: '', confirmPassword: '' });
    }

    setSaving(false);
  };

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h2 className="hig-text-heading mb-2">Password &amp; Security</h2>
        <p className="text-sm text-gray-600">
          Update your login password. Changes apply immediately across all Luma-IQ sessions.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="hig-label">New Password</label>
          <input
            type="password"
            value={form.newPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
            className="hig-input"
            minLength={8}
            required
          />
          <p className="text-xs text-gray-500 mt-1">Use at least 8 characters including a number or symbol.</p>
        </div>

        <div>
          <label className="hig-label">Confirm Password</label>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
            className="hig-input"
            required
          />
        </div>

        {message && (
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border-red-200/60'
              : 'bg-green-50 text-emerald-700 border-emerald-200/60'
          }`}>
            {message.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
            ) : (
              <ShieldCheck className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
            )}
            <span className="text-sm font-medium">{message.text}</span>
          </div>
        )}

        <button type="submit" className="hig-btn-primary" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
              <span>Updating…</span>
            </>
          ) : (
            <span>Update Password</span>
          )}
        </button>
      </form>
    </div>
  );
}
