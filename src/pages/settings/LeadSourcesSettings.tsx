import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Pencil, Trash2, Loader2, X, Tag, AlertCircle, Handshake, Sparkles } from 'lucide-react';

type PayoutStructure = 'standard' | 'partnership';

interface LeadSource {
  id: string;
  name: string;
  category: string | null;
  brokerage_split_rate: number;
  payout_structure: PayoutStructure;
  partnership_split_rate: number | null;
  partnership_notes: string | null;
}

interface LeadSourceFormState {
  name: string;
  category: string;
  brokerage_split_rate: number;
  payout_structure: PayoutStructure;
  partnership_split_rate: number;
  partnership_notes: string;
}

const createDefaultFormState = (): LeadSourceFormState => ({
  name: '',
  category: '',
  brokerage_split_rate: 20,
  payout_structure: 'standard',
  partnership_split_rate: 35,
  partnership_notes: ''
});

interface LeadSourcesSettingsProps {
  canEdit?: boolean;
}

export default function LeadSourcesSettings({ canEdit = true }: LeadSourcesSettingsProps) {
  const { user } = useAuth();
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingSource, setEditingSource] = useState<LeadSource | null>(null);
  const [formData, setFormData] = useState<LeadSourceFormState>(createDefaultFormState());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadSources = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('lead_sources')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (data) setSources(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !user || !formData.name.trim()) {
      setError('Lead source name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: formData.name,
        category: formData.category || null,
        brokerage_split_rate: formData.brokerage_split_rate / 100,
        payout_structure: formData.payout_structure,
        partnership_split_rate: formData.payout_structure === 'partnership' ? formData.partnership_split_rate / 100 : null,
        partnership_notes: formData.payout_structure === 'partnership' ? formData.partnership_notes.trim() || null : null
      };

      if (editingSource) {
        const { error: updateError } = await supabase
          .from('lead_sources')
          .update(payload)
          .eq('id', editingSource.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('lead_sources')
          .insert({
            user_id: user.id,
            ...payload
          });

        if (insertError) throw insertError;
      }

      setShowModal(false);
      setFormData(createDefaultFormState());
      setEditingSource(null);
      loadSources();
    } catch (err) {
      console.error('Error saving lead source:', err);
      setError(err instanceof Error ? err.message : 'Failed to save lead source');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (source: LeadSource) => {
    if (!canEdit) return;
    setEditingSource(source);
    setFormData({
      name: source.name,
      category: source.category || '',
      brokerage_split_rate: source.brokerage_split_rate * 100,
      payout_structure: source.payout_structure,
      partnership_split_rate: (source.partnership_split_rate ?? 0.35) * 100,
      partnership_notes: source.partnership_notes || ''
    });
    setShowModal(true);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) return;
    if (!confirm('Are you sure you want to delete this lead source? This action cannot be undone.')) {
      return;
    }

    try {
      const { error: deleteError } = await supabase
        .from('lead_sources')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      loadSources();
    } catch (err) {
      console.error('Error deleting lead source:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete lead source');
    }
  };

  const categories = [
    { value: 'online', label: 'Online' },
    { value: 'referral', label: 'Referral' },
    { value: 'event', label: 'Event' },
    { value: 'farming', label: 'Farming' },
    { value: 'advertising', label: 'Advertising' },
    { value: 'direct', label: 'Direct' },
    { value: 'other', label: 'Other' }
  ];

  const payoutOptions: { value: PayoutStructure; title: string; description: string }[] = [
    {
      value: 'standard',
      title: 'Standard Split',
      description: 'Only your brokerage split applies.'
    },
    {
      value: 'partnership',
      title: 'Partnership Program',
      description: 'Pay the partner first, then split the remainder with your brokerage.'
    }
  ];

  const getCategoryColor = (category: string | null) => {
    const colors: Record<string, string> = {
      online: 'bg-blue-50 text-blue-700 border-blue-200/60',
      referral: 'bg-green-50 text-green-700 border-green-200/60',
      event: 'bg-purple-50 text-purple-700 border-purple-200/60',
      farming: 'bg-orange-50 text-orange-700 border-orange-200/60',
      advertising: 'bg-pink-50 text-pink-700 border-pink-200/60',
      direct: 'bg-cyan-50 text-cyan-700 border-cyan-200/60',
      other: 'bg-gray-50 text-gray-700 border-gray-200/60'
    };
    return colors[category || 'other'] || colors.other;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-[rgb(0,122,255)]" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="hig-text-heading mb-2">Lead Sources</h2>
        <p className="text-sm text-gray-600">
          Track where your leads come from and manage commission splits
        </p>
        {!canEdit && (
          <p className="text-xs text-gray-500 mt-1">
            You can review workspace lead sources. Only admins can make edits.
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3 p-4 rounded-xl bg-red-50 text-red-700 border border-red-200/60">
          <AlertCircle className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {canEdit && (
        <div className="mb-6">
          <button
            onClick={() => {
              setShowModal(true);
              setEditingSource(null);
              setFormData(createDefaultFormState());
              setError(null);
            }}
            className="hig-btn-primary"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            <span>Add Lead Source</span>
          </button>
        </div>
      )}

      {sources.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center border border-gray-200/60">
          <Tag className="w-12 h-12 text-gray-400 mx-auto mb-4" strokeWidth={1.5} />
          <p className="text-gray-600 mb-4">No lead sources configured yet</p>
          <p className="text-sm text-gray-500 mb-6">
            Add your first lead source to start tracking where your deals come from
          </p>
          {canEdit ? (
            <button
              onClick={() => {
                setShowModal(true);
                setEditingSource(null);
                setFormData(createDefaultFormState());
                setError(null);
              }}
              className="hig-btn-primary"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              <span>Add Lead Source</span>
            </button>
          ) : (
            <p className="text-sm text-gray-500">
              Ask an admin to add lead sources for your workspace.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sources.map(source => {
            const isPartnership = source.payout_structure === 'partnership';
            const partnerRate = Math.round(((source.partnership_split_rate ?? 0) * 100) * 10) / 10;

            return (
              <div
                key={source.id}
                className="bg-white border border-gray-200/60 rounded-2xl p-5 hover:shadow-sm hover:border-gray-300 transition-all space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 mb-2">{source.name}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      {source.category && (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border ${getCategoryColor(source.category)}`}>
                          <Tag className="w-3 h-3" strokeWidth={2} />
                          {categories.find(c => c.value === source.category)?.label || source.category}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${
                        isPartnership
                          ? 'border-[rgb(0,122,255)]/30 text-[rgb(0,122,255)] bg-[rgb(0,122,255)]/5'
                          : 'border-gray-200 text-gray-600 bg-gray-50'
                      }`}>
                        {isPartnership ? <Handshake className="w-3 h-3" strokeWidth={2} /> : <Sparkles className="w-3 h-3" strokeWidth={2} />}
                        {isPartnership ? 'Partnership' : 'Standard Split'}
                      </span>
                    </div>
                  </div>
                {canEdit ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(source)}
                      className="p-1.5 text-gray-600 hover:text-[rgb(0,122,255)] hover:bg-blue-50 rounded-lg transition"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => handleDelete(source.id)}
                      className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] uppercase tracking-wide text-gray-400">View only</span>
                )}
              </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Brokerage Split</span>
                    <span className="font-semibold text-gray-900">{(source.brokerage_split_rate * 100).toFixed(1)}%</span>
                  </div>
                  {isPartnership && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Partner Program</span>
                      <span className="font-semibold text-gray-900">{partnerRate.toFixed(1)}%</span>
                    </div>
                  )}
                  <div className="pt-3 border-t border-gray-200/70">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Payout Flow</p>
                    <ol className="space-y-2 text-sm text-gray-700">
                      {isPartnership && (
                        <li className="flex items-center gap-2">
                          <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-[rgb(0,122,255)]/10 text-[rgb(0,122,255)] text-xs font-semibold">1</span>
                          Pay partner first ({partnerRate.toFixed(1)}% of gross commission)
                        </li>
                      )}
                      <li className="flex items-center gap-2">
                        <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-[rgb(0,122,255)]/10 text-[rgb(0,122,255)] text-xs font-semibold">
                          {isPartnership ? '2' : '1'}
                        </span>
                        Split remainder with brokerage ({(source.brokerage_split_rate * 100).toFixed(1)}% to broker)
                      </li>
                    </ol>
                  </div>
                </div>

                {isPartnership && source.partnership_notes && (
                  <div className="text-xs text-gray-500 bg-[rgb(0,122,255)]/5 border border-[rgb(0,122,255)]/10 rounded-xl p-3">
                    {source.partnership_notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="flex justify-between items-center p-6 border-b border-gray-200/60">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingSource ? 'Edit Lead Source' : 'Add Lead Source'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingSource(null);
                  setFormData(createDefaultFormState());
                  setError(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Source Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="hig-input"
                  placeholder="e.g., Zillow, Past Client, Open House"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-3">
                  Deal Structure
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {payoutOptions.map(option => {
                    const isActive = formData.payout_structure === option.value;
                    return (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => setFormData({ ...formData, payout_structure: option.value })}
                        className={`text-left rounded-2xl border p-4 transition-all ${
                          isActive
                            ? 'border-[rgb(0,122,255)] bg-[rgb(0,122,255)]/5'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-sm font-semibold text-gray-900 mb-1">{option.title}</div>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Choose partnership when working with platforms like Redfin or Zillow that take their fee before your team split.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Brokerage Split Rate
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    value={formData.brokerage_split_rate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        brokerage_split_rate: Number.isNaN(parseFloat(e.target.value))
                          ? 0
                          : parseFloat(e.target.value)
                      })
                    }
                    className="hig-input pr-8"
                    placeholder="20"
                    min="0"
                    max="100"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                    %
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Percentage of the remaining commission that goes to your brokerage/team.
                </p>
              </div>

              {formData.payout_structure === 'partnership' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Partner Split Rate
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        value={formData.partnership_split_rate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            partnership_split_rate: Number.isNaN(parseFloat(e.target.value))
                              ? 0
                              : parseFloat(e.target.value)
                          })
                        }
                        className="hig-input pr-8"
                        placeholder="35"
                        min="0"
                        max="100"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                        %
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Portion of the gross commission that goes to the partner program before any brokerage split.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Partner Notes
                    </label>
                    <textarea
                      value={formData.partnership_notes}
                      onChange={(e) => setFormData({ ...formData, partnership_notes: e.target.value })}
                      className="hig-input min-h-[88px]"
                      placeholder="e.g., Pay Redfin 35% within 5 days, then 50/50 split with brokerage"
                    />
                  </div>
                </>
              )}

              <div className="rounded-2xl border border-gray-200/70 bg-gray-50/60 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">Payout Preview</p>
                <ol className="space-y-3 text-sm text-gray-800">
                  {formData.payout_structure === 'partnership' && (
                    <li className="flex items-center gap-3">
                      <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-[rgb(0,122,255)]/10 text-[rgb(0,122,255)] text-xs font-semibold">
                        1
                      </span>
                      Pay partner first ({formData.partnership_split_rate || 0}% of gross commission)
                    </li>
                  )}
                  <li className="flex items-center gap-3">
                    <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-[rgb(0,122,255)]/10 text-[rgb(0,122,255)] text-xs font-semibold">
                      {formData.payout_structure === 'partnership' ? '2' : '1'}
                    </span>
                    Split the remaining commission with your brokerage ({formData.brokerage_split_rate || 0}% to broker)
                  </li>
                </ol>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-200/60">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingSource(null);
                    setFormData(createDefaultFormState());
                    setError(null);
                  }}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.name.trim()}
                  className="hig-btn-primary"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingSource ? 'Update' : 'Add'} Source</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
