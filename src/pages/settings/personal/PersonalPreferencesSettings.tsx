import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import type { Database } from '../../../lib/database.types';

type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];
type UserSettingsInsert = Database['public']['Tables']['user_settings']['Insert'];

export default function PersonalPreferencesSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [formData, setFormData] = useState({
    annual_gci_goal: 0,
    default_tax_rate: 25,
    default_brokerage_split_rate: 20
  });

  const loadSettings = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      const settings = data as UserSettingsRow;
      setFormData({
        annual_gci_goal: settings.annual_gci_goal ?? 0,
        default_tax_rate: (settings.default_tax_rate ?? 0) * 100,
        default_brokerage_split_rate: (settings.default_brokerage_split_rate ?? 0) * 100
      });
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setMessage(null);

    const payload: UserSettingsInsert = {
      user_id: user.id,
      annual_gci_goal: formData.annual_gci_goal,
      default_tax_rate: formData.default_tax_rate / 100,
      default_brokerage_split_rate: formData.default_brokerage_split_rate / 100
    };
    const { error } = await supabase
      .from('user_settings')
      .upsert(payload);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to save preferences. Please try again.' });
    } else {
      setMessage({ type: 'success', text: 'Preferences updated!' });
      setTimeout(() => setMessage(null), 3000);
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--app-accent)]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="hig-text-heading mb-2">Personal Preferences</h2>
        <p className="text-sm text-gray-600">
          Set your financial targets and default assumptions. These only apply to your profile.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Annual GCI Goal
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
              $
            </span>
            <input
              type="number"
              value={formData.annual_gci_goal}
              onChange={(e) => setFormData({ ...formData, annual_gci_goal: parseFloat(e.target.value) || 0 })}
              className="hig-input pl-8"
              placeholder="100000"
              min="0"
              step="1000"
            />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Your personal net commission goal for the year.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Default Tax Allocation
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.5"
              value={formData.default_tax_rate}
              onChange={(e) => setFormData({ ...formData, default_tax_rate: parseFloat(e.target.value) || 0 })}
              className="hig-input pr-8"
              placeholder="25"
              min="0"
              max="100"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
              %
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Used to forecast take-home pay inside PipelineIQ.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Default Brokerage Split
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.5"
              value={formData.default_brokerage_split_rate}
              onChange={(e) => setFormData({ ...formData, default_brokerage_split_rate: parseFloat(e.target.value) || 0 })}
              className="hig-input pr-8"
              placeholder="20"
              min="0"
              max="100"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
              %
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Determines what portion of each deal is allocated to your brokerage by default.
          </p>
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

        <div className="pt-4 border-t border-gray-200/60 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="hig-btn-primary px-8"
          >
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
      </form>
    </div>
  );
}
