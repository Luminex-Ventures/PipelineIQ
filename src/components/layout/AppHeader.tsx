import { Search, User, Settings, LogOut, X, Plus, Bell, Clock } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { getRoleLabel, getVisibleUserIds } from '../../lib/rbac';

interface SearchResult {
  id: string;
  client_name: string;
  property_address: string;
  client_email?: string;
  client_phone?: string;
  status: string;
  expected_sale_price: number;
}

type ActivityEventType = 'deal_status_change' | 'deal_deleted' | 'task_created';

interface NotificationItem {
  id: string;
  eventType: ActivityEventType;
  actorId: string;
  targetUserId: string;
  dealId?: string | null;
  taskId?: string | null;
  payload?: Record<string, any> | null;
  timestamp: Date;
}

export function AppHeader() {
  const { user, roleInfo } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [lastViewedAt, setLastViewedAt] = useState<Date>(new Date(0));
  const [lastClearedAt, setLastClearedAt] = useState<Date>(new Date(0));
  const [visibleSearchIds, setVisibleSearchIds] = useState<string[]>([]);
  const fetchRecentNotifications = useCallback(async () => {
    let query = supabase
      .from('activity_events')
      .select('id, event_type, actor_id, target_user_id, deal_id, task_id, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (visibleIds.length > 0) {
      const list = visibleIds.join(',');
      query = query.or(`target_user_id.in.(${list}),actor_id.in.(${list})`);
    }

    const { data, error } = await query;

    if (!error && data) {
      const mapped = data
        .map((row) => ({
          id: row.id,
          eventType: row.event_type as ActivityEventType,
          actorId: row.actor_id,
          targetUserId: row.target_user_id,
          dealId: row.deal_id,
          taskId: row.task_id,
          payload: (row.payload || {}) as Record<string, any>,
          timestamp: new Date(row.created_at),
        }))
        .filter((item) => item.timestamp.getTime() > lastClearedAt.getTime());
      setNotifications(mapped);
      if (mapped.some((n) => n.timestamp.getTime() > lastViewedAt.getTime())) {
        setHasUnread(true);
      }
    }
  }, [visibleIds, lastViewedAt, lastClearedAt]);

  useEffect(() => {
    const loadVisibleSearchIds = async () => {
      if (!roleInfo) return;
      const ids = await getVisibleUserIds(roleInfo);
      setVisibleSearchIds(ids.length ? ids : user ? [user.id] : []);
    };
    loadVisibleSearchIds();
  }, [roleInfo, user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
      if (!(event.target as HTMLElement).closest('#notification-popover')) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchDeals = async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setSearchResults([]);
        setShowSearchResults(false);
        return;
      }

      setIsSearching(true);
      setShowSearchResults(true);

      try {
        let query = supabase
          .from('deals')
          .select('id, client_name, property_address, client_email, client_phone, status, expected_sale_price, user_id')
          .or(`client_name.ilike.%${searchQuery}%,property_address.ilike.%${searchQuery}%,client_email.ilike.%${searchQuery}%,client_phone.ilike.%${searchQuery}%`)
          .limit(8);

        if (visibleSearchIds.length === 1) {
          query = query.eq('user_id', visibleSearchIds[0]);
        } else if (visibleSearchIds.length > 1) {
          query = query.in('user_id', visibleSearchIds);
        } else if (user?.id) {
          query = query.eq('user_id', user.id);
        }

        const { data, error } = await query;

        if (error) throw error;
        setSearchResults(data || []);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchDeals, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, user?.id, visibleSearchIds]);

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const { data, error } = await supabase.rpc('get_accessible_agents');
        if (!error && data) {
          const map: Record<string, string> = {};
          (data as { user_id: string; display_name: string | null; email: string | null }[]).forEach((row) => {
            map[row.user_id] = row.display_name || row.email || 'Agent';
          });
          setAgentMap(map);
        }
      } catch (err) {
        console.error('Error loading agents for notifications', err);
      }
    };
    loadAgents();
  }, []);

  useEffect(() => {
    if (!roleInfo || (roleInfo.globalRole !== 'sales_manager' && roleInfo.globalRole !== 'team_lead' && roleInfo.globalRole !== 'admin')) {
      return;
    }

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      const ids = await getVisibleUserIds(roleInfo);
      setVisibleIds(ids);
      await fetchRecentNotifications();

      channel = supabase.channel('activity-events');
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_events' }, (payload) => {
          const row: any = payload.new;
          if (!row) return;
          if (ids.length && !ids.includes(row.target_user_id) && !ids.includes(row.actor_id)) {
            return;
          }
          if (new Date(row.created_at).getTime() <= lastClearedAt.getTime()) {
            return;
          }
          setNotifications((prev) => {
            const next: NotificationItem[] = [
              {
                id: row.id,
                eventType: row.event_type as ActivityEventType,
                actorId: row.actor_id,
                targetUserId: row.target_user_id,
                dealId: row.deal_id,
                taskId: row.task_id,
                payload: (row.payload || {}) as Record<string, any>,
                timestamp: new Date(row.created_at),
              },
              ...prev,
            ];
            return next.slice(0, 10);
          });
          setHasUnread(true);
        })
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [roleInfo, fetchRecentNotifications]);

  const handleResultClick = (dealId: string) => {
    setSearchQuery('');
    setShowSearchResults(false);
    navigate(`/pipeline?dealId=${dealId}`);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleGlobalNewDeal = () => {
    navigate('/pipeline?newDeal=true');
  };

  const roleLabel = getRoleLabel(roleInfo?.globalRole);

  const nowMs = Date.now();
  const hasRecent = notifications.some(
    (n) =>
      nowMs - n.timestamp.getTime() <= 60 * 60 * 1000 &&
      n.timestamp.getTime() > lastViewedAt.getTime()
  );

  useEffect(() => {
    if (notifications.some((n) => n.timestamp.getTime() > lastViewedAt.getTime())) {
      setHasUnread(true);
    }
  }, [notifications, lastViewedAt]);

  useEffect(() => {
    if (!roleInfo || (roleInfo.globalRole !== 'sales_manager' && roleInfo.globalRole !== 'team_lead' && roleInfo.globalRole !== 'admin')) {
      return;
    }
    // Poll occasionally in case realtime misses an event
    const interval = setInterval(() => {
      fetchRecentNotifications();
    }, 45000);
    return () => clearInterval(interval);
  }, [roleInfo, fetchRecentNotifications]);

  const formatStatusLabel = (status: string) => {
    if (!status) return '';
    if (status === 'dead') return 'Archived';
    if (status === 'closed') return 'Closed Won';
    return status.replace(/_/g, ' ');
  };

  const formatNotification = (item: NotificationItem) => {
    const actor = agentMap[item.actorId] || 'An agent';
    switch (item.eventType) {
      case 'deal_status_change': {
        const from = item.payload?.from_status?.replace(/_/g, ' ') || 'previous stage';
        const to = item.payload?.to_status?.replace(/_/g, ' ') || 'new stage';
        const client = item.payload?.client_name || 'a client';
        const address = item.payload?.property_address || 'deal';
        return `${actor} moved the ${client} — ${address} deal from ${from} to ${to}.`;
      }
      case 'deal_deleted': {
        const client = item.payload?.client_name || 'a client';
        const address = item.payload?.property_address || 'deal';
        return `${actor} deleted the ${client} — ${address} deal.`;
      }
      case 'task_created': {
        const title = item.payload?.title || 'a task';
        const due = item.payload?.due_date
          ? ` with a due date of ${new Date(item.payload.due_date).toLocaleDateString()}`
          : '';
        return `${actor} created a new task "${title}"${due}.`;
      }
      default:
        return `${actor} made an update.`;
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/30 bg-white/75 backdrop-blur-2xl shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div className="mx-auto flex h-16 w-full items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm font-semibold text-gray-900 shadow-[0_2px_8px_rgba(15,23,42,0.08)]"
          >
            <img src="/PipelineIQ.png" alt="PipelineIQ" className="h-8 w-auto" />
          </button>
          <div className="hidden lg:flex w-96" ref={searchRef}>
            <div className="relative w-full">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search deals, people, addresses..."
                className="w-full rounded-2xl border border-white/60 bg-white/90 py-2 pl-10 pr-10 text-sm text-gray-900 shadow-inner focus:border-[var(--app-accent)]/40 focus:ring-2 focus:ring-[var(--app-accent)]/15"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {showSearchResults && (
                <div className="absolute top-full left-0 right-0 z-50 mt-3 rounded-2xl border border-white/70 bg-white/95 shadow-[0_15px_40px_rgba(15,23,42,0.16)]">
                  {isSearching ? (
                    <div className="px-4 py-3 text-sm text-gray-500 text-center">Searching…</div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => handleResultClick(result.id)}
                        className="flex w-full items-start justify-between px-4 py-3 text-left hover:bg-gray-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {result.client_name}
                          </p>
                          <p className="truncate text-xs text-gray-500">{result.property_address}</p>
                          {(result.client_email || result.client_phone) && (
                            <p className="truncate text-xs text-gray-400">
                              {result.client_email || result.client_phone}
                            </p>
                          )}
                        </div>
                        <div className="ml-3 flex flex-col items-end gap-1">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                {formatStatusLabel(result.status)}
              </span>
                          <span className="text-xs text-gray-500">
                            ${result.expected_sale_price.toLocaleString()}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-gray-500 text-center">
                      No deals found matching “{searchQuery}”.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleGlobalNewDeal}
            className="hidden sm:inline-flex items-center gap-2 rounded-2xl border border-white/40 bg-white/80 px-3 py-2 text-sm font-medium text-gray-700 shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition hover:border-[var(--app-accent)]/40 hover:text-[var(--app-accent)]"
          >
            <Plus className="h-4 w-4" />
            New deal
          </button>
          {(roleInfo?.globalRole === 'sales_manager' || roleInfo?.globalRole === 'team_lead' || roleInfo?.globalRole === 'admin') && (
            <div className="relative" id="notification-popover">
              <button
                onClick={() => {
                  if (!showNotifications) {
                    // Refresh on open in case realtime missed anything
                    fetchRecentNotifications();
                  }
                  setShowNotifications((prev) => !prev);
                  setHasUnread(false);
                  setLastViewedAt(new Date());
                }}
                className="relative inline-flex items-center gap-2 rounded-2xl border border-white/50 bg-white/80 px-2.5 py-1.5 shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition hover:border-[var(--app-accent)]/30"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700">
                  <Bell className="h-4 w-4" />
                </div>
                <div className="hidden text-left sm:block">
                  <p className="text-xs font-semibold text-gray-900">Notifications</p>
                  <p className="text-[11px] text-gray-500">Team activity</p>
                </div>
                {hasUnread && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[rgb(0,122,255)] shadow-[0_0_0_4px_rgba(0,122,255,0.14)]"></span>
                )}
                {!hasUnread && hasRecent && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-gray-300 shadow-[0_0_0_4px_rgba(148,163,184,0.25)]"></span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-3 w-96 max-w-[90vw] rounded-2xl border border-white/70 bg-white/95 p-3 shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Recent activity</p>
                      <p className="text-xs text-gray-500">Latest 10 actions</p>
                    </div>
                    <button
                      onClick={() => {
                        const now = new Date();
                        setNotifications([]);
                        setHasUnread(false);
                        setLastViewedAt(now);
                        setLastClearedAt(now);
                      }}
                      className="text-[11px] font-semibold text-[var(--app-accent)] hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto space-y-2">
                    {notifications.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-2 text-sm text-gray-500">
                        Nothing yet — team updates will appear here.
                      </div>
                    ) : (
                      notifications.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-gray-100 bg-white/90 px-3 py-2 shadow-sm"
                        >
                          <p className="text-sm text-gray-900">{formatNotification(item)}</p>
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{item.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu((prev) => !prev)}
              className="flex items-center gap-2 rounded-2xl border border-white/50 bg-white/80 px-2.5 py-1.5 shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition hover:border-[var(--app-accent)]/30"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--app-accent)] text-white">
                <User className="h-4 w-4" />
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-semibold text-gray-900">{user?.email}</p>
                <p className="text-[11px] text-gray-500">{roleLabel}</p>
              </div>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-3 w-64 rounded-2xl border border-white/70 bg-white/95 shadow-[0_25px_60px_rgba(15,23,42,0.16)]">
                <div className="border-b border-gray-100 px-4 py-3 space-y-1">
                  <p className="text-sm font-semibold text-gray-900">{user?.email}</p>
                  <p className="text-xs font-medium text-gray-500 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">
                      {roleLabel}
                    </span>
                    Signed in
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/settings');
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  <Settings className="h-4 w-4" />
                  <span>Personal Settings</span>
                </button>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
