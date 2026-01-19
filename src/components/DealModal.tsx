import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  X,
  Plus,
  Check,
  Trash2,
  Calendar,
  FileText,
  CheckSquare,
  Edit2,
  Loader2
} from 'lucide-react';
import type { Database } from '../lib/database.types';
import { getVisibleUserIds } from '../lib/rbac';
import DealNotes from './DealNotes';

type Deal = Database['public']['Tables']['deals']['Row'];
type LeadSource = Database['public']['Tables']['lead_sources']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type PipelineStatus = Database['public']['Tables']['pipeline_statuses']['Row'];

type FormState = {
  client_name: string;
  client_phone: string;
  client_email: string;
  property_address: string;
  city: string;
  state: string;
  zip: string;
  deal_type: Deal['deal_type'];
  lead_source_id: string;
  pipeline_status_id: string;
  expected_sale_price: number | string;
  actual_sale_price: number | string | null;
  gross_commission_rate: number;
  brokerage_split_rate: number;
  referral_out_rate: number | string | null;
  referral_in_rate: number | string | null;
  transaction_fee: number | string;
  close_date: string | null;
};

interface DealModalProps {
  deal: Deal | null;
  onClose: () => void;
  onDelete?: () => void;
}

const buildFormState = (deal: Deal | null): FormState => ({
  client_name: deal?.client_name || '',
  client_phone: deal?.client_phone || '',
  client_email: deal?.client_email || '',
  property_address: deal?.property_address || '',
  city: deal?.city || '',
  state: deal?.state || '',
  zip: deal?.zip || '',
  deal_type: deal?.deal_type || 'buyer',
  lead_source_id: deal?.lead_source_id || '',
  pipeline_status_id: deal?.pipeline_status_id || '',
  expected_sale_price: deal?.expected_sale_price || '',
  actual_sale_price: deal?.actual_sale_price || '',
  gross_commission_rate: deal?.gross_commission_rate || 0.03,
  brokerage_split_rate: deal?.brokerage_split_rate || 0.2,
  referral_out_rate: deal?.referral_out_rate || '',
  referral_in_rate: deal?.referral_in_rate || '',
  transaction_fee: deal?.transaction_fee || '',
  close_date: deal?.close_date || ''
});

export default function DealModal({ deal, onClose, onDelete }: DealModalProps) {
  const { user, roleInfo } = useAuth();
  const teamId = roleInfo?.teamId || null;

  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(!!deal);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [pipelineStatuses, setPipelineStatuses] = useState<PipelineStatus[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [showAddTaskForm, setShowAddTaskForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [editingTaskDueDate, setEditingTaskDueDate] = useState('');
  const [archived, setArchived] = useState(deal?.status === 'dead');
  const [archivedReason, setArchivedReason] = useState(deal?.archived_reason || '');
  const [isEditing, setIsEditing] = useState(!deal);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const [formData, setFormData] = useState<FormState>(buildFormState(deal));
  const initialFormDataRef = useRef<FormState>(buildFormState(deal));
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  // Reset form state when a different deal is opened
  useEffect(() => {
    const snapshot = buildFormState(deal);
    initialFormDataRef.current = snapshot;
    setFormData(snapshot);
    setArchived(deal?.status === 'dead');
    setArchivedReason(deal?.archived_reason || '');
    setIsEditing(!deal);
    setSubmitError(null);
  }, [deal]);

  // Load supporting data
  useEffect(() => {
    if (!user) return;

    const initialize = async () => {
      setInitializing(!!deal);

      await Promise.all([
        loadLeadSources(),
        loadPipelineStatuses(),
        deal ? loadTasks() : Promise.resolve(),
        deal ? loadArchivedReason() : Promise.resolve()
      ]);

      setInitializing(false);
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal, teamId, user?.id]);

  // Clear pipeline status when archived
  useEffect(() => {
    if (archived) {
      setFormData(prev => ({ ...prev, pipeline_status_id: '' }));
    }
  }, [archived]);

  // Focus first field when editing
  useEffect(() => {
    if (isEditing && firstFieldRef.current) {
      firstFieldRef.current.focus();
    }
  }, [isEditing]);

  // Trigger slide-in animation on mount
  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Prevent background scroll while the drawer is open
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const loadArchivedReason = async () => {
    if (!deal) return;

    const { data, error } = await supabase
      .from('deal_notes')
      .select('content')
      .eq('deal_id', deal.id)
      .ilike('content', 'Archive reason:%')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!error && data && data.length) {
      const note = (data[0] as any).content || '';
      const parsed = note.replace(/^Archive reason:\s*/i, '').trim();
      setArchivedReason(parsed);
    }
  };

  const loadLeadSources = async () => {
    if (!user) return;

    const { data: teamSources, error: teamError } = teamId
      ? await supabase
          .from('lead_sources')
          .select('*')
          .eq('team_id', teamId)
          .order('name')
      : ({ data: null, error: null } as any);

    if (teamError) return;

    const { data } = teamSources?.length
      ? ({ data: teamSources } as any)
      : await supabase
          .from('lead_sources')
          .select('*')
          .eq('user_id', user.id)
          .order('name');

    if (data) setLeadSources(data);
  };

  const loadPipelineStatuses = async () => {
    if (!user) return;

    const { data: teamStatuses, error: teamError } = teamId
      ? await supabase
          .from('pipeline_statuses')
          .select('*')
          .eq('team_id', teamId)
          .order('sort_order')
      : ({ data: null, error: null } as any);

    if (teamError) return;

    const { data } = teamStatuses?.length
      ? ({ data: teamStatuses } as any)
      : await supabase
          .from('pipeline_statuses')
          .select('*')
          .eq('user_id', user.id)
          .order('sort_order');

    if (data) {
      setPipelineStatuses(data);

      if (!deal && data.length > 0 && !formData.pipeline_status_id) {
        setFormData(prev => {
          const next = { ...prev, pipeline_status_id: data[0].id };
          initialFormDataRef.current = next;
          return next;
        });
      }
    }
  };

  const loadTasks = async () => {
    if (!deal || !user) return;

    let visibleUserIds: string[] = [user.id];

    if (roleInfo) {
      visibleUserIds = await getVisibleUserIds(roleInfo);
      if (!visibleUserIds.length) {
        visibleUserIds = [user.id];
      }
    }

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('deal_id', deal.id);

    if (visibleUserIds.length === 1) {
      query = query.eq('user_id', visibleUserIds[0]);
    } else if (visibleUserIds.length > 1) {
      query = query.in('user_id', visibleUserIds);
    }

    const { data } = await query;

    if (data) {
      const sortedTasks = (data as any).sort((a: any, b: any) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return -1;
        if (!b.due_date) return 1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
      setTasks(sortedTasks);
    }
  };

  const handleLeadSourceChange = (sourceId: string) => {
    setFormData(prev => ({ ...prev, lead_source_id: sourceId }));

    const selectedSource = leadSources.find(s => s.id === sourceId);
    if (selectedSource && !deal) {
      setFormData(prev => ({
        ...prev,
        lead_source_id: sourceId,
        brokerage_split_rate: selectedSource.brokerage_split_rate
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setSubmitError(null);

    const selectedStatus = pipelineStatuses.find(s => s.id === formData.pipeline_status_id);
    const lifecycleStage = archived
      ? 'dead'
      : (selectedStatus?.lifecycle_stage || 'new');

    if (!formData.lead_source_id) {
      alert('Please select a lead source');
      setLoading(false);
      return;
    }

    if (archived && !archivedReason) {
      alert('Please choose an archive reason.');
      setLoading(false);
      return;
    }

    const dealData = {
      ...formData,
      user_id: user.id,
      lead_source_id: formData.lead_source_id,
      pipeline_status_id: archived ? null : (formData.pipeline_status_id || null),
      status: lifecycleStage,
      expected_sale_price: Number(formData.expected_sale_price) || 0,
      actual_sale_price: formData.actual_sale_price ? Number(formData.actual_sale_price) : null,
      referral_out_rate: formData.referral_out_rate ? Number(formData.referral_out_rate) : null,
      referral_in_rate: formData.referral_in_rate ? Number(formData.referral_in_rate) : null,
      transaction_fee: Number(formData.transaction_fee) || 0,
      close_date: formData.close_date || null,
      closed_at:
        lifecycleStage === 'closed' || archived
          ? (deal?.closed_at || new Date().toISOString())
          : null,
      archived_reason: archived ? archivedReason : null
    };

    let dealId = deal?.id || null;

    try {
      if (deal) {
        const { error } = await (supabase
          .from('deals') as any)
          .update(dealData)
          .eq('id', deal.id);

        if (error) throw error;
        dealId = deal.id;
      } else {
        const { data: insertData, error: insertError } = await (supabase
          .from('deals') as any)
          .insert(dealData)
          .select('id')
          .single();

        if (insertError) throw insertError;
        if ((insertData as any)?.id) {
          dealId = (insertData as any).id;
        }
      }

      if (archived && dealId) {
        const { error: noteError } = await (supabase.from('deal_notes') as any).insert({
          deal_id: dealId,
          user_id: user.id,
          content: `Archive reason: ${archivedReason}`
        });
        if (noteError) throw noteError;
      }

      if (deal) {
        const refreshedState: FormState = {
          ...formData,
          pipeline_status_id: archived ? '' : formData.pipeline_status_id,
          close_date: formData.close_date || null
        };
        initialFormDataRef.current = refreshedState;
        setFormData(refreshedState);
        setIsEditing(false);
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Error saving deal', err);
      setSubmitError('Could not save this deal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !deal || !user) return;

    const taskOwnerId = deal.user_id || user.id;

    await (supabase.from('tasks') as any).insert({
      deal_id: deal.id,
      user_id: taskOwnerId,
      title: newTaskTitle,
      due_date: newTaskDueDate || null,
      completed: false
    });

    setNewTaskTitle('');
    setNewTaskDueDate('');
    setShowAddTaskForm(false);
    loadTasks();
  };

  const toggleTaskComplete = async (taskId: string, completed: boolean) => {
    await (supabase
      .from('tasks') as any)
      .update({ completed: !completed })
      .eq('id', taskId);

    loadTasks();
  };

  const handleEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setEditingTaskDueDate(task.due_date || '');
  };

  const handleUpdateTask = async () => {
    if (!editingTaskTitle.trim() || !editingTaskId) return;

    await (supabase
      .from('tasks') as any)
      .update({
        title: editingTaskTitle,
        due_date: editingTaskDueDate || null
      })
      .eq('id', editingTaskId);

    setEditingTaskId(null);
    setEditingTaskTitle('');
    setEditingTaskDueDate('');
    loadTasks();
  };

  const handleDeleteTask = async (taskId: string) => {
    await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    loadTasks();
  };

  const handleCancelEditTask = () => {
    setEditingTaskId(null);
    setEditingTaskTitle('');
    setEditingTaskDueDate('');
  };

  const handleDelete = async () => {
    if (!deal) return;

    setLoading(true);

    await supabase
      .from('deals')
      .delete()
      .eq('id', deal.id);

    setLoading(false);
    if (onDelete) onDelete();
    onClose();
  };

  const handleCancelFormEdit = () => {
    setFormData(initialFormDataRef.current);
    setArchived(deal?.status === 'dead');
    setArchivedReason(deal?.archived_reason || '');
    setIsEditing(false);
    setSubmitError(null);
  };

  const handleGenerateOffer = () => {
    if (!deal) return;

    const dealData = {
      client_name: formData.client_name,
      client_email: formData.client_email,
      client_phone: formData.client_phone,
      property_address: formData.property_address,
      city: formData.city,
      state: formData.state,
      zip: formData.zip,
      deal_type: formData.deal_type,
      expected_sale_price: formData.expected_sale_price,
      actual_sale_price: formData.actual_sale_price
    };

    const params = new URLSearchParams({
      source: 'pipelineiq',
      ...Object.entries(dealData).reduce((acc, [key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          acc[key] = String(value);
        }
        return acc;
      }, {} as Record<string, string>)
    });

    window.open(`/contractscribe?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  // Derived values
  const salePrice =
    Number(formData.actual_sale_price) || Number(formData.expected_sale_price) || 0;
  const grossCommission = salePrice * formData.gross_commission_rate;
  const afterBrokerageSplit = grossCommission * (1 - formData.brokerage_split_rate);
  const referralOutRate = Number(formData.referral_out_rate) || 0;
  const referralInRate = Number(formData.referral_in_rate) || 0;
  const transactionFee = Number(formData.transaction_fee) || 0;

  const afterReferralOut = referralOutRate
    ? afterBrokerageSplit * (1 - referralOutRate)
    : afterBrokerageSplit;

  const afterReferralIn = referralInRate
    ? afterReferralOut * (1 + referralInRate)
    : afterReferralOut;

  const netBeforeTax = afterReferralIn - transactionFee;

  const leadSourceLabel =
    leadSources.find(source => source.id === formData.lead_source_id)?.name || 'Not set';

  const pipelineStatusLabel = archived
    ? 'Archived (Closed Lost)'
    : (pipelineStatuses.find(status => status.id === formData.pipeline_status_id)?.name ||
        'Not set');

  const dealTypeLabel =
    {
      buyer: 'Buyer',
      seller: 'Seller',
      buyer_and_seller: 'Buyer & Seller',
      renter: 'Renter',
      landlord: 'Landlord'
    }[formData.deal_type] || 'Not set';

  // SSR guard for portal
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <>
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="hig-card max-w-md w-full p-6">
            <h3 className="hig-text-heading mb-2">Delete Deal</h3>
            <p className="hig-text-body text-gray-600 mb-6">
              Are you sure you want to delete this deal? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="hig-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="bg-[rgb(255,59,48)] hover:bg-red-600 active:bg-red-700 text-white font-medium px-5 py-2 rounded-lg transition-colors duration-150 disabled:opacity-40 text-[15px] min-h-[44px] inline-flex items-center justify-center gap-2"
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen layer (backdrop + drawer) */}
      <div className="fixed inset-0 z-50 flex">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Right-side drawer */}
        <div
          className={`relative ml-auto h-full max-w-3xl w-full md:w-[900px] bg-white shadow-2xl border-l border-gray-200 transform transition-transform duration-200 ease-out flex flex-col overflow-hidden ${
            isVisible ? 'translate-x-0' : 'translate-x-full'
          }`}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200/60 px-6 py-5 flex flex-wrap gap-3 justify-between items-center backdrop-blur-md bg-white/95">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {deal ? 'Deal' : 'New Deal'}
              </p>
              <h2 className="hig-text-display">
                {formData.client_name || 'Deal Details'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {!isEditing && deal && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="hig-btn-primary"
                >
                  Edit
                </button>
              )}
              {isEditing && (
                <>
                  <button
                    type="button"
                    onClick={handleCancelFormEdit}
                    className="hig-btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="deal-edit-form"
                    disabled={loading}
                    className="hig-btn-primary"
                  >
                    {loading ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                type="button"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-150"
              >
                <X className="w-5 h-5 text-gray-600" strokeWidth={2} />
              </button>
            </div>
          </div>

          {submitError && (
            <div className="px-6 pt-4">
              <div className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-700">
                {submitError}
              </div>
            </div>
          )}

          {/* Scrollable content area */}
          <form
            id="deal-edit-form"
            onSubmit={handleSubmit}
            className="p-6 space-y-8 flex-1 overflow-y-auto"
          >
            {initializing && deal && (
              <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-4 py-3 text-sm text-gray-700 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-[rgb(0,122,255)]" />
                <span>Loading deal details…</span>
              </div>
            )}

            <div className="space-y-6">
              {/* Client Information */}
              <div>
                <h3 className="hig-text-heading mb-4">Client Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="hig-label">Client Name *</label>
                    {isEditing ? (
                      <input
                        ref={firstFieldRef}
                        type="text"
                        value={formData.client_name}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            client_name: e.target.value
                          }))
                        }
                        className="hig-input"
                        required
                      />
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {formData.client_name || '—'}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="hig-label">Phone</label>
                    {isEditing ? (
                      <input
                        type="tel"
                        value={formData.client_phone}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            client_phone: e.target.value
                          }))
                        }
                        className="hig-input"
                      />
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {formData.client_phone || '—'}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="hig-label">Email</label>
                    {isEditing ? (
                      <input
                        type="email"
                        value={formData.client_email}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            client_email: e.target.value
                          }))
                        }
                        className="hig-input"
                      />
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {formData.client_email || '—'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Property Details */}
              <div>
                <h3 className="hig-text-heading mb-4">Property Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="hig-label">Property Address</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.property_address}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            property_address: e.target.value
                          }))
                        }
                        className="hig-input"
                        placeholder="e.g., 123 Main St"
                      />
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {formData.property_address || '—'}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="hig-label">City</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.city}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            city: e.target.value
                          }))
                        }
                        className="hig-input"
                      />
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {formData.city || '—'}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="hig-label">State</label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={formData.state}
                          onChange={e =>
                            setFormData(prev => ({
                              ...prev,
                              state: e.target.value
                            }))
                          }
                          className="hig-input"
                          maxLength={2}
                          placeholder="CA"
                        />
                      ) : (
                        <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                          {formData.state || '—'}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="hig-label">ZIP</label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={formData.zip}
                          onChange={e =>
                            setFormData(prev => ({
                              ...prev,
                              zip: e.target.value
                            }))
                          }
                          className="hig-input"
                          maxLength={10}
                        />
                      ) : (
                        <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                          {formData.zip || '—'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Deal Configuration */}
              <div>
                <h3 className="hig-text-heading mb-4">Deal Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="hig-label">Deal Type *</label>
                    {isEditing ? (
                      <select
                        value={formData.deal_type}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            deal_type: e.target.value as any
                          }))
                        }
                        className="hig-input"
                      >
                        <option value="buyer">Buyer</option>
                        <option value="seller">Seller</option>
                        <option value="buyer_and_seller">Buyer &amp; Seller</option>
                        <option value="renter">Renter</option>
                        <option value="landlord">Landlord</option>
                      </select>
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {dealTypeLabel}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="hig-label">Lead Source *</label>
                    {isEditing ? (
                      <select
                        value={formData.lead_source_id}
                        onChange={e => handleLeadSourceChange(e.target.value)}
                        className="hig-input"
                        required
                      >
                        <option value="">Select a source</option>
                        {leadSources.map(source => (
                          <option key={source.id} value={source.id}>
                            {source.name} ({(source.brokerage_split_rate * 100).toFixed(0)}% split)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {leadSourceLabel}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="hig-label">Pipeline Status</label>
                    {isEditing ? (
                      <select
                        value={formData.pipeline_status_id}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            pipeline_status_id: e.target.value
                          }))
                        }
                        className="hig-input"
                      >
                        <option value="">Select a status</option>
                        {pipelineStatuses.map(status => (
                          <option key={status.id} value={status.id}>
                            {status.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {pipelineStatusLabel}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="hig-label">Close Date</label>
                    {isEditing ? (
                      <input
                        type="date"
                        value={formData.close_date || ''}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            close_date: e.target.value
                          }))
                        }
                        className="hig-input"
                      />
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {formData.close_date
                          ? new Date(formData.close_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })
                          : '—'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Financial Details */}
              <div>
                <h3 className="hig-text-heading mb-4">Financial Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="hig-label">Expected Sale Price *</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={formData.expected_sale_price}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            expected_sale_price: e.target.value
                          }))
                        }
                        className="hig-input"
                        placeholder="500,000"
                        required
                      />
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {formData.expected_sale_price
                          ? `$${Number(formData.expected_sale_price).toLocaleString()}`
                          : '—'}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="hig-label">Actual Sale Price</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={formData.actual_sale_price || ''}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            actual_sale_price: e.target.value
                          }))
                        }
                        className="hig-input"
                        placeholder="505,000"
                      />
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {formData.actual_sale_price
                          ? `$${Number(formData.actual_sale_price).toLocaleString()}`
                          : '—'}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="hig-label">Commission Rate (%)</label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={formData.gross_commission_rate * 100}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            gross_commission_rate: parseFloat(e.target.value) / 100 || 0
                          }))
                        }
                        className="hig-input"
                      />
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {(formData.gross_commission_rate * 100 || 0).toFixed(2)}%
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="hig-label">Brokerage Split (% to broker)</label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={formData.brokerage_split_rate * 100}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            brokerage_split_rate: parseFloat(e.target.value) / 100 || 0
                          }))
                        }
                        className="hig-input"
                      />
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {(formData.brokerage_split_rate * 100 || 0).toFixed(2)}%
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="hig-label">Transaction Fee</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={formData.transaction_fee}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            transaction_fee: e.target.value
                          }))
                        }
                        className="hig-input"
                        placeholder="500"
                      />
                    ) : (
                      <div className="rounded-xl border border-gray-200/70 bg-gray-50/80 px-3 py-2.5 text-[15px] text-gray-900">
                        {formData.transaction_fee
                          ? `$${Number(formData.transaction_fee).toLocaleString()}`
                          : '$0'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Commission Breakdown */}
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200/60">
              <h3 className="hig-text-heading mb-4">Commission Breakdown</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="hig-text-body text-gray-600">Gross Commission</span>
                  <span className="hig-text-body font-medium">
                    $
                    {grossCommission.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="hig-text-body text-gray-600">After Brokerage Split</span>
                  <span className="hig-text-body font-medium">
                    $
                    {afterBrokerageSplit.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="hig-text-body text-gray-600">Transaction Fee</span>
                  <span className="hig-text-body font-medium text-gray-500">
                    -
                    {transactionFee.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </span>
                </div>
                <div className="hig-divider my-3" />
                <div className="flex justify-between items-center">
                  <span className="hig-text-heading">Net to Agent</span>
                  <span className="text-xl font-semibold text-[rgb(52,199,89)]">
                    $
                    {netBeforeTax.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Tasks */}
            {deal && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-5 h-5 text-gray-600" strokeWidth={2} />
                    <h3 className="font-semibold text-gray-900">Tasks</h3>
                    <span className="text-sm text-gray-500">({tasks.length})</span>
                  </div>
                  {!showAddTaskForm && (
                    <button
                      type="button"
                      onClick={() => setShowAddTaskForm(true)}
                      className="hig-btn-secondary text-sm py-2"
                    >
                      <Plus className="w-4 h-4" strokeWidth={2} />
                      <span>Add Task</span>
                    </button>
                  )}
                </div>

                {showAddTaskForm && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200/60">
                    <div className="space-y-3">
                      <input
                        id="task-title-input"
                        type="text"
                        value={newTaskTitle}
                        onChange={e => setNewTaskTitle(e.target.value)}
                        placeholder="Task description..."
                        className="hig-input"
                        autoFocus
                        onKeyPress={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTask();
                          }
                        }}
                      />
                      <div className="flex gap-3">
                        <input
                          type="date"
                          value={newTaskDueDate}
                          onChange={e => setNewTaskDueDate(e.target.value)}
                          placeholder="Due date (optional)"
                          className="hig-input flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddTaskForm(false);
                            setNewTaskTitle('');
                            setNewTaskDueDate('');
                          }}
                          className="hig-btn-secondary text-sm py-2"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddTask}
                          disabled={!newTaskTitle.trim()}
                          className="hig-btn-primary text-sm py-2"
                        >
                          <span>Add Task</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {tasks.map(task => {
                    const isOverdue =
                      task.due_date &&
                      !task.completed &&
                      new Date(task.due_date) < new Date();
                    const isDueToday =
                      task.due_date &&
                      !task.completed &&
                      new Date(task.due_date).toDateString() ===
                        new Date().toDateString();

                    if (editingTaskId === task.id) {
                      return (
                        <div
                          key={task.id}
                          className="bg-gray-50 rounded-xl p-4 border border-gray-200/60"
                        >
                          <div className="space-y-3">
                            <input
                              type="text"
                              value={editingTaskTitle}
                              onChange={e => setEditingTaskTitle(e.target.value)}
                              placeholder="Task description..."
                              className="hig-input"
                              autoFocus
                              onKeyPress={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleUpdateTask();
                                }
                              }}
                            />
                            <div className="flex gap-3">
                              <input
                                type="date"
                                value={editingTaskDueDate}
                                onChange={e => setEditingTaskDueDate(e.target.value)}
                                placeholder="Due date (optional)"
                                className="hig-input flex-1"
                              />
                              <button
                                type="button"
                                onClick={handleCancelEditTask}
                                className="hig-btn-secondary text-sm py-2"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleUpdateTask}
                                disabled={!editingTaskTitle.trim()}
                                className="hig-btn-primary text-sm py-2"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={task.id}
                        className="group flex items-center p-3 bg-white border border-gray-200/60 rounded-xl hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              toggleTaskComplete(task.id, task.completed)
                            }
                            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-150 ${
                              task.completed
                                ? 'bg-[rgb(52,199,89)] border-[rgb(52,199,89)]'
                                : 'border-gray-300 hover:border-[rgb(52,199,89)]'
                            }`}
                          >
                            {task.completed && (
                              <Check
                                className="w-3 h-3 text-white"
                                strokeWidth={2.5}
                              />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <span
                              className={
                                task.completed
                                  ? 'line-through text-gray-500 hig-text-body'
                                  : 'text-gray-900 hig-text-body'
                              }
                            >
                              {task.title}
                            </span>
                            {task.due_date && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <Calendar
                                  className="w-3.5 h-3.5 text-gray-400"
                                  strokeWidth={2}
                                />
                                <span
                                  className={`hig-text-caption ${
                                    isOverdue
                                      ? 'text-[rgb(255,59,48)] font-medium'
                                      : isDueToday
                                      ? 'text-[rgb(255,149,0)] font-medium'
                                      : task.completed
                                      ? 'text-gray-400'
                                      : 'text-gray-500'
                                  }`}
                                >
                                  {isOverdue
                                    ? 'Overdue: '
                                    : isDueToday
                                    ? 'Due today: '
                                    : ''}
                                  {new Date(task.due_date).toLocaleDateString(
                                    'en-US',
                                    {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    }
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                            <button
                              type="button"
                              onClick={() => handleEditTask(task)}
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Edit task"
                            >
                              <Edit2
                                className="w-4 h-4 text-gray-600"
                                strokeWidth={2}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTask(task.id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete task"
                            >
                              <Trash2
                                className="w-4 h-4 text-red-600"
                                strokeWidth={2}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Deal Notes */}
            {deal && (
              <div className="pt-8 border-t border-gray-200/60">
                <DealNotes dealId={deal.id} />
              </div>
            )}

            {/* Archive section */}
            {isEditing ? (
              <div className="rounded-xl border border-gray-200/70 bg-white/90 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 border border-gray-200">
                    <CheckSquare className="h-5 w-5 text-gray-700" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">
                          Archive this deal (Closed Lost)
                        </p>
                        <p className="text-sm text-gray-600">
                          Use when a deal falls through, goes MIA, or stops responding.
                          We’ll remove it from the active pipeline and track it for KPIs.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-center">
                      <label className="inline-flex items-center gap-2 md:justify-self-start">
                        <span className="text-sm text-gray-700">Archived</span>
                        <input
                          type="checkbox"
                          checked={archived}
                          onChange={e => setArchived(e.target.checked)}
                          className="h-5 w-5 rounded border-gray-300 text-[rgb(0,122,255)] focus:ring-[rgb(0,122,255)]"
                        />
                      </label>
                      <div className="md:col-span-2">
                        <label className="hig-label mb-1">Archive reason</label>
                        <select
                          value={archivedReason}
                          onChange={e => setArchivedReason(e.target.value)}
                          className="hig-input"
                          disabled={!archived}
                        >
                          <option value="">Select a reason</option>
                          <option value="No Response / Ghosted">
                            No Response / Ghosted
                          </option>
                          <option value="Client Not Ready / Timeline Changed">
                            Client Not Ready / Timeline Changed
                          </option>
                          <option value="Chose Another Agent">Chose Another Agent</option>
                          <option value="Financing Didn’t Work Out">
                            Financing Didn’t Work Out
                          </option>
                          <option value="Deal Fell Through">Deal Fell Through</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200/70 bg-white/90 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 border border-gray-200">
                    <CheckSquare className="h-5 w-5 text-gray-700" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="font-semibold text-gray-900">Archive status</p>
                    <p className="text-sm text-gray-700">
                      {archived ? 'Archived (Closed Lost)' : 'Active'}
                    </p>
                    {archivedReason && (
                      <p className="text-sm text-gray-600">Reason: {archivedReason}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div className="flex justify-between items-center pt-6 border-t border-gray-200/60">
              <div className="flex gap-3">
                {deal && (
                  <>
                    <button
                      type="button"
                      onClick={handleGenerateOffer}
                      className="hig-btn-secondary gap-2"
                    >
                      <FileText className="w-4 h-4" strokeWidth={2} />
                      <span>Generate Offer</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="bg-white hover:bg-red-50 active:bg-red-100 text-[rgb(255,59,48)] font-medium px-5 py-2 rounded-lg border border-red-200 transition-colors duration-150 text-[15px] min-h-[44px] inline-flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                      <span>Delete</span>
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-3">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelFormEdit}
                      className="hig-btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="hig-btn-primary"
                    >
                      {loading ? 'Saving...' : deal ? 'Update Deal' : 'Create Deal'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="hig-btn-secondary"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}
