import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { Plus, Trash2, Loader2, AlertCircle, DollarSign, GripVertical } from 'lucide-react';
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Database } from '../../../lib/database.types';

type WorkspaceDeduction = Database['public']['Tables']['workspace_deductions']['Row'];
type WorkspaceDeductionInsert = Database['public']['Tables']['workspace_deductions']['Insert'];

interface DeductionFormState {
  name: string;
  type: 'percentage' | 'flat';
  value: number;
}

const createDefaultForm = (): DeductionFormState => ({
  name: '',
  type: 'flat',
  value: 0
});

export default function WorkspaceDeductionsSettings() {
  const { user, roleInfo } = useAuth();
  const [deductions, setDeductions] = useState<WorkspaceDeduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<DeductionFormState>(createDefaultForm());
  const [editingId, setEditingId] = useState<string | null>(null);

  const canEdit = roleInfo?.globalRole === 'admin' || roleInfo?.globalRole === 'sales_manager';

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 3 }
    })
  );

  const loadDeductions = useCallback(async () => {
    if (!roleInfo?.workspaceId) return;
    
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('workspace_deductions')
        .select('*')
        .eq('workspace_id', roleInfo.workspaceId)
        .order('apply_order', { ascending: true });

      if (fetchError) throw fetchError;
      setDeductions(data || []);
    } catch (err) {
      console.error('Error loading deductions:', err);
      setError('Failed to load deductions');
    } finally {
      setLoading(false);
    }
  }, [roleInfo?.workspaceId]);

  useEffect(() => {
    loadDeductions();
  }, [loadDeductions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !roleInfo?.workspaceId || !canEdit) return;

    if (!formData.name.trim()) {
      setError('Please enter a name for the deduction');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const valueForDb = formData.type === 'percentage' ? formData.value / 100 : formData.value;

      if (editingId) {
        const { error: updateError } = await supabase
          .from('workspace_deductions')
          .update({
            name: formData.name.trim(),
            type: formData.type,
            value: valueForDb
          })
          .eq('id', editingId);

        if (updateError) throw updateError;
      } else {
        const maxOrder = deductions.reduce((max, d) => Math.max(max, d.apply_order), 0);
        const insertPayload: WorkspaceDeductionInsert = {
          workspace_id: roleInfo.workspaceId,
          name: formData.name.trim(),
          type: formData.type,
          value: valueForDb,
          apply_order: maxOrder + 1,
          is_active: true
        };

        const { error: insertError } = await supabase
          .from('workspace_deductions')
          .insert(insertPayload);

        if (insertError) throw insertError;
      }

      setShowAddForm(false);
      setEditingId(null);
      setFormData(createDefaultForm());
      loadDeductions();
    } catch (err) {
      console.error('Error saving deduction:', err);
      setError(err instanceof Error ? err.message : 'Failed to save deduction');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (deduction: WorkspaceDeduction) => {
    setEditingId(deduction.id);
    setFormData({
      name: deduction.name,
      type: deduction.type,
      value: deduction.type === 'percentage' ? deduction.value * 100 : deduction.value
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!canEdit) return;
    if (!confirm('Are you sure you want to delete this deduction?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('workspace_deductions')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      loadDeductions();
    } catch (err) {
      console.error('Error deleting deduction:', err);
      setError('Failed to delete deduction');
    }
  };

  const handleToggleActive = async (deduction: WorkspaceDeduction) => {
    if (!canEdit) return;

    try {
      const { error: updateError } = await supabase
        .from('workspace_deductions')
        .update({ is_active: !deduction.is_active })
        .eq('id', deduction.id);

      if (updateError) throw updateError;
      loadDeductions();
    } catch (err) {
      console.error('Error toggling deduction:', err);
      setError('Failed to update deduction');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !canEdit) return;

    const oldIndex = deductions.findIndex(d => d.id === active.id);
    const newIndex = deductions.findIndex(d => d.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(deductions, oldIndex, newIndex);
    const updated = reordered.map((d, i) => ({ ...d, apply_order: i + 1 }));
    setDeductions(updated);

    try {
      await Promise.all(
        updated.map(d =>
          supabase
            .from('workspace_deductions')
            .update({ apply_order: d.apply_order })
            .eq('id', d.id)
        )
      );
    } catch (err) {
      console.error('Error reordering:', err);
      loadDeductions();
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#1e3a5f] mb-1">Default Deductions</h2>
        <p className="text-sm text-gray-600">
          Configure fees that apply to all deals by default. Agents can waive or adjust these per deal.
        </p>
        {!canEdit && (
          <p className="text-xs text-gray-500 mt-1">
            Only admins and sales managers can edit default deductions.
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {canEdit && (
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingId(null);
            setFormData(createDefaultForm());
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
          style={{ backgroundColor: '#1e3a5f', color: '#ffffff' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D4883A'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1e3a5f'}
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium">Add Deduction</span>
        </button>
      )}

      {showAddForm && canEdit && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="font-semibold text-[#1e3a5f]">
            {editingId ? 'Edit Deduction' : 'Add New Deduction'}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="hig-input"
                placeholder="e.g., Broker Fee"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'flat' | 'percentage' })}
                className="hig-input"
              >
                <option value="flat">Flat Amount ($)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <div className="relative">
                {formData.type === 'flat' && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                )}
                <input
                  type="number"
                  step={formData.type === 'percentage' ? '0.1' : '1'}
                  value={formData.value || ''}
                  onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                  className={`hig-input ${formData.type === 'flat' ? 'pl-7' : 'pr-7'}`}
                  placeholder={formData.type === 'flat' ? '695' : '2'}
                />
                {formData.type === 'percentage' && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setEditingId(null);
                setFormData(createDefaultForm());
              }}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all disabled:opacity-50"
              style={{ backgroundColor: '#1e3a5f', color: '#ffffff' }}
              onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = '#D4883A')}
              onMouseLeave={(e) => !saving && (e.currentTarget.style.backgroundColor = '#1e3a5f')}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{editingId ? 'Update' : 'Add'} Deduction</span>
              )}
            </button>
          </div>
        </form>
      )}

      {deductions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <DollarSign className="mx-auto h-10 w-10 text-gray-400 mb-4" />
          <p className="text-gray-600 font-medium mb-1">No default deductions configured</p>
          <p className="text-sm text-gray-500">
            Add fees like broker fees or admin fees that will apply to all deals.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={deductions.map(d => d.id)} strategy={verticalListSortingStrategy}>
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              {deductions.map((deduction, index) => (
                <DeductionRow
                  key={deduction.id}
                  deduction={deduction}
                  canEdit={canEdit}
                  isLast={index === deductions.length - 1}
                  onEdit={() => handleEdit(deduction)}
                  onDelete={() => handleDelete(deduction.id)}
                  onToggleActive={() => handleToggleActive(deduction)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          <strong>How it works:</strong> These deductions are applied to every deal by default. 
          When creating or editing a deal, agents can waive, reduce, or add additional deductions 
          specific to that deal.
        </p>
      </div>
    </div>
  );
}

interface DeductionRowProps {
  deduction: WorkspaceDeduction;
  canEdit: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

function DeductionRow({ deduction, canEdit, isLast, onEdit, onDelete, onToggleActive }: DeductionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deduction.id,
    disabled: !canEdit
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? 'transform 200ms ease'
  };

  const displayValue = deduction.type === 'percentage' 
    ? `${(deduction.value * 100).toFixed(1)}%`
    : `$${deduction.value.toLocaleString()}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-4 px-4 py-3 transition ${
        isDragging ? 'bg-orange-50 ring-2 ring-[var(--app-accent)]/40' : 'hover:bg-gray-50'
      } ${!isLast ? 'border-b border-gray-100' : ''} ${!deduction.is_active ? 'opacity-50' : ''}`}
    >
      {canEdit && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex-shrink-0 p-1 text-gray-400 cursor-grab hover:text-gray-700 active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium ${deduction.is_active ? 'text-[#1e3a5f]' : 'text-gray-500 line-through'}`}>
            {deduction.name}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
            deduction.type === 'flat' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
          }`}>
            {deduction.type === 'flat' ? 'Flat' : 'Percentage'}
          </span>
          {!deduction.is_active && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-gray-200 text-gray-600">
              Inactive
            </span>
          )}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className="font-semibold text-[#1e3a5f]">{displayValue}</div>
      </div>

      {canEdit && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onToggleActive}
            className={`p-1.5 rounded-lg transition ${
              deduction.is_active 
                ? 'text-gray-500 hover:bg-yellow-50 hover:text-yellow-600' 
                : 'text-gray-400 hover:bg-green-50 hover:text-green-600'
            }`}
            title={deduction.is_active ? 'Deactivate' : 'Activate'}
          >
            <span className="text-xs font-medium">{deduction.is_active ? 'Disable' : 'Enable'}</span>
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-[var(--app-accent)]"
            title="Edit"
          >
            <span className="text-xs font-medium">Edit</span>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-500 transition hover:bg-red-50 hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
