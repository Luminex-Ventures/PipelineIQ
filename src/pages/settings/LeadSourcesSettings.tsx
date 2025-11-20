import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Pencil, Trash2, Loader2, X, Tag, AlertCircle, Handshake, Sparkles, GripVertical, Search } from 'lucide-react';
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type PayoutStructure = 'standard' | 'partnership';

interface LeadSource {
  id: string;
  name: string;
  category: string | null;
  sort_order: number;
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
  const [typeFilter, setTypeFilter] = useState<'all' | PayoutStructure>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadSources = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data, error: fetchError } = await supabase
        .from('lead_sources')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true, nullsLast: true })
        .order('name', { ascending: true });

      if (fetchError) {
        throw fetchError;
      }

      if (!data) {
        setSources([]);
        setLoading(false);
        return;
      }

      const ordered = [...data].sort((a, b) => {
        if (a.sort_order === b.sort_order) {
          return a.name.localeCompare(b.name);
        }
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });

      const needsNormalization = ordered.some((source, index) => source.sort_order !== index + 1);
      if (needsNormalization) {
        const normalized = ordered.map((source, index) => ({
          ...source,
          sort_order: index + 1
        }));
        setSources(normalized);
        await Promise.all(
          normalized.map((source, index) =>
            supabase
              .from('lead_sources')
              .update({ sort_order: index + 1 })
              .eq('id', source.id)
          )
        );
      } else {
        setSources(ordered);
      }
    } catch (err) {
      console.error('Error loading lead sources:', err);
      setError(err instanceof Error ? err.message : 'Failed to load lead sources');
    } finally {
      setLoading(false);
    }
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
        const maxSort = sources.reduce((max, src) => Math.max(max, src.sort_order ?? 0), 0);
        const { error: insertError } = await supabase
          .from('lead_sources')
          .insert({
            user_id: user.id,
            sort_order: maxSort + 1,
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

  const typeFilterOptions: { value: 'all' | PayoutStructure; label: string }[] = [
    { value: 'all', label: 'All sources' },
    { value: 'standard', label: 'Standard' },
    { value: 'partnership', label: 'Partnership' }
  ];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  );

  const filteredSources = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sources.filter(source => {
      const matchesType = typeFilter === 'all' || source.payout_structure === typeFilter;
      const matchesQuery =
        !query ||
        [source.name, source.category || '', source.partnership_notes || ''].some(field =>
          field.toLowerCase().includes(query)
        );
      return matchesType && matchesQuery;
    });
  }, [sources, searchQuery, typeFilter]);

  const canReorder = canEdit && typeFilter === 'all' && searchQuery.trim() === '';

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

  const getCategoryLabel = (category: string | null) => {
    return categories.find(c => c.value === category)?.label || 'Uncategorized';
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!canReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sources.findIndex(source => source.id === active.id);
    const newIndex = sources.findIndex(source => source.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sources, oldIndex, newIndex).map((source, index) => ({
      ...source,
      sort_order: index + 1
    }));
    setSources(reordered);

    try {
      await Promise.all(
        reordered.map((source, index) =>
          supabase
            .from('lead_sources')
            .update({ sort_order: index + 1 })
            .eq('id', source.id)
        )
      );
    } catch (err) {
      console.error('Error reordering lead sources:', err);
      setError('Unable to save lead source order. Please try again.');
      loadSources();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-[rgb(0,122,255)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="hig-text-heading mb-1">Lead Sources</h2>
            <p className="text-sm text-gray-600">
              Track partner programs, portals, and referral channels.
            </p>
            <p className="text-xs text-gray-500">
              Standard sources split directly with your brokerage. Partnership sources pay the partner first, then apply the brokerage split to the remaining commission.
            </p>
            {!canEdit && (
              <p className="text-xs text-gray-400 mt-1">
                You can review workspace lead sources. Only admins can make edits.
              </p>
            )}
          </div>
          {canEdit && (
            <button
              onClick={() => {
                setShowModal(true);
                setEditingSource(null);
                setFormData(createDefaultFormState());
                setError(null);
              }}
              className="hig-btn-primary self-start"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              <span>Add Lead Source</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200/70 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="inline-flex flex-wrap gap-2 rounded-2xl border border-gray-200/70 bg-white/80 p-1.5 shadow-inner">
          {typeFilterOptions.map(option => {
            const active = typeFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTypeFilter(option.value)}
                className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                  active ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="relative w-full md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search lead sources"
            className="w-full rounded-2xl border border-gray-200/70 bg-white/90 py-2 pl-9 pr-3 text-sm text-gray-900 shadow-inner focus:border-[var(--app-accent)]/50 focus:ring-2 focus:ring-[var(--app-accent)]/20"
          />
        </div>
      </div>
      {canEdit && (
        <p className="text-xs text-gray-400">
          Drag handles appear when viewing all sources without filters so you can reorder tiles.
        </p>
      )}

      {sources.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/80 p-10 text-center">
          <Tag className="mx-auto mb-4 h-10 w-10 text-gray-400" strokeWidth={1.5} />
          <p className="text-gray-600 mb-2 font-medium">No lead sources configured</p>
          <p className="text-sm text-gray-500 mb-6">
            Add your first lead source to start tracking where your deals originate.
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
            <p className="text-xs text-gray-500">Ask a workspace admin to configure lead sources.</p>
          )}
        </div>
      ) : filteredSources.length === 0 ? (
        <div className="rounded-2xl border border-gray-200/70 bg-white/80 p-10 text-center text-sm text-gray-500">
          No sources match your filters.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filteredSources.map(source => source.id)}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredSources.map(source => (
                <LeadSourceCard
                  key={source.id}
                  source={source}
                  canEdit={canEdit}
                  disableDrag={!canReorder}
                  categoryLabel={getCategoryLabel(source.category)}
                  categoryBadgeClass={getCategoryColor(source.category)}
                  onEdit={() => handleEdit(source)}
                  onDelete={() => handleDelete(source.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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

interface LeadSourceCardProps {
  source: LeadSource;
  categoryLabel: string;
  categoryBadgeClass: string;
  canEdit: boolean;
  disableDrag: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function LeadSourceCard({
  source,
  categoryLabel,
  categoryBadgeClass,
  canEdit,
  disableDrag,
  onEdit,
  onDelete
}: LeadSourceCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: source.id,
    disabled: disableDrag
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const isPartnership = source.payout_structure === 'partnership';
  const brokerSplit = `${(source.brokerage_split_rate * 100).toFixed(1)}%`;
  const partnerSplit = isPartnership ? `${((source.partnership_split_rate ?? 0) * 100).toFixed(1)}%` : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-3xl border border-gray-200/70 bg-white/95 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition ${
        isDragging
          ? 'ring-2 ring-[var(--app-accent)]/40 shadow-[0_18px_45px_rgba(15,23,42,0.15)]'
          : 'hover:border-gray-300/80 hover:shadow-[0_20px_50px_rgba(15,23,42,0.08)]'
      }`}
    >
      <div className="flex items-start gap-3">
        {canEdit && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            disabled={disableDrag}
            className={`mt-1 rounded-full border border-gray-200/70 bg-white/80 p-2 text-gray-400 transition ${
              disableDrag ? 'cursor-not-allowed opacity-40' : 'cursor-grab hover:text-gray-700 active:cursor-grabbing'
            }`}
            aria-label="Drag to reorder lead source"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gray-400">Lead Source</p>
              <h3 className="text-lg font-semibold text-gray-900">{source.name}</h3>
            </div>
            {canEdit ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={onEdit}
                  className="rounded-xl p-1.5 text-gray-600 transition hover:bg-blue-50 hover:text-[var(--app-accent)]"
                  title="Edit lead source"
                >
                  <Pencil className="h-4 w-4" strokeWidth={2} />
                </button>
                <button
                  onClick={onDelete}
                  className="rounded-xl p-1.5 text-gray-600 transition hover:bg-red-50 hover:text-red-600"
                  title="Delete lead source"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            ) : (
              <span className="text-[11px] uppercase tracking-[0.35em] text-gray-400">View only</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${categoryBadgeClass}`}
            >
              <Tag className="h-3 w-3" strokeWidth={2} />
              {categoryLabel}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                isPartnership
                  ? 'border-[var(--app-accent)]/30 bg-[var(--app-accent)]/8 text-[var(--app-accent)]'
                  : 'border-gray-200/80 bg-gray-50 text-gray-600'
              }`}
            >
              {isPartnership ? <Handshake className="h-3 w-3" strokeWidth={2} /> : <Sparkles className="h-3 w-3" strokeWidth={2} />}
              {isPartnership ? 'Partnership' : 'Standard'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <LeadSourceStat label="Broker split" value={brokerSplit} />
        {isPartnership ? <LeadSourceStat label="Partner share" value={partnerSplit!} /> : <LeadSourceStat label="Structure" value="Standard" />}
      </div>

      {isPartnership && (
        <p className="mt-3 rounded-2xl border border-gray-100 bg-gray-50/80 px-3 py-2 text-xs text-gray-600">
          Partner receives {partnerSplit}. Brokerage split applies on the remaining commission.
        </p>
      )}

      {source.partnership_notes && (
        <p className="mt-3 rounded-2xl border border-[var(--app-accent)]/20 bg-[var(--app-accent)]/5 px-3 py-2 text-xs text-gray-700">
          {source.partnership_notes}
        </p>
      )}
    </div>
  );
}

function LeadSourceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white/80 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
