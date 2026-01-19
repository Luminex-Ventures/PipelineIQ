import { Check } from 'lucide-react';
import { getColorValue } from '../../lib/colors';
import { COLOR_SWATCHES } from './colorSwatches';

const DEFAULT_STATUS_COLOR = COLOR_SWATCHES[0].value;

interface ColorPickerProps {
  value: string | null;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const resolvedColor = value ? getColorValue(value) : DEFAULT_STATUS_COLOR;
  const normalizedResolved = resolvedColor.toLowerCase();
  const selectedDefinition = COLOR_SWATCHES.find(
    (color) => color.value.toLowerCase() === normalizedResolved
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-gray-200/70 bg-white/80 p-4 shadow-inner">
        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/40 shadow">
          <span
            className="absolute inset-0 rounded-2xl"
            style={{ backgroundColor: resolvedColor }}
          />
          <Check className="relative h-5 w-5 text-white drop-shadow" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-400">
            Selected color
          </span>
          <span className="text-xs text-gray-500">
            {selectedDefinition ? 'From palette' : 'Custom'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3 sm:grid-cols-8">
        {COLOR_SWATCHES.map((color) => {
          const isSelected = color.value.toLowerCase() === normalizedResolved;
          return (
            <button
              key={color.value}
              type="button"
              onClick={() => onChange(color.value)}
              className={`relative h-10 w-10 rounded-2xl border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]/40 ${
                isSelected
                  ? 'border-[var(--app-accent)] shadow-[0_8px_18px_rgba(15,23,42,0.15)]'
                  : 'border-white/70 shadow-inner hover:border-gray-300'
              }`}
              style={{ backgroundColor: color.value }}
              aria-label={`${color.name} color`}
            >
              {isSelected && (
                <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" strokeWidth={2.5} />
              )}
              <span className="sr-only">{color.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
