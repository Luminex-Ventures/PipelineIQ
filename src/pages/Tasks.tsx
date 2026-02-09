import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  CheckCircle,
  Circle,
  Clock,
  MapPin,
  User,
  AlertTriangle,
  Loader2,
  ArrowUpRight,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import DealModal from '../components/DealModal';
import QuickAddTask from '../components/QuickAddTask';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../lib/database.types';
import { getVisibleUserIds } from '../lib/rbac';
import { Card } from '../ui/Card';
import { FormField } from '../ui/FormField';
import { LastUpdatedStatus } from '../ui/LastUpdatedStatus';
import { PageShell } from '../ui/PageShell';
import { PageHeader } from '../ui/PageHeader';
import { Text } from '../ui/Text';
import { ui } from '../ui/tokens';

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
  | 'updated_at'
>;
type TaskNote = {
  id: string;
  task_id: string | null;
  content: string;
  created_at: string;
};
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
type AccessibleAgentRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

type StatusFilterValue = 'all' | 'overdue' | 'today' | 'upcoming' | 'unscheduled';

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
  const [optimisticallyCompletedIds, setOptimisticallyCompletedIds] = useState<Record<string, true>>({});
  const [optimisticallyCompletedTasks, setOptimisticallyCompletedTasks] = useState<Record<string, Task>>({});
  const hasLoadedOnceRef = useRef(false);
  const tasksRequestIdRef = useRef(0);
  const dealsRequestIdRef = useRef(0);
  const completedRequestIdRef = useRef(0);
  const notesRequestIdRef = useRef(0);
  const optimisticallyCompletedIdsRef = useRef<Record<string, true>>({});

  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [dealOwners, setDealOwners] = useState<Record<string, string>>({});

  const [completingId, setCompletingId] = useState<string | null>(null);
  const [showDealModal, setShowDealModal] = useState(false);
  const [selectedDeal, setSelectedDeal] =
    useState<Database['public']['Tables']['deals']['Row'] | null>(null);
  const [lastOpenedDealId, setLastOpenedDealId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('tasks_last_opened_deal');
  });
  const [showListQuickAdd, setShowListQuickAdd] = useState(false);
  const taskListRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'compact'>(() => {
    if (typeof window === 'undefined') return 'list';
    const stored = window.localStorage.getItem('tasks_view_mode');
    return stored === 'compact' ? 'compact' : 'list';
  });

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

  useEffect(() => {
    optimisticallyCompletedIdsRef.current = optimisticallyCompletedIds;
  }, [optimisticallyCompletedIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('tasks_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (lastOpenedDealId) {
      window.localStorage.setItem('tasks_last_opened_deal', lastOpenedDealId);
    } else {
      window.localStorage.removeItem('tasks_last_opened_deal');
    }
  }, [lastOpenedDealId]);

  const todayStart = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }, []);

  const effectiveTasks = useMemo(
    () => tasks.filter((task) => !optimisticallyCompletedIds[task.id]),
    [optimisticallyCompletedIds, tasks]
  );

  const taskBase = useMemo(
    () =>
      agentFilter === 'all'
        ? effectiveTasks
        : effectiveTasks.filter((task) => task.user_id === agentFilter),
    [effectiveTasks, agentFilter]
  );

  const optimisticTasks = useMemo(() => {
    const list = Object.values(optimisticallyCompletedTasks);
    if (agentFilter === 'all') return list;
    return list.filter((task) => task.user_id === agentFilter);
  }, [agentFilter, optimisticallyCompletedTasks]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const taskStats = useMemo(() => {
    let overdue = 0;
    let dueToday = 0;
    let upcoming = 0;
    let unscheduled = 0;

    const datedTasks: Array<{ task: Task; dueTs: number }> = [];

    taskBase.forEach((task) => {
      const due = normalizeDueDate(task.due_date);
      if (!due) {
        unscheduled += 1;
        return;
      }
      const dueTs = due.getTime();
      if (dueTs < todayStart) {
        overdue += 1;
      } else if (dueTs === todayStart) {
        dueToday += 1;
      } else {
        upcoming += 1;
      }
      datedTasks.push({ task, dueTs });
    });

    datedTasks.sort((a, b) => {
      return a.dueTs - b.dueTs;
    });

    return {
      total: effectiveTasks.length,
      scopedTotal: taskBase.length,
      overdue,
      dueToday,
      upcoming,
      unscheduled,
      nextTask: datedTasks[0]?.task || null
    };
  }, [taskBase, effectiveTasks.length, todayStart]);

  const shouldGroupDeals = useMemo(
    () => !!(roleInfo && ['sales_manager', 'team_lead'].includes(roleInfo.globalRole)),
    [roleInfo]
  );

  const dealsForSelector = useMemo(() => {
    const scoped = agentFilter === 'all'
      ? deals
      : deals.filter((deal) => deal.user_id === agentFilter);
    return [...scoped].sort((a, b) => {
      const aTs = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bTs = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bTs - aTs;
    });
  }, [agentFilter, deals]);

  const dealOptions = useMemo(
    () =>
      dealsForSelector.map((deal) => {
        const location = [deal.city, deal.state].filter(Boolean).join(', ');
        const keywords = `${deal.client_name} ${deal.property_address ?? ''} ${deal.city ?? ''} ${deal.state ?? ''}`;
        return {
          value: deal.id,
          label: `${deal.client_name} — ${deal.property_address || 'Address TBD'}`,
          subLabel: location || undefined,
          group: shouldGroupDeals ? getOwnerName(deal.user_id) : undefined,
          keywords
        };
      }),
    [dealsForSelector, shouldGroupDeals, dealOwners, user]
  );

  const loadAgents = useCallback(async (): Promise<{ id: string; label: string }[]> => {
    if (!user || !roleInfo) return [];
    if (!isManagerRole) {
      setAgentOptions([]);
      setAgentFilter('all');
      return [];
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
      return opts;
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
      return fallback;
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

  const fetchTasks = useCallback(async (): Promise<Task[]> => {
    if (!user) return [];
    const requestId = ++tasksRequestIdRef.current;

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

    if (requestId !== tasksRequestIdRef.current) return [];
    if (!error && data) {
      const optimisticMap = optimisticallyCompletedIdsRef.current;
      const taskList = (data ?? [])
        .filter((task) => task.deals)
        .filter((task) => !optimisticMap[task.id]) as Task[];
      setTasks(taskList);
      await fetchTaskNotes(taskList);
      if (requestId !== tasksRequestIdRef.current) return [];
      setLastRefreshedAt(Date.now());
      hasLoadedOnceRef.current = true;
      setLoading(false);
      setRefreshing(false);
      return taskList;
    }

    setLoading(false);
    setRefreshing(false);
    return [];
  }, [fetchTaskNotes, roleInfo, user]);

  const fetchDeals = useCallback(async (): Promise<DealSummary[]> => {
    if (!user) return [];
    const requestId = ++dealsRequestIdRef.current;

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
          'id, user_id, client_name, property_address, city, state, deal_type, status, next_task_due_date, next_task_description, updated_at'
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

      if (requestId !== dealsRequestIdRef.current) return [];
      if (error) {
        console.error('Error loading deals', error);
        setDeals([]);
        return [];
      }
      
      const dealsList = (data || []) as DealSummary[];
      setDeals(dealsList);
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
      return dealsList;
    } catch (err) {
      if (requestId !== dealsRequestIdRef.current) return [];
      console.error('Error resolving visible deals', err);
      setDeals([]);
      setDealOwners({});
      return [];
    }
  }, [roleInfo, user]);

  // React Query for cached tasks - provides instant loading on revisit
  const tasksQuery = useQuery({
    queryKey: ['tasks', 'active', user?.id, roleInfo?.globalRole, roleInfo?.teamId],
    queryFn: async () => {
      const result = await fetchTasks();
      return result ?? []; // Ensure we never return undefined
    },
    enabled: !!user,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // React Query for cached deals
  useQuery({
    queryKey: ['tasks', 'deals', user?.id, roleInfo?.globalRole, roleInfo?.teamId],
    queryFn: async () => {
      const result = await fetchDeals();
      return result ?? []; // Ensure we never return undefined
    },
    enabled: !!user,
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // React Query for cached agents
  useQuery({
    queryKey: ['tasks', 'agents', user?.id, roleInfo?.globalRole],
    queryFn: async () => {
      const result = await loadAgents();
      return result ?? []; // Ensure we never return undefined
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Sync loading states
  useEffect(() => {
    setLoading(tasksQuery.isLoading);
    setRefreshing(tasksQuery.isFetching && !tasksQuery.isLoading);
  }, [tasksQuery.isLoading, tasksQuery.isFetching]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = debouncedSearchQuery.toLowerCase();
    let result = [...taskBase, ...optimisticTasks];

    if (statusFilter !== 'all') {
      result = result.filter((task) => {
        const due = normalizeDueDate(task.due_date);
        if (statusFilter === 'unscheduled') return !due;
        if (!due) return false;
        const dueTs = due.getTime();
        if (statusFilter === 'overdue') return dueTs < todayStart;
        if (statusFilter === 'today') return dueTs === todayStart;
        return dueTs > todayStart;
      });
    }

    if (normalizedSearch) {
      result = result.filter((task) => {
        return (
          task.title.toLowerCase().includes(normalizedSearch) ||
          (task.deals.client_name || '').toLowerCase().includes(normalizedSearch) ||
          (task.deals.property_address || '').toLowerCase().includes(normalizedSearch)
        );
      });
    }

    return result;
  }, [debouncedSearchQuery, optimisticTasks, statusFilter, taskBase, todayStart]);

  const dealById = useMemo(() => {
    const map: Record<string, DealSummary> = {};
    deals.forEach((deal) => {
      map[deal.id] = deal;
    });
    return map;
  }, [deals]);

  const preferredDeal = useMemo<DealSummary | null>(() => {
    if (selectedDeal) {
      return {
        id: selectedDeal.id,
        user_id: selectedDeal.user_id,
        client_name: selectedDeal.client_name,
        property_address: selectedDeal.property_address,
        city: selectedDeal.city,
        state: selectedDeal.state,
        updated_at: selectedDeal.updated_at
      };
    }
    if (lastOpenedDealId) {
      return dealById[lastOpenedDealId] ?? null;
    }
    return null;
  }, [dealById, lastOpenedDealId, selectedDeal]);

  const preferredDealLabel = preferredDeal
    ? `${preferredDeal.client_name} — ${preferredDeal.property_address || 'Address TBD'}`
    : null;


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
      return (
        <Text as="span" variant="muted" className="font-medium">
          No due date
        </Text>
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (due < today) {
      return (
        <Text as="span" variant="muted" className={[ui.tone.rose, 'font-semibold'].join(' ')}>
          Overdue
        </Text>
      );
    }
    if (due.getTime() === today.getTime()) {
      return (
        <Text as="span" variant="muted" className={[ui.tone.warningStrong, 'font-semibold'].join(' ')}>
          Due today
        </Text>
      );
    }
    return (
      <Text as="span" variant="muted" className={[ui.tone.successStrong, 'font-semibold'].join(' ')}>
        Upcoming
      </Text>
    );
  };

  const getDueMeta = (task: Task) => {
    const due = normalizeDueDate(task.due_date);
    if (!due) {
      return { label: 'No due date', tone: ui.tone.subtle, bg: 'bg-gray-100' };
    }
    const dueTs = due.getTime();
    if (dueTs < todayStart) {
      return { label: 'Overdue', tone: ui.tone.rose, bg: 'bg-rose-50' };
    }
    if (dueTs === todayStart) {
      return { label: 'Due today', tone: ui.tone.warningStrong, bg: 'bg-amber-50' };
    }
    return { label: 'Upcoming', tone: ui.tone.successStrong, bg: 'bg-emerald-50' };
  };

  const getStatusFilterLabel = (value: StatusFilterValue) => {
    if (value === 'today') return 'Due today';
    if (value === 'overdue') return 'Overdue';
    if (value === 'upcoming') return 'Upcoming';
    if (value === 'unscheduled') return 'No due date';
    return 'All tasks';
  };

  const sortTasksByDueDate = useCallback(
    (list: Task[]) =>
      [...list].sort((a, b) => {
        const aDue = normalizeDueDate(a.due_date);
        const bDue = normalizeDueDate(b.due_date);
        if (!aDue && !bDue) return 0;
        if (!aDue) return 1;
        if (!bDue) return -1;
        return aDue.getTime() - bDue.getTime();
      }),
    [normalizeDueDate]
  );

  const handleRowClick = (task: Task) => {
    setSelectedDeal(task.deals);
    setShowDealModal(true);
    setLastOpenedDealId(task.deals.id);
  };

  const completeTask = async (task: Task) => {
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
      setOptimisticallyCompletedIds((prev) => ({ ...prev, [task.id]: true }));
      setOptimisticallyCompletedTasks((prev) => ({ ...prev, [task.id]: task }));
      setCompletedVisual((prev) => ({ ...prev, [task.id]: true }));
      setTasks((prev) => prev.filter((t) => t.id !== task.id));

      // After animation completes, clean up optimistic state
      setTimeout(() => {
        setOptimisticallyCompletedIds((prev) => {
          const next = { ...prev };
          delete next[task.id];
          return next;
        });
        setOptimisticallyCompletedTasks((prev) => {
          const next = { ...prev };
          delete next[task.id];
          return next;
        });
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
      setOptimisticallyCompletedIds((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
      setOptimisticallyCompletedTasks((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
      setCompletedVisual((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
    }
  };

  const handleToggleComplete = async (task: Task, event: React.MouseEvent) => {
    event.stopPropagation();
    await completeTask(task);
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

  const handleQuickAddCreated = useCallback(
    (createdTask: Database['public']['Tables']['tasks']['Row'], deal: DealSummary | null) => {
      if (!deal) return;
      const taskWithDeal: Task = {
        id: createdTask.id,
        user_id: createdTask.user_id,
        title: createdTask.title,
        due_date: createdTask.due_date,
        completed: createdTask.completed,
        deal_id: createdTask.deal_id,
        updated_at: createdTask.updated_at,
        deals: {
          id: deal.id,
          client_name: deal.client_name,
          property_address: deal.property_address,
          city: deal.city,
          state: deal.state,
          next_task_description: deal.next_task_description
        }
      };
      setTasks((prev) => sortTasksByDueDate([taskWithDeal, ...prev]));
      setLastOpenedDealId(deal.id);
    },
    [sortTasksByDueDate]
  );

  const renderCompletionButton = (task: Task, isVisuallyCompleted: boolean) => (
    <button
      type="button"
      className="pt-1"
      onClick={(event) => handleToggleComplete(task, event)}
      disabled={completingId === task.id}
      aria-label="Mark task complete"
    >
      {completingId === task.id ? (
        <Loader2 className={['h-4 w-4 animate-spin', ui.tone.success].join(' ')} />
      ) : (
        <span
          className={[
            'relative flex h-5 w-5 items-center justify-center transition-all duration-300',
            ui.radius.pill,
            ui.border.subtle,
            isVisuallyCompleted ? 'bg-emerald-50' : 'bg-white'
          ].join(' ')}
        >
          <Circle
            className={[
              'absolute h-4 w-4 transition-opacity duration-200',
              ui.tone.faint,
              isVisuallyCompleted ? 'opacity-0' : 'opacity-100'
            ].join(' ')}
          />
          <CheckCircle
            className={[
              'absolute h-4 w-4 origin-center transition-all duration-500',
              ui.tone.success,
              isVisuallyCompleted ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
            ].join(' ')}
          />
        </span>
      )}
    </button>
  );

  const renderNotesToggle = (task: Task, notes: TaskNote[], expanded: boolean) => {
    if (notes.length === 0) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpandedNotes((prev) => ({
            ...prev,
            [task.id]: !expanded
          }));
        }}
        className="inline-flex items-center gap-1"
        aria-label="Toggle task notes"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <Text as="span" variant="micro" className={ui.tone.accent}>
          Notes
        </Text>
      </button>
    );
  };

  const renderTaskRow = (task: Task) => {
    const notes = notesByTask[task.id] || [];
    const expanded = !!expandedNotes[task.id];
    const isVisuallyCompleted = !!completedVisual[task.id];
    const due = normalizeDueDate(task.due_date);
    const isOverdue = !!due && due.getTime() < todayStart && !isVisuallyCompleted;

    return (
      <tr
        key={task.id}
        className={`hover:bg-[var(--app-surface-muted)]/60 cursor-pointer transition-opacity duration-300 ${
          isVisuallyCompleted ? 'opacity-60 pointer-events-none' : 'opacity-100'
        }`}
        onClick={() => handleRowClick(task)}
      >
        <td
          className={[
            'tasks-cell',
            isOverdue ? 'border-l-2 border-rose-400/60 pl-4' : ''
          ].join(' ')}
        >
          <div className="flex items-start gap-3">
            {renderCompletionButton(task, isVisuallyCompleted)}
            <div>
              <div className="flex items-center gap-2">
                <Text
                  as="p"
                  variant="body"
                  className={[
                    'font-medium transition-all duration-300',
                    isVisuallyCompleted ? ui.tone.faint : ui.tone.primary
                  ].join(' ')}
                >
                  <span className="relative inline-block">
                    <span className="relative z-10">{task.title}</span>
                    {isVisuallyCompleted && (
                      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-[1px] bg-gray-400 task-strike" />
                    )}
                  </span>
                </Text>
                {renderNotesToggle(task, notes, expanded)}
              </div>
              {task.deals?.next_task_description && (
                <Text as="p" variant="muted">
                  Related: {task.deals.next_task_description}
                </Text>
              )}
              {expanded && notes.length > 0 && (
                <div className={[ui.radius.control, ui.border.subtle, ui.pad.cardTight, 'tasks-mt-2 bg-gray-50/80 space-y-2'].join(' ')}>
                  {notes.slice(0, 3).map((note) => (
                    <Text key={note.id} as="p" variant="body" className={ui.tone.muted}>
                      {note.content}
                    </Text>
                  ))}
                  {notes.length > 3 && (
                    <Text as="p" variant="muted">
                      {notes.length - 3} more note
                      {notes.length - 3 === 1 ? '' : 's'} in Deal notes
                    </Text>
                  )}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="tasks-cell">
          <div className="flex items-center gap-2">
            <Calendar className={['h-4 w-4', ui.tone.faint].join(' ')} />
            <Text as="span" variant="body" className={ui.tone.muted}>
              {formatDate(task.due_date)}
            </Text>
          </div>
        </td>
        <td className="tasks-cell">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <User className={['h-3.5 w-3.5', ui.tone.faint].join(' ')} />
              <Text as="span" variant="body" className="font-medium">
                {task.deals.client_name}
              </Text>
            </div>
            {task.deals.property_address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3" />
                <Text as="span" variant="muted" className="truncate">
                  {task.deals.property_address}
                  {task.deals.city ? `, ${task.deals.city}` : ''}
                </Text>
              </div>
            )}
          </div>
        </td>
        <td className="tasks-cell">
          <div className="flex items-center gap-2">
            <Clock className={['h-4 w-4', ui.tone.faint].join(' ')} />
            {getTaskStatusBadge(task)}
          </div>
        </td>
      </tr>
    );
  };

  const renderTaskCard = (task: Task) => {
    const notes = notesByTask[task.id] || [];
    const expanded = !!expandedNotes[task.id];
    const isVisuallyCompleted = !!completedVisual[task.id];
    const dueMeta = getDueMeta(task);

    return (
      <Card
        key={task.id}
        role="button"
        tabIndex={0}
        onClick={() => handleRowClick(task)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleRowClick(task);
          }
        }}
        padding="cardTight"
        className={[
          'transition hover:bg-white',
          isVisuallyCompleted ? 'opacity-70' : 'opacity-100'
        ].join(' ')}
      >
        <div className="flex items-start gap-3">
          {renderCompletionButton(task, isVisuallyCompleted)}
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Text
                  as="p"
                  variant="body"
                  className={[
                    'font-semibold transition-all duration-300',
                    isVisuallyCompleted ? ui.tone.faint : ui.tone.primary
                  ].join(' ')}
                >
                  <span className="relative inline-block">
                    <span className="relative z-10">{task.title}</span>
                    {isVisuallyCompleted && (
                      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-[1px] bg-gray-400 task-strike" />
                    )}
                  </span>
                </Text>
                <Text as="p" variant="muted">
                  {task.deals.client_name}
                  {task.deals.property_address ? ` • ${task.deals.property_address}` : ''}
                </Text>
              </div>
              <span
                className={[
                  'inline-flex items-center',
                  ui.radius.pill,
                  ui.pad.chip,
                  dueMeta.bg,
                  dueMeta.tone,
                  'font-semibold'
                ].join(' ')}
              >
                {dueMeta.label}
              </span>
            </div>

            {task.deals?.next_task_description && (
              <Text as="p" variant="muted">
                Related: {task.deals.next_task_description}
              </Text>
            )}

            {renderNotesToggle(task, notes, expanded)}

            {expanded && notes.length > 0 && (
              <div className={[ui.radius.control, ui.border.subtle, ui.pad.cardTight, 'bg-gray-50/80 space-y-2'].join(' ')}>
                {notes.slice(0, 3).map((note) => (
                  <Text key={note.id} as="p" variant="body" className={ui.tone.muted}>
                    {note.content}
                  </Text>
                ))}
                {notes.length > 3 && (
                  <Text as="p" variant="muted">
                    {notes.length - 3} more note
                    {notes.length - 3 === 1 ? '' : 's'} in Deal notes
                  </Text>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  };

  const renderCompletedRow = (task: Task) => (
    <tr
      key={task.id}
      className="hover:bg-gray-100/80 cursor-pointer"
      onClick={() => handleRowClick(task)}
    >
      <td className="tasks-cell-sm">
        <div className="flex items-start gap-2">
          <span className="tasks-mt-0_5">
            <CheckCircle className={['h-4 w-4', ui.tone.success].join(' ')} />
          </span>
          <div>
            <Text as="p" variant="body" className={[ui.tone.muted, 'line-through decoration-gray-400 font-medium'].join(' ')}>
              {task.title}
            </Text>
            <Text as="p" variant="muted">
              {task.deals.client_name}
              {task.deals.property_address ? ` • ${task.deals.property_address}` : ''}
            </Text>
          </div>
        </div>
      </td>
      <td className="tasks-cell-sm">
        <span className="flex items-center gap-1">
          <Calendar className={['h-3.5 w-3.5', ui.tone.faint].join(' ')} />
          <Text as="span" variant="muted">{formatDate(task.due_date)}</Text>
        </span>
      </td>
    </tr>
  );

  const groupedTasks =
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
              agentName: dealOwners[agentId] || getOwnerName(agentId),
              tasks: tasksForAgent
            }))
            .sort((a, b) => a.agentName.localeCompare(b.agentName));
        })()
      : null;

  const UrgencyFilterBar = ({
    taskStats,
    statusFilter,
    setStatusFilter
  }: {
    taskStats: typeof taskStats;
    statusFilter: StatusFilterValue;
    setStatusFilter: React.Dispatch<React.SetStateAction<StatusFilterValue>>;
  }) => {
    const urgencyFilters: Array<{
      label: string;
      value: StatusFilterValue;
      count: number;
      helper: string;
      icon: React.ComponentType<{ className?: string }>;
      tone: string;
      bg: string;
      ring: string;
    }> = [
      {
        label: 'Overdue',
        value: 'overdue',
        count: taskStats.overdue,
        helper: 'Clear the backlog',
        icon: AlertTriangle,
        tone: ui.tone.rose,
        bg: 'bg-rose-50/80',
        ring: 'ring-rose-200/70'
      },
      {
        label: 'Due today',
        value: 'today',
        count: taskStats.dueToday,
        helper: 'Handle before day end',
        icon: Clock,
        tone: ui.tone.warningStrong,
        bg: 'bg-amber-50/70',
        ring: 'ring-amber-200/70'
      },
      {
        label: 'Upcoming',
        value: 'upcoming',
        count: taskStats.upcoming,
        helper: 'Prep the next moves',
        icon: ArrowUpRight,
        tone: ui.tone.successStrong,
        bg: 'bg-emerald-50/70',
        ring: 'ring-emerald-200/70'
      },
      {
        label: 'Unscheduled',
        value: 'unscheduled',
        count: taskStats.unscheduled,
        helper: 'Add due dates to keep momentum',
        icon: AlertTriangle,
        tone: ui.tone.subtle,
        bg: 'bg-gray-50/80',
        ring: 'ring-gray-200'
      }
    ];

    const handleFilterClick = (value: StatusFilterValue) => {
      setStatusFilter(value);
      requestAnimationFrame(() => {
        taskListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };

    const urgencyPillBase = [
      'group flex w-full flex-col gap-2 transition focus:outline-none cursor-pointer hover:shadow-sm hover:-translate-y-0.5',
      ui.align.left,
      ui.radius.card,
      ui.border.subtle,
      ui.pad.cardTight
    ].join(' ');

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {urgencyFilters.map((filter) => {
            const isActive = statusFilter === filter.value;
            const Icon = filter.icon;
            return (
              <button
                key={filter.value}
                onClick={() => handleFilterClick(filter.value)}
                className={[
                  urgencyPillBase,
                  'min-w-[180px]',
                  filter.bg,
                  filter.tone,
                  isActive ? `ring-1 ${filter.ring}` : ''
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <Text as="span" variant="body" className="font-semibold">
                      {filter.label}
                    </Text>
                  </div>
                  <Text as="span" variant="h2">
                    {filter.count}
                  </Text>
                </div>
                <Text as="p" variant="muted" className="font-medium opacity-80">
                  {filter.helper}
                </Text>
              </button>
            );
          })}
        </div>
        {statusFilter !== 'all' && (
          <button
            type="button"
            onClick={() => handleFilterClick('all')}
            className="inline-flex items-center self-start"
          >
            <Text as="span" variant="muted" className={[ui.tone.accent, 'font-semibold'].join(' ')}>
              Clear filter
            </Text>
          </button>
        )}
      </div>
    );
  };

  const viewToggleWrap = [
    ui.radius.pill,
    ui.border.subtle,
    ui.pad.chipTight,
    'inline-flex items-center bg-white'
  ].join(' ');
  const viewToggleButton = [
    ui.radius.pill,
    ui.pad.chip,
    'transition'
  ].join(' ');
  const filterPillBase = [
    ui.radius.pill,
    ui.border.subtle,
    ui.pad.chip,
    'inline-flex items-center gap-2 transition'
  ].join(' ');

  return (
    <PageShell
      title={(
        <PageHeader
          label="Tasks"
          title="Focus on the next actions that move deals forward"
          subtitle="Triage today’s priorities, assign follow-ups, and keep every client on track without leaving this view."
        />
      )}
      actions={(refreshing || lastRefreshedAt) ? (
        <LastUpdatedStatus
          refreshing={refreshing}
          label={
            lastRefreshedAt
              ? `Last updated ${new Date(lastRefreshedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : null
          }
          className="md:justify-end"
        />
      ) : null}
    >
      <div className="space-y-4">
        <UrgencyFilterBar
          taskStats={taskStats}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />

        <Card padding="cardTight">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Text as="span" variant="micro">Next Action</Text>
          </div>
          {taskStats.nextTask ? (
            <>
              <div className="tasks-mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Text as="p" variant="body" className="font-semibold">
                    {taskStats.nextTask.title}
                  </Text>
                  <Text as="p" variant="muted">
                    {taskStats.nextTask.deals.client_name}
                  </Text>
                  {taskStats.nextTask.deals.property_address && (
                    <div className="flex items-center gap-2">
                      <MapPin className={['h-3.5 w-3.5', ui.tone.faint].join(' ')} />
                      <Text as="span" variant="muted">
                        {taskStats.nextTask.deals.property_address}
                        {taskStats.nextTask.deals.city
                          ? `, ${taskStats.nextTask.deals.city}`
                          : ''}
                        {taskStats.nextTask.deals.state
                          ? `, ${taskStats.nextTask.deals.state}`
                          : ''}
                      </Text>
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2 md:justify-end">
                  {(() => {
                    const due = normalizeDueDate(taskStats.nextTask!.due_date);
                    const dueTs = due ? due.getTime() : null;
                    const isOverdue = dueTs !== null && dueTs < todayStart;
                    const isToday = dueTs !== null && dueTs === todayStart;
                    const badgeTone = isOverdue
                      ? ui.tone.rose
                      : isToday
                        ? ui.tone.warningStrong
                        : due
                          ? ui.tone.successStrong
                          : ui.tone.subtle;
                    const badgeLabel = isOverdue
                      ? 'Overdue'
                      : isToday
                        ? 'Due today'
                        : due
                          ? 'Upcoming'
                          : 'No due date';
                    return (
                      <div className="flex items-center gap-2">
                        <Calendar className={['h-4 w-4', badgeTone].join(' ')} />
                        <div className="flex flex-col items-end">
                          <Text as="span" variant="micro" className={badgeTone}>
                            {badgeLabel}
                          </Text>
                          <Text as="span" variant="muted">
                            {formatDate(taskStats.nextTask!.due_date)}
                          </Text>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="tasks-mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleRowClick(taskStats.nextTask!)}
                  className="hig-btn-secondary inline-flex items-center gap-2"
                >
                  Open deal
                </button>
                <button
                  type="button"
                  onClick={() => completeTask(taskStats.nextTask!)}
                  className="hig-btn-primary inline-flex items-center gap-2"
                  disabled={completingId === taskStats.nextTask.id}
                >
                  {completingId === taskStats.nextTask.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Marking…
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Mark complete
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <Text as="p" variant="muted" className="tasks-mt-3">
              Add a due date to your most important task so it rises to the top.
            </Text>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <FormField
            label={<Text as="span" variant="micro" className="sr-only">Search</Text>}
            className="w-full md:min-w-[280px] space-y-0"
          >
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by client, task, property..."
              className={['hig-input', ui.radius.pill, 'h-10'].join(' ')}
            />
          </FormField>
          <div className={[viewToggleWrap, 'h-10 items-center'].join(' ')}>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={[
                viewToggleButton,
                viewMode === 'list' ? 'bg-[#1e3a5f] ring-1 ring-[#1e3a5f]/30' : ''
              ].join(' ')}
              style={{ 
                color: viewMode === 'list' ? '#ffffff' : '#1e3a5f',
                backgroundColor: viewMode === 'list' ? '#1e3a5f' : 'transparent'
              }}
              onMouseEnter={(e) => {
                if (viewMode !== 'list') {
                  e.currentTarget.style.backgroundColor = 'rgba(212, 136, 58, 0.1)';
                  e.currentTarget.style.color = '#D4883A';
                }
              }}
              onMouseLeave={(e) => {
                if (viewMode !== 'list') {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#1e3a5f';
                }
              }}
            >
              <span className="font-medium text-[15px]" style={{ color: 'inherit' }}>
                List
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compact')}
              className={[
                viewToggleButton,
                viewMode === 'compact' ? 'bg-[#1e3a5f] ring-1 ring-[#1e3a5f]/30' : ''
              ].join(' ')}
              style={{ 
                color: viewMode === 'compact' ? '#ffffff' : '#1e3a5f',
                backgroundColor: viewMode === 'compact' ? '#1e3a5f' : 'transparent'
              }}
              onMouseEnter={(e) => {
                if (viewMode !== 'compact') {
                  e.currentTarget.style.backgroundColor = 'rgba(212, 136, 58, 0.1)';
                  e.currentTarget.style.color = '#D4883A';
                }
              }}
              onMouseLeave={(e) => {
                if (viewMode !== 'compact') {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#1e3a5f';
                }
              }}
            >
              <span className="font-medium text-[15px]" style={{ color: 'inherit' }}>
                Compact
              </span>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          {isManagerRole && (
            <FormField
              label={<Text as="span" variant="micro" className="sr-only">Agent</Text>}
              className="space-y-0"
            >
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="hig-input w-52 h-10"
              >
                <option value="all">All agents</option>
                {agentOptions.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.label}
                  </option>
                ))}
              </select>
            </FormField>
          )}
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
            className={[
              filterPillBase,
              'h-10',
              showCompleted ? 'bg-[var(--app-accent)]/10' : 'bg-white hover:bg-gray-50/80',
              showCompleted ? ui.tone.accent : ui.tone.subtle
            ].join(' ')}
          >
            <CheckCircle className={['h-3.5 w-3.5', showCompleted ? ui.tone.accent : ui.tone.subtle].join(' ')} />
            <Text as="span" variant="body" className="font-semibold">
              {showCompleted ? 'Hide completed' : 'View recently completed'}
            </Text>
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div ref={taskListRef}>
          <Card
            padding="cardTight"
            className={['space-y-3', refreshing ? 'opacity-90' : ''].join(' ')}
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <Text variant="micro">Task list</Text>
                <Text as="h2" variant="h2">Work the current queue</Text>
                <Text variant="muted">
                  {getStatusFilterLabel(statusFilter)} · {filteredTasks.length} task
                  {filteredTasks.length === 1 ? '' : 's'}
                </Text>
              </div>
              <button
                type="button"
                onClick={() => setShowListQuickAdd((prev) => !prev)}
                className="hig-btn-primary inline-flex items-center gap-2"
              >
                + Add task
              </button>
            </div>
            {showListQuickAdd && (
              <QuickAddTask
                contextDealId={preferredDeal?.id}
                contextDealLabel={preferredDealLabel}
                defaultDuePreset="today"
                dealOptions={dealOptions}
                dealById={dealById}
                onCreated={(createdTask, deal) => {
                  handleQuickAddCreated(createdTask, deal);
                  setShowListQuickAdd(false);
                }}
                onCancel={() => setShowListQuickAdd(false)}
                autoFocus
              />
            )}
            {loading ? (
              <div className="tasks-empty">
                <Text variant="muted">Loading tasks…</Text>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="tasks-empty">
                <Text variant="muted">
                  {statusFilter === 'all'
                    ? 'Nothing to show here — take a moment to plan your next steps.'
                    : 'Nothing urgent right now. Nice work.'}
                </Text>
              </div>
            ) : groupedTasks && groupedTasks.length > 0 ? (
              groupedTasks.map((group) => (
                <div key={group.agentId} className="space-y-3">
                  <div className="tasks-sticky">
                    <Text as="span" variant="micro" className={ui.tone.muted}>
                      {group.agentName} • {group.tasks.length} task
                      {group.tasks.length === 1 ? '' : 's'}
                    </Text>
                  </div>
                  {group.tasks.map((task) => renderTaskCard(task))}
                </div>
              ))
            ) : (
              filteredTasks.map((task) => renderTaskCard(task))
            )}

            {showCompleted && (
              <div className="tasks-muted-card">
                <div className="tasks-muted-header">
                  <div className="space-y-1">
                    <Text as="span" variant="micro" className={ui.tone.subtle}>
                      Recently completed
                    </Text>
                    <Text as="p" variant="muted">
                      Last 30 completed tasks in your scope.
                    </Text>
                  </div>
                  <Text as="span" variant="muted">
                    {completedLoading
                      ? 'Loading…'
                      : `${completedTasks.length} item${
                          completedTasks.length === 1 ? '' : 's'
                        }`}
                  </Text>
                </div>
                {completedLoading ? (
                  <div className="tasks-muted-body">
                    <Text variant="muted">Loading…</Text>
                  </div>
                ) : completedTasks.length === 0 ? (
                  <div className="tasks-muted-body">
                    <Text variant="muted">Nothing completed yet.</Text>
                  </div>
                ) : (
                  <>
                    <div className="max-h-72 overflow-y-auto">
                      <table className="tasks-table">
                        <tbody>{completedTasks.map((task) => renderCompletedRow(task))}</tbody>
                      </table>
                    </div>
                    <div className="tasks-muted-footer">
                      {completedHasMore ? (
                        <button
                          type="button"
                          onClick={() => fetchCompletedTasksPage('append')}
                          disabled={completedLoadingMore}
                          className="hig-btn-secondary"
                        >
                          {completedLoadingMore ? 'Loading…' : 'Load more'}
                        </button>
                      ) : (
                        <Text as="span" variant="muted">You've reached the end.</Text>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
      ) : (
        <div ref={taskListRef}>
          <Card
            padding="none"
            className={['overflow-hidden', refreshing ? 'opacity-90' : ''].join(' ')}
          >
            <div className="tasks-compact-header">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <Text variant="micro">Task list</Text>
                  <Text as="h2" variant="h2">Work the current queue</Text>
                  <Text variant="muted">
                    {getStatusFilterLabel(statusFilter)} · {filteredTasks.length} task
                    {filteredTasks.length === 1 ? '' : 's'}
                  </Text>
                </div>
                <button
                  type="button"
                  onClick={() => setShowListQuickAdd((prev) => !prev)}
                  className="hig-btn-primary inline-flex items-center gap-2"
                >
                  + Add task
                </button>
              </div>
              {showListQuickAdd && (
                <div className="tasks-mt-3">
                  <QuickAddTask
                    contextDealId={preferredDeal?.id}
                    contextDealLabel={preferredDealLabel}
                    defaultDuePreset="today"
                    dealOptions={dealOptions}
                    dealById={dealById}
                    onCreated={(createdTask, deal) => {
                      handleQuickAddCreated(createdTask, deal);
                      setShowListQuickAdd(false);
                    }}
                    onCancel={() => setShowListQuickAdd(false)}
                    autoFocus
                  />
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="tasks-table tasks-table-divider">
                <thead className="tasks-table-head">
                  <tr className="tasks-table-head-row">
                    <th className="tasks-table-head-cell">Task</th>
                    <th className="tasks-table-head-cell">Due</th>
                    <th className="tasks-table-head-cell">Deal</th>
                    <th className="tasks-table-head-cell">Status</th>
                  </tr>
                </thead>
                <tbody className="tasks-table-body">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="tasks-table-empty">
                        <Text variant="muted">Loading tasks…</Text>
                      </td>
                    </tr>
                  ) : filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="tasks-table-empty">
                        <Text variant="muted">
                          {statusFilter === 'all'
                            ? 'Nothing to show here — take a moment to plan your next steps.'
                            : 'Nothing urgent right now. Nice work.'}
                        </Text>
                      </td>
                    </tr>
                  ) : groupedTasks && groupedTasks.length > 0 ? (
                    <>
                      {groupedTasks.map((group) => (
                        <React.Fragment key={group.agentId}>
                          <tr className="tasks-table-group">
                            <td colSpan={4} className="tasks-table-group-cell">
                              <Text as="span" variant="micro" className={ui.tone.muted}>
                                {group.agentName} • {group.tasks.length} task
                                {group.tasks.length === 1 ? '' : 's'}
                              </Text>
                            </td>
                          </tr>
                          {group.tasks.map((task) => renderTaskRow(task))}
                        </React.Fragment>
                      ))}
                    </>
                  ) : (
                    <>{filteredTasks.map((task) => renderTaskRow(task))}</>
                  )}
                </tbody>
              </table>
            </div>

            {showCompleted && (
              <div className="tasks-muted-card tasks-muted-card--bordered">
                <div className="tasks-muted-header">
                  <div className="space-y-1">
                    <Text as="span" variant="micro" className={ui.tone.subtle}>
                      Recently completed
                    </Text>
                    <Text as="p" variant="muted">
                      Last 30 completed tasks in your scope.
                    </Text>
                  </div>
                  <Text as="span" variant="muted">
                    {completedLoading
                      ? 'Loading…'
                      : `${completedTasks.length} item${
                          completedTasks.length === 1 ? '' : 's'
                        }`}
                  </Text>
                </div>
                {completedLoading ? (
                  <div className="tasks-muted-body">
                    <Text variant="muted">Loading…</Text>
                  </div>
                ) : completedTasks.length === 0 ? (
                  <div className="tasks-muted-body">
                    <Text variant="muted">Nothing completed yet.</Text>
                  </div>
                ) : (
                  <>
                    <div className="max-h-72 overflow-y-auto">
                      <table className="tasks-table">
                        <tbody>{completedTasks.map((task) => renderCompletedRow(task))}</tbody>
                      </table>
                    </div>
                    <div className="tasks-muted-footer">
                      {completedHasMore ? (
                        <button
                          type="button"
                          onClick={() => fetchCompletedTasksPage('append')}
                          disabled={completedLoadingMore}
                          className="hig-btn-secondary"
                        >
                          {completedLoadingMore ? 'Loading…' : 'Load more'}
                        </button>
                      ) : (
                        <Text as="span" variant="muted">You've reached the end.</Text>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {showDealModal && selectedDeal && (
        <DealModal
          deal={selectedDeal}
          onClose={handleDealModalClose}
          onDelete={handleDealModalClose}
        />
      )}
    </PageShell>
  );
}
