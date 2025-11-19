import { useState } from 'react';
import { Plus, GripVertical, Pencil, Trash2, RotateCcw, Loader2, X, AlertCircle } from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePipelineStatuses } from '../../hooks/usePipelineStatuses';
import TemplateSelectionModal from '../../components/TemplateSelectionModal';
import { ColorPicker } from '../../components/ui/ColorPicker';
import { getColorByName, getColorValue, normalizeRgbInput } from '../../lib/colors';
import type { Database } from '../../lib/database.types';

type PipelineStatus = Database['public']['Tables']['pipeline_statuses']['Row'];

interface PipelineStatusesSettingsProps {
  canEdit?: boolean;
}

const DEFAULT_PICKER_COLOR = 'hsl(220, 70%, 50%)';

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
          className="p-2 text-gray-600 hover:text-[rgb(0,122,255)] hover:bg-blue-50 rounded-lg transition"
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

function StatusPreviewItem({ status }: { status: PipelineStatus }) {
  const statusColor = getColorByName(status.color);
  return (
    <div className="bg-white border border-gray-200/60 rounded-xl p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: statusColor.bg }} />
        <div>
          <p className="text-sm font-semibold text-gray-900">{status.name}</p>
          <p className="text-xs text-gray-500">Order {status.sort_order}</p>
        </div>
      </div>
      <span className="text-[11px] uppercase tracking-wide text-gray-400">View only</span>
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
    createCustomWorkflow
  } = usePipelineStatuses();
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState<PipelineStatus | null>(null);
  const [statusName, setStatusName] = useState('');
  const [pickerColor, setPickerColor] = useState(DEFAULT_PICKER_COLOR);
  const [colorMode, setColorMode] = useState<'picker' | 'rgb'>('picker');
  const [rgbInput, setRgbInput] = useState('');
  const [rgbPreview, setRgbPreview] = useState<string | null>(null);
  const [rgbValidationError, setRgbValidationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

    let colorToSave = pickerColor;
    if (colorMode === 'rgb') {
      const normalized = normalizeRgbInput(rgbInput);
      if (!normalized) {
        setRgbValidationError('Enter RGB values between 0 and 255 (e.g., 0,122,255)');
        return;
      }
      colorToSave = normalized;
    }

    setSaving(true);
    setError(null);
    setRgbValidationError(null);

    try {
      if (editingStatus) {
        await updateStatus(editingStatus.id, {
          name: statusName.trim(),
          color: colorToSave
        });
      } else {
        await addStatus(statusName.trim(), colorToSave);
      }

      resetFormAndClose();
    } catch (err) {
      console.error('Error saving status:', err);
      setError(err instanceof Error ? err.message : 'Failed to save status');
    } finally {
      setSaving(false);
    }
  };

  const handleRgbInputChange = (value: string) => {
    setRgbInput(value);
    if (!value.trim()) {
      setRgbPreview(null);
      setRgbValidationError(null);
      return;
    }

    const normalized = normalizeRgbInput(value);
    if (normalized) {
      setRgbPreview(normalized);
      setRgbValidationError(null);
    } else {
      setRgbPreview(null);
      setRgbValidationError('Enter RGB values between 0 and 255 (e.g., 74,144,226)');
    }
  };

  const resetFormAndClose = () => {
    setShowAddModal(false);
    setEditingStatus(null);
    setStatusName('');
    setPickerColor(DEFAULT_PICKER_COLOR);
    setColorMode('picker');
    setRgbInput('');
    setRgbPreview(null);
    setRgbValidationError(null);
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

    if (status.color && status.color.toLowerCase().startsWith('rgb(')) {
      setColorMode('rgb');
      setRgbInput(status.color);
      setRgbPreview(status.color);
      setRgbValidationError(null);
    } else {
      setColorMode('picker');
      setPickerColor(getColorValue(status.color) || DEFAULT_PICKER_COLOR);
      setRgbInput('');
      setRgbPreview(null);
      setRgbValidationError(null);
    }

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
        <h2 className="hig-text-heading mb-2">Pipeline Statuses</h2>
        <p className="text-sm text-gray-600">
          Customize your pipeline stages, colors, and workflow order
        </p>
        {!canEdit && (
          <p className="text-xs text-gray-500 mt-1">
            Viewing workspace stages. Only admins can modify pipeline statuses.
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
                setPickerColor(DEFAULT_PICKER_COLOR);
                setColorMode('picker');
                setRgbInput('');
                setRgbPreview(null);
                setRgbValidationError(null);
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
            <StatusPreviewItem key={status.id} status={status} />
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

                <div className="inline-flex rounded-lg border border-gray-200/60 p-0.5 mb-4 gap-1 bg-gray-50/80">
                  {[
                    { id: 'picker', label: 'Color Picker' },
                    { id: 'rgb', label: 'Custom RGB' }
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setColorMode(mode.id as 'picker' | 'rgb');
                        if (mode.id === 'picker') {
                          setRgbValidationError(null);
                        }
                      }}
                      className={`px-3 py-1.5 text-sm rounded-md transition ${
                        colorMode === mode.id
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {colorMode === 'picker' ? (
                  <ColorPicker
                    value={pickerColor}
                    onChange={setPickerColor}
                  />
                ) : (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={rgbInput}
                      onChange={(e) => handleRgbInputChange(e.target.value)}
                      placeholder="rgb(0, 122, 255) or 0,122,255"
                      className="hig-input"
                    />
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl border border-gray-200/60"
                        style={{ backgroundColor: rgbPreview || '#f5f5f5' }}
                      />
                      <div className="flex flex-col text-xs font-mono text-gray-600">
                        <span className="uppercase tracking-wide text-gray-500">Preview</span>
                        <span>{rgbPreview || 'N/A'}</span>
                      </div>
                    </div>
                    {rgbValidationError ? (
                      <p className="text-sm text-red-600">{rgbValidationError}</p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Provide values between 0 and 255. Example: <span className="font-mono">74, 144, 226</span>
                      </p>
                    )}
                  </div>
                )}
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
    </div>
  );
}
