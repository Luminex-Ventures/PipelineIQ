import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Calendar,
  CheckCircle,
  Circle,
  Clock,
  MapPin,
  User,
  AlertTriangle,
  ArrowUpRight,
  Loader2,
  Plus,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import DealModal from '../components/DealModal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../lib/database.types';
import { getVisibleUserIds } from '../lib/rbac';

const surfaceClass =
  'rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.08)]';
const filterPillBaseClass =
  'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition';

type TaskRow = Pick<
  Database['public']['Tables']['tasks']['Row'],
  'id' | 'user_id' | 'title' | 'due_date' | 'completed' | 'deal_id' | 'updated_at'
>;
type TaskDeal = Pick<
  Database['public']['Tables']['deals']['Row'],
  'id' | 'client_name' | 'property_address' | 'city' | 'state' | 'next_task_description'
>;
type Task = TaskRow & { deals: TaskDeal };
type DealSummary = Pick<
  Database['public']['Tables']['deals']['Row'],
  | 'id'
  | 'user_id'
  | 'client_name'
  | 'property_address'
  | 'city'
  | 'state'
  | 'deal_type'
  | 'status'
  | 'next_task_due_date'
  | 'next_task_description'
>;
type TaskNote = {
  id: string;
  task_id: string | null;
  content: string;
  created_at: string;
};
type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
type DealNoteInsert = Database['public']['Tables']['deal_notes']['Insert'];
type AccessibleAgentRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

const statusFilterOptions = [
  {
    label: 'All tasks',
    value: 'all',
    accentClass: 'bg-gray-900 text-white border-gray-900 shadow-sm'
  },
  {
    label: 'Overdue',
    value: 'overdue',
    accentClass:
      'bg-red-50 text-red-700 border-red-200 shadow-sm ring-1 ring-red-100'
  },
  {
    label: 'Due today',
    value: 'today',
    accentClass:
      'bg-amber-50 text-amber-700 border-amber-200 shadow-sm ring-1 ring-amber-100'
  },
  {
    label: 'Upcoming',
    value: 'upcoming',
    accentClass:
      'bg-sky-50 text-sky-700 border-sky-200 shadow-sm ring-1 ring-sky-100'
  }
] as const;

type StatusFilterValue = (typeof statusFilterOptions)[number]['value'];

const TASK_COLUMNS = 'id,user_id,title,due_date,completed,deal_id,updated_at';
const DEAL_COLUMNS = 'id,client_name,property_address,city,state,next_task_description';
const COMPLETED_PAGE_SIZE = 30;

export default function Tasks() {
  const { user, roleInfo } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const tasksRequestIdRef = useRef(0);
  const dealsRequestIdRef = useRef(0);
  const completedRequestIdRef = useRef(0);
  const notesRequestIdRef = useRef(0);

  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [dealOwners, setDealOwners] = useState<Record<string, string>>({});
  const [dealsLoading, setDealsLoading] = useState(true);

  const [completingId, setCompletingId] = useState<string | null>(null);
  const [showDealModal, setShowDealModal] = useState(false);
  const [selectedDeal, setSelectedDeal] =
    useState<Database['public']['Tables']['deals']['Row'] | null>(null);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDealId, setNewTaskDealId] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const isManagerRole =
    !!roleInfo && ['sales_manager', 'team_lead', 'admin'].includes(roleInfo.globalRole);
  const [agentOptions, setAgentOptions] = useState<{ id: string; label: string }[]>([]);
  const [notesByTask, setNotesByTask] = useState<Record<string, TaskNote[]>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  // Local “visual completion” state for animation
  const [completedVisual, setCompletedVisual] = useState<Record<string, boolean>>({});

  // Completed tasks view
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedLoadingMore, setCompletedLoadingMore] = useState(false);
  const [completedHasMore, setCompletedHasMore] = useState(true);
  const [completedCursor, setCompletedCursor] = useState<string | null>(null);

  const getOwnerName = (ownerId: string) => {
    if (dealOwners[ownerId]) return dealOwners[ownerId];
    if (ownerId === user?.id) return user.user_metadata?.name || user.email || 'You';
    return `Agent ${ownerId.slice(0, 8)}`;
  };

  const normalizeDueDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  };

  const taskBase = useMemo(
    () => (agentFilter === 'all' ? tasks : tasks.filter((task) => task.user_id === agentFilter)),
    [tasks, agentFilter]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const taskStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let overdue = 0;
    let dueToday = 0;
    let upcoming = 0;
    let unscheduled = 0;

    const datedTasks: Task[] = [];

    taskBase.forEach((task) => {
      const due = normalizeDueDate(task.due_date);
      if (!due) {
        unscheduled += 1;
        return;
      }
      if (due < today) {
        overdue += 1;
      } else if (due.getTime() === today.getTime()) {
        dueToday += 1;
      } else {
        upcoming += 1;
      }
      datedTasks.push(task);
    });

    datedTasks.sort((a, b) => {
      const dueA = normalizeDueDate(a.due_date);
      const dueB = normalizeDueDate(b.due_date);
      if (!dueA) return 1;
      if (!dueB) return -1;
      return dueA.getTime() - dueB.getTime();
    });

    return {
      total: tasks.length,
      scopedTotal: taskBase.length,
      overdue,
      dueToday,
      upcoming,
      unscheduled,
      nextTask: datedTasks[0] || null
    };
  }, [taskBase, tasks.length]);

  const selectedDealOption = useMemo(
    () => deals.find((deal) => deal.id === newTaskDealId),
    [deals, newTaskDealId]
  );

  const shouldGroupDeals = useMemo(
    () => !!(roleInfo && ['sales_manager', 'team_lead'].includes(roleInfo.globalRole)),
    [roleInfo]
  );

  const groupedDeals = useMemo(() => {
    if (!shouldGroupDeals) return null;
    return deals.reduce<Record<string, DealSummary[]>>((acc, deal) => {
      const ownerId = deal.user_id;
      if (!acc[ownerId]) acc[ownerId] = [];
      acc[ownerId].push(deal);
      return acc;
    }, {});
  }, [deals, shouldGroupDeals]);

  const loadAgents = useCallback(async () => {
    if (!user || !roleInfo) return;
    if (!isManagerRole) {
      setAgentOptions([]);
      setAgentFilter('all');
      return;
    }
    try {
      const visibleIds = await getVisibleUserIds(roleInfo);
      const { data, error } = await supabase.rpc<AccessibleAgentRow[]>('get_accessible_agents');
      let opts: { id: string; label: string }[] = [];

      if (!error && data) {
        opts = data
          .filter(
            (agent) =>
              visibleIds.includes(agent.user_id) &&
              agent.global_role !== 'admin' &&
              agent.global_role !== 'sales_manager'
          )
          .map((agent) => ({
            id: agent.user_id,
            label:
              agent.user_id === user.id
                ? (user.user_metadata?.name || user.email || 'You')
                : (agent.display_name || agent.email || `Agent ${agent.user_id.slice(0, 8)}`)
          }));
      }

      if (opts.length === 0) {
        opts = visibleIds.map((id) => ({
          id,
          label:
            id === user.id
              ? (user.user_metadata?.name || user.email || 'You')
              : `Agent ${id.slice(0, 8)}`
        }));
      }

      setAgentOptions(opts);
      if (agentFilter !== 'all' && !opts.find((opt) => opt.id === agentFilter)) {
        setAgentFilter('all');
      }
    } catch (err) {
      console.error('Error loading agents', err);
      const visibleIds = roleInfo ? await getVisibleUserIds(roleInfo) : [];
      const fallback = visibleIds.map((id) => ({
        id,
        label:
          id === user.id
            ? (user.user_metadata?.name || user.email || 'You')
            : `Agent ${id.slice(0, 8)}`
      }));
      setAgentOptions(fallback);
      if (agentFilter !== 'all' && !fallback.find((opt) => opt.id === agentFilter)) {
        setAgentFilter('all');
      }
    }
  }, [agentFilter, isManagerRole, roleInfo, user]);

  const fetchTaskNotes = useCallback(async (taskList: Task[]) => {
    if (!taskList.length) {
      setNotesByTask({});
      return;
    }
    const requestId = ++notesRequestIdRef.current;
    const taskIds = taskList.map((t) => t.id);
    const { data, error } = await supabase
      .from('deal_notes')
      .select('id, task_id, content, created_at')
      .in('task_id', taskIds)
      .order('created_at', { ascending: false });

    if (requestId !== notesRequestIdRef.current) return;
    if (error || !data) {
      console.error('Error loading task notes', error);
      setNotesByTask({});
      return;
    }

    const map: Record<string, TaskNote[]> = {};
    const notes = data as TaskNote[];
    notes.forEach((note) => {
      if (!note.task_id) return;
      if (!map[note.task_id]) map[note.task_id] = [];
      map[note.task_id].push(note);
    });
    setNotesByTask(map);
  }, []);

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    const requestId = ++tasksRequestIdRef.current;
    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    let visibleIds: string[] = [user.id];
    if (roleInfo) {
      visibleIds = await getVisibleUserIds(roleInfo);
      if (!visibleIds.length) visibleIds = [user.id];
    }

    let query = supabase
      .from('tasks')
      .select(`${TASK_COLUMNS}, deals(${DEAL_COLUMNS})`)
      .eq('completed', false)
      .order('due_date', { ascending: true });

    if (visibleIds.length === 1) {
      query = query.eq('user_id', visibleIds[0]);
    } else if (visibleIds.length > 1) {
      query = query.in('user_id', visibleIds);
    }

    const { data, error } = await query;

    if (requestId !== tasksRequestIdRef.current) return;
    if (!error && data) {
      const taskList = (data ?? []).filter((task) => task.deals) as Task[];
      setTasks(taskList);
      await fetchTaskNotes(taskList);
      if (requestId !== tasksRequestIdRef.current) return;
      setLastRefreshedAt(Date.now());
      hasLoadedOnceRef.current = true;
    }

    if (requestId === tasksRequestIdRef.current) {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchTaskNotes, roleInfo, user]);

  const fetchDeals = useCallback(async () => {
    if (!user) return;
    const requestId = ++dealsRequestIdRef.current;
    setDealsLoading(true);

    try {
      let visibleUserIds: string[] = [user.id];

      if (roleInfo) {
        visibleUserIds = await getVisibleUserIds(roleInfo);
        if (!visibleUserIds.length) {
          visibleUserIds = [user.id];
        }
      }

      let query = supabase
        .from('deals')
        .select(
          'id, user_id, client_name, property_address, city, state, deal_type, status, next_task_due_date, next_task_description'
        )
        .neq('status', 'closed')
        .neq('status', 'dead')
        .order('updated_at', { ascending: false });

      if (visibleUserIds.length === 1) {
        query = query.eq('user_id', visibleUserIds[0]);
      } else if (visibleUserIds.length > 1) {
        query = query.in('user_id', visibleUserIds);
      }

      const { data, error } = await query;

      if (requestId !== dealsRequestIdRef.current) return;
      if (error) {
        console.error('Error loading deals', error);
        setDeals([]);
      } else {
        setDeals(data || []);
        const ownerMap: Record<string, string> = {};
        const { data: agents, error: agentError } =
          await supabase.rpc<AccessibleAgentRow[]>('get_accessible_agents');
        if (!agentError && Array.isArray(agents)) {
          agents.forEach((agent) => {
            if (visibleUserIds.includes(agent.user_id)) {
              ownerMap[agent.user_id] =
                agent.display_name || agent.email || 'Agent';
            }
          });
        }
        setDealOwners(ownerMap);
      }
    } catch (err) {
      if (requestId !== dealsRequestIdRef.current) return;
      console.error('Error resolving visible deals', err);
      setDeals([]);
      setDealOwners({});
    } finally {
      if (requestId === dealsRequestIdRef.current) {
        setDealsLoading(false);
      }
    }
  }, [roleInfo, user]);

  useEffect(() => {
    if (!user) return;
    fetchTasks();
  }, [fetchTasks, user]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    if (!user) {
      setDeals([]);
      setDealsLoading(false);
      return;
    }
    fetchDeals();
  }, [fetchDeals, user]);

  const filteredTasks = useMemo(() => {
    let result = [...taskBase];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (statusFilter === 'overdue') {
      result = result.filter((task) => {
        if (!task.due_date) return false;
        const dueDate = normalizeDueDate(task.due_date);
        return !!dueDate && dueDate < today;
      });
    } else if (statusFilter === 'today') {
      result = result.filter((task) => {
        if (!task.due_date) return false;
        const dueDate = normalizeDueDate(task.due_date);
        if (!dueDate) return false;
        return dueDate.getTime() === today.getTime();
      });
    } else if (statusFilter === 'upcoming') {
      result = result.filter((task) => {
        if (!task.due_date) return false;
        const dueDate = normalizeDueDate(task.due_date);
        return !!dueDate && dueDate > today;
      });
    }

    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          (task.deals.client_name || '').toLowerCase().includes(query) ||
          (task.deals.property_address || '').toLowerCase().includes(query)
      );
    }

    return result;
  }, [debouncedSearchQuery, statusFilter, taskBase]);

  useEffect(() => {
    if (agentFilter === 'all') return;
    const validDealIds = new Set(
      deals.filter((deal) => deal.user_id === agentFilter).map((deal) => deal.id)
    );
    if (newTaskDealId && !validDealIds.has(newTaskDealId)) {
      setNewTaskDealId('');
    }
  }, [agentFilter, deals, newTaskDealId]);


  const resetCompletedTasks = useCallback(() => {
    setCompletedTasks([]);
    setCompletedCursor(null);
    setCompletedHasMore(true);
    setCompletedLoadingMore(false);
  }, []);

  const fetchCompletedTasksPage = useCallback(
    async (mode: 'reset' | 'append') => {
      if (!user) return;
      const requestId = ++completedRequestIdRef.current;
      if (mode === 'reset') {
        setCompletedLoading(true);
      } else {
        setCompletedLoadingMore(true);
      }

      try {
        let visibleIds: string[] = [user.id];
        if (roleInfo) {
          visibleIds = await getVisibleUserIds(roleInfo);
          if (!visibleIds.length) visibleIds = [user.id];
        }

        let query = supabase
          .from('tasks')
          .select(`${TASK_COLUMNS}, deals(${DEAL_COLUMNS})`)
          .eq('completed', true)
          .order('updated_at', { ascending: false })
          .limit(COMPLETED_PAGE_SIZE);

        if (mode === 'append' && completedCursor) {
          query = query.lt('updated_at', completedCursor);
        }

        if (visibleIds.length === 1) {
          query = query.eq('user_id', visibleIds[0]);
        } else if (visibleIds.length > 1) {
          query = query.in('user_id', visibleIds);
        }

        const { data, error } = await query;

        if (requestId !== completedRequestIdRef.current) return;
        if (!error && data) {
          const list = (data ?? []).filter((t) => t.deals) as Task[];
          setCompletedTasks((prev) =>
            mode === 'append' ? [...prev, ...list] : list
          );
          if (list.length < COMPLETED_PAGE_SIZE) {
            setCompletedHasMore(false);
          }
          if (list.length > 0) {
            setCompletedCursor(list[list.length - 1].updated_at ?? null);
          } else if (mode === 'reset') {
            setCompletedCursor(null);
          }
        }
      } catch (err) {
        if (requestId !== completedRequestIdRef.current) return;
        console.error('Error loading completed tasks', err);
      } finally {
        if (requestId === completedRequestIdRef.current) {
          if (mode === 'reset') {
            setCompletedLoading(false);
          } else {
            setCompletedLoadingMore(false);
          }
        }
      }
    },
    [completedCursor, roleInfo, user]
  );

  const formatDate = (date?: string | null) => {
    const parsed = normalizeDueDate(date);
    if (!parsed) return 'No due date';
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getTaskStatusBadge = (task: Task) => {
    const due = normalizeDueDate(task.due_date);
    if (!due) {
      return <span className="text-xs font-medium text-gray-500">No due date</span>;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (due < today) {
      return <span className="text-xs font-semibold text-red-600">Overdue</span>;
    }
    if (due.getTime() === today.getTime()) {
      return <span className="text-xs font-semibold text-orange-600">Due today</span>;
    }
    return <span className="text-xs font-semibold text-emerald-600">Upcoming</span>;
  };

  const handleRowClick = (task: Task) => {
    setSelectedDeal(task.deals);
    setShowDealModal(true);
  };

  const handleCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    setCreateError(null);

    if (!newTaskTitle.trim() || !newTaskDealId) {
      setCreateError('Add a task name and choose a deal.');
      return;
    }

    setCreating(true);

    try {
      const taskPayload: TaskInsert = {
        user_id: selectedDealOption?.user_id || user.id,
        deal_id: newTaskDealId,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || null,
        due_date: newTaskDueDate || null,
        completed: false
      };
      const { data: createdTask, error } = await supabase
        .from('tasks')
        .insert(taskPayload)
        .select('id')
        .single();

      if (error) throw error;

      let noteSaveError: string | null = null;

      if (createdTask && newTaskDescription.trim()) {
        const trimmedNote = newTaskDescription.trim();
        const attemptNoteInsert = async (userId: string) => {
          const payload: DealNoteInsert = {
            deal_id: newTaskDealId,
            task_id: createdTask?.id ?? null,
            user_id: userId,
            content: trimmedNote
          };
          return supabase.from('deal_notes').insert(payload);
        };

        let { error: noteError } = await attemptNoteInsert(user.id);

        if (noteError && selectedDealOption?.user_id && selectedDealOption.user_id !== user.id) {
          ({ error: noteError } = await attemptNoteInsert(selectedDealOption.user_id));
        }

        if (noteError) {
          console.error('Error saving task note', noteError);
          noteSaveError = 'Task saved, but note could not be saved for this deal.';
        }
      }

      setNewTaskTitle('');
      setNewTaskDealId('');
      setNewTaskDueDate('');
      setNewTaskDescription('');
      setStatusFilter('all');
      await fetchTasks();
      if (noteSaveError) {
        setCreateError(noteSaveError);
      }
    } catch (err) {
      console.error('Error creating task', err);
      setCreateError('Could not add this task. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleComplete = async (task: Task, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!user) return;

    setCompletingId(task.id);
    try {
      const payload: TaskUpdate = { completed: true };
      const { error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', task.id);

      if (error) throw error;

      // Stop spinner, start animation
      setCompletingId(null);
      setCompletedVisual((prev) => ({ ...prev, [task.id]: true }));

      // After animation completes, remove from list
      setTimeout(() => {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        setCompletedVisual((prev) => {
          const next = { ...prev };
          delete next[task.id];
          return next;
        });

        // If completed panel is open, refresh it so the new one appears there
        if (showCompleted) {
          resetCompletedTasks();
          fetchCompletedTasksPage('reset');
        }
      }, 650);
    } catch (err) {
      console.error('Error completing task', err);
      setCompletingId(null);
      setCompletedVisual((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
    }
  };

  const handleDealModalClose = () => {
    setShowDealModal(false);
    setSelectedDeal(null);
    fetchTasks();
    if (showCompleted) {
      resetCompletedTasks();
      fetchCompletedTasksPage('reset');
    }
  };

  const renderTaskRow = (task: Task) => {
    const notes = notesByTask[task.id] || [];
    const expanded = !!expandedNotes[task.id];
    const isVisuallyCompleted = !!completedVisual[task.id];

    return (
      <tr
        key={task.id}
        className={`hover:bg-[var(--app-surface-muted)]/60 cursor-pointer transition-opacity duration-300 ${
          isVisuallyCompleted ? 'opacity-60 pointer-events-none' : 'opacity-100'
        }`}
        onClick={() => handleRowClick(task)}
      >
        <td className="px-5 py-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              className="pt-1"
              onClick={(event) => handleToggleComplete(task, event)}
              disabled={completingId === task.id}
              aria-label="Mark task complete"
            >
              {completingId === task.id ? (
                <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />
              ) : (
                <span
                  className={`relative flex h-5 w-5 items-center justify-center rounded-full border transition-all duration-300 ${
                    isVisuallyCompleted
                      ? 'border-emerald-500 bg-emerald-50 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  <Circle
                    className={`absolute h-4 w-4 text-gray-300 transition-opacity duration-200 ${
                      isVisuallyCompleted ? 'opacity-0' : 'opacity-100'
                    }`}
                  />
                  <CheckCircle
                    className={`absolute h-4 w-4 text-emerald-500 origin-center transition-all duration-500 ${
                      isVisuallyCompleted ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                    }`}
                  />
                </span>
              )}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <p
                  className={`font-medium transition-all duration-300 ${
                    isVisuallyCompleted ? 'text-gray-400' : 'text-gray-900'
                  }`}
                >
                  <span className="relative inline-block">
                    <span className="relative z-10">{task.title}</span>
                    {isVisuallyCompleted && (
                      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-[1px] bg-gray-400 task-strike" />
                    )}
                  </span>
                </p>
                {notes.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedNotes((prev) => ({
                        ...prev,
                        [task.id]: !expanded
                      }));
                    }}
                    className="text-[11px] font-semibold text-[var(--app-accent)] inline-flex items-center gap-1"
                    aria-label="Toggle task notes"
                  >
                    {expanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <span>Notes</span>
                  </button>
                )}
              </div>
              {task.deals?.next_task_description && (
                <p className="text-xs text-gray-500">
                  Related: {task.deals.next_task_description}
                </p>
              )}
              {expanded && notes.length > 0 && (
                <div className="mt-2 rounded-xl border border-gray-200/70 bg-gray-50/80 p-3 space-y-2">
                  {notes.slice(0, 3).map((note) => (
                    <p key={note.id} className="text-sm text-gray-700">
                      {note.content}
                    </p>
                  ))}
                  {notes.length > 3 && (
                    <p className="text-xs text-gray-500">
                      {notes.length - 3} more note
                      {notes.length - 3 === 1 ? '' : 's'} in Deal notes
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-5 py-4 text-sm text-gray-700">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <span>{formatDate(task.due_date)}</span>
          </div>
        </td>
        <td className="px-5 py-4 text-sm text-gray-700">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-medium text-gray-900">
                {task.deals.client_name}
              </span>
            </div>
            {task.deals.property_address && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <MapPin className="h-3 w-3" />
                <span className="truncate">
                  {task.deals.property_address}
                  {task.deals.city ? `, ${task.deals.city}` : ''}
                </span>
              </div>
            )}
          </div>
        </td>
        <td className="px-5 py-4 text-sm text-gray-700">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            {getTaskStatusBadge(task)}
          </div>
        </td>
      </tr>
    );
  };

  const renderCompletedRow = (task: Task) => (
    <tr
      key={task.id}
      className="hover:bg-gray-100/80 cursor-pointer text-xs sm:text-sm"
      onClick={() => handleRowClick(task)}
    >
      <td className="px-5 py-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </span>
          <div>
            <p className="font-medium text-gray-700 line-through decoration-gray-400">
              {task.title}
            </p>
            <p className="text-[11px] text-gray-500">
              {task.deals.client_name}
              {task.deals.property_address ? ` • ${task.deals.property_address}` : ''}
            </p>
          </div>
        </div>
      </td>
      <td className="px-5 py-2">
        <span className="flex items-center gap-1 text-gray-500">
          <Calendar className="h-3.5 w-3.5" />
          <span>{formatDate(task.due_date)}</span>
        </span>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <div className={`${surfaceClass} p-6 space-y-5`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.25em]">
              Tasks
            </p>
            <h1 className="text-3xl font-semibold text-gray-900 mt-1">Outstanding work</h1>
            <p className="text-sm text-gray-600 mt-2">
              Track every open commitment across all deals in a single, prioritized list.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
            <div className="flex flex-col items-start gap-1 text-xs text-gray-500 md:items-end">
              {refreshing && (
                <div className="inline-flex items-center gap-2 text-gray-500">
                  <span className="inline-flex h-2 w-2 rounded-full bg-[var(--app-accent)]" />
                  <span>Refreshing…</span>
                </div>
              )}
              {lastRefreshedAt && (
                <span>
                  Last updated{' '}
                  {new Date(lastRefreshedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by client, task, property..."
              className="w-full rounded-2xl border border-white/60 bg-white/90 py-2.5 pl-4 pr-4 text-sm text-gray-900 shadow-inner placeholder:text-gray-400 focus:border-[var(--app-accent)]/40 focus:ring-2 focus:ring-[var(--app-accent)]/15 md:min-w-[280px]"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-400">
                Task status
              </span>
              {statusFilter !== 'all' && (
                <button
                  onClick={() => setStatusFilter('all')}
                  className="text-xs font-medium text-[var(--app-accent)] hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
            {isManagerRole && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-400">
                  Agent
                </span>
                <select
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                  className="hig-input w-52"
                >
                  <option value="all">All agents</option>
                  {agentOptions.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {statusFilterOptions.map((option) => {
                const isActive = statusFilter === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setStatusFilter(option.value)}
                    className={`${filterPillBaseClass} ${
                      isActive
                        ? option.accentClass
                        : 'border-gray-200/70 bg-white text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <span className="h-6 w-px bg-gray-200/80" aria-hidden="true" />
            <button
              type="button"
              onClick={async () => {
                setShowCompleted((prev) => {
                  const next = !prev;
                  if (next) {
                    resetCompletedTasks();
                    fetchCompletedTasksPage('reset');
                  }
                  return next;
                });
              }}
              className={`${filterPillBaseClass} gap-2 tracking-[0.05em] ${
                showCompleted
                  ? 'border-[var(--app-accent)]/30 bg-[var(--app-accent)]/10 text-[var(--app-accent)] shadow-sm'
                  : 'border-gray-200/70 bg-white text-gray-700 hover:text-gray-900'
              }`}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              {showCompleted ? 'Hide completed' : 'View recently completed'}
            </button>
          </div>
        </div>
      </div>

      <div className={`${surfaceClass} p-6 space-y-4`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.25em]">
              Add a task
            </p>
            <h2 className="text-2xl font-semibold text-gray-900 mt-1">
              Assign the next move
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Attach a next step to any deal without leaving this page. Keep it short,
              clear, and actionable.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-4 py-2 text-xs font-semibold text-gray-700 shadow-inner">
            <span className="h-2 w-2 rounded-full bg-[var(--app-accent)] shadow-[0_0_0_4px_rgba(0,122,255,0.12)]" />
            {dealsLoading
              ? 'Loading deals…'
              : `${
                  agentFilter === 'all'
                    ? deals.length
                    : deals.filter((d) => d.user_id === agentFilter).length
                } deals available`}
          </div>
        </div>

        <form onSubmit={handleCreateTask} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <label className="hig-label">Task</label>
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => {
                setNewTaskTitle(e.target.value);
                if (createError) setCreateError(null);
              }}
              placeholder="Call lender about pre-approval"
              className="hig-input"
            />
          </div>

          <div className="lg:col-span-4">
            <label className="hig-label">Deal</label>
            <select
              value={newTaskDealId}
              onChange={(e) => {
                setNewTaskDealId(e.target.value);
                if (createError) setCreateError(null);
              }}
              className="hig-input task-deal-select"
              disabled={dealsLoading || deals.length === 0}
            >
              <option value="">
                {dealsLoading ? 'Loading deals…' : 'Choose a deal'}
              </option>
              {shouldGroupDeals && groupedDeals
                ? Object.entries(groupedDeals)
                    .map(([ownerId, ownerDeals]) => {
                      const filtered =
                        agentFilter === 'all'
                          ? ownerDeals
                          : ownerDeals.filter((d) => d.user_id === agentFilter);
                      return [ownerId, filtered] as const;
                    })
                    .filter(([, ownerDeals]) => ownerDeals.length > 0)
                    .sort((a, b) => {
                      const nameA = getOwnerName(a[0]);
                      const nameB = getOwnerName(b[0]);
                      return nameA.localeCompare(nameB);
                    })
                    .map(([ownerId, ownerDeals]) => (
                      <optgroup
                        key={ownerId}
                        label={`— ${getOwnerName(ownerId).toUpperCase()} · ${
                          ownerDeals.length
                        } deal${ownerDeals.length === 1 ? '' : 's'} —`}
                      >
                        {ownerDeals.map((deal) => (
                          <option key={deal.id} value={deal.id}>
                            {deal.client_name} — {deal.property_address || 'Address TBD'}
                          </option>
                        ))}
                      </optgroup>
                    ))
                : (agentFilter === 'all'
                    ? deals
                    : deals.filter((deal) => deal.user_id === agentFilter)
                  ).map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.client_name} — {deal.property_address || 'Address TBD'}
                    </option>
                  ))}
            </select>
            {selectedDealOption && (
              <p className="mt-1 text-xs text-gray-500">
                {selectedDealOption.city && selectedDealOption.state
                  ? `${selectedDealOption.city}, ${selectedDealOption.state}`
                  : selectedDealOption.city ||
                    selectedDealOption.state ||
                    'No location on file'}
              </p>
            )}
          </div>

          <div className="lg:col-span-2">
            <label className="hig-label">Due date</label>
            <input
              type="date"
              value={newTaskDueDate}
              onChange={(e) => setNewTaskDueDate(e.target.value)}
              className="hig-input"
            />
          </div>

          <div className="lg:col-span-1 flex items-end">
            <button
              type="submit"
              className="hig-btn-primary w-full gap-2"
              disabled={creating || dealsLoading || deals.length === 0}
            >
              {creating ? (
                'Adding…'
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add
                </>
              )}
            </button>
          </div>

          <div className="lg:col-span-9">
            <label className="hig-label">Notes (optional)</label>
            <textarea
              value={newTaskDescription}
              onChange={(e) => setNewTaskDescription(e.target.value)}
              placeholder="Context, prep work, or key talking points"
              className="hig-input min-h-[80px]"
            />
          </div>

          <div className="lg:col-span-3">
            <div className="h-full rounded-xl border border-gray-200/70 bg-gray-50/80 px-4 py-3 text-sm text-gray-700 shadow-inner">
              <p className="font-semibold text-gray-900">Give it clarity</p>
              <p className="mt-1 text-gray-600">
                Use short verbs, include the who/where, and set a date so it shows up
                in the right bucket.
              </p>
            </div>
          </div>

          {createError && (
            <div className="lg:col-span-12 text-sm text-red-600">{createError}</div>
          )}
        </form>
      </div>

      <div className={`${surfaceClass} p-0 overflow-hidden ${refreshing ? 'opacity-90' : ''}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Task</th>
                <th className="px-5 py-3">Due</th>
                <th className="px-5 py-3">Deal</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white/90">
              {loading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-gray-500 text-sm"
                  >
                    Loading tasks…
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-12 text-center text-gray-500 text-sm"
                  >
                    Nothing to show here — take a moment to plan your next steps.
                  </td>
                </tr>
              ) : (() => {
                const groups =
                  isManagerRole && agentFilter === 'all'
                    ? (() => {
                        const g = new Map<string, Task[]>();
                        filteredTasks.forEach((task) => {
                          const ownerId = task.user_id;
                          if (!g.has(ownerId)) g.set(ownerId, []);
                          g.get(ownerId)!.push(task);
                        });
                        return Array.from(g.entries())
                          .map(([agentId, tasksForAgent]) => ({
                            agentId,
                            agentName:
                              dealOwners[agentId] || getOwnerName(agentId),
                            tasks: tasksForAgent
                          }))
                          .sort((a, b) =>
                            a.agentName.localeCompare(b.agentName)
                          );
                      })()
                    : null;

                if (groups && groups.length > 0) {
                  return (
                    <>
                      {groups.map((group) => (
                        <React.Fragment key={group.agentId}>
                          <tr className="bg-[var(--app-surface-muted)] sticky top-[3.5rem] z-10">
                            <td
                              colSpan={4}
                              className="px-5 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide"
                            >
                              {group.agentName} • {group.tasks.length} task
                              {group.tasks.length === 1 ? '' : 's'}
                            </td>
                          </tr>
                          {group.tasks.map((task) => renderTaskRow(task))}
                        </React.Fragment>
                      ))}
                    </>
                  );
                }

                return <>{filteredTasks.map((task) => renderTaskRow(task))}</>;
              })()}
            </tbody>
          </table>
        </div>

        {showCompleted && (
          <div className="border-t border-gray-100 bg-gray-50/80">
            <div className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                  Recently completed
                </p>
                <p className="text-xs text-gray-500">
                  Last 30 completed tasks in your scope.
                </p>
              </div>
              <div className="text-xs text-gray-500">
                {completedLoading
                  ? 'Loading…'
                  : `${completedTasks.length} item${
                      completedTasks.length === 1 ? '' : 's'
                    }`}
              </div>
            </div>
            {completedLoading ? (
              <div className="px-5 pb-4 text-xs text-gray-500">Loading…</div>
            ) : completedTasks.length === 0 ? (
              <div className="px-5 pb-4 text-xs text-gray-500">
                Nothing completed yet.
              </div>
            ) : (
              <>
                <div className="max-h-72 overflow-y-auto">
                  <table className="min-w-full text-left">
                    <tbody>{completedTasks.map((task) => renderCompletedRow(task))}</tbody>
                  </table>
                </div>
                <div className="flex items-center justify-center px-5 pb-4 pt-3">
                  {completedHasMore ? (
                    <button
                      type="button"
                      onClick={() => fetchCompletedTasksPage('append')}
                      disabled={completedLoadingMore}
                      className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-semibold text-gray-700 transition hover:text-gray-900 disabled:opacity-60"
                    >
                      {completedLoadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-500">You've reached the end.</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <section className={`${surfaceClass} p-6`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Focus cues
            </p>
            <h2 className="text-xl font-semibold text-gray-900">
              Where attention is needed
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-red-100/60 bg-red-50/70 p-4">
            <div className="flex items-center gap-2 text-red-600 text-sm font-semibold uppercase tracking-wide">
              <AlertTriangle className="h-4 w-4" />
              Overdue
            </div>
            <p className="mt-2 text-2xl font-semibold text-red-700">
              {taskStats.overdue}
            </p>
            <p className="text-xs text-red-600">Tasks waiting on you</p>
          </div>
          <div className="rounded-2xl border border-amber-100/70 bg-amber-50/60 p-4">
            <div className="flex items-center gap-2 text-amber-600 text-sm font-semibold uppercase tracking-wide">
              <Clock className="h-4 w-4" />
              Due today
            </div>
            <p className="mt-2 text-2xl font-semibold text-amber-700">
              {taskStats.dueToday}
            </p>
            <p className="text-xs text-amber-600">Expected before midnight</p>
          </div>
          <div className="rounded-2xl border border-emerald-100/70 bg-emerald-50/60 p-4">
            <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold uppercase tracking-wide">
              <ArrowUpRight className="h-4 w-4" />
              Upcoming
            </div>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">
              {taskStats.upcoming}
            </p>
            <p className="text-xs text-emerald-600">On the horizon</p>
          </div>
          <div className="rounded-2xl border border-gray-100/70 bg-gray-50/80 p-4">
            <div className="flex items-center gap-2 text-gray-600 text-sm font-semibold uppercase tracking-wide">
              <Circle className="h-4 w-4" />
              Unscheduled
            </div>
            <p className="mt-2 text-2xl font-semibold text-gray-700">
              {taskStats.unscheduled}
            </p>
            <p className="text-xs text-gray-500">
              Add due dates to keep momentum
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-gray-100/80 bg-[var(--app-surface-muted)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Next actionable
          </p>
          {taskStats.nextTask ? (
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {taskStats.nextTask.title}
                </p>
                <p className="text-sm text-gray-600">
                  {taskStats.nextTask.deals.client_name}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span>{formatDate(taskStats.nextTask.due_date)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600">
              No dated tasks remain. Assign due dates to keep focus on high-leverage
              work.
            </p>
          )}
        </div>
      </section>

      {showDealModal && selectedDeal && (
        <DealModal
          deal={selectedDeal}
          onClose={handleDealModalClose}
          onDelete={handleDealModalClose}
        />
      )}
    </div>
  );
}
