import { useState, useRef, useEffect } from 'react';
import { parseHSL } from '../../lib/colors';

interface ColorPickerProps {
  value: string | null;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [hue, setHue] = useState(220);
  const [saturation, setSaturation] = useState(70);
  const [lightness, setLightness] = useState(50);
  const saturationRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const skipOnChange = useRef(false);

  useEffect(() => {
    if (!value || !value.startsWith('hsl(')) {
      return;
    }

    const parsed = parseHSL(value);
    if (!parsed) return;

    skipOnChange.current = true;
    setHue(parsed.h);
    setSaturation(parsed.s);
    setLightness(parsed.l);
  }, [value]);

  useEffect(() => {
    if (skipOnChange.current) {
      skipOnChange.current = false;
      return;
    }

    const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    onChange(color);
  }, [hue, saturation, lightness, onChange]);

  const handleSaturationClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!saturationRef.current) return;
    const rect = saturationRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const newSaturation = Math.round((x / rect.width) * 100);
    const newLightness = Math.round(100 - (y / rect.height) * 100);

    setSaturation(newSaturation);
    setLightness(newLightness);
  };

  const handleHueClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const newHue = Math.round((x / rect.width) * 360);
    setHue(newHue);
  };

  const currentColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

  return (
    <div className="space-y-4">
      {/* Color Preview */}
      <div className="flex items-center gap-3">
        <div
          className="w-16 h-16 rounded-xl shadow-sm border-2 border-white ring-1 ring-gray-200/60"
          style={{ backgroundColor: currentColor }}
        />
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-900 mb-1">Selected Color</div>
          <div className="text-xs font-mono text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
            {currentColor}
          </div>
        </div>
      </div>

      {/* Saturation/Lightness Picker */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">
          Saturation & Lightness
        </label>
        <div
          ref={saturationRef}
          onClick={handleSaturationClick}
          className="relative w-full h-40 rounded-xl cursor-crosshair shadow-sm border border-gray-200/60 overflow-hidden"
          style={{
            background: `
              linear-gradient(to top, black, transparent),
              linear-gradient(to right, white, hsl(${hue}, 100%, 50%))
            `
          }}
        >
          <div
            className="absolute w-5 h-5 border-2 border-white rounded-full shadow-lg pointer-events-none"
            style={{
              left: `${saturation}%`,
              top: `${100 - lightness}%`,
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)'
            }}
          >
            <div
              className="w-full h-full rounded-full"
              style={{ backgroundColor: currentColor }}
            />
          </div>
        </div>
      </div>

      {/* Hue Slider */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">
          Hue
        </label>
        <div
          ref={hueRef}
          onClick={handleHueClick}
          className="relative w-full h-8 rounded-lg cursor-pointer shadow-sm border border-gray-200/60 overflow-hidden"
          style={{
            background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
          }}
        >
          <div
            className="absolute top-0 bottom-0 w-1 bg-white shadow-lg pointer-events-none"
            style={{
              left: `${(hue / 360) * 100}%`,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)'
            }}
          />
        </div>
      </div>

      {/* Preset Colors */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">
          Quick Presets
        </label>
        <div className="grid grid-cols-8 gap-2">
          {[
            { h: 220, s: 70, l: 50, label: 'Blue' },
            { h: 190, s: 65, l: 48, label: 'Cyan' },
            { h: 165, s: 60, l: 45, label: 'Teal' },
            { h: 145, s: 65, l: 45, label: 'Green' },
            { h: 80, s: 60, l: 50, label: 'Lime' },
            { h: 45, s: 100, l: 50, label: 'Yellow' },
            { h: 25, s: 95, l: 55, label: 'Orange' },
            { h: 5, s: 75, l: 55, label: 'Red' },
            { h: 340, s: 70, l: 55, label: 'Pink' },
            { h: 280, s: 65, l: 55, label: 'Purple' },
            { h: 260, s: 60, l: 55, label: 'Violet' },
            { h: 240, s: 65, l: 55, label: 'Indigo' },
            { h: 200, s: 20, l: 50, label: 'Slate' },
            { h: 0, s: 0, l: 50, label: 'Gray' },
            { h: 30, s: 40, l: 45, label: 'Brown' },
            { h: 0, s: 0, l: 25, label: 'Dark' },
          ].map((preset) => {
            const presetColor = `hsl(${preset.h}, ${preset.s}%, ${preset.l}%)`;
            const isSelected = hue === preset.h && saturation === preset.s && lightness === preset.l;

            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setHue(preset.h);
                  setSaturation(preset.s);
                  setLightness(preset.l);
                }}
                className={`w-8 h-8 rounded-lg transition-all hover:scale-110 ${
                  isSelected ? 'ring-2 ring-offset-2 ring-[rgb(0,122,255)]' : ''
                }`}
                style={{ backgroundColor: presetColor }}
                title={preset.label}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
