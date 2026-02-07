import { useState } from 'react';
import { Plus, GripVertical, Pencil, Trash2, RotateCcw, Loader2, X, AlertCircle } from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePipelineStatuses, LIFECYCLE_STAGE_OPTIONS } from '../../hooks/usePipelineStatuses';
import TemplateSelectionModal from '../../components/TemplateSelectionModal';
import { ColorPicker } from '../../components/ui/ColorPicker';
import { DEFAULT_STATUS_COLOR } from '../../components/ui/colorSwatches';
import { getColorByName, getColorValue } from '../../lib/colors';
import type { Database } from '../../lib/database.types';

type PipelineStatus = Database['public']['Tables']['pipeline_statuses']['Row'];

interface PipelineStatusesSettingsProps {
  canEdit?: boolean;
}

function SortableStatusItem({ status, onEdit, onDelete }: {
  status: PipelineStatus;
  onEdit: (status: PipelineStatus) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: status.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const statusColor = getColorByName(status.color);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-gray-200/60 rounded-xl p-4 flex items-center gap-4 hover:shadow-sm hover:border-gray-300 transition-all"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-5 h-5 text-gray-400" />
      </div>

      <div className="flex-1 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full shadow-sm"
            style={{ backgroundColor: statusColor.bg }}
          />
          <span className="text-sm font-medium text-gray-900">
            {status.name}
          </span>
        </div>
        <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-lg">
          Order: {status.sort_order}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onEdit(status)}
          className="p-2 text-gray-600 hover:text-[var(--app-accent)] hover:bg-blue-50 rounded-lg transition"
          title="Edit status"
        >
          <Pencil className="w-4 h-4" strokeWidth={2} />
        </button>
        <button
          onClick={() => onDelete(status.id)}
          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
          title="Delete status"
        >
          <Trash2 className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function StatusPreviewItem({
  status,
  onPersonalize,
  onResetOverride,
  hasPersonalOverride
}: {
  status: PipelineStatus;
  onPersonalize?: (status: PipelineStatus) => void;
  onResetOverride?: (id: string) => void;
  hasPersonalOverride?: boolean;
}) {
  const statusColor = getColorByName(status.color);
  return (
    <div className="bg-white border border-gray-200/60 rounded-xl p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: statusColor.bg }} />
        <div>
          <p className="text-sm font-semibold text-gray-900">{status.name}</p>
          <p className="text-xs text-gray-500">Order {status.sort_order}</p>
          {hasPersonalOverride && (
            <p className="text-[11px] font-semibold text-[var(--app-accent)]">Personalized</p>
          )}
        </div>
      </div>
      {onPersonalize ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPersonalize(status)}
            className="px-3 py-1.5 text-xs font-semibold text-[var(--app-accent)] hover:bg-blue-50 rounded-lg transition"
          >
            Personalize color
          </button>
          {hasPersonalOverride && onResetOverride && (
            <button
              onClick={() => onResetOverride(status.id)}
              className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-lg transition"
            >
              Reset
            </button>
          )}
        </div>
      ) : (
        <span className="text-[11px] uppercase tracking-wide text-gray-400">View only</span>
      )}
    </div>
  );
}

export default function PipelineStatusesSettings({ canEdit = true }: PipelineStatusesSettingsProps) {
  const {
    statuses,
    loading,
    addStatus,
    updateStatus,
    deleteStatus,
    reorderStatuses,
    applyTemplate,
    createCustomWorkflow,
    colorOverrides,
    setPersonalStatusColor,
    clearPersonalStatusColor
  } = usePipelineStatuses();
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState<PipelineStatus | null>(null);
  const [statusName, setStatusName] = useState('');
  const [selectedColor, setSelectedColor] = useState(DEFAULT_STATUS_COLOR);
  const [selectedLifecycleStage, setSelectedLifecycleStage] = useState<PipelineStatus['lifecycle_stage']>('in_progress');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [personalizingStatus, setPersonalizingStatus] = useState<PipelineStatus | null>(null);
  const [personalColor, setPersonalColor] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = statuses.findIndex(s => s.id === active.id);
    const newIndex = statuses.findIndex(s => s.id === over.id);

    const reordered = [...statuses];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    try {
      await reorderStatuses(reordered);
    } catch (err) {
      console.error('Error reordering:', err);
      setError('Failed to reorder statuses');
    }
  };

  const handleSave = async () => {
    if (!statusName.trim()) {
      setError('Status name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingStatus) {
        await updateStatus(editingStatus.id, {
          name: statusName.trim(),
          color: selectedColor,
          lifecycle_stage: selectedLifecycleStage
        });
      } else {
        await addStatus(statusName.trim(), selectedColor, selectedLifecycleStage);
      }

      resetFormAndClose();
    } catch (err) {
      console.error('Error saving status:', err);
      setError(err instanceof Error ? err.message : 'Failed to save status');
    } finally {
      setSaving(false);
    }
  };

  const resetFormAndClose = () => {
    setShowAddModal(false);
    setEditingStatus(null);
    setStatusName('');
    setSelectedColor(DEFAULT_STATUS_COLOR);
    setSelectedLifecycleStage('in_progress');
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this status? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteStatus(id);
    } catch (err) {
      console.error('Error deleting status:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete status');
    }
  };

  const handleEdit = (status: PipelineStatus) => {
    setEditingStatus(status);
    setStatusName(status.name);
    setSelectedColor(getColorValue(status.color) || DEFAULT_STATUS_COLOR);
    setSelectedLifecycleStage(status.lifecycle_stage || 'in_progress');
    setShowAddModal(true);
  };

  const handleApplyTemplate = async (templateName: string) => {
    try {
      await applyTemplate(templateName);
    } catch (err) {
      console.error('Error applying template:', err);
      throw err;
    }
  };

  const openPersonalizeModal = (status: PipelineStatus) => {
    setPersonalizingStatus(status);
    setPersonalColor(status.color || DEFAULT_STATUS_COLOR);
  };

  const handleSavePersonalColor = () => {
    if (!personalizingStatus || !personalColor) return;
    setPersonalStatusColor(personalizingStatus.id, personalColor);
    setPersonalizingStatus(null);
  };

  const handleResetPersonalColor = (statusId?: string) => {
    if (!personalizingStatus && !statusId) return;
    const targetId = statusId || personalizingStatus?.id;
    if (!targetId) return;
    clearPersonalStatusColor(targetId);
    if (!statusId) {
      setPersonalizingStatus(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--app-accent)]" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="hig-text-heading mb-2">Pipeline Statuses</h2>
        <p className="text-sm text-gray-600">
          Customize your pipeline stages, colors, and workflow order
        </p>
        {!canEdit && (
          <p className="text-xs text-gray-500 mt-1">
            Viewing workspace stages from your workspace. You can personalize colors without changing the shared setup.
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
        <>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button
              onClick={() => {
                setStatusName('');
                setSelectedColor(DEFAULT_STATUS_COLOR);
                setShowAddModal(true);
              }}
              className="hig-btn-primary"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              <span>Add Status</span>
            </button>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="hig-btn-secondary"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={2} />
              <span>Load Template</span>
            </button>
          </div>

          {showTemplateModal && (
            <TemplateSelectionModal
              onClose={() => setShowTemplateModal(false)}
              onSelect={handleApplyTemplate}
              onCreateCustomWorkflow={createCustomWorkflow}
            />
          )}
        </>
      )}

      {statuses.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center border border-gray-200/60">
          <p className="text-gray-600 mb-4">No pipeline stages configured</p>
          {canEdit ? (
            <button
              onClick={() => setShowTemplateModal(true)}
              className="hig-btn-primary"
            >
              Load a Template to Get Started
            </button>
          ) : (
            <p className="text-sm text-gray-500">Ask an admin to configure stages for this workspace.</p>
          )}
        </div>
      ) : canEdit ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={statuses.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {statuses.map(status => (
                <SortableStatusItem
                  key={status.id}
                  status={status}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-3">
          {statuses.map(status => (
            <StatusPreviewItem
              key={status.id}
              status={status}
              hasPersonalOverride={!!colorOverrides[status.id]}
              onPersonalize={canEdit ? undefined : openPersonalizeModal}
              onResetOverride={canEdit ? undefined : () => handleResetPersonalColor(status.id)}
            />
          ))}
        </div>
      )}

      {canEdit && showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="flex justify-between items-center p-6 border-b border-gray-200/60">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingStatus ? 'Edit Status' : 'Add New Status'}
              </h2>
              <button
                onClick={resetFormAndClose}
                className="text-gray-400 hover:text-gray-600 transition p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Status Name
                </label>
                <input
                  type="text"
                  value={statusName}
                  onChange={(e) => setStatusName(e.target.value)}
                  className="hig-input"
                  placeholder="e.g., Inspection, Appraisal"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-3">
                  Color
                </label>
                <ColorPicker
                  value={selectedColor}
                  onChange={setSelectedColor}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Top-level status mapping
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Map this stage to one of the four canonical lifecycle buckets so reports stay accurate.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {LIFECYCLE_STAGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedLifecycleStage(option.value)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                        selectedLifecycleStage === option.value
                          ? 'border-[var(--app-accent)] bg-[var(--app-accent)]/5 text-[var(--app-accent)]'
                          : 'border-gray-200 text-gray-700 hover:border-[var(--app-accent)]/40 hover:text-[var(--app-accent)]'
                      }`}
                    >
                      <span>{option.label}</span>
                      {selectedLifecycleStage === option.value && (
                        <span className="text-[var(--app-accent)] text-xs font-semibold">Selected</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200/60 bg-gray-50/50">
              <button
                onClick={resetFormAndClose}
                className="hig-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !statusName.trim()}
                className="hig-btn-primary"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{editingStatus ? 'Update' : 'Add'} Status</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {!canEdit && personalizingStatus && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="flex justify-between items-center p-6 border-b border-gray-200/60">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Personalize "{personalizingStatus.name}"</h2>
                <p className="text-xs text-gray-500 mt-1">Changes apply only to your view. Workspace defaults stay intact.</p>
              </div>
              <button
                onClick={() => setPersonalizingStatus(null)}
                className="text-gray-400 hover:text-gray-600 transition p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <ColorPicker
                value={personalColor}
                onChange={setPersonalColor}
              />
            </div>

            <div className="flex justify-between items-center gap-3 p-6 border-t border-gray-200/60 bg-gray-50/50">
              <button
                onClick={() => handleResetPersonalColor()}
                className="text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 px-3 py-2 rounded-lg transition"
              >
                Use workspace default
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setPersonalizingStatus(null)}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePersonalColor}
                  className="hig-btn-primary"
                >
                  Save for me
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
