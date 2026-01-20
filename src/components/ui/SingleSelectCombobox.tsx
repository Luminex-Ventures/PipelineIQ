import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

export type SingleSelectOption = {
  value: string;
  label: string;
  subLabel?: string;
  group?: string;
  keywords?: string;
};

type SingleSelectComboboxProps = {
  label: string;
  options: SingleSelectOption[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
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

export function SingleSelectCombobox({
  label,
  options,
  value,
  onChange,
  placeholder = 'Search...',
  disabled = false,
  allowClear = true,
}: SingleSelectComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debouncedQuery = useDebouncedValue(query, 150);
  const listboxId = useMemo(
    () => `singleselect-${label.toLowerCase().replace(/\s+/g, '-')}`,
    [label]
  );

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  useEffect(() => {
    if (!open && selectedOption) {
      setQuery(selectedOption.label);
    }
  }, [open, selectedOption]);

  const filteredOptions = useMemo(() => {
    if (!debouncedQuery.trim()) return options;
    const lower = debouncedQuery.toLowerCase();
    return options.filter((option) => {
      const haystack = `${option.label} ${option.subLabel ?? ''} ${option.keywords ?? ''}`.toLowerCase();
      return haystack.includes(lower);
    });
  }, [debouncedQuery, options]);

  const groupedOptions = useMemo(() => {
    const map = new Map<string, SingleSelectOption[]>();
    filteredOptions.forEach((option) => {
      const key = option.group ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(option);
    });
    return Array.from(map.entries());
  }, [filteredOptions]);

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

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    const next = options.find((option) => option.value === nextValue);
    setQuery(next?.label ?? '');
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
    setOpen(false);
  };

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
        handleSelect(option.value);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Backspace' && !query && value && allowClear) {
      handleClear();
    }
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-400">
        {label}
      </label>
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
            value={open ? query : (selectedOption?.label ?? query)}
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
        {allowClear && value && !disabled && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleClear();
            }}
            className="text-xs font-semibold text-gray-400 hover:text-gray-600"
            aria-label="Clear selection"
          >
            x
          </button>
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
          {groupedOptions.map(([group, groupOptions]) => (
            <div key={group || 'default'}>
              {group && (
                <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                  {group}
                </div>
              )}
              {groupOptions.map((option) => {
                const index = filteredOptions.findIndex((item) => item.value === option.value);
                const active = index === highlighted;
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
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
                    {isSelected && (
                      <span className="text-xs font-semibold text-[var(--app-accent)]">Selected</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
