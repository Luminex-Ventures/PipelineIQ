export function parseHSL(hslString: string): { h: number; s: number; l: number } | null {
  if (!hslString || !hslString.startsWith('hsl(')) {
    return null;
  }

  const match = hslString.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return null;

  return {
    h: parseInt(match[1], 10),
    s: parseInt(match[2], 10),
    l: parseInt(match[3], 10)
  };
}

export function parseRGB(rgbString: string): { r: number; g: number; b: number } | null {
  if (!rgbString || !rgbString.toLowerCase().startsWith('rgb(')) {
    return null;
  }

  const match = rgbString.match(/rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)/i);
  if (!match) return null;

  const [r, g, b] = match.slice(1).map((value) => parseInt(value, 10));
  if ([r, g, b].some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return null;
  }

  return { r, g, b };
}

export function normalizeRgbInput(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const direct = parseRGB(trimmed);
  if (direct) {
    return `rgb(${direct.r}, ${direct.g}, ${direct.b})`;
  }

  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 3) {
    return null;
  }

  const [r, g, b] = parts.map((value) => parseInt(value, 10));
  if ([r, g, b].some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return null;
  }

  return `rgb(${r}, ${g}, ${b})`;
}

function parseHexColor(hexString: string): { r: number; g: number; b: number } | null {
  if (!hexString || !hexString.startsWith('#')) return null;
  const normalized = hexString.trim();
  const match = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;

  let value = match[1];
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('');
  }

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  return { r, g, b };
}

export function getTextColor(colorValue: string | null | undefined): string {
  if (!colorValue) return '#ffffff';

  const hex = parseHexColor(colorValue);
  if (hex) {
    const luminance = (0.2126 * hex.r + 0.7152 * hex.g + 0.0722 * hex.b) / 255;
    return luminance > 0.6 ? '#000000' : '#ffffff';
  }

  const hsl = parseHSL(colorValue);
  if (hsl) {
    return hsl.l > 60 ? '#000000' : '#ffffff';
  }

  const rgb = parseRGB(colorValue);
  if (rgb) {
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance > 0.6 ? '#000000' : '#ffffff';
  }

  return '#ffffff';
}

export function getColorValue(colorValue: string | null | undefined): string {
  if (!colorValue) return 'hsl(220, 70%, 50%)';

  const lowered = colorValue.toLowerCase();
  const hexMatch = colorValue.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    return hexMatch[0];
  }

  if (lowered.startsWith('hsl(') || lowered.startsWith('rgb(')) {
    return colorValue;
  }

  const legacyColors: Record<string, string> = {
    blue: 'hsl(220, 70%, 50%)',
    cyan: 'hsl(190, 65%, 48%)',
    teal: 'hsl(165, 60%, 45%)',
    green: 'hsl(145, 65%, 45%)',
    lime: 'hsl(80, 60%, 50%)',
    yellow: 'hsl(45, 100%, 50%)',
    orange: 'hsl(25, 95%, 55%)',
    red: 'hsl(5, 75%, 55%)',
    pink: 'hsl(340, 70%, 55%)',
    purple: 'hsl(280, 65%, 55%)',
    violet: 'hsl(260, 60%, 55%)',
    indigo: 'hsl(240, 65%, 55%)',
    slate: 'hsl(200, 20%, 50%)',
    gray: 'hsl(0, 0%, 50%)',
    brown: 'hsl(30, 40%, 45%)',
    amber: 'hsl(40, 95%, 50%)',
    emerald: 'hsl(160, 70%, 45%)',
    sky: 'hsl(200, 90%, 50%)',
    rose: 'hsl(350, 80%, 55%)',
    mint: 'hsl(175, 60%, 45%)',
  };

  return legacyColors[lowered] || 'hsl(220, 70%, 50%)';
}

export function getColorByName(colorName: string | null | undefined): { bg: string; text: string } {
  const bg = getColorValue(colorName);
  const text = getTextColor(bg);
  return { bg, text };
}
