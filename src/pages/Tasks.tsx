import { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle, Circle, Clock, MapPin, User, AlertTriangle, ArrowUpRight, Loader2, Plus } from 'lucide-react';
import DealModal from '../components/DealModal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../lib/database.types';
import { getVisibleUserIds } from '../lib/rbac';

const surfaceClass = 'rounded-2xl border border-gray-200/70 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.08)]';
const filterPillBaseClass =
  'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition';

type Task = Database['public']['Tables']['tasks']['Row'] & {
  deals: Database['public']['Tables']['deals']['Row'];
};
type DealSummary = Pick<
  Database['public']['Tables']['deals']['Row'],
  'id' | 'user_id' | 'client_name' | 'property_address' | 'city' | 'state' | 'deal_type' | 'status' | 'next_task_due_date' | 'next_task_description'
>;
type AccessibleAgentRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

const statusFilterOptions = [
  { label: 'All tasks', value: 'all', accentClass: 'bg-gray-900 text-white border-gray-900 shadow-sm' },
  { label: 'Overdue', value: 'overdue', accentClass: 'bg-red-50 text-red-700 border-red-200 shadow-sm ring-1 ring-red-100' },
  { label: 'Due today', value: 'today', accentClass: 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm ring-1 ring-amber-100' },
  { label: 'Upcoming', value: 'upcoming', accentClass: 'bg-sky-50 text-sky-700 border-sky-200 shadow-sm ring-1 ring-sky-100' }
] as const;

type StatusFilterValue = (typeof statusFilterOptions)[number]['value'];

export default function Tasks() {
  const { user, roleInfo } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [dealOwners, setDealOwners] = useState<Record<string, string>>({});
  const [dealsLoading, setDealsLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [showDealModal, setShowDealModal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Database['public']['Tables']['deals']['Row'] | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDealId, setNewTaskDealId] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  const taskStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let overdue = 0;
    let dueToday = 0;
    let upcoming = 0;
    let unscheduled = 0;

    const datedTasks: Task[] = [];

    tasks.forEach((task) => {
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
      overdue,
      dueToday,
      upcoming,
      unscheduled,
      nextTask: datedTasks[0] || null
    };
  }, [tasks]);

  const selectedDealOption = useMemo(
    () => deals.find(deal => deal.id === newTaskDealId),
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

  useEffect(() => {
    if (!user) return;
    fetchTasks();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setDeals([]);
      setDealsLoading(false);
      return;
    }
    fetchDeals();
  }, [user, roleInfo]);

  useEffect(() => {
    let result = [...tasks];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (statusFilter === 'overdue') {
      result = result.filter(task => {
        if (!task.due_date) return false;
        const dueDate = normalizeDueDate(task.due_date);
        return !!dueDate && dueDate < today;
      });
    } else if (statusFilter === 'today') {
      result = result.filter(task => {
        if (!task.due_date) return false;
        const dueDate = normalizeDueDate(task.due_date);
        if (!dueDate) return false;
        return dueDate.getTime() === today.getTime();
      });
    } else if (statusFilter === 'upcoming') {
      result = result.filter(task => {
        if (!task.due_date) return false;
        const dueDate = normalizeDueDate(task.due_date);
        return !!dueDate && dueDate > today;
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(task =>
        task.title.toLowerCase().includes(query) ||
        task.deals.client_name.toLowerCase().includes(query) ||
        task.deals.property_address.toLowerCase().includes(query)
      );
    }

    setFilteredTasks(result);
  }, [statusFilter, searchQuery, tasks]);

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('tasks')
      .select(`*, deals(*, lead_sources(*))`)
      .eq('user_id', user.id)
      .eq('completed', false)
      .order('due_date', { ascending: true });

    if (!error && data) {
      setTasks(
        data.filter((task) => task.deals).map(task => task as Task)
      );
    }

    setLoading(false);
  };

  const fetchDeals = async () => {
    if (!user) return;
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
        .select('id, user_id, client_name, property_address, city, state, deal_type, status, next_task_due_date, next_task_description')
        .neq('status', 'closed')
        .order('updated_at', { ascending: false });

      if (visibleUserIds.length === 1) {
        query = query.eq('user_id', visibleUserIds[0]);
      } else if (visibleUserIds.length > 1) {
        query = query.in('user_id', visibleUserIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading deals', error);
        setDeals([]);
      } else {
        setDeals(data || []);
        const ownerMap: Record<string, string> = {};
        const { data: agents, error: agentError } = await supabase.rpc('get_accessible_agents');
        if (!agentError && Array.isArray(agents)) {
          (agents as AccessibleAgentRow[]).forEach(agent => {
            if (visibleUserIds.includes(agent.user_id)) {
              ownerMap[agent.user_id] = agent.display_name || agent.email || 'Agent';
            }
          });
        }
        setDealOwners(ownerMap);
      }
    } catch (err) {
      console.error('Error resolving visible deals', err);
      setDeals([]);
      setDealOwners({});
    } finally {
      setDealsLoading(false);
    }
  };

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
      const { error } = await supabase.from('tasks').insert({
        user_id: user.id,
        deal_id: newTaskDealId,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || null,
        due_date: newTaskDueDate || null,
        completed: false
      });

      if (error) throw error;

      setNewTaskTitle('');
      setNewTaskDealId('');
      setNewTaskDueDate('');
      setNewTaskDescription('');
      setStatusFilter('all');
      await fetchTasks();
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
      const { error } = await supabase
        .from('tasks')
        .update({ completed: true })
        .eq('id', task.id)
        .eq('user_id', user.id);

      if (error) throw error;

      setTasks(prev => prev.filter(t => t.id !== task.id));
      setFilteredTasks(prev => prev.filter(t => t.id !== task.id));
    } catch (err) {
      console.error('Error completing task', err);
    } finally {
      setCompletingId(null);
    }
  };

  const handleDealModalClose = () => {
    setShowDealModal(false);
    setSelectedDeal(null);
    fetchTasks();
  };

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
          <div className="w-full md:w-auto">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by client, task, property..."
              className="w-full rounded-2xl border border-white/60 bg-white/90 py-2.5 pl-4 pr-4 text-sm text-gray-900 shadow-inner placeholder:text-gray-400 focus:border-[var(--app-accent)]/40 focus:ring-2 focus:ring-[var(--app-accent)]/15 md:min-w-[280px]"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
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
          <div className="flex flex-wrap gap-2">
            {statusFilterOptions.map(option => {
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
        </div>
      </div>

      <div className={`${surfaceClass} p-6 space-y-4`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.25em]">
              Add a task
            </p>
            <h2 className="text-2xl font-semibold text-gray-900 mt-1">Assign the next move</h2>
            <p className="text-sm text-gray-600 mt-1">
              Attach a next step to any deal without leaving this page. Keep it short, clear, and actionable.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-4 py-2 text-xs font-semibold text-gray-700 shadow-inner">
            <span className="h-2 w-2 rounded-full bg-[var(--app-accent)] shadow-[0_0_0_4px_rgba(0,122,255,0.12)]" />
            {dealsLoading ? 'Loading deals…' : `${deals.length} deals available`}
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
              <option value="">{dealsLoading ? 'Loading deals…' : 'Choose a deal'}</option>
              {shouldGroupDeals && groupedDeals
                ? Object.entries(groupedDeals)
                    .sort((a, b) => {
                      const nameA = getOwnerName(a[0]);
                      const nameB = getOwnerName(b[0]);
                      return nameA.localeCompare(nameB);
                    })
                    .map(([ownerId, ownerDeals]) => (
                      <optgroup
                        key={ownerId}
                        label={`— ${getOwnerName(ownerId).toUpperCase()} · ${ownerDeals.length} deal${ownerDeals.length === 1 ? '' : 's'} —`}
                      >
                        {ownerDeals.map((deal) => (
                          <option key={deal.id} value={deal.id}>
                            {deal.client_name} — {deal.property_address || 'Address TBD'}
                          </option>
                        ))}
                      </optgroup>
                    ))
                : deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.client_name} — {deal.property_address || 'Address TBD'}
                    </option>
                  ))}
            </select>
            {selectedDealOption && (
              <p className="mt-1 text-xs text-gray-500">
                {selectedDealOption.city && selectedDealOption.state
                  ? `${selectedDealOption.city}, ${selectedDealOption.state}`
                  : selectedDealOption.city || selectedDealOption.state || 'No location on file'}
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
                Use short verbs, include the who/where, and set a date so it shows up in the right bucket.
              </p>
            </div>
          </div>

          {createError && (
            <div className="lg:col-span-12 text-sm text-red-600">
              {createError}
            </div>
          )}
        </form>
      </div>

      <div className={`${surfaceClass} p-0 overflow-hidden`}>
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
                  <td colSpan={4} className="px-5 py-8 text-center text-gray-500 text-sm">
                    Loading tasks…
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-gray-500 text-sm">
                    Nothing to show here — take a moment to plan your next steps.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="hover:bg-[var(--app-surface-muted)]/60 cursor-pointer"
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
                          ) : task.completed ? (
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Circle className="h-4 w-4 text-gray-300" />
                          )}
                        </button>
                        <div>
                          <p className="font-medium text-gray-900">{task.title}</p>
                          {task.deals?.next_task_description && (
                            <p className="text-xs text-gray-500">Related: {task.deals.next_task_description}</p>
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
                          <span className="font-medium text-gray-900">{task.deals.client_name}</span>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <section className={`${surfaceClass} p-6`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Focus cues
            </p>
            <h2 className="text-xl font-semibold text-gray-900">Where attention is needed</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-red-100/60 bg-red-50/70 p-4">
            <div className="flex items-center gap-2 text-red-600 text-sm font-semibold uppercase tracking-wide">
              <AlertTriangle className="h-4 w-4" />
              Overdue
            </div>
            <p className="mt-2 text-2xl font-semibold text-red-700">{taskStats.overdue}</p>
            <p className="text-xs text-red-600">Tasks waiting on you</p>
          </div>
          <div className="rounded-2xl border border-amber-100/70 bg-amber-50/60 p-4">
            <div className="flex items-center gap-2 text-amber-600 text-sm font-semibold uppercase tracking-wide">
              <Clock className="h-4 w-4" />
              Due today
            </div>
            <p className="mt-2 text-2xl font-semibold text-amber-700">{taskStats.dueToday}</p>
            <p className="text-xs text-amber-600">Expected before midnight</p>
          </div>
          <div className="rounded-2xl border border-emerald-100/70 bg-emerald-50/60 p-4">
            <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold uppercase tracking-wide">
              <ArrowUpRight className="h-4 w-4" />
              Upcoming
            </div>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">{taskStats.upcoming}</p>
            <p className="text-xs text-emerald-600">On the horizon</p>
          </div>
          <div className="rounded-2xl border border-gray-100/70 bg-gray-50/80 p-4">
            <div className="flex items-center gap-2 text-gray-600 text-sm font-semibold uppercase tracking-wide">
              <Circle className="h-4 w-4" />
              Unscheduled
            </div>
            <p className="mt-2 text-2xl font-semibold text-gray-700">{taskStats.unscheduled}</p>
            <p className="text-xs text-gray-500">Add due dates to keep momentum</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-gray-100/80 bg-[var(--app-surface-muted)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Next actionable
          </p>
          {taskStats.nextTask ? (
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold text-gray-900">{taskStats.nextTask.title}</p>
                <p className="text-sm text-gray-600">{taskStats.nextTask.deals.client_name}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span>{formatDate(taskStats.nextTask.due_date)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600">
              No dated tasks remain. Assign due dates to keep focus on high-leverage work.
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
