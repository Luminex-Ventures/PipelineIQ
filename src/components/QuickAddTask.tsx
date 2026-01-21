import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { SingleSelectCombobox } from './ui/SingleSelectCombobox';
import { getVisibleUserIds } from '../lib/rbac';
import type { Database } from '../lib/database.types';

type DealSummary = Pick<
  Database['public']['Tables']['deals']['Row'],
  'id' | 'user_id' | 'client_name' | 'property_address' | 'city' | 'state' | 'updated_at'
>;
type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
type TaskRow = Database['public']['Tables']['tasks']['Row'];

type DealOption = {
  value: string;
  label: string;
  subLabel?: string;
  group?: string;
  keywords?: string;
};

type DuePreset = 'today' | 'tomorrow' | 'pick';

interface QuickAddTaskProps {
  contextDealId?: string | null;
  contextDealLabel?: string | null;
  defaultDuePreset?: DuePreset;
  dealOptions?: DealOption[];
  dealById?: Record<string, DealSummary>;
  allowDealChange?: boolean;
  onCreated?: (task: TaskRow, deal: DealSummary | null) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildDealOption = (deal: DealSummary, group?: string): DealOption => {
  const location = [deal.city, deal.state].filter(Boolean).join(', ');
  const keywords = `${deal.client_name} ${deal.property_address ?? ''} ${deal.city ?? ''} ${deal.state ?? ''}`;
  return {
    value: deal.id,
    label: `${deal.client_name} — ${deal.property_address || 'Address TBD'}`,
    subLabel: location || undefined,
    group,
    keywords
  };
};

export default function QuickAddTask({
  contextDealId,
  contextDealLabel,
  defaultDuePreset,
  dealOptions,
  dealById,
  allowDealChange = true,
  onCreated,
  onCancel,
  autoFocus
}: QuickAddTaskProps) {
  const { user, roleInfo } = useAuth();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState(contextDealId ?? '');
  const [showDealPicker, setShowDealPicker] = useState(!contextDealId);
  const [duePreset, setDuePreset] = useState<DuePreset>('today');
  const [customDueDate, setCustomDueDate] = useState('');
  const [internalDeals, setInternalDeals] = useState<DealSummary[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);

  useEffect(() => {
    if (contextDealId) {
      setSelectedDealId(contextDealId);
      setShowDealPicker(false);
    }
  }, [contextDealId]);

  useEffect(() => {
    const now = new Date();
    const isLate = now.getHours() >= 16;
    const resolvedPreset = defaultDuePreset || (isLate ? 'tomorrow' : 'today');
    setDuePreset(isLate && resolvedPreset === 'today' ? 'tomorrow' : resolvedPreset);
  }, [defaultDuePreset]);

  const resolvedDealById = useMemo(() => {
    if (dealById && Object.keys(dealById).length) return dealById;
    if (!internalDeals.length) return {} as Record<string, DealSummary>;
    const map: Record<string, DealSummary> = {};
    internalDeals.forEach((deal) => {
      map[deal.id] = deal;
    });
    return map;
  }, [dealById, internalDeals]);

  const resolvedDealOptions = useMemo(() => {
    if (dealOptions && dealOptions.length) return dealOptions;
    if (!internalDeals.length) return [];
    return internalDeals.map((deal) => buildDealOption(deal));
  }, [dealOptions, internalDeals]);

  const selectedDeal = selectedDealId ? resolvedDealById[selectedDealId] ?? null : null;
  const selectedDealLabel =
    contextDealLabel || (selectedDeal ? buildDealOption(selectedDeal).label : null);

  const ensureDealOptions = useCallback(async () => {
    if (dealOptions?.length || internalDeals.length || loadingDeals) return;
    if (!user) return;
    setLoadingDeals(true);
    try {
      let visibleUserIds: string[] = [user.id];
      if (roleInfo) {
        visibleUserIds = await getVisibleUserIds(roleInfo);
        if (!visibleUserIds.length) visibleUserIds = [user.id];
      }

      let query = supabase
        .from('deals')
        .select('id,user_id,client_name,property_address,city,state,updated_at')
        .neq('status', 'closed')
        .neq('status', 'dead')
        .order('updated_at', { ascending: false });

      if (visibleUserIds.length === 1) {
        query = query.eq('user_id', visibleUserIds[0]);
      } else if (visibleUserIds.length > 1) {
        query = query.in('user_id', visibleUserIds);
      }

      const { data } = await query;
      if (data) {
        setInternalDeals(data as DealSummary[]);
      }
    } catch (err) {
      console.error('Error loading deals for quick add', err);
    } finally {
      setLoadingDeals(false);
    }
  }, [dealOptions, internalDeals.length, loadingDeals, roleInfo, user]);

  useEffect(() => {
    if (showDealPicker && !dealOptions?.length && !internalDeals.length) {
      ensureDealOptions();
    }
  }, [dealOptions?.length, ensureDealOptions, internalDeals.length, showDealPicker]);

  const getDueDateValue = () => {
    const today = new Date();
    if (duePreset === 'today') {
      return formatDateInput(today);
    }
    if (duePreset === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      return formatDateInput(tomorrow);
    }
    return customDueDate || null;
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      setError('Add a task title to continue.');
      return;
    }
    if (!selectedDealId) {
      setError('Choose a deal to attach this task.');
      return;
    }
    if (!user) return;

    setCreating(true);
    setError(null);

    const dueDateValue = getDueDateValue();
    const dealOwnerId = resolvedDealById[selectedDealId]?.user_id || user.id;

    const payload: TaskInsert = {
      user_id: dealOwnerId,
      deal_id: selectedDealId,
      title: title.trim(),
      due_date: dueDateValue,
      description: showNote && note.trim() ? note.trim() : null,
      completed: false
    };

    try {
      const { data, error: insertError } = await supabase
        .from('tasks')
        .insert(payload)
        .select('id,user_id,title,due_date,completed,deal_id,updated_at')
        .single();

      if (insertError) throw insertError;

      const createdTask = data as TaskRow;
      onCreated?.(createdTask, resolvedDealById[selectedDealId] ?? null);
      setTitle('');
      setNote('');
      setShowNote(false);
      setError(null);
    } catch (err) {
      console.error('Error creating task', err);
      setError('Could not add this task. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white/90 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Add a task
        </p>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        )}
      </div>

      {contextDealId && !showDealPicker && selectedDealLabel && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
            {selectedDealLabel}
          </span>
          {allowDealChange && (
            <button
              type="button"
              onClick={async () => {
                setShowDealPicker(true);
                await ensureDealOptions();
              }}
              className="text-xs font-semibold text-[var(--app-accent)] hover:underline"
            >
              Change deal
            </button>
          )}
        </div>
      )}

      {showDealPicker && (
        <div className="mt-3">
          <SingleSelectCombobox
            label="Deal"
            value={selectedDealId}
            onChange={(next) => {
              setSelectedDealId(next);
              if (error) setError(null);
            }}
            options={resolvedDealOptions}
            placeholder={loadingDeals ? 'Loading deals…' : 'Search client or address...'}
            disabled={loadingDeals}
            allowClear
          />
        </div>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <input
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error) setError(null);
          }}
          placeholder="What needs to be done?"
          className="hig-input"
          autoFocus={autoFocus}
        />
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <select
            value={duePreset}
            onChange={(event) => setDuePreset(event.target.value as DuePreset)}
            className="hig-input min-w-[140px]"
          >
            <option value="today">Due: Today</option>
            <option value="tomorrow">Due: Tomorrow</option>
            <option value="pick">Pick date…</option>
          </select>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="hig-btn-primary inline-flex items-center gap-2 px-4"
        >
          {creating ? 'Adding…' : (
            <>
              <Plus className="h-4 w-4" />
              Add
            </>
          )}
        </button>
      </div>

      {duePreset === 'pick' && (
        <div className="mt-3">
          <input
            type="date"
            value={customDueDate}
            onChange={(event) => setCustomDueDate(event.target.value)}
            className="hig-input"
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowNote((prev) => !prev)}
          className="text-xs font-semibold text-gray-500 hover:text-gray-700"
        >
          {showNote ? 'Hide note' : 'Add note'}
        </button>
      </div>

      {showNote && (
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add context (optional)"
          className="mt-2 hig-input min-h-[80px]"
        />
      )}

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
