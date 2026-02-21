import { useState, useRef, useEffect, useCallback } from 'react';
import { ui } from '../../ui/tokens';
import { fetchAddressSuggestions, type AddressSuggestion } from '../../services/addressSuggestions';

const DEBOUNCE_MS = 350;

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when user selects an address from the dropdown (use for pre-filling property details). */
  onSelect?: (address: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  required?: boolean;
  id?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = '123 Main Street, City, State',
  className = '',
  inputClassName = '',
  required = false,
  id,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const runSearch = useCallback(async (query: string) => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const results = await fetchAddressSuggestions(query);
      setSuggestions(results);
      setHighlightIndex(-1);
      setOpen(results.length > 0);
    } catch {
      setSuggestions([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(value);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, runSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(address: string) {
    onChange(address);
    onSelect?.(address);
    setSuggestions([]);
    setOpen(false);
    setHighlightIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i < suggestions.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && highlightIndex >= 0 && suggestions[highlightIndex]) {
      e.preventDefault();
      handleSelect(suggestions[highlightIndex].address);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlightIndex(-1);
    }
  }

  const inputClasses = [
    'w-full px-3.5 py-2.5 text-sm text-[#1e3a5f]',
    ui.radius.control,
    'border border-gray-200 bg-white',
    'focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/20 focus:border-[var(--app-accent)]',
    'placeholder:text-[rgba(30,58,95,0.4)]',
    'transition-all duration-150',
    inputClassName,
  ].filter(Boolean).join(' ');

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClasses}
        required={required}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="address-suggestions-list"
        aria-activedescendant={
          highlightIndex >= 0 && suggestions[highlightIndex]
            ? `address-suggestion-${highlightIndex}`
            : undefined
        }
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <div className="h-4 w-4 border-2 border-gray-200 border-t-[var(--app-accent)] rounded-full animate-spin" />
        </div>
      )}
      {open && suggestions.length > 0 && (
        <ul
          id="address-suggestions-list"
          role="listbox"
          className={[
            'absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto',
            ui.radius.control,
            ui.border.card,
            'bg-white shadow-lg',
          ].join(' ')}
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.address}-${i}`}
              id={`address-suggestion-${i}`}
              role="option"
              aria-selected={highlightIndex === i}
              className={[
                'px-3.5 py-2.5 text-sm cursor-pointer transition-colors',
                highlightIndex === i
                  ? 'bg-[rgba(30,58,95,0.08)] text-[#1e3a5f]'
                  : 'text-[#1e3a5f] hover:bg-gray-50',
              ].join(' ')}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s.address);
              }}
            >
              {s.address}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
