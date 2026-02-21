/**
 * Geocode a market area (zip, city, etc.) to coordinates and bbox for map display.
 * Uses OpenStreetMap Nominatim (free, no API key). Per usage policy we send a
 * descriptive User-Agent.
 */

import type { AreaSelection } from '../types/marketIntelligence';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Luma-IQ-Market-Intel/1.0 (https://github.com; market area map)';

export interface GeocodedArea {
  lat: number;
  lon: number;
  /** [south, north, west, east] from Nominatim */
  bbox: [number, number, number, number];
  displayName: string;
}

/**
 * Build search query from area selection. Prefer label for display (e.g. "Austin, TX")
 * and ensure US context for zip/city.
 */
function buildQuery(area: AreaSelection): string {
  if (area.type === 'zip') {
    return `${area.value}, USA`;
  }
  return `${area.label}, USA`;
}

/**
 * Geocode an area to lat/lon and bounding box. Returns null if no result or on error.
 */
export async function geocodeArea(area: AreaSelection): Promise<GeocodedArea | null> {
  const query = buildQuery(area);
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
  });

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : data;
    if (!first || first.lat == null || first.lon == null) return null;

    const lat = Number(first.lat);
    const lon = Number(first.lon);
    const rawBbox = first.boundingbox;
    let bbox: [number, number, number, number];
    if (Array.isArray(rawBbox) && rawBbox.length >= 4) {
      const [south, north, west, east] = rawBbox.map(Number);
      bbox = [south, north, west, east];
    } else {
      const pad = 0.03;
      bbox = [lat - pad, lat + pad, lon - pad, lon + pad];
    }

    return {
      lat,
      lon,
      bbox,
      displayName: first.display_name ?? area.label,
    };
  } catch (err) {
    console.error('[areaGeocode] Geocode failed:', err);
    return null;
  }
}
