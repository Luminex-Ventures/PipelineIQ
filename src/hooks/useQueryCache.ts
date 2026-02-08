/**
 * Cached data fetching hooks using TanStack Query
 * 
 * These hooks provide:
 * - Instant UI with stale-while-revalidate pattern
 * - Automatic background refetching
 * - Request deduplication
 * - Memory-efficient caching with garbage collection
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getVisibleUserIds, type RoleInfo } from '../lib/rbac';
import type { Database } from '../lib/database.types';

type DealRow = Database['public']['Tables']['deals']['Row'];
type TaskRow = Database['public']['Tables']['tasks']['Row'];
type LeadSourceRow = Database['public']['Tables']['lead_sources']['Row'];
type PipelineStatusRow = Database['public']['Tables']['pipeline_statuses']['Row'];

// ============================================================================
// Query Keys - Used for cache invalidation and deduplication
// ============================================================================

export const queryKeys = {
  // Deals
  deals: ['deals'] as const,
  dealsActive: (userIds: string[]) => ['deals', 'active', userIds.sort().join(',')] as const,
  dealsForDashboard: (userIds: string[], filters: Record<string, unknown>) => 
    ['deals', 'dashboard', userIds.sort().join(','), JSON.stringify(filters)] as const,
  dealById: (id: string) => ['deals', id] as const,

  // Tasks
  tasks: ['tasks'] as const,
  tasksActive: (userIds: string[]) => ['tasks', 'active', userIds.sort().join(',')] as const,
  tasksCompleted: (userIds: string[]) => ['tasks', 'completed', userIds.sort().join(',')] as const,

  // Lead Sources
  leadSources: ['leadSources'] as const,
  leadSourcesByTeam: (teamId?: string) => ['leadSources', teamId || 'all'] as const,

  // Pipeline Statuses
  pipelineStatuses: ['pipelineStatuses'] as const,
  pipelineStatusesByTeam: (teamId?: string) => ['pipelineStatuses', teamId || 'all'] as const,

  // Analytics
  analytics: ['analytics'] as const,
  analyticsSummary: (year: number, userIds: string[], filters: Record<string, unknown>) =>
    ['analytics', 'summary', year, userIds.sort().join(','), JSON.stringify(filters)] as const,

  // Agents
  agents: ['agents'] as const,
  accessibleAgents: ['agents', 'accessible'] as const,
  visibleUserIds: (roleInfo: RoleInfo | null) => 
    ['agents', 'visibleIds', roleInfo?.globalRole, roleInfo?.teamId, roleInfo?.userId] as const,
};

// ============================================================================
// Visible User IDs Hook
// ============================================================================

interface UseVisibleUserIdsOptions {
  userId?: string;
  roleInfo: RoleInfo | null;
  enabled?: boolean;
}

export function useVisibleUserIds({ userId, roleInfo, enabled = true }: UseVisibleUserIdsOptions) {
  return useQuery({
    queryKey: queryKeys.visibleUserIds(roleInfo),
    queryFn: async () => {
      if (!roleInfo) return userId ? [userId] : [];
      return getVisibleUserIds(roleInfo);
    },
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000, // User IDs rarely change
  });
}

// ============================================================================
// Accessible Agents Hook
// ============================================================================

interface AccessibleAgentRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  global_role?: string | null;
}

export interface AgentOption {
  id: string;
  label: string;
  email: string;
}

interface UseAccessibleAgentsOptions {
  userId?: string;
  userEmail?: string;
  userName?: string;
  roleInfo: RoleInfo | null;
  visibleUserIds?: string[];
  enabled?: boolean;
}

export function useAccessibleAgents({
  userId,
  userEmail,
  userName,
  roleInfo,
  visibleUserIds = [],
  enabled = true,
}: UseAccessibleAgentsOptions) {
  return useQuery({
    queryKey: [...queryKeys.accessibleAgents, visibleUserIds.sort().join(',')],
    queryFn: async (): Promise<AgentOption[]> => {
      const fallback: AgentOption = {
        id: userId || '',
        label: userName || userEmail || 'You',
        email: userEmail || '',
      };

      if (!roleInfo || roleInfo.globalRole === 'agent') {
        return [fallback];
      }

      const { data, error } = await supabase.rpc('get_accessible_agents');
      if (error) {
        console.error('Unable to load accessible agents', error);
        return visibleUserIds.map(id => ({
          id,
          label: id === userId ? (userName || userEmail || 'You') : `Agent ${id.slice(0, 8)}`,
          email: '',
        }));
      }

      const rows = (data || []) as AccessibleAgentRow[];
      const excludeIds = new Set(
        rows
          .filter(row => row.global_role === 'admin' || row.global_role === 'sales_manager')
          .map(row => row.user_id)
      );

      const normalized: AgentOption[] = rows
        .filter(agent => agent.global_role !== 'admin' && agent.global_role !== 'sales_manager')
        .map(agent => ({
          id: agent.user_id,
          label: agent.display_name || agent.email || 'Agent',
          email: agent.email || '',
        }));

      const filtered = visibleUserIds.length
        ? normalized.filter(option => visibleUserIds.includes(option.id))
        : normalized;

      const agentOptions = filtered.filter(
        (option, index, arr) => arr.findIndex(candidate => candidate.id === option.id) === index
      );

      if (!agentOptions.length) {
        return visibleUserIds
          .filter(id => !excludeIds.has(id))
          .map(id => ({
            id,
            label: id === userId ? (userName || userEmail || 'You') : `Agent ${id.slice(0, 8)}`,
            email: '',
          }));
      }

      return agentOptions;
    },
    enabled: enabled && !!userId && visibleUserIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Lead Sources Hook
// ============================================================================

interface UseLeadSourcesOptions {
  teamId?: string;
  enabled?: boolean;
}

export function useLeadSources({ teamId, enabled = true }: UseLeadSourcesOptions = {}) {
  return useQuery({
    queryKey: queryKeys.leadSourcesByTeam(teamId),
    queryFn: async (): Promise<LeadSourceRow[]> => {
      let query = supabase
        .from('lead_sources')
        .select('*')
        .order('name', { ascending: true });

      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading lead sources', error);
        return [];
      }
      return data || [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Pipeline Statuses Hook
// ============================================================================

interface UsePipelineStatusesOptions {
  teamId?: string;
  enabled?: boolean;
}

export function useCachedPipelineStatuses({ teamId, enabled = true }: UsePipelineStatusesOptions = {}) {
  return useQuery({
    queryKey: queryKeys.pipelineStatusesByTeam(teamId),
    queryFn: async (): Promise<PipelineStatusRow[]> => {
      let query = supabase
        .from('pipeline_statuses')
        .select('*')
        .order('sort_order', { ascending: true });

      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading pipeline statuses', error);
        return [];
      }
      return data || [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Active Deals Hook
// ============================================================================

const DEAL_BASE_COLUMNS = `
  id,
  user_id,
  status,
  created_at,
  close_date,
  closed_at,
  stage_entered_at,
  pipeline_status_id,
  deal_type,
  lead_source_id,
  expected_sale_price,
  actual_sale_price,
  gross_commission_rate,
  brokerage_split_rate,
  referral_out_rate,
  transaction_fee,
  client_name,
  property_address
`;

const DEAL_WITH_RELATIONS = `
  ${DEAL_BASE_COLUMNS},
  pipeline_statuses (id, name, color, sort_order),
  lead_sources (id, name)
`;

type DealWithRelations = DealRow & {
  pipeline_statuses?: PipelineStatusRow | null;
  lead_sources?: LeadSourceRow | null;
};

interface UseActiveDealsOptions {
  userIds: string[];
  filters?: {
    leadSourceIds?: string[];
    pipelineStageIds?: string[];
    dealTypes?: DealRow['deal_type'][];
  };
  enabled?: boolean;
}

export function useActiveDeals({ userIds, filters = {}, enabled = true }: UseActiveDealsOptions) {
  const currentYear = new Date().getFullYear();
  
  return useQuery({
    queryKey: queryKeys.dealsForDashboard(userIds, filters),
    queryFn: async (): Promise<DealWithRelations[]> => {
      if (!userIds.length) return [];

      const yearStartDateOnly = `${currentYear}-01-01`;
      const yearStartTs = `${currentYear}-01-01T00:00:00.000Z`;
      const closedInRangeOrClause = [
        'status.neq.closed',
        `and(status.eq.closed,or(close_date.gte.${yearStartDateOnly},and(close_date.is.null,closed_at.gte.${yearStartTs})))`,
      ].join(',');

      let query = supabase
        .from('deals')
        .select(DEAL_WITH_RELATIONS)
        .neq('status', 'dead')
        .or(closedInRangeOrClause)
        .order('created_at', { ascending: false })
        .range(0, 499);

      if (userIds.length === 1) {
        query = query.eq('user_id', userIds[0]);
      } else {
        query = query.in('user_id', userIds);
      }

      if (filters.leadSourceIds?.length) {
        query = query.in('lead_source_id', filters.leadSourceIds);
      }
      if (filters.pipelineStageIds?.length) {
        query = query.in('pipeline_status_id', filters.pipelineStageIds);
      }
      if (filters.dealTypes?.length) {
        query = query.in('deal_type', filters.dealTypes);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading active deals', error);
        return [];
      }
      return (data || []) as DealWithRelations[];
    },
    enabled: enabled && userIds.length > 0,
    staleTime: 1 * 60 * 1000, // Deals change more frequently
  });
}

// ============================================================================
// Active Tasks Hook
// ============================================================================

const TASK_COLUMNS = 'id,user_id,title,due_date,completed,deal_id,updated_at';
const DEAL_SUMMARY_COLUMNS = 'id,client_name,property_address,city,state,next_task_description';

type TaskWithDeal = TaskRow & {
  deals: {
    id: string;
    client_name: string;
    property_address: string;
    city: string;
    state: string;
    next_task_description: string;
  };
};

interface UseActiveTasksOptions {
  userIds: string[];
  enabled?: boolean;
}

export function useActiveTasks({ userIds, enabled = true }: UseActiveTasksOptions) {
  return useQuery({
    queryKey: queryKeys.tasksActive(userIds),
    queryFn: async (): Promise<TaskWithDeal[]> => {
      if (!userIds.length) return [];

      let query = supabase
        .from('tasks')
        .select(`${TASK_COLUMNS}, deals(${DEAL_SUMMARY_COLUMNS})`)
        .eq('completed', false)
        .order('due_date', { ascending: true });

      if (userIds.length === 1) {
        query = query.eq('user_id', userIds[0]);
      } else {
        query = query.in('user_id', userIds);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading active tasks', error);
        return [];
      }
      return ((data || []).filter(task => task.deals) as TaskWithDeal[]);
    },
    enabled: enabled && userIds.length > 0,
    staleTime: 1 * 60 * 1000,
  });
}

// ============================================================================
// Cache Invalidation Utilities
// ============================================================================

export function useInvalidateDeals() {
  const queryClient = useQueryClient();
  
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: queryKeys.deals }),
    invalidateActive: (userIds: string[]) => 
      queryClient.invalidateQueries({ queryKey: queryKeys.dealsActive(userIds) }),
    invalidateById: (id: string) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.dealById(id) }),
  };
}

export function useInvalidateTasks() {
  const queryClient = useQueryClient();
  
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
    invalidateActive: (userIds: string[]) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.tasksActive(userIds) }),
  };
}

export function useInvalidateAnalytics() {
  const queryClient = useQueryClient();
  
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: queryKeys.analytics }),
  };
}

// ============================================================================
// Generic Cached Data Fetching Hook
// ============================================================================

/**
 * A generic hook that wraps any async data fetching function with React Query caching.
 * This provides stale-while-revalidate behavior without rewriting existing fetch logic.
 * 
 * @param queryKey - Unique key for the cache entry
 * @param fetchFn - The async function that fetches data
 * @param options - Configuration options
 * @returns Object with data, loading states, and refetch function
 */
interface UseCachedFetchOptions<T> {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  refetchOnWindowFocus?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export function useCachedFetch<T>(
  queryKey: readonly unknown[],
  fetchFn: () => Promise<T>,
  options: UseCachedFetchOptions<T> = {}
) {
  const {
    enabled = true,
    staleTime = 2 * 60 * 1000, // 2 minutes
    gcTime = 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus = true,
    onSuccess,
    onError,
  } = options;

  const query = useQuery({
    queryKey,
    queryFn: fetchFn,
    enabled,
    staleTime,
    gcTime,
    refetchOnWindowFocus,
  });

  // Call success/error callbacks
  useEffect(() => {
    if (query.isSuccess && query.data !== undefined && onSuccess) {
      onSuccess(query.data);
    }
  }, [query.isSuccess, query.data, onSuccess]);

  useEffect(() => {
    if (query.isError && query.error && onError) {
      onError(query.error as Error);
    }
  }, [query.isError, query.error, onError]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isRefetching: query.isRefetching,
    isStale: query.isStale,
    isSuccess: query.isSuccess,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    // For backwards compatibility with existing loading patterns
    loading: query.isLoading,
    refreshing: query.isFetching && !query.isLoading,
  };
}

// ============================================================================
// Dashboard-Specific Cached Hooks
// ============================================================================

/**
 * Hook for caching dashboard data with all dependencies.
 * Replaces the manual useEffect/useState pattern in Dashboard.tsx
 */
interface DashboardQueryParams {
  userId: string;
  agentIds: string[];
  startISO: string;
  endISO: string;
  leadSources: string[];
  pipelineStages: string[];
  dealTypes: string[];
}

export function useDashboardQueryKey(params: DashboardQueryParams) {
  const stableJoin = (arr: string[]) => [...arr].filter(Boolean).sort().join('|');
  
  return [
    'dashboard',
    params.userId,
    stableJoin(params.agentIds),
    params.startISO.slice(0, 10),
    params.endISO.slice(0, 10),
    stableJoin(params.leadSources),
    stableJoin(params.pipelineStages),
    stableJoin(params.dealTypes),
  ] as const;
}

// ============================================================================
// Prefetching Utilities
// ============================================================================

/**
 * Prefetch data for a route before navigation for instant loading
 */
export function usePrefetch() {
  const queryClient = useQueryClient();

  const prefetchDeals = useCallback(async (userIds: string[]) => {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.dealsActive(userIds),
      queryFn: async () => {
        const currentYear = new Date().getFullYear();
        const yearStartDateOnly = `${currentYear}-01-01`;
        const yearStartTs = `${currentYear}-01-01T00:00:00.000Z`;
        const closedInRangeOrClause = [
          'status.neq.closed',
          `and(status.eq.closed,or(close_date.gte.${yearStartDateOnly},and(close_date.is.null,closed_at.gte.${yearStartTs})))`,
        ].join(',');

        let query = supabase
          .from('deals')
          .select('*')
          .neq('status', 'dead')
          .or(closedInRangeOrClause)
          .order('created_at', { ascending: false })
          .limit(100);

        if (userIds.length === 1) {
          query = query.eq('user_id', userIds[0]);
        } else if (userIds.length > 1) {
          query = query.in('user_id', userIds);
        }

        const { data } = await query;
        return data || [];
      },
      staleTime: 2 * 60 * 1000,
    });
  }, [queryClient]);

  return { prefetchDeals };
}

// ============================================================================
// Optimistic Update Helpers
// ============================================================================

/**
 * Hook for optimistic updates to cached data
 */
export function useOptimisticUpdate<T>() {
  const queryClient = useQueryClient();

  const updateCache = useCallback(
    (queryKey: readonly unknown[], updater: (old: T | undefined) => T) => {
      queryClient.setQueryData(queryKey, updater);
    },
    [queryClient]
  );

  const invalidate = useCallback(
    (queryKey: readonly unknown[]) => {
      queryClient.invalidateQueries({ queryKey });
    },
    [queryClient]
  );

  return { updateCache, invalidate };
}

// ============================================================================
// Integration Hook for Existing Pages
// ============================================================================

/**
 * A hook that provides the same interface as useState but with caching.
 * Drop-in replacement for state + useEffect data fetching patterns.
 * 
 * Usage:
 * Before: 
 *   const [data, setData] = useState([]);
 *   useEffect(() => { fetchData().then(setData); }, [deps]);
 * 
 * After:
 *   const { data, setData, refetch } = useCachedState(['myData', deps], fetchData, []);
 */
export function useCachedState<T>(
  queryKey: readonly unknown[],
  fetchFn: () => Promise<T>,
  initialValue: T,
  options: UseCachedFetchOptions<T> & { enabled?: boolean } = {}
) {
  const [localData, setLocalData] = useState<T>(initialValue);
  const hasSetInitialData = useRef(false);
  
  const query = useCachedFetch<T>(queryKey, fetchFn, options);

  // Sync query data to local state for backwards compatibility
  useEffect(() => {
    if (query.data !== undefined && !hasSetInitialData.current) {
      setLocalData(query.data);
      hasSetInitialData.current = true;
    } else if (query.data !== undefined) {
      setLocalData(query.data);
    }
  }, [query.data]);

  return {
    data: localData,
    setData: setLocalData,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isStale: query.isStale,
    refetch: query.refetch,
    // Aliases for existing code patterns
    loading: query.loading,
    refreshing: query.refreshing,
  };
}
