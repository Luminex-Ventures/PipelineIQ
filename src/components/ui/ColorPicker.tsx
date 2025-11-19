import { Check } from 'lucide-react';
import { getColorValue } from '../../lib/colors';

interface ColorDefinition {
  name: string;
  value: string;
}

export const COLOR_SWATCHES: ColorDefinition[] = [
  { name: 'Snow', value: '#F9FAFB' },
  { name: 'Pearl', value: '#F3F4F6' },
  { name: 'Mist', value: '#E5E7EB' },
  { name: 'Silver Fog', value: '#D1D5DB' },
  { name: 'Ice Blue', value: '#E8F1FF' },
  { name: 'Cloud Blue', value: '#D6E7FF' },
  { name: 'Sky Wash', value: '#C3DBFF' },
  { name: 'Pale Azure', value: '#AECFFF' },
  { name: 'Soft Blue', value: '#98C3FF' },
  { name: 'Bluebell', value: '#87B6F9' },
  { name: 'Foggy Indigo', value: '#AEB8D9' },
  { name: 'Lavender Mist', value: '#F2EDFF' },
  { name: 'Lilac Whisper', value: '#E8E2FF' },
  { name: 'Soft Violet', value: '#D8D0FF' },
  { name: 'Periwinkle Light', value: '#C7C3FF' },
  { name: 'Muted Orchid', value: '#B7B2F2' },
  { name: 'Barely Purple', value: '#DDD6F6' },
  { name: 'Blush Tint', value: '#FFE8F3' },
  { name: 'Pink Dew', value: '#FFD6E8' },
  { name: 'Rosewater', value: '#F9C8DB' },
  { name: 'Petal Pink', value: '#F5B8CD' },
  { name: 'Soft Berry', value: '#E8A7C3' },
  { name: 'Muted Magenta', value: '#D3A6C9' },
  { name: 'Rose Mist', value: '#FFE5E5' },
  { name: 'Pale Coral', value: '#FFD4D4' },
  { name: 'Soft Clay', value: '#F5B8B8' },
  { name: 'Muted Red', value: '#EFA9A9' },
  { name: 'Peach Wash', value: '#FFF1E6' },
  { name: 'Apricot Mist', value: '#FFE3CC' },
  { name: 'Soft Tangerine', value: '#FFD1AE' },
  { name: 'Warm Peach', value: '#F7C39C' },
  { name: 'Muted Orange', value: '#E7B690' },
  { name: 'Sunhaze', value: '#FFF8DD' },
  { name: 'Lemon Tint', value: '#FFF2BB' },
  { name: 'Buttercream', value: '#FFECA1' },
  { name: 'Golden Mist', value: '#FFE38C' },
  { name: 'Muted Amber', value: '#F6D67C' },
  { name: 'Mint Wash', value: '#E6FFF5' },
  { name: 'Soft Mint', value: '#CFF9EA' },
  { name: 'Pale Green', value: '#B7F0D9' },
  { name: 'Seafoam', value: '#A1E8CC' },
  { name: 'Soft Teal', value: '#8EDCC0' },
  { name: 'Muted Green', value: '#7BCDB1' },
  { name: 'Aqua Mist', value: '#E5FAFF' },
  { name: 'Arctic Blue', value: '#CDF2FA' },
  { name: 'Icy Teal', value: '#B5E8F0' },
  { name: 'Soft Cyan', value: '#A1DEEA' },
  { name: 'Muted Teal', value: '#8DCFD9' },
  { name: 'Sandstone', value: '#F7EFE6' },
  { name: 'Driftwood', value: '#EADFD2' },
  { name: 'Clay Neutral', value: '#DDCEBF' },
  { name: 'Soft Taupe', value: '#CFC1B2' }
];

export const DEFAULT_STATUS_COLOR = COLOR_SWATCHES[0].value;

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
