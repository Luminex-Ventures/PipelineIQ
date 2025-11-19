import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Plus, Check, Trash2, Calendar, FileText, CheckSquare, Edit2, GripVertical } from 'lucide-react';
import type { Database } from '../lib/database.types';
import DealNotes from './DealNotes';

type Deal = Database['public']['Tables']['deals']['Row'];
type LeadSource = Database['public']['Tables']['lead_sources']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type PipelineStatus = Database['public']['Tables']['pipeline_statuses']['Row'];

interface DealModalProps {
  deal: Deal | null;
  onClose: () => void;
  onDelete?: () => void;
}

export default function DealModal({ deal, onClose, onDelete }: DealModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
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

  const [formData, setFormData] = useState({
    client_name: deal?.client_name || '',
    client_phone: deal?.client_phone || '',
    client_email: deal?.client_email || '',
    property_address: deal?.property_address || '',
    city: deal?.city || '',
    state: deal?.state || '',
    zip: deal?.zip || '',
    deal_type: deal?.deal_type || 'buyer' as const,
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

  useEffect(() => {
    loadLeadSources();
    loadPipelineStatuses();
    if (deal) {
      loadTasks();
    }
  }, [deal]);

  const loadLeadSources = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('lead_sources')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (data) setLeadSources(data);
  };

  const loadPipelineStatuses = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('pipeline_statuses')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order');

    if (data) {
      setPipelineStatuses(data);
      if (!deal && data.length > 0 && !formData.pipeline_status_id) {
        setFormData(prev => ({ ...prev, pipeline_status_id: data[0].id }));
      }
    }
  };

  const loadTasks = async () => {
    if (!deal || !user) return;
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('deal_id', deal.id)
      .eq('user_id', user.id);

    if (data) {
      const sortedTasks = data.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return -1;
        if (!b.due_date) return 1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
      setTasks(sortedTasks);
    }
  };

  const handleLeadSourceChange = (sourceId: string) => {
    setFormData({ ...formData, lead_source_id: sourceId });

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

    const selectedStatus = pipelineStatuses.find(s => s.id === formData.pipeline_status_id);

    if (!formData.lead_source_id) {
      alert('Please select a lead source');
      setLoading(false);
      return;
    }

    const dealData = {
      ...formData,
      user_id: user.id,
      lead_source_id: formData.lead_source_id,
      pipeline_status_id: formData.pipeline_status_id || null,
      status: selectedStatus ? (selectedStatus.slug || selectedStatus.name || 'new_lead').toLowerCase() : 'new_lead',
      expected_sale_price: Number(formData.expected_sale_price) || 0,
      actual_sale_price: formData.actual_sale_price ? Number(formData.actual_sale_price) : null,
      referral_out_rate: formData.referral_out_rate ? Number(formData.referral_out_rate) : null,
      referral_in_rate: formData.referral_in_rate ? Number(formData.referral_in_rate) : null,
      transaction_fee: Number(formData.transaction_fee) || 0,
      close_date: formData.close_date || null
    };

    if (deal) {
      await supabase
        .from('deals')
        .update(dealData)
        .eq('id', deal.id);
    } else {
      await supabase
        .from('deals')
        .insert(dealData);
    }

    setLoading(false);
    onClose();
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !deal || !user) return;

    await supabase
      .from('tasks')
      .insert({
        deal_id: deal.id,
        user_id: user.id,
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
    await supabase
      .from('tasks')
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

    await supabase
      .from('tasks')
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

  const handleCancelEdit = () => {
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

  const salePrice = Number(formData.actual_sale_price) || Number(formData.expected_sale_price) || 0;
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

  return (
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

      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="hig-card max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200/60 px-6 py-5 flex justify-between items-center backdrop-blur-md bg-white/95">
          <h2 className="hig-text-display">
            {deal ? 'Edit Deal' : 'New Deal'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-150"
          >
            <X className="w-5 h-5 text-gray-600" strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          <div className="space-y-6">
            <div>
              <h3 className="hig-text-heading mb-4">Client Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="hig-label">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    value={formData.client_name}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                    className="hig-input"
                    required
                  />
                </div>

                <div>
                  <label className="hig-label">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.client_phone}
                    onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                    className="hig-input"
                  />
                </div>

                <div>
                  <label className="hig-label">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.client_email}
                    onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                    className="hig-input"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="hig-text-heading mb-4">Property Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="hig-label">
                    Property Address
                  </label>
                  <input
                    type="text"
                    value={formData.property_address}
                    onChange={(e) => setFormData({ ...formData, property_address: e.target.value })}
                    className="hig-input"
                    placeholder="e.g., 123 Main St"
                  />
                </div>

                <div>
                  <label className="hig-label">
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="hig-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="hig-label">
                      State
                    </label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="hig-input"
                      maxLength={2}
                      placeholder="CA"
                    />
                  </div>

                  <div>
                    <label className="hig-label">
                      ZIP
                    </label>
                    <input
                      type="text"
                      value={formData.zip}
                      onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                      className="hig-input"
                      maxLength={10}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="hig-text-heading mb-4">Deal Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="hig-label">
                    Deal Type *
                  </label>
                  <select
                    value={formData.deal_type}
                    onChange={(e) => setFormData({ ...formData, deal_type: e.target.value as any })}
                    className="hig-input"
                  >
                    <option value="buyer">Buyer</option>
                    <option value="seller">Seller</option>
                    <option value="buyer_and_seller">Buyer & Seller</option>
                    <option value="renter">Renter</option>
                    <option value="landlord">Landlord</option>
                  </select>
                </div>

                <div>
                  <label className="hig-label">
                    Lead Source *
                  </label>
                  <select
                    value={formData.lead_source_id}
                    onChange={(e) => handleLeadSourceChange(e.target.value)}
                    className="hig-input"
                    required
                  >
                    <option value="">Select a source</option>
                    {leadSources.map(source => (
                      <option key={source.id} value={source.id}>{source.name} ({(source.brokerage_split_rate * 100).toFixed(0)}% split)</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="hig-label">
                    Pipeline Status
                  </label>
                  <select
                    value={formData.pipeline_status_id}
                    onChange={(e) => setFormData({ ...formData, pipeline_status_id: e.target.value })}
                    className="hig-input"
                  >
                    <option value="">Select a status</option>
                    {pipelineStatuses.map(status => (
                      <option key={status.id} value={status.id}>{status.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="hig-label">
                    Close Date
                  </label>
                  <input
                    type="date"
                    value={formData.close_date}
                    onChange={(e) => setFormData({ ...formData, close_date: e.target.value })}
                    className="hig-input"
                  />
                </div>

              </div>
            </div>

            <div>
              <h3 className="hig-text-heading mb-4">Financial Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="hig-label">
                    Expected Sale Price *
                  </label>
                  <input
                    type="number"
                    value={formData.expected_sale_price}
                    onChange={(e) => setFormData({ ...formData, expected_sale_price: e.target.value })}
                    className="hig-input"
                    placeholder="500,000"
                    required
                  />
                </div>

                <div>
                  <label className="hig-label">
                    Actual Sale Price
                  </label>
                  <input
                    type="number"
                    value={formData.actual_sale_price}
                    onChange={(e) => setFormData({ ...formData, actual_sale_price: e.target.value })}
                    className="hig-input"
                    placeholder="505,000"
                  />
                </div>

                <div>
                  <label className="hig-label">
                    Commission Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.gross_commission_rate * 100}
                    onChange={(e) => setFormData({ ...formData, gross_commission_rate: parseFloat(e.target.value) / 100 || 0 })}
                    className="hig-input"
                  />
                </div>

                <div>
                  <label className="hig-label">
                    Brokerage Split (% to broker)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.brokerage_split_rate * 100}
                    onChange={(e) => setFormData({ ...formData, brokerage_split_rate: parseFloat(e.target.value) / 100 || 0 })}
                    className="hig-input"
                  />
                </div>

                <div>
                  <label className="hig-label">
                    Transaction Fee
                  </label>
                  <input
                    type="number"
                    value={formData.transaction_fee}
                    onChange={(e) => setFormData({ ...formData, transaction_fee: e.target.value })}
                    className="hig-input"
                    placeholder="500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-5 border border-gray-200/60">
            <h3 className="hig-text-heading mb-4">Commission Breakdown</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="hig-text-body text-gray-600">Gross Commission</span>
                <span className="hig-text-body font-medium">${grossCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="hig-text-body text-gray-600">After Brokerage Split</span>
                <span className="hig-text-body font-medium">${afterBrokerageSplit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="hig-text-body text-gray-600">Transaction Fee</span>
                <span className="hig-text-body font-medium text-gray-500">-${transactionFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="hig-divider my-3"></div>
              <div className="flex justify-between items-center">
                <span className="hig-text-heading">Net to Agent</span>
                <span className="text-xl font-semibold text-[rgb(52,199,89)]">${netBeforeTax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

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
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Task description..."
                      className="hig-input"
                      autoFocus
                      onKeyPress={(e) => {
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
                        onChange={(e) => setNewTaskDueDate(e.target.value)}
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
                  const isOverdue = task.due_date && !task.completed && new Date(task.due_date) < new Date();
                  const isDueToday = task.due_date && !task.completed &&
                    new Date(task.due_date).toDateString() === new Date().toDateString();

                  if (editingTaskId === task.id) {
                    return (
                      <div key={task.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200/60">
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={editingTaskTitle}
                            onChange={(e) => setEditingTaskTitle(e.target.value)}
                            placeholder="Task description..."
                            className="hig-input"
                            autoFocus
                            onKeyPress={(e) => {
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
                              onChange={(e) => setEditingTaskDueDate(e.target.value)}
                              placeholder="Due date (optional)"
                              className="hig-input flex-1"
                            />
                            <button
                              type="button"
                              onClick={handleCancelEdit}
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
                    <div key={task.id} className="group flex items-center p-3 bg-white border border-gray-200/60 rounded-xl hover:shadow-sm transition-all">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleTaskComplete(task.id, task.completed)}
                          className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-150 ${
                            task.completed
                              ? 'bg-[rgb(52,199,89)] border-[rgb(52,199,89)]'
                              : 'border-gray-300 hover:border-[rgb(52,199,89)]'
                          }`}
                        >
                          {task.completed && <Check className="w-3 h-3 text-white" strokeWidth={2.5} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className={task.completed ? 'line-through text-gray-500 hig-text-body' : 'text-gray-900 hig-text-body'}>
                            {task.title}
                          </span>
                          {task.due_date && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
                              <span className={`hig-text-caption ${
                                isOverdue ? 'text-[rgb(255,59,48)] font-medium' :
                                isDueToday ? 'text-[rgb(255,149,0)] font-medium' :
                                task.completed ? 'text-gray-400' : 'text-gray-500'
                              }`}>
                                {isOverdue ? 'Overdue: ' : isDueToday ? 'Due today: ' : ''}
                                {new Date(task.due_date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
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
                            <Edit2 className="w-4 h-4 text-gray-600" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete task"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {deal && (
            <div className="pt-8 border-t border-gray-200/60">
              <DealNotes dealId={deal.id} />
            </div>
          )}

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
              <button
                type="button"
                onClick={onClose}
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
            </div>
          </div>
        </form>
      </div>
    </div>
    </>
  );
}
