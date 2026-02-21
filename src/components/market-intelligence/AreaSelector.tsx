import { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Clock, ChevronDown, X } from 'lucide-react';
import { ui } from '../../ui/tokens';
import { Text } from '../../ui/Text';
import { useAreaSearch } from '../../hooks/useMarketIntelligence';
import { getRecentAreas, type AreaOption } from '../../services/marketIntelligence';
import type { AreaSelection, AreaType } from '../../types/marketIntelligence';

const TYPE_ICONS: Record<AreaType, string> = {
  zip: 'ZIP',
  city: 'City',
  county: 'County',
  state: 'State',
};

const TYPE_COLORS: Record<AreaType, string> = {
  zip: 'bg-blue-50 text-blue-600',
  city: 'bg-emerald-50 text-emerald-600',
  county: 'bg-purple-50 text-purple-600',
  state: 'bg-amber-50 text-amber-700',
};

interface AreaSelectorProps {
  selected: AreaSelection | null;
  onSelect: (area: AreaSelection) => void;
}

export function AreaSelector({ selected, onSelect }: AreaSelectorProps) {
  const [open, setOpen] = useState(false);
  const { query, setQuery, results, searching } = useAreaSearch();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recentAreas = getRecentAreas();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  function handleSelect(option: AreaOption) {
    onSelect({
      type: option.type,
      value: option.value,
      label: option.label,
      timestamp: Date.now(),
    });
    setOpen(false);
    setQuery('');
  }

  function handleRecentSelect(area: AreaSelection) {
    onSelect(area);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={[
          'flex w-full items-center gap-3 px-4 py-3',
          ui.radius.card,
          ui.border.card,
          ui.shadow.card,
          'bg-white/90 transition-all duration-200',
          'hover:border-[rgba(var(--app-accent-rgb),0.3)] hover:shadow-md',
          open ? 'ring-2 ring-[var(--app-accent)]/20 border-[var(--app-accent)]' : '',
        ].join(' ')}
      >
        <MapPin className="h-4.5 w-4.5 text-[var(--app-accent)] flex-shrink-0" strokeWidth={2} />
        <div className="flex-1 text-left min-w-0">
          {selected ? (
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${TYPE_COLORS[selected.type]}`}>
                {TYPE_ICONS[selected.type]}
              </span>
              <span className="text-[15px] font-medium text-[#1e3a5f] truncate">
                {selected.label}
              </span>
            </div>
          ) : (
            <span className="text-sm text-[rgba(30,58,95,0.5)]">
              Search by zip, city, county, or state...
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-[rgba(30,58,95,0.4)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          className={[
            'absolute top-full left-0 right-0 z-50 mt-2',
            ui.radius.card,
            ui.border.card,
            'bg-white shadow-[0_20px_60px_rgba(30,58,95,0.16)]',
            'animate-content-in overflow-hidden',
          ].join(' ')}
        >
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[rgba(30,58,95,0.35)]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search areas..."
                className={[
                  'w-full pl-9 pr-8 py-2.5 text-sm',
                  ui.radius.control,
                  'border border-gray-200 bg-gray-50/60',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/20 focus:border-[var(--app-accent)]',
                  'placeholder:text-[rgba(30,58,95,0.4)]',
                  'text-[#1e3a5f]',
                ].join(' ')}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {!query && recentAreas.length > 0 && (
              <div className="px-3 pt-3 pb-1">
                <div className="flex items-center gap-1.5 px-1 mb-2">
                  <Clock className="h-3 w-3 text-[rgba(30,58,95,0.4)]" />
                  <Text variant="micro" className="!text-[10px]">Recent</Text>
                </div>
                {recentAreas.slice(0, 4).map((area) => (
                  <button
                    key={`${area.type}-${area.value}`}
                    type="button"
                    onClick={() => handleRecentSelect(area)}
                    className={[
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left',
                      ui.radius.control,
                      'hover:bg-gray-50 transition-colors duration-150',
                    ].join(' ')}
                  >
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${TYPE_COLORS[area.type]}`}>
                      {TYPE_ICONS[area.type]}
                    </span>
                    <span className="text-sm text-[#1e3a5f] truncate">{area.label}</span>
                  </button>
                ))}
              </div>
            )}

            {(query || recentAreas.length === 0) && (
              <div className="p-2">
                {searching ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="h-5 w-5 border-2 border-gray-200 border-t-[var(--app-accent)] rounded-full animate-spin" />
                  </div>
                ) : results.length === 0 ? (
                  <div className="text-center py-6">
                    <Text variant="muted">No areas found</Text>
                  </div>
                ) : (
                  results.map((option) => (
                    <button
                      key={`${option.type}-${option.value}`}
                      type="button"
                      onClick={() => handleSelect(option)}
                      className={[
                        'flex w-full items-center gap-2.5 px-3 py-2.5 text-left',
                        ui.radius.control,
                        'hover:bg-gray-50 transition-colors duration-150',
                      ].join(' ')}
                    >
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${TYPE_COLORS[option.type]}`}>
                        {TYPE_ICONS[option.type]}
                      </span>
                      <span className="text-sm text-[#1e3a5f]">{option.label}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
