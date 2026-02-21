import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { ui } from '../../ui/tokens';
import { Text } from '../../ui/Text';
import { geocodeArea } from '../../services/areaGeocode';
import type { AreaSelection } from '../../types/marketIntelligence';

const MAPKIT_SCRIPT_URL = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js';
const MAP_CONTAINER_ID = 'area-map-mapkit-container';

declare global {
  interface Window {
    mapkit?: {
      init: (opts: { authorizationCallback: (done: (token: string) => void) => void }) => void;
      Map: new (elementId: string) => {
        region: unknown;
      };
      Coordinate: new (lat: number, lon: number) => unknown;
      CoordinateRegion: new (center: unknown, span: unknown) => unknown;
      CoordinateSpan: new (latitudeDelta: number, longitudeDelta: number) => unknown;
      loadedLibraries?: string[];
    };
    __areaMapInitMapKit?: () => void;
  }
}

interface AreaMapProps {
  area: AreaSelection | null;
  className?: string;
}

export function AreaMap({ area, className = '' }: AreaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<InstanceType<NonNullable<typeof window.mapkit>['Map']> | null>(null);
  const scriptLoadedRef = useRef(false);
  const [geo, setGeo] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Geocode when area changes
  useEffect(() => {
    if (!area) {
      setGeo(null);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    geocodeArea(area)
      .then((result) => {
        if (result) setGeo({ lat: result.lat, lon: result.lon });
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [area?.type, area?.value]);

  // Load MapKit script once and create/update map when we have geo
  useEffect(() => {
    if (!geo || !containerRef.current) return;

    const createOrUpdateMap = () => {
      const mapkit = window.mapkit;
      if (!mapkit || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.region = new mapkit.CoordinateRegion(
          new mapkit.Coordinate(geo.lat, geo.lon),
          new mapkit.CoordinateSpan(0.08, 0.08),
        );
        return;
      }

      const map = new mapkit.Map(MAP_CONTAINER_ID);
      map.region = new mapkit.CoordinateRegion(
        new mapkit.Coordinate(geo.lat, geo.lon),
        new mapkit.CoordinateSpan(0.08, 0.08),
      );
      mapRef.current = map;
    };

    if (scriptLoadedRef.current && window.mapkit) {
      createOrUpdateMap();
      return;
    }

    if (document.querySelector(`script[src="${MAPKIT_SCRIPT_URL}"]`)) {
      const checkReady = () => {
        if (window.mapkit?.loadedLibraries?.includes('map')) {
          scriptLoadedRef.current = true;
          createOrUpdateMap();
        } else {
          setTimeout(checkReady, 50);
        }
      };
      checkReady();
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const tokenUrl = `${supabaseUrl?.replace(/\/$/, '')}/functions/v1/mapkit-token`;

    window.__areaMapInitMapKit = () => {
      const mapkit = window.mapkit;
      if (!mapkit) return;
      mapkit.init({
        authorizationCallback: (done) => {
          fetch(tokenUrl, {
            method: 'GET',
            headers: { Authorization: `Bearer ${anonKey ?? ''}` },
          })
            .then((r) => r.json())
            .then((data: { token?: string }) => {
              if (data?.token) done(data.token);
              else setError(true);
            })
            .catch((err) => {
              console.error('[AreaMap] MapKit token failed:', err);
              setError(true);
            });
        },
      });
      scriptLoadedRef.current = true;
      createOrUpdateMap();
    };

    const script = document.createElement('script');
    script.src = MAPKIT_SCRIPT_URL;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.setAttribute('data-callback', '__areaMapInitMapKit');
    script.setAttribute('data-libraries', 'map');
    document.head.appendChild(script);

    return () => {
      if (scriptLoadedRef.current && mapRef.current && !geo) {
        mapRef.current = null;
      }
    };
  }, [geo]);

  if (!area) {
    return (
      <div
        className={[
          'flex flex-col items-center justify-center rounded-xl border border-gray-200/70 bg-gray-50/50 min-h-[180px]',
          className,
        ].join(' ')}
      >
        <MapPin className="h-8 w-8 text-gray-300 mb-1.5" strokeWidth={1.5} />
        <Text variant="muted" className="!text-xs">
          Select an area
        </Text>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={[
          'flex flex-col items-center justify-center rounded-xl border border-gray-200/70 bg-gray-50/50 min-h-[180px]',
          className,
        ].join(' ')}
      >
        <div className="h-6 w-6 border-2 border-gray-200 border-t-[var(--app-accent)] rounded-full animate-spin mb-1.5" />
        <Text variant="muted" className="!text-xs">
          Loading map…
        </Text>
      </div>
    );
  }

  if (error || !geo) {
    return (
      <div
        className={[
          'flex flex-col items-center justify-center rounded-xl border border-gray-200/70 bg-gray-50/50 min-h-[180px]',
          className,
        ].join(' ')}
      >
        <MapPin className="h-8 w-8 text-gray-300 mb-1.5" strokeWidth={1.5} />
        <Text variant="muted" className="!text-xs text-center px-2">
          Could not show map for this area
        </Text>
      </div>
    );
  }

  return (
    <div
      className={[
        'rounded-xl overflow-hidden border border-gray-200/70 bg-white min-h-[180px]',
        ui.shadow.card,
        className,
      ].join(' ')}
    >
      <div
        ref={containerRef}
        id={MAP_CONTAINER_ID}
        className="w-full h-[180px]"
        aria-label={`Map of ${area.label}`}
      />
    </div>
  );
}
