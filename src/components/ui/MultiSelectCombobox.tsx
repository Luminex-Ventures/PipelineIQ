import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

export type MultiSelectOption = {
  value: string;
  label: string;
  subLabel?: string;
  group?: string;
};

type MultiSelectComboboxProps = {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxChipsVisible?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const useDebouncedValue = (value: string, delayMs: number) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
};

export function MultiSelectCombobox({
  label,
  options,
  value,
  onChange,
  placeholder = 'Search...',
  disabled = false,
  maxChipsVisible = 6,
}: MultiSelectComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debouncedQuery = useDebouncedValue(query, 150);
  const listboxId = useMemo(
    () => `multiselect-${label.toLowerCase().replace(/\\s+/g, '-')}`,
    [label]
  );

  const selectedSet = useMemo(() => new Set(value), [value]);
  const filteredOptions = useMemo(() => {
    if (!debouncedQuery.trim()) return options;
    const lower = debouncedQuery.toLowerCase();
    return options.filter((option) => {
      const haystack = `${option.label} ${option.subLabel ?? ''}`.toLowerCase();
      return haystack.includes(lower);
    });
  }, [debouncedQuery, options]);

  const selectedOptions = useMemo(
    () => options.filter((option) => selectedSet.has(option.value)),
    [options, selectedSet]
  );

  const toggleValue = (nextValue: string) => {
    if (selectedSet.has(nextValue)) {
      onChange(value.filter((item) => item !== nextValue));
    } else {
      onChange([...value, nextValue]);
    }
  };

  const handleSelectAll = () => {
    onChange(options.map((option) => option.value));
  };

  const handleClear = () => {
    onChange([]);
  };

  useEffect(() => {
    if (!open) return;
    setHighlighted((current) => clamp(current, 0, Math.max(filteredOptions.length - 1, 0)));
  }, [filteredOptions.length, open]);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => clamp(current + 1, 0, Math.max(filteredOptions.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => clamp(current - 1, 0, Math.max(filteredOptions.length - 1, 0)));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filteredOptions[highlighted];
      if (option) {
        toggleValue(option.value);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Backspace' && !query && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">
          {label}
        </label>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <button
            type="button"
            onClick={handleSelectAll}
            className="hover:text-gray-700"
            disabled={disabled || options.length === 0}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="hover:text-gray-700"
            disabled={disabled || value.length === 0}
          >
            Clear
          </button>
        </div>
      </div>
      <div
        className={`hig-input flex items-center gap-2 rounded-2xl border-gray-200 bg-white/90 px-3 py-2 text-sm ${
          disabled ? 'opacity-60' : 'cursor-text'
        }`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        <div className="flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
          />
        </div>
        {value.length > 0 && (
          <span className="text-xs font-semibold text-gray-500">{value.length}</span>
        )}
      </div>
      {open && !disabled && (
        <div
          className="max-h-64 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-lg"
          role="listbox"
          id={listboxId}
        >
          {filteredOptions.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-500">No matches.</div>
          )}
          {filteredOptions.map((option, index) => {
            const active = index === highlighted;
            const isSelected = selectedSet.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleValue(option.value)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                  active ? 'bg-gray-50' : ''
                }`}
                role="option"
                aria-selected={isSelected}
              >
                <div>
                  <p className="text-gray-900">{option.label}</p>
                  {option.subLabel && (
                    <p className="text-xs text-gray-500">{option.subLabel}</p>
                  )}
                </div>
                {isSelected && <span className="text-xs font-semibold text-[var(--app-accent)]">Selected</span>}
              </button>
            );
          })}
        </div>
      )}
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedOptions.slice(0, maxChipsVisible).map((option) => (
            <span
              key={option.value}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700"
            >
              {option.label}
              <button
                type="button"
                onClick={() => toggleValue(option.value)}
                className="text-gray-400 hover:text-gray-600"
                aria-label={`Remove ${option.label}`}
              >
                x
              </button>
            </span>
          ))}
          {selectedOptions.length > maxChipsVisible && (
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-500">
              +{selectedOptions.length - maxChipsVisible} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
