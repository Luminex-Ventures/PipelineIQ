import { useState } from 'react';
import { Plus, GripVertical, Pencil, Trash2, RotateCcw, Loader2, X } from 'lucide-react';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePipelineStatuses, LIFECYCLE_STAGE_OPTIONS } from '../hooks/usePipelineStatuses';
import TemplateSelectionModal from '../components/TemplateSelectionModal';
import { ColorPicker, DEFAULT_STATUS_COLOR } from '../components/ui/ColorPicker';
import { getColorByName } from '../lib/colors';
import type { Database } from '../lib/database.types';

type PipelineStatus = Database['public']['Tables']['pipeline_statuses']['Row'];


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
      className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-5 h-5 text-gray-400" />
      </div>

      <div className="flex-1 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: statusColor.bg }}
          />
          <span className="text-sm font-medium text-gray-900">
            {status.name}
          </span>
        </div>
        <span className="text-sm text-gray-500">
          Order: {status.sort_order}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onEdit(status)}
          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(status.id)}
          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function PipelineSettings() {
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
  const [formData, setFormData] = useState({ name: '', color: DEFAULT_STATUS_COLOR, lifecycle_stage: 'in_progress' as PipelineStatus['lifecycle_stage'] });
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
    if (!formData.name.trim()) {
      setError('Status name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingStatus) {
        await updateStatus(editingStatus.id, {
          name: formData.name,
          color: formData.color,
          lifecycle_stage: formData.lifecycle_stage
        });
      } else {
        await addStatus(formData.name, formData.color, formData.lifecycle_stage);
      }

      setShowAddModal(false);
      setEditingStatus(null);
      setFormData({ name: '', color: DEFAULT_STATUS_COLOR, lifecycle_stage: 'in_progress' });
    } catch (err) {
      console.error('Error saving status:', err);
      setError(err instanceof Error ? err.message : 'Failed to save status');
    } finally {
      setSaving(false);
    }
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
    setFormData({
      name: status.name,
      color: status.color || DEFAULT_STATUS_COLOR,
      lifecycle_stage: status.lifecycle_stage || 'in_progress'
    });
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Pipeline Configuration</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Customize your pipeline stages to match your workflow
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTemplateModal(true)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center space-x-2 transition text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Load Template</span>
          </button>
          <button
            onClick={() => {
              setEditingStatus(null);
                  setFormData({ name: '', color: DEFAULT_STATUS_COLOR, lifecycle_stage: 'in_progress' });
              setShowAddModal(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center space-x-2 transition text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Status</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Pipeline Stages</h2>
        <p className="text-sm text-gray-600 mb-6">Drag to reorder, click to edit</p>

        {statuses.length === 0 ? (
          <div className="bg-white rounded-lg p-12 text-center">
            <p className="text-gray-600 mb-4">No pipeline stages configured</p>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              Load a Template to Get Started
            </button>
          </div>
        ) : (
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
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingStatus ? 'Edit Status' : 'Add New Status'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingStatus(null);
                  setFormData({ name: '', color: DEFAULT_STATUS_COLOR, lifecycle_stage: 'in_progress' });
                  setError(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Inspection, Appraisal"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Color
                </label>
                <ColorPicker
                  value={formData.color}
                  onChange={(color) => setFormData({ ...formData, color })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Top-level status mapping
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Choose the lifecycle bucket this stage belongs to (New, In Progress, Closed, Dead).
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {LIFECYCLE_STAGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, lifecycle_stage: option.value })}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                        formData.lifecycle_stage === option.value
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-gray-200 text-gray-700 hover:border-blue-200 hover:text-blue-600'
                      }`}
                    >
                      <span>{option.label}</span>
                      {formData.lifecycle_stage === option.value && (
                        <span className="text-blue-600 text-xs font-semibold">Selected</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingStatus(null);
                  setFormData({ name: '', color: DEFAULT_STATUS_COLOR, lifecycle_stage: 'in_progress' });
                  setError(null);
                }}
                disabled={saving}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name.trim()}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{editingStatus ? 'Update' : 'Create'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTemplateModal && (
        <TemplateSelectionModal
          onClose={() => setShowTemplateModal(false)}
          onSelect={handleApplyTemplate}
          onCreateCustomWorkflow={createCustomWorkflow}
        />
      )}
    </div>
  );
}
