import { Search, User, Settings, LogOut, X, Plus } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { getRoleLabel } from '../../lib/rbac';

interface SearchResult {
  id: string;
  client_name: string;
  property_address: string;
  client_email?: string;
  client_phone?: string;
  status: string;
  expected_sale_price: number;
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
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
        const { data, error } = await supabase
          .from('deals')
          .select('id, client_name, property_address, client_email, client_phone, status, expected_sale_price')
          .eq('user_id', user?.id)
          .or(`client_name.ilike.%${searchQuery}%,property_address.ilike.%${searchQuery}%,client_email.ilike.%${searchQuery}%,client_phone.ilike.%${searchQuery}%`)
          .limit(5);

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
  }, [searchQuery, user?.id]);

  const handleResultClick = (dealId: string) => {
    setSearchQuery('');
    setShowSearchResults(false);
    navigate('/pipeline');
    setTimeout(() => {
      const dealElement = document.querySelector(`[data-deal-id="${dealId}"]`);
      if (dealElement) {
        dealElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dealElement.classList.add('ring-2', 'ring-[rgb(0,122,255)]', 'ring-offset-2');
        setTimeout(() => {
          dealElement.classList.remove('ring-2', 'ring-[rgb(0,122,255)]', 'ring-offset-2');
        }, 2000);
      }
    }, 100);
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

  return (
    <header className="sticky top-0 z-50 border-b border-white/30 bg-white/75 backdrop-blur-2xl shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:px-8">
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
                            {result.status.replace(/_/g, ' ')}
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
