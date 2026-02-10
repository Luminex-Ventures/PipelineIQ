import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { calculateCommissionBreakdown, getTieredSplitRate } from '../lib/commission';
import { useAuth } from '../contexts/AuthContext';
import {
  X,
  Plus,
  Check,
  Trash2,
  FileText,
  Edit2,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Home,
  MoreHorizontal,
  TrendingUp,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import QuickAddTask from './QuickAddTask';
import type { Database, DealDeduction, DealCredit, PercentBasis } from '../lib/database.types';
import type { PostgrestError } from '@supabase/supabase-js';
import { getVisibleUserIds } from '../lib/rbac';
import DealNotes from './DealNotes';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { ui } from '../ui/tokens';
import { getColorByName } from '../lib/colors';

/** Format a percentage: 1 decimal minimum, more if the value has more precision (e.g. 2.5 → "2.5%", 2.55 → "2.55%", 20.0 → "20.0%") */
const fmtPct = (v: number): string => {
  // Show at least 1 decimal place; if the value has more precision, show up to 4
  const s1 = v.toFixed(1);
  if (parseFloat(s1) === v) return s1;
  const s2 = v.toFixed(2);
  if (parseFloat(s2) === v) return s2;
  const s3 = v.toFixed(3);
  if (parseFloat(s3) === v) return s3;
  return v.toFixed(4);
};

type Deal = Database['public']['Tables']['deals']['Row'];
type LeadSource = Database['public']['Tables']['lead_sources']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];
type PipelineStatus = Database['public']['Tables']['pipeline_statuses']['Row'];
type DealInsert = Database['public']['Tables']['deals']['Insert'];
type DealUpdate = Database['public']['Tables']['deals']['Update'];
type DealNoteInsert = Database['public']['Tables']['deal_notes']['Insert'];
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
type WorkspaceDeduction = Database['public']['Tables']['workspace_deductions']['Row'];

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
  deal_deductions: DealDeduction[];
  deal_credits: DealCredit[];
};

interface DealModalProps {
  deal: Deal | null;
  onClose: () => void;
  onDelete?: () => void;
  onSaved?: (deal: Deal) => void;
  onDeleted?: (dealId: string) => void;
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
  close_date: deal?.close_date || '',
  deal_deductions: (deal?.deal_deductions || []).map(d => ({
    ...d,
    // Convert percentage values from decimal (DB) to display percentage
    value: d.type === 'percentage' ? d.value * 100 : d.value,
    include_in_gci: !!d.include_in_gci,
    percent_of: (d.percent_of as PercentBasis) || 'gross'
  })),
  deal_credits: (deal?.deal_credits || []).map(c => ({
    ...c,
    value: c.type === 'percentage' ? c.value * 100 : c.value,
    include_in_gci: !!c.include_in_gci,
    percent_of: (c.percent_of as PercentBasis) || 'gross'
  }))
});

const generateId = () => Math.random().toString(36).substring(2, 11);

const DEAL_TYPE_LABELS: Record<string, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  buyer_and_seller: 'Buyer & Seller',
  renter: 'Renter',
  landlord: 'Landlord'
};

// Parse date string without timezone conversion (avoids off-by-one day issue)
function parseLocalDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Format date for display without timezone issues
function formatDate(dateString: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const date = parseLocalDate(dateString);
  if (!date) return 'Not set';
  return date.toLocaleDateString('en-US', options || { month: 'short', day: 'numeric', year: 'numeric' });
}

// Section header component - matches app-wide pattern
function SectionHeader({ 
  title, 
  count,
  action 
}: { 
  title: string; 
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
      <Text variant="micro" className="font-semibold">
        {title}{count !== undefined && ` (${count})`}
      </Text>
      {action}
    </div>
  );
}

// Detail field component - matches Settings/Analytics pattern
function DetailField({ 
  label, 
  children,
  isEditing,
  editComponent
}: { 
  label: string; 
  children: React.ReactNode;
  isEditing?: boolean;
  editComponent?: React.ReactNode;
}) {
  return (
    <div className="py-2">
      <Text variant="micro" className="mb-1">{label}</Text>
      {isEditing && editComponent ? editComponent : (
        <Text variant="body">{children}</Text>
      )}
    </div>
  );
}

export default function DealModal({ deal, onClose, onDelete, onSaved, onDeleted }: DealModalProps) {
  const { user, roleInfo } = useAuth();
  const teamId = roleInfo?.teamId || null;

  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(!!deal);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [pipelineStatuses, setPipelineStatuses] = useState<PipelineStatus[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workspaceDeductions, setWorkspaceDeductions] = useState<WorkspaceDeduction[]>([]);
  const [showQuickAddTask, setShowQuickAddTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [editingTaskDueDate, setEditingTaskDueDate] = useState('');
  const [archived, setArchived] = useState(deal?.status === 'dead');
  const [archivedReason, setArchivedReason] = useState(deal?.archived_reason || '');
  const [isEditing, setIsEditing] = useState(!deal);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

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
    setShowQuickAddTask(false);
  }, [deal]);

  // Load supporting data
  useEffect(() => {
    if (!user) return;

    const initialize = async () => {
      setInitializing(!!deal);

      const [wsDeductions] = await Promise.all([
        loadWorkspaceDeductions(),
        loadLeadSources(),
        loadPipelineStatuses(),
        deal ? loadTasks() : Promise.resolve(),
        deal ? loadArchivedReason() : Promise.resolve()
      ]);

      if (!deal && wsDeductions && wsDeductions.length > 0) {
        initializeDealDeductions(wsDeductions);
      }

      setInitializing(false);
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal, teamId, user?.id, roleInfo?.workspaceId]);

  useEffect(() => {
    if (archived) {
      setFormData(prev => ({ ...prev, pipeline_status_id: '' }));
    }
  }, [archived]);

  useEffect(() => {
    if (isEditing && firstFieldRef.current) {
      firstFieldRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const loadWorkspaceDeductions = useCallback(async () => {
    if (!roleInfo?.workspaceId) return [];

    const { data, error } = await supabase
      .from('workspace_deductions')
      .select('*')
      .eq('workspace_id', roleInfo.workspaceId)
      .eq('is_active', true)
      .order('apply_order', { ascending: true });

    if (error) {
      console.error('Error loading workspace deductions:', error);
      return [];
    }

    setWorkspaceDeductions(data || []);
    return data || [];
  }, [roleInfo?.workspaceId]);

  const initializeDealDeductions = useCallback((wsDeductions: WorkspaceDeduction[]) => {
    if (deal) return;
    
    const initialDeductions: DealDeduction[] = wsDeductions.map((wd, index) => ({
      id: generateId(),
      deduction_id: wd.id,
      name: wd.name,
      type: wd.type,
      value: wd.type === 'percentage' ? wd.value * 100 : wd.value,
      apply_order: index + 1,
      is_waived: false
    }));

    setFormData(prev => ({ ...prev, deal_deductions: initialDeductions }));
    initialFormDataRef.current = { ...initialFormDataRef.current, deal_deductions: initialDeductions };
  }, [deal]);

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
      const note = data[0]?.content ?? '';
      const parsed = note.replace(/^Archive reason:\s*/i, '').trim();
      setArchivedReason(parsed);
    }
  };

  const loadLeadSources = async () => {
    if (!user) return;

    let teamSources: LeadSource[] | null = null;
    let teamError: PostgrestError | null = null;

    if (teamId) {
      const resp = await supabase
        .from('lead_sources')
        .select('*')
        .eq('team_id', teamId)
        .order('name');
      teamSources = resp.data;
      teamError = resp.error;
    }

    if (teamError) return;

    const { data, error } = teamSources?.length
      ? { data: teamSources, error: null }
      : await supabase
          .from('lead_sources')
          .select('*')
          .eq('user_id', user.id)
          .order('name');

    if (error) return;
    if (data) setLeadSources(data);
  };

  const loadPipelineStatuses = async () => {
    if (!user) return;

    let teamStatuses: PipelineStatus[] | null = null;
    let teamError: PostgrestError | null = null;

    if (teamId) {
      const resp = await supabase
        .from('pipeline_statuses')
        .select('*')
        .eq('team_id', teamId)
        .order('sort_order');
      teamStatuses = resp.data;
      teamError = resp.error;
    }

    if (teamError) return;

    const { data, error } = teamStatuses?.length
      ? { data: teamStatuses, error: null }
      : await supabase
          .from('pipeline_statuses')
          .select('*')
          .eq('user_id', user.id)
          .order('sort_order');

    if (error) return;
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
      const sortedTasks = [...data].sort((a: Task, b: Task) => {
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

  const toggleDeductionWaived = (deductionId: string) => {
    setFormData(prev => ({
      ...prev,
      deal_deductions: prev.deal_deductions.map(d =>
        d.id === deductionId ? { ...d, is_waived: !d.is_waived } : d
      )
    }));
  };

  const toggleDeductionType = (deductionId: string) => {
    setFormData(prev => ({
      ...prev,
      deal_deductions: prev.deal_deductions.map(d =>
        d.id === deductionId ? { ...d, type: d.type === 'flat' ? 'percentage' : 'flat', value: 0, percent_of: d.type === 'flat' ? 'gross' : undefined } : d
      )
    }));
  };

  const updateDeductionValue = (deductionId: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      deal_deductions: prev.deal_deductions.map(d =>
        d.id === deductionId ? { ...d, value } : d
      )
    }));
  };

  const setDeductionPercentOf = (deductionId: string, basis: PercentBasis) => {
    setFormData(prev => ({
      ...prev,
      deal_deductions: prev.deal_deductions.map(d =>
        d.id === deductionId ? { ...d, percent_of: basis, include_in_gci: basis === 'gross' } : d
      )
    }));
  };

  const toggleDeductionGci = (deductionId: string) => {
    setFormData(prev => ({
      ...prev,
      deal_deductions: prev.deal_deductions.map(d =>
        d.id === deductionId ? { ...d, include_in_gci: !d.include_in_gci } : d
      )
    }));
  };

  const addCustomDeduction = () => {
    const maxOrder = formData.deal_deductions.reduce((max, d) => Math.max(max, d.apply_order), 0);
    const newDeduction: DealDeduction = {
      id: generateId(),
      deduction_id: 'custom',
      name: '',
      type: 'flat',
      value: 0,
      apply_order: maxOrder + 1,
      is_waived: false,
      include_in_gci: false,
      percent_of: 'gross'
    };
    setFormData(prev => ({
      ...prev,
      deal_deductions: [...prev.deal_deductions, newDeduction]
    }));
  };

  const updateCustomDeductionName = (deductionId: string, name: string) => {
    setFormData(prev => ({
      ...prev,
      deal_deductions: prev.deal_deductions.map(d =>
        d.id === deductionId ? { ...d, name } : d
      )
    }));
  };

  const removeDeduction = (deductionId: string) => {
    setFormData(prev => ({
      ...prev,
      deal_deductions: prev.deal_deductions.filter(d => d.id !== deductionId)
    }));
  };

  // --- Credit CRUD ---
  const setCreditPercentOf = (creditId: string, basis: PercentBasis) => {
    setFormData(prev => ({
      ...prev,
      deal_credits: prev.deal_credits.map(c =>
        c.id === creditId ? { ...c, percent_of: basis, include_in_gci: basis === 'gross' } : c
      )
    }));
  };

  const toggleCreditGci = (creditId: string) => {
    setFormData(prev => ({
      ...prev,
      deal_credits: prev.deal_credits.map(c =>
        c.id === creditId ? { ...c, include_in_gci: !c.include_in_gci } : c
      )
    }));
  };

  const addCredit = () => {
    const newCredit: DealCredit = {
      id: generateId(),
      name: '',
      type: 'flat',
      value: 0,
      include_in_gci: false,
      percent_of: 'gross'
    };
    setFormData(prev => ({
      ...prev,
      deal_credits: [...prev.deal_credits, newCredit]
    }));
  };

  const updateCreditName = (creditId: string, name: string) => {
    setFormData(prev => ({
      ...prev,
      deal_credits: prev.deal_credits.map(c =>
        c.id === creditId ? { ...c, name } : c
      )
    }));
  };

  const toggleCreditType = (creditId: string) => {
    setFormData(prev => ({
      ...prev,
      deal_credits: prev.deal_credits.map(c =>
        c.id === creditId ? { ...c, type: c.type === 'flat' ? 'percentage' : 'flat', value: 0, percent_of: c.type === 'flat' ? 'gross' : undefined } : c
      )
    }));
  };

  const updateCreditValue = (creditId: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      deal_credits: prev.deal_credits.map(c =>
        c.id === creditId ? { ...c, value } : c
      )
    }));
  };

  const removeCredit = (creditId: string) => {
    setFormData(prev => ({
      ...prev,
      deal_credits: prev.deal_credits.filter(c => c.id !== creditId)
    }));
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

    const deductionsForDb: DealDeduction[] = formData.deal_deductions
      .filter(d => !d.is_waived)
      .map(d => ({
        id: d.id,
        deduction_id: d.deduction_id,
        name: d.name,
        type: d.type,
        value: d.type === 'percentage' ? d.value / 100 : d.value,
        apply_order: d.apply_order,
        is_waived: d.is_waived,
        include_in_gci: d.type === 'percentage' ? (d.percent_of || 'gross') === 'gross' : !!d.include_in_gci,
        percent_of: d.type === 'percentage' ? (d.percent_of || 'gross') : undefined
      }));

    const creditsForDb: DealCredit[] = formData.deal_credits
      .filter(c => c.value > 0)
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        value: c.type === 'percentage' ? c.value / 100 : c.value,
        include_in_gci: c.type === 'percentage' ? (c.percent_of || 'gross') === 'gross' : !!c.include_in_gci,
        percent_of: c.type === 'percentage' ? (c.percent_of || 'gross') : undefined
      }));

    const dealData: DealInsert & DealUpdate = {
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
      archived_reason: archived ? archivedReason : null,
      deal_deductions: deductionsForDb.length > 0 ? deductionsForDb : null,
      deal_credits: creditsForDb.length > 0 ? creditsForDb : null
    };

    let dealId = deal?.id || null;
    let savedDeal: Deal | null = null;

    try {
      if (deal) {
        const { data: updatedDeal, error } = await supabase
          .from('deals')
          .update(dealData)
          .eq('id', deal.id)
          .select('*')
          .single();

        if (error) throw error;
        savedDeal = updatedDeal as Deal;
        dealId = savedDeal.id;
      } else {
        const { data: insertData, error: insertError } = await supabase
          .from('deals')
          .insert(dealData)
          .select('*')
          .single();

        if (insertError) throw insertError;
        if (insertData) {
          savedDeal = insertData as Deal;
          dealId = savedDeal.id;
        }
      }

      if (archived && dealId) {
        const notePayload: DealNoteInsert = {
          deal_id: dealId,
          user_id: user.id,
          content: `Archive reason: ${archivedReason}`
        };
        const { error: noteError } = await supabase.from('deal_notes').insert(notePayload);
        if (noteError) throw noteError;
      }

      if (savedDeal) {
        onSaved?.(savedDeal);
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

  const toggleTaskComplete = async (taskId: string, completed: boolean) => {
    const payload: TaskUpdate = { completed: !completed };
    await supabase.from('tasks').update(payload).eq('id', taskId);
    loadTasks();
  };

  const handleEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setEditingTaskDueDate(task.due_date || '');
  };

  const handleUpdateTask = async () => {
    if (!editingTaskTitle.trim() || !editingTaskId) return;
    const payload: TaskUpdate = { title: editingTaskTitle, due_date: editingTaskDueDate || null };
    await supabase.from('tasks').update(payload).eq('id', editingTaskId);
    setEditingTaskId(null);
    setEditingTaskTitle('');
    setEditingTaskDueDate('');
    loadTasks();
  };

  const handleDeleteTask = async (taskId: string) => {
    await supabase.from('tasks').delete().eq('id', taskId);
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
    await supabase.from('deals').delete().eq('id', deal.id);
    setLoading(false);
    if (onDeleted) onDeleted(deal.id);
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

  const handleUpdateStatus = async (statusId: string) => {
    if (!deal) return;
    setShowStatusMenu(false);
    
    const selectedStatus = pipelineStatuses.find(s => s.id === statusId);
    const lifecycleStage = selectedStatus?.lifecycle_stage || 'new';
    
    const { error } = await supabase
      .from('deals')
      .update({ 
        pipeline_status_id: statusId,
        status: lifecycleStage,
        stage_entered_at: new Date().toISOString()
      })
      .eq('id', deal.id);
    
    if (error) {
      console.error('Failed to update status:', error);
      return;
    }
    
    setFormData(prev => ({ ...prev, pipeline_status_id: statusId }));
    onSave?.();
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
  const selectedLeadSource = leadSources.find(s => s.id === formData.lead_source_id) || null;

  // Lead source (preferred partner) fees — applied through the commission engine
  const partnerDeductions = (selectedLeadSource?.custom_deductions || []).map((d, i) => ({
    ...d,
    apply_order: d.apply_order ?? i
  }));

  // Commission engine handles: gross, partnership, brokerage, referrals, transaction fee, partner deductions
  // Deal-level fees/credits are handled manually below (GCI vs non-GCI ordering)
  const commissionInput = {
    actual_sale_price: Number(formData.actual_sale_price),
    expected_sale_price: Number(formData.expected_sale_price),
    gross_commission_rate: Number(formData.gross_commission_rate),
    brokerage_split_rate: Number(formData.brokerage_split_rate),
    referral_out_rate: Number(formData.referral_out_rate),
    referral_in_rate: Number(formData.referral_in_rate),
    transaction_fee: Number(formData.transaction_fee),
    custom_deductions: partnerDeductions.length > 0 ? partnerDeductions : null,
    payout_structure: selectedLeadSource?.payout_structure || null,
    partnership_split_rate: selectedLeadSource?.partnership_split_rate || null,
    tiered_splits: selectedLeadSource?.tiered_splits || null
  };
  const commissionBreakdown = calculateCommissionBreakdown(commissionInput, { includeReferralIn: true });
  const grossCommission = commissionBreakdown.gross;
  const afterEngineNet = commissionBreakdown.net; // net after broker split, referrals, partner fees, etc.

  // Active deal-level fees/credits (not waived)
  const activeFees = formData.deal_deductions.filter(d => !d.is_waived);

  // Helper: resolve percent_of for an item (flat items use include_in_gci; percentage items use percent_of)
  const getBasis = (item: { type: string; percent_of?: PercentBasis; include_in_gci?: boolean }): PercentBasis | 'flat_gci' | 'flat_other' => {
    if (item.type === 'flat') return item.include_in_gci ? 'flat_gci' : 'flat_other';
    return item.percent_of || 'gross';
  };

  // --- Phase 1: GCI items (% of gross + flat GCI) → determine Total GCI ---
  const gciFeeTotal = activeFees
    .filter(d => getBasis(d) === 'gross' || getBasis(d) === 'flat_gci')
    .reduce((sum, d) => sum + (d.type === 'flat' ? d.value : grossCommission * (d.value / 100)), 0);
  const gciCreditTotal = formData.deal_credits
    .filter(c => getBasis(c) === 'gross' || getBasis(c) === 'flat_gci')
    .reduce((sum, c) => sum + (c.type === 'flat' ? c.value : grossCommission * (c.value / 100)), 0);
  const reportedGCI = grossCommission - gciFeeTotal + gciCreditTotal;

  // --- Phase 2: Total-GCI items (% of Total GCI + flat non-GCI) ---
  const tgciFeeTotal = activeFees
    .filter(d => getBasis(d) === 'total_gci' || getBasis(d) === 'flat_other')
    .reduce((sum, d) => sum + (d.type === 'flat' ? d.value : reportedGCI * (d.value / 100)), 0);
  const tgciCreditTotal = formData.deal_credits
    .filter(c => getBasis(c) === 'total_gci' || getBasis(c) === 'flat_other')
    .reduce((sum, c) => sum + (c.type === 'flat' ? c.value : reportedGCI * (c.value / 100)), 0);

  // --- Phase 3: Net items (% of preliminary net) ---
  const prelimNet = afterEngineNet - gciFeeTotal - tgciFeeTotal + gciCreditTotal + tgciCreditTotal;
  const netFeeTotal = activeFees
    .filter(d => getBasis(d) === 'net')
    .reduce((sum, d) => sum + prelimNet * (d.value / 100), 0);
  const netCreditTotal = formData.deal_credits
    .filter(c => getBasis(c) === 'net')
    .reduce((sum, c) => sum + prelimNet * (c.value / 100), 0);

  const netWithCredits = prelimNet - netFeeTotal + netCreditTotal;

  // --- Waterfall line items from Total GCI → Net to Agent (for summary display) ---
  const brokerSplitAmount = commissionBreakdown.afterPartnership - commissionBreakdown.afterBrokerage;
  const partnershipSplitAmount = commissionBreakdown.gross - commissionBreakdown.afterPartnership;
  const referralOutAmount = commissionBreakdown.afterBrokerage - commissionBreakdown.afterReferralOut;
  const referralInAmount = commissionBreakdown.afterReferralIn - commissionBreakdown.afterReferralOut;
  const transactionFeeAmount = commissionBreakdown.transactionFee;
  const partnerDeductionsAmount = commissionBreakdown.customDeductions;
  const nonGciDeductionsTotal = tgciFeeTotal + netFeeTotal;
  const nonGciAdditionsTotal = tgciCreditTotal + netCreditTotal;

  // Helper to get the dollar amount for any individual fee/credit (for display)
  const getItemDollarAmount = (item: { type: string; value: number; percent_of?: PercentBasis; include_in_gci?: boolean }) => {
    if (item.type === 'flat') return item.value;
    const basis = item.percent_of || 'gross';
    const base = basis === 'gross' ? grossCommission : basis === 'total_gci' ? reportedGCI : prelimNet;
    return base * (item.value / 100);
  };

  const currentStatus = pipelineStatuses.find(s => s.id === formData.pipeline_status_id);
  const leadSourceLabel = leadSources.find(source => source.id === formData.lead_source_id)?.name || 'Not set';
  const locationLine = [formData.city, formData.state].filter(Boolean).join(', ');

  // Hero card content
  const heroTitle = formData.property_address || DEAL_TYPE_LABELS[formData.deal_type] || 'New Deal';
  const heroSubtitle = formData.property_address ? locationLine : formData.client_name;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <Card className="max-w-md w-full">
            <Text variant="h2" className="mb-2">Delete Deal</Text>
            <Text variant="muted" className="mb-6">
              Are you sure you want to delete this deal? This action cannot be undone.
            </Text>
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
                className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Main modal */}
      <div className="fixed inset-0 z-50 flex">
        <div className="fixed inset-0 bg-black/30" onClick={onClose} />

        <div
          className={`relative ml-auto h-full w-full max-w-4xl bg-[#f8f9fa] shadow-2xl transform transition-transform duration-200 ease-out flex flex-col ${
            isVisible ? 'translate-x-0' : 'translate-x-full'
          }`}
          onClick={e => e.stopPropagation()}
        >
          {/* Header - Name primary, Status secondary */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Text variant="h2" className="truncate">
                  {formData.client_name || 'New Deal'}
                </Text>
                {(currentStatus || archived) && (
                  <>
                    <span className="text-gray-300 mx-1">·</span>
                    {archived ? (
                      <span className="px-2.5 py-1 rounded-full bg-gray-200 text-gray-700 text-xs font-semibold">
                        Archived
                      </span>
                    ) : currentStatus && (() => {
                      const statusColor = getColorByName(currentStatus.color);
                      return (
                        <span 
                          className="px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{ 
                            backgroundColor: statusColor.bg,
                            color: statusColor.text
                          }}
                        >
                          {currentStatus.name}
                        </span>
                      );
                    })()}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {!isEditing && deal && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="hig-btn-secondary text-sm py-1.5 px-3"
                  >
                    <Edit2 className="w-4 h-4 mr-1.5" />
                    Edit
                  </button>
                )}
                
                {isEditing && (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelFormEdit}
                      className="hig-btn-text text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      form="deal-edit-form"
                      disabled={loading}
                      className="hig-btn-primary text-sm py-1.5 px-4"
                    >
                      {loading ? 'Saving…' : 'Save'}
                    </button>
                  </>
                )}

                {deal && (
                  <div className="relative">
                    <button
                      onClick={() => setShowMoreMenu(!showMoreMenu)}
                      className="hig-icon-btn"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                    
                    {showMoreMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
                        <div className={`absolute right-0 top-full mt-1 w-48 bg-white ${ui.radius.control} ${ui.shadow.card} border border-gray-200 py-1 z-20`}>
                          <button
                            onClick={() => { handleGenerateOffer(); setShowMoreMenu(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <FileText className="w-4 h-4" />
                            Generate Offer
                          </button>
                          <button
                            onClick={() => { setShowDeleteConfirm(true); setShowMoreMenu(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete Deal
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <button onClick={onClose} type="button" className="hig-icon-btn">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {submitError && (
            <div className="bg-red-50 border-b border-red-200 px-6 py-3">
              <Text variant="body" className="text-red-700">{submitError}</Text>
            </div>
          )}

          {/* Two-column layout */}
          <form id="deal-edit-form" onSubmit={handleSubmit} className="flex-1 overflow-hidden flex">
            {/* Left column - Main content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {initializing && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              )}

              {/* Hero Card - Reusing Card component */}
              <Card padding="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className={`w-10 h-10 ${ui.radius.control} bg-gray-100 flex items-center justify-center flex-shrink-0`}>
                      <Home className="w-5 h-5 text-[#1e3a5f]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          ref={firstFieldRef}
                          type="text"
                          value={formData.property_address}
                          onChange={e => setFormData(prev => ({ ...prev, property_address: e.target.value }))}
                          className="hig-input text-base font-semibold w-full mb-1"
                          placeholder="Property address"
                        />
                      ) : (
                        <Text variant="h2" className="truncate">{heroTitle}</Text>
                      )}
                      {isEditing ? (
                        <div className="flex gap-2 mt-1">
                          <input
                            type="text"
                            value={formData.city}
                            onChange={e => setFormData(prev => ({ ...prev, city: e.target.value }))}
                            className="hig-input text-sm py-1 w-28"
                            placeholder="City"
                          />
                          <input
                            type="text"
                            value={formData.state}
                            onChange={e => setFormData(prev => ({ ...prev, state: e.target.value }))}
                            className="hig-input text-sm py-1 w-14"
                            placeholder="ST"
                            maxLength={2}
                          />
                          <input
                            type="text"
                            value={formData.zip}
                            onChange={e => setFormData(prev => ({ ...prev, zip: e.target.value }))}
                            className="hig-input text-sm py-1 w-20"
                            placeholder="ZIP"
                          />
                        </div>
                      ) : (
                        <Text variant="muted">{heroSubtitle || 'No location'}</Text>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Text variant="h2">
                      ${Number(formData.expected_sale_price || 0).toLocaleString()}
                    </Text>
                    <Text variant="micro">Expected Price</Text>
                  </div>
                </div>
              </Card>

              {/* Tasks Section */}
              {deal && (
                <Card padding="card">
                  <SectionHeader
                    title="Tasks"
                    count={tasks.length}
                    action={
                      <button
                        type="button"
                        onClick={() => setShowQuickAddTask(prev => !prev)}
                        className="hig-btn-text text-xs py-1 px-2"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add
                      </button>
                    }
                  />

                  <div className="mt-3">
                    {showQuickAddTask && (
                      <div className="mb-3">
                        <QuickAddTask
                          contextDealId={deal.id}
                          contextDealLabel={`${deal.client_name} — ${deal.property_address || 'Address TBD'}`}
                          defaultDuePreset="today"
                          allowDealChange
                          dealById={{
                            [deal.id]: {
                              id: deal.id,
                              user_id: deal.user_id,
                              client_name: deal.client_name,
                              property_address: deal.property_address,
                              city: deal.city,
                              state: deal.state,
                              updated_at: deal.updated_at
                            }
                          }}
                          onCreated={(createdTask) => {
                            setTasks(prev => [...prev, createdTask].sort((a, b) => {
                              if (!a.due_date && !b.due_date) return 0;
                              if (!a.due_date) return -1;
                              if (!b.due_date) return 1;
                              return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
                            }));
                            setShowQuickAddTask(false);
                          }}
                          onCancel={() => setShowQuickAddTask(false)}
                          autoFocus
                        />
                      </div>
                    )}

                    {tasks.length === 0 ? (
                      <Text variant="muted" className="py-2">No tasks yet</Text>
                    ) : (
                      <div className="space-y-1">
                        {tasks.map(task => {
                          const taskDate = parseLocalDate(task.due_date);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const isOverdue = taskDate && !task.completed && taskDate < today;
                          const isDueToday = taskDate && !task.completed && taskDate.toDateString() === today.toDateString();

                          if (editingTaskId === task.id) {
                            return (
                              <div key={task.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                                <input
                                  type="text"
                                  value={editingTaskTitle}
                                  onChange={e => setEditingTaskTitle(e.target.value)}
                                  className="hig-input w-full"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <input type="date" value={editingTaskDueDate} onChange={e => setEditingTaskDueDate(e.target.value)} className="hig-input flex-1" />
                                  <button type="button" onClick={handleCancelEditTask} className="hig-btn-text text-sm">Cancel</button>
                                  <button type="button" onClick={handleUpdateTask} className="hig-btn-primary text-sm py-1.5 px-3">Save</button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={task.id} className="group flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-gray-50 transition">
                              <button
                                type="button"
                                onClick={() => toggleTaskComplete(task.id, task.completed)}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${
                                  task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-500'
                                }`}
                              >
                                {task.completed && <Check className="w-3 h-3 text-white" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <Text variant="body" className={task.completed ? 'line-through text-gray-400' : ''}>
                                  {task.title}
                                </Text>
                                {task.due_date && (
                                  <Text variant="muted" className={isOverdue ? 'text-red-500' : isDueToday ? 'text-orange-500' : ''}>
                                    {formatDate(task.due_date, { month: 'short', day: 'numeric' })}
                                  </Text>
                                )}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                <button type="button" onClick={() => handleEditTask(task)} className="p-1 hover:bg-gray-200 rounded">
                                  <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                                </button>
                                <button type="button" onClick={() => handleDeleteTask(task.id)} className="p-1 hover:bg-red-100 rounded">
                                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Notes Section */}
              {deal && (
                <Card padding="card">
                  <DealNotes dealId={deal.id} />
                </Card>
              )}

              {/* Quick Actions */}
              {deal && !archived && (
                <div className="flex gap-2">
                  {/* Update Status Dropdown — only in edit mode */}
                  {isEditing && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowStatusMenu(!showStatusMenu)}
                        className="hig-btn-secondary text-sm py-2 px-4"
                      >
                        <TrendingUp className="w-4 h-4 mr-1.5" />
                        Update Status
                        <ChevronDown className="w-4 h-4 ml-1.5" />
                      </button>
                      {showStatusMenu && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
                          <div className={`absolute left-0 bottom-full mb-1 w-56 bg-white ${ui.radius.control} ${ui.shadow.card} border border-gray-200 py-1 z-20 max-h-64 overflow-y-auto`}>
                            {pipelineStatuses.map(status => {
                              const isCurrentStatus = status.id === formData.pipeline_status_id;
                              const statusColor = getColorByName(status.color);
                              return (
                                <button
                                  key={status.id}
                                  onClick={() => handleUpdateStatus(status.id)}
                                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${isCurrentStatus ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                                >
                                  <span 
                                    className="w-3 h-3 rounded-full flex-shrink-0" 
                                    style={{ backgroundColor: statusColor.bg }}
                                  />
                                  <span className={isCurrentStatus ? 'font-medium' : ''}>{status.name}</span>
                                  {isCurrentStatus && <span className="ml-auto text-xs text-gray-400">Current</span>}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={handleGenerateOffer}
                      className="inline-flex items-center text-sm font-semibold py-2 px-5 rounded-lg text-[#1e3a5f] transition-all duration-200 shadow-sm active:scale-[0.97]"
                      style={{
                        background: 'linear-gradient(135deg, rgba(30,58,95,0.08) 0%, rgba(212,136,58,0.18) 100%)',
                        border: '1px solid rgba(212,136,58,0.25)',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30,58,95,0.12) 0%, rgba(212,136,58,0.28) 100%)';
                        e.currentTarget.style.borderColor = 'rgba(212,136,58,0.4)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30,58,95,0.08) 0%, rgba(212,136,58,0.18) 100%)';
                        e.currentTarget.style.borderColor = 'rgba(212,136,58,0.25)';
                      }}
                    >
                      <Sparkles className="w-4 h-4 mr-1.5" />
                      Generate Offer
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right column - Details sidebar */}
            <div className="w-72 bg-white border-l border-gray-200 overflow-y-auto p-5 flex-shrink-0">
              {/* Details section */}
              <h3 className="text-sm font-semibold text-[#1e3a5f] mb-3">Details</h3>
              
              <DetailField label="DEAL TYPE" isEditing={isEditing} editComponent={
                <select value={formData.deal_type} onChange={e => setFormData(prev => ({ ...prev, deal_type: e.target.value as Deal['deal_type'] }))} className="hig-input w-full">
                  {Object.entries(DEAL_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              }>
                {DEAL_TYPE_LABELS[formData.deal_type]}
              </DetailField>

              <DetailField label="LEAD SOURCE" isEditing={isEditing} editComponent={
                <select value={formData.lead_source_id} onChange={e => handleLeadSourceChange(e.target.value)} className="hig-input w-full" required>
                  <option value="">Select source</option>
                  {leadSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              }>
                {leadSourceLabel === 'Not set' ? '—' : leadSourceLabel}
              </DetailField>

              <DetailField label="CLOSE DATE" isEditing={isEditing} editComponent={
                <input type="date" value={formData.close_date || ''} onChange={e => setFormData(prev => ({ ...prev, close_date: e.target.value }))} className="hig-input w-full" />
              }>
                {formatDate(formData.close_date) || '—'}
              </DetailField>

              <div className="border-t border-gray-100 my-4" />

              {/* Client section */}
              <h3 className="text-sm font-semibold text-[#1e3a5f] mb-3">Client</h3>

              <DetailField label="NAME" isEditing={isEditing} editComponent={
                <input type="text" value={formData.client_name} onChange={e => setFormData(prev => ({ ...prev, client_name: e.target.value }))} className="hig-input w-full" required />
              }>
                {formData.client_name || '—'}
              </DetailField>

              <DetailField label="PHONE" isEditing={isEditing} editComponent={
                <input type="tel" value={formData.client_phone} onChange={e => setFormData(prev => ({ ...prev, client_phone: e.target.value }))} className="hig-input w-full" />
              }>
                {formData.client_phone || '—'}
              </DetailField>

              <DetailField label="EMAIL" isEditing={isEditing} editComponent={
                <input type="email" value={formData.client_email} onChange={e => setFormData(prev => ({ ...prev, client_email: e.target.value }))} className="hig-input w-full" />
              }>
                {formData.client_email || '—'}
              </DetailField>

              <div className="border-t border-gray-100 my-4" />

              {/* Financials section - matches Analytics formatting */}
              <h3 className="text-sm font-semibold text-[#1e3a5f] mb-3">Financials</h3>

              <DetailField label="EXPECTED" isEditing={isEditing} editComponent={
                <input type="number" value={formData.expected_sale_price} onChange={e => setFormData(prev => ({ ...prev, expected_sale_price: e.target.value }))} className="hig-input w-full" placeholder="500000" />
              }>
                ${Number(formData.expected_sale_price || 0).toLocaleString()}
              </DetailField>

              <DetailField label="ACTUAL" isEditing={isEditing} editComponent={
                <input type="number" value={formData.actual_sale_price || ''} onChange={e => setFormData(prev => ({ ...prev, actual_sale_price: e.target.value }))} className="hig-input w-full" placeholder="505000" />
              }>
                {formData.actual_sale_price ? `$${Number(formData.actual_sale_price).toLocaleString()}` : '—'}
              </DetailField>

              <DetailField label="COMMISSION" isEditing={isEditing} editComponent={
                <input type="number" step="0.01" value={formData.gross_commission_rate * 100} onChange={e => setFormData(prev => ({ ...prev, gross_commission_rate: parseFloat(e.target.value) / 100 || 0 }))} className="hig-input w-full" />
              }>
                {fmtPct(formData.gross_commission_rate * 100)}%
              </DetailField>

              <DetailField label="BROKER SPLIT" isEditing={isEditing} editComponent={
                <input type="number" step="0.01" value={formData.brokerage_split_rate ? (formData.brokerage_split_rate * 100) : ''} onChange={e => setFormData(prev => ({ ...prev, brokerage_split_rate: parseFloat(e.target.value) / 100 || 0 }))} className="hig-input w-full" placeholder="20" />
              }>
                {(() => {
                  if (selectedLeadSource?.payout_structure === 'tiered' && selectedLeadSource.tiered_splits?.length) {
                    const salePrice = Number(formData.actual_sale_price) || Number(formData.expected_sale_price) || 0;
                    const effectiveRate = getTieredSplitRate(salePrice, selectedLeadSource.tiered_splits, formData.brokerage_split_rate);
                    return `${fmtPct(effectiveRate * 100)}% (tiered)`;
                  }
                  return `${fmtPct(formData.brokerage_split_rate * 100)}%`;
                })()}
              </DetailField>

              {/* Partner deductions (from lead source) */}
              {partnerDeductions.length > 0 && (
                <div className="py-2">
                  <div className="flex items-center justify-between mb-1">
                    <Text variant="micro">PARTNER DEDUCTIONS</Text>
                    <Text variant="muted" className="text-[10px]">{selectedLeadSource?.name}</Text>
                  </div>
                  <div className="pl-2 space-y-1 mt-1">
                    {partnerDeductions.map((d, idx) => {
                      // Use the engine's computed amount for accuracy (waterfall ordering)
                      const engineDetail = commissionBreakdown.deductionDetails[idx];
                      const amount = engineDetail ? engineDetail.amount : (d.type === 'flat' ? d.value : grossCommission * d.value);
                      return (
                        <div key={d.id} className="flex items-baseline justify-between">
                          <Text variant="muted" className="text-[13px]">{d.name || 'Deduction'}</Text>
                          <Text variant="body" className="text-[13px] tabular-nums text-right">
                            {`-$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            {d.type === 'percentage' ? ` (${fmtPct(d.value * 100)}%)` : ''}
                          </Text>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Partnership split (from lead source) */}
              {selectedLeadSource?.payout_structure === 'partnership' && selectedLeadSource.partnership_split_rate != null && (
                <DetailField label="PARTNERSHIP SPLIT" isEditing={false}>
                  {fmtPct(selectedLeadSource.partnership_split_rate * 100)}%
                </DetailField>
              )}

              {/* Deductions sub-section */}
              <div className="py-2">
                <div className="flex items-center justify-between mb-1">
                  <Text variant="micro">DEDUCTIONS</Text>
                  {isEditing && (
                    <button type="button" onClick={addCustomDeduction} className="text-[11px] text-[#D4883A] hover:underline">
                      + Add
                    </button>
                  )}
                </div>

                {formData.deal_deductions.length === 0 ? (
                  <Text variant="muted" className="text-[13px]">No deductions</Text>
                ) : (
                  <div className="pl-2 space-y-2 mt-1">
                    {formData.deal_deductions.map(d => {
                      const dollarAmount = getItemDollarAmount(d);
                      const basisLabel = d.percent_of === 'total_gci' ? 'Total GCI' : d.percent_of === 'net' ? 'Net' : 'GCI';
                      return (
                      <div key={d.id}>
                        {isEditing ? (
                          <>
                            {d.deduction_id === 'custom' ? (
                              <input
                                type="text"
                                value={d.name}
                                onChange={e => updateCustomDeductionName(d.id, e.target.value)}
                                className="text-[11px] font-medium text-[rgba(30,58,95,0.45)] bg-transparent border-0 border-b border-dashed border-gray-300 focus:border-gray-400 focus:outline-none w-full mb-1 p-0 placeholder:font-normal placeholder:text-gray-400"
                                placeholder="Enter name (e.g., Processing Fee)"
                              />
                            ) : (
                              <Text variant="muted" className="text-[11px] font-medium mb-0.5">{d.name || 'Fee'}</Text>
                            )}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleDeductionType(d.id)}
                                className="flex-shrink-0 w-8 h-8 rounded-md border border-gray-200 bg-gray-50 text-[11px] font-semibold text-[#42526e] hover:bg-gray-100 transition"
                                title={d.type === 'flat' ? 'Switch to percentage' : 'Switch to fixed amount'}
                              >
                                {d.type === 'flat' ? '$' : '%'}
                              </button>
                              <input 
                                type="number" 
                                value={d.value || ''} 
                                onChange={e => updateDeductionValue(d.id, parseFloat(e.target.value) || 0)} 
                                className="hig-input w-full" 
                                placeholder={d.type === 'flat' ? '0' : '0.00'}
                              />
                              {d.deduction_id === 'custom' && (
                                <button type="button" onClick={() => removeDeduction(d.id)} className="flex-shrink-0 text-gray-400 hover:text-red-500 text-lg leading-none">
                                  ×
                                </button>
                              )}
                            </div>
                            {d.type === 'percentage' ? (
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-[10px] text-gray-400">% of</span>
                                {(['gross', 'total_gci', 'net'] as PercentBasis[]).map(b => (
                                  <button
                                    key={b}
                                    type="button"
                                    onClick={() => setDeductionPercentOf(d.id, b)}
                                    className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                                      (d.percent_of || 'gross') === b
                                        ? 'bg-[#1e3a5f] text-white'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                                  >
                                    {b === 'gross' ? 'GCI' : b === 'total_gci' ? 'Total GCI' : 'Net'}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <label className="flex items-center gap-1.5 mt-1 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={!!d.include_in_gci}
                                  onChange={() => toggleDeductionGci(d.id)}
                                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
                                />
                                <span className="text-[10px] text-gray-500">Include in GCI</span>
                              </label>
                            )}
                          </>
                        ) : (
                          <div className="flex items-baseline justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Text variant="muted" className="text-[13px] truncate">{d.name || 'Deduction'}</Text>
                              {d.type === 'percentage' && (
                                <span className="text-[9px] font-medium text-[rgba(30,58,95,0.5)] bg-[rgba(30,58,95,0.06)] px-1.5 py-0.5 rounded flex-shrink-0">{basisLabel}</span>
                              )}
                              {d.type === 'flat' && d.include_in_gci && (
                                <span className="text-[9px] font-medium text-[rgba(30,58,95,0.5)] bg-[rgba(30,58,95,0.06)] px-1.5 py-0.5 rounded flex-shrink-0">GCI</span>
                              )}
                            </div>
                            <Text variant="body" className="text-[13px] tabular-nums text-right flex-shrink-0 ml-2">
                              {d.type === 'flat'
                                ? `-$${dollarAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : `-$${dollarAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${fmtPct(d.value)}%)`
                              }
                            </Text>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Additions sub-section */}
              <div className="py-2">
                <div className="flex items-center justify-between mb-1">
                  <Text variant="micro">ADDITIONS</Text>
                  {isEditing && (
                    <button type="button" onClick={addCredit} className="text-[11px] text-[#D4883A] hover:underline">
                      + Add
                    </button>
                  )}
                </div>

                {formData.deal_credits.length === 0 ? (
                  <Text variant="muted" className="text-[13px]">No additions</Text>
                ) : (
                  <div className="pl-2 space-y-2 mt-1">
                    {formData.deal_credits.map(c => {
                      const dollarAmount = getItemDollarAmount(c);
                      const basisLabel = c.percent_of === 'total_gci' ? 'Total GCI' : c.percent_of === 'net' ? 'Net' : 'GCI';
                      return (
                      <div key={c.id}>
                        {isEditing ? (
                          <>
                            <input
                              type="text"
                              value={c.name}
                              onChange={e => updateCreditName(c.id, e.target.value)}
                              className="text-[11px] font-medium text-[rgba(30,58,95,0.45)] bg-transparent border-0 border-b border-dashed border-gray-300 focus:border-gray-400 focus:outline-none w-full mb-1 p-0 placeholder:font-normal placeholder:text-gray-400"
                              placeholder="Enter name (e.g., Referral Bonus)"
                            />
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleCreditType(c.id)}
                                className="flex-shrink-0 w-8 h-8 rounded-md border border-gray-200 bg-gray-50 text-[11px] font-semibold text-[#42526e] hover:bg-gray-100 transition"
                                title={c.type === 'flat' ? 'Switch to percentage' : 'Switch to fixed amount'}
                              >
                                {c.type === 'flat' ? '$' : '%'}
                              </button>
                              <input
                                type="number"
                                value={c.value || ''}
                                onChange={e => updateCreditValue(c.id, parseFloat(e.target.value) || 0)}
                                className="hig-input w-full"
                                placeholder={c.type === 'flat' ? '0' : '0.00'}
                              />
                              <button type="button" onClick={() => removeCredit(c.id)} className="flex-shrink-0 text-gray-400 hover:text-red-500 text-lg leading-none">
                                ×
                              </button>
                            </div>
                            {c.type === 'percentage' ? (
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-[10px] text-gray-400">% of</span>
                                {(['gross', 'total_gci', 'net'] as PercentBasis[]).map(b => (
                                  <button
                                    key={b}
                                    type="button"
                                    onClick={() => setCreditPercentOf(c.id, b)}
                                    className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                                      (c.percent_of || 'gross') === b
                                        ? 'bg-[#1e3a5f] text-white'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                                  >
                                    {b === 'gross' ? 'GCI' : b === 'total_gci' ? 'Total GCI' : 'Net'}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <label className="flex items-center gap-1.5 mt-1 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={!!c.include_in_gci}
                                  onChange={() => toggleCreditGci(c.id)}
                                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
                                />
                                <span className="text-[10px] text-gray-500">Include in GCI</span>
                              </label>
                            )}
                          </>
                        ) : (
                          <div className="flex items-baseline justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Text variant="muted" className="text-[13px] truncate">{c.name || 'Addition'}</Text>
                              {c.type === 'percentage' && (
                                <span className="text-[9px] font-medium text-[rgba(30,58,95,0.5)] bg-[rgba(30,58,95,0.06)] px-1.5 py-0.5 rounded flex-shrink-0">{basisLabel}</span>
                              )}
                              {c.type === 'flat' && c.include_in_gci && (
                                <span className="text-[9px] font-medium text-[rgba(30,58,95,0.5)] bg-[rgba(30,58,95,0.06)] px-1.5 py-0.5 rounded flex-shrink-0">GCI</span>
                              )}
                            </div>
                            <Text variant="body" className="text-[13px] tabular-nums text-right flex-shrink-0 ml-2">
                              {c.type === 'flat'
                                ? `+$${dollarAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : `+$${dollarAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${fmtPct(c.value)}%)`
                              }
                            </Text>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Commission summary */}
              <div className="mt-4 pt-3 border-t border-gray-200">

                {/* ── Gross Comm. ── */}
                <div className="flex items-baseline justify-between py-2">
                  <Text variant="micro">GROSS COMM.</Text>
                  <Text variant="body" className="font-medium tabular-nums text-right">
                    ${grossCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </div>

                {/* GCI-level adjustments */}
                {(gciCreditTotal > 0 || gciFeeTotal > 0) && (
                  <div className="space-y-0.5 -mt-1 mb-1">
                    {gciCreditTotal > 0 && (
                      <div className="flex items-baseline justify-between py-0.5 pl-3">
                        <span className="text-[13px] text-[rgba(30,58,95,0.5)]">+ Additions</span>
                        <span className="text-[13px] text-[rgba(30,58,95,0.5)] tabular-nums text-right">
                          +${gciCreditTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    {gciFeeTotal > 0 && (
                      <div className="flex items-baseline justify-between py-0.5 pl-3">
                        <span className="text-[13px] text-[rgba(30,58,95,0.5)]">&minus; Deductions</span>
                        <span className="text-[13px] text-[rgba(30,58,95,0.5)] tabular-nums text-right">
                          &minus;${gciFeeTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Total GCI ── */}
                <div className="flex items-baseline justify-between py-2 border-t border-dashed border-gray-200">
                  <Text variant="micro">TOTAL GCI</Text>
                  <Text variant="body" className="font-medium tabular-nums text-right">
                    ${reportedGCI.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </div>

                {/* ── Waterfall: Total GCI → Net to Agent ── */}
                <div className="space-y-0.5 -mt-1 mb-1">
                  {brokerSplitAmount > 0 && (
                    <div className="flex items-baseline justify-between py-0.5 pl-3">
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)]">&minus; Broker Split</span>
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)] tabular-nums text-right">
                        &minus;${brokerSplitAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  {partnershipSplitAmount > 0 && (
                    <div className="flex items-baseline justify-between py-0.5 pl-3">
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)]">&minus; Partnership Split</span>
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)] tabular-nums text-right">
                        &minus;${partnershipSplitAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  {referralOutAmount > 0 && (
                    <div className="flex items-baseline justify-between py-0.5 pl-3">
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)]">&minus; Referral Out</span>
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)] tabular-nums text-right">
                        &minus;${referralOutAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  {referralInAmount > 0 && (
                    <div className="flex items-baseline justify-between py-0.5 pl-3">
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)]">+ Referral In</span>
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)] tabular-nums text-right">
                        +${referralInAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  {transactionFeeAmount > 0 && (
                    <div className="flex items-baseline justify-between py-0.5 pl-3">
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)]">&minus; Transaction Fee</span>
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)] tabular-nums text-right">
                        &minus;${transactionFeeAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  {partnerDeductionsAmount > 0 && (
                    <div className="flex items-baseline justify-between py-0.5 pl-3">
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)]">&minus; Partner Deductions</span>
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)] tabular-nums text-right">
                        &minus;${partnerDeductionsAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  {nonGciAdditionsTotal > 0 && (
                    <div className="flex items-baseline justify-between py-0.5 pl-3">
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)]">+ Additions</span>
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)] tabular-nums text-right">
                        +${nonGciAdditionsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  {nonGciDeductionsTotal > 0 && (
                    <div className="flex items-baseline justify-between py-0.5 pl-3">
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)]">&minus; Deductions</span>
                      <span className="text-[13px] text-[rgba(30,58,95,0.5)] tabular-nums text-right">
                        &minus;${nonGciDeductionsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                {/* ── Net to Agent — strongest emphasis ── */}
                <div className="flex items-baseline justify-between py-2 border-t-2 border-[#1e3a5f]/15 bg-[rgba(30,58,95,0.03)] rounded-md px-2 -mx-1">
                  <Text variant="micro" className="!text-[#1e3a5f]">NET TO AGENT</Text>
                  <Text variant="body" className="font-bold tabular-nums text-right">
                    ${netWithCredits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </div>
              </div>

              {/* Archive option */}
              {isEditing && (
                <>
                  <div className="border-t border-gray-100 my-4" />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={archived}
                      onChange={e => setArchived(e.target.checked)}
                      className="hig-checkbox"
                    />
                    <Text variant="muted">Archive (Closed Lost)</Text>
                  </label>
                  {archived && (
                    <select
                      value={archivedReason}
                      onChange={e => setArchivedReason(e.target.value)}
                      className="hig-input w-full mt-2"
                    >
                      <option value="">Select reason</option>
                      <option value="No Response / Ghosted">No Response / Ghosted</option>
                      <option value="Client Not Ready / Timeline Changed">Client Not Ready</option>
                      <option value="Chose Another Agent">Chose Another Agent</option>
                      <option value="Financing Didn't Work Out">Financing Issue</option>
                      <option value="Deal Fell Through">Deal Fell Through</option>
                    </select>
                  )}
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}
