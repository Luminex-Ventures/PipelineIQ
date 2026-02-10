import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FormField } from '../../ui/FormField';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';

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
    <FormField
      label={
        <div className="multiselect-header">
          <div className="multiselect-label">
            <Text as="span" variant="micro" className="font-medium text-gray-600">
              {label}
            </Text>
          </div>
          <div className="multiselect-actions">
            <button
              type="button"
              onClick={handleSelectAll}
              className={['transition', ui.tone.faint, 'hover:text-gray-700'].join(' ')}
              disabled={disabled || options.length === 0}
            >
              <Text as="span" variant="micro" className="normal-case">Select all</Text>
            </button>
            <button
              type="button"
              onClick={handleClear}
              className={['transition', ui.tone.faint, 'hover:text-gray-700'].join(' ')}
              disabled={disabled || value.length === 0}
            >
              <Text as="span" variant="micro" className="normal-case">Clear</Text>
            </button>
          </div>
        </div>
      }
    >
      <div ref={containerRef} className="multiselect-body relative">
        <div
          className={`hig-input flex items-center gap-2 ${ui.radius.card} bg-white/90 ${
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
              className="w-full bg-transparent outline-none placeholder:text-gray-400"
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
            />
          </div>
          {value.length > 0 && (
            <Text as="span" variant="micro" className={ui.tone.subtle}>
              {value.length}
            </Text>
          )}
        </div>
        {open && !disabled && (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-lg"
            role="listbox"
            id={listboxId}
          >
            {filteredOptions.length === 0 && (
              <div className={ui.pad.cardTight}>
                <Text variant="muted">No matches.</Text>
              </div>
            )}
            {filteredOptions.map((option, index) => {
              const active = index === highlighted;
              const isSelected = selectedSet.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleValue(option.value)}
                  className={`flex w-full items-center justify-between ${ui.pad.cardTight} ${ui.align.left} ${
                    active ? 'bg-gray-50' : ''
                  }`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="space-y-1">
                    <Text as="p" variant="body">{option.label}</Text>
                    {option.subLabel && (
                      <Text as="p" variant="muted">{option.subLabel}</Text>
                    )}
                  </div>
                  {isSelected && (
                    <Text as="span" variant="micro" className={ui.tone.accent}>
                      Selected
                    </Text>
                  )}
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
                className={[
                  'inline-flex items-center gap-1 bg-white',
                  ui.radius.pill,
                  ui.border.subtle,
                  ui.pad.chipTight
                ].join(' ')}
              >
                <Text as="span" variant="muted">{option.label}</Text>
                <button
                  type="button"
                  onClick={() => toggleValue(option.value)}
                  className={['transition', ui.tone.faint, 'hover:text-gray-600'].join(' ')}
                  aria-label={`Remove ${option.label}`}
                >
                  x
                </button>
              </span>
            ))}
            {selectedOptions.length > maxChipsVisible && (
              <span
                className={[
                  'inline-flex items-center bg-white',
                  ui.radius.pill,
                  ui.border.subtle,
                  ui.pad.chipTight
                ].join(' ')}
              >
                <Text as="span" variant="muted">+{selectedOptions.length - maxChipsVisible} more</Text>
              </span>
            )}
          </div>
        )}
      </div>
    </FormField>
  );
}
