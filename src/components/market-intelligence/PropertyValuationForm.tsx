import { useState, useCallback, useRef, type FormEvent } from 'react';
import {
  Home,
  BedDouble,
  Bath,
  Ruler,
  Calendar,
  Wrench,
  Sparkles,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '../../ui/Card';
import { Text } from '../../ui/Text';
import { ui } from '../../ui/tokens';
import { useHomeEstimator } from '../../hooks/useMarketIntelligence';
import { fetchPropertyDetailFromApi } from '../../services/marketIntelligenceApi';
import type {
  PropertyCondition,
  Renovation,
  HomeEstimateInput,
  PricingStrategy,
} from '../../types/marketIntelligence';
import { EstimateResult } from './EstimateResult';
import { AddressAutocomplete } from './AddressAutocomplete';

type PrefilledKey = 'beds' | 'baths' | 'sqft' | 'yearBuilt';

const CONDITIONS: { value: PropertyCondition; label: string }[] = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'needs_work', label: 'Needs Work' },
  { value: 'fixer_upper', label: 'Fixer Upper' },
];

const RENOVATIONS: { value: Renovation; label: string }[] = [
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'bathrooms', label: 'Bathrooms' },
  { value: 'roof', label: 'Roof' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'windows', label: 'Windows' },
  { value: 'flooring', label: 'Flooring' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'addition', label: 'Addition' },
];

const inputClasses = [
  'w-full px-3.5 py-2.5 text-sm text-[#1e3a5f]',
  ui.radius.control,
  'border border-gray-200 bg-white',
  'focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/20 focus:border-[var(--app-accent)]',
  'placeholder:text-[rgba(30,58,95,0.4)]',
  'transition-all duration-150',
].join(' ');

export function PropertyValuationForm() {
  const { estimate, loading, error, run, reset } = useHomeEstimator();
  const lastFetchedAddress = useRef<string>('');

  const [form, setForm] = useState<HomeEstimateInput>({
    address: '',
    beds: 3,
    baths: 2,
    sqft: 1800,
    yearBuilt: 2005,
    condition: 'good',
    renovations: [],
  });
  const [prefilledFields, setPrefilledFields] = useState<Set<PrefilledKey>>(new Set());
  const [detailLoading, setDetailLoading] = useState(false);

  const update = useCallback(
    <K extends keyof HomeEstimateInput>(key: K, value: HomeEstimateInput[K]) => {
      if (key === 'beds' || key === 'baths' || key === 'sqft' || key === 'yearBuilt') {
        setPrefilledFields((prev) => {
          const next = new Set(prev);
          next.delete(key as PrefilledKey);
          return next;
        });
      }
      if (key === 'address' && typeof value === 'string' && !value.trim()) {
        lastFetchedAddress.current = '';
        setPrefilledFields(new Set());
      }
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleAddressSelect = useCallback(async (address: string) => {
    if (!address.trim() || address === lastFetchedAddress.current) return;
    lastFetchedAddress.current = address;
    setDetailLoading(true);
    try {
      const detail = await fetchPropertyDetailFromApi(address);
      if (!detail.prefilled) {
        setPrefilledFields(new Set());
        return;
      }
      const keys: PrefilledKey[] = [];
      setForm((prev) => {
        const next = { ...prev };
        if (detail.beds != null) {
          next.beds = detail.beds;
          keys.push('beds');
        }
        if (detail.baths != null) {
          next.baths = detail.baths;
          keys.push('baths');
        }
        if (detail.sqft != null) {
          next.sqft = detail.sqft;
          keys.push('sqft');
        }
        if (detail.yearBuilt != null) {
          next.yearBuilt = detail.yearBuilt;
          keys.push('yearBuilt');
        }
        return next;
      });
      setPrefilledFields(new Set(keys));
    } catch (err) {
      console.error('[PropertyValuationForm] Failed to fetch property detail:', err);
      setPrefilledFields(new Set());
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const toggleRenovation = useCallback((r: Renovation) => {
    setForm((prev) => ({
      ...prev,
      renovations: prev.renovations.includes(r)
        ? prev.renovations.filter((x) => x !== r)
        : [...prev.renovations, r],
    }));
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    run(form);
  }

  function handleReset() {
    reset();
    lastFetchedAddress.current = '';
    setPrefilledFields(new Set());
    setForm({
      address: '',
      beds: 3,
      baths: 2,
      sqft: 1800,
      yearBuilt: 2005,
      condition: 'good',
      renovations: [],
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card padding="card">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[rgba(30,58,95,0.7)] uppercase tracking-wider">
              <Home className="h-3.5 w-3.5" /> Address
            </label>
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => update('address', v)}
              onSelect={handleAddressSelect}
              placeholder="Start typing an address..."
              required
            />
            {detailLoading && (
              <Text variant="micro" className={ui.tone.subtle}>
                Loading property details…
              </Text>
            )}
          </div>

          <div className="space-y-2">
            {prefilledFields.size > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Pre-filled from property data — you can override any value.</span>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-xs font-semibold text-[rgba(30,58,95,0.7)] uppercase tracking-wider">
                  <BedDouble className="h-3.5 w-3.5" /> Beds
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={form.beds}
                  onChange={(e) => update('beds', Number(e.target.value))}
                  className={[
                    inputClasses,
                    prefilledFields.has('beds') ? 'bg-emerald-50/70 border-emerald-200' : '',
                  ].join(' ')}
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-xs font-semibold text-[rgba(30,58,95,0.7)] uppercase tracking-wider">
                  <Bath className="h-3.5 w-3.5" /> Baths
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  value={form.baths}
                  onChange={(e) => update('baths', Number(e.target.value))}
                  className={[
                    inputClasses,
                    prefilledFields.has('baths') ? 'bg-emerald-50/70 border-emerald-200' : '',
                  ].join(' ')}
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-xs font-semibold text-[rgba(30,58,95,0.7)] uppercase tracking-wider">
                  <Ruler className="h-3.5 w-3.5" /> Sq Ft
                </label>
                <input
                  type="number"
                  min={200}
                  max={50000}
                  value={form.sqft}
                  onChange={(e) => update('sqft', Number(e.target.value))}
                  className={[
                    inputClasses,
                    prefilledFields.has('sqft') ? 'bg-emerald-50/70 border-emerald-200' : '',
                  ].join(' ')}
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-xs font-semibold text-[rgba(30,58,95,0.7)] uppercase tracking-wider">
                  <Calendar className="h-3.5 w-3.5" /> Year Built
                </label>
                <input
                  type="number"
                  min={1800}
                  max={2026}
                  value={form.yearBuilt}
                  onChange={(e) => update('yearBuilt', Number(e.target.value))}
                  className={[
                    inputClasses,
                    prefilledFields.has('yearBuilt') ? 'bg-emerald-50/70 border-emerald-200' : '',
                  ].join(' ')}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[rgba(30,58,95,0.7)] uppercase tracking-wider">
              <Wrench className="h-3.5 w-3.5" /> Condition
            </label>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => update('condition', c.value)}
                  className={[
                    'px-3 py-1.5 text-sm font-medium rounded-full border transition-all duration-150',
                    form.condition === c.value
                      ? 'bg-[var(--app-accent)] text-white border-[var(--app-accent)] shadow-sm'
                      : 'bg-white text-[rgba(30,58,95,0.7)] border-gray-200 hover:border-[var(--app-accent)] hover:text-[var(--app-accent)]',
                  ].join(' ')}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[rgba(30,58,95,0.7)] uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" /> Recent Renovations
            </label>
            <div className="flex flex-wrap gap-2">
              {RENOVATIONS.map((r) => {
                const active = form.renovations.includes(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => toggleRenovation(r.value)}
                    className={[
                      'px-3 py-1.5 text-sm font-medium rounded-full border transition-all duration-150',
                      active
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-[rgba(30,58,95,0.6)] border-gray-200 hover:border-[#1e3a5f] hover:text-[#1e3a5f]',
                    ].join(' ')}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={loading || !form.address.trim()}
              className="hig-btn-primary gap-2"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Estimating...
                </>
              ) : (
                'Get Estimate'
              )}
            </button>
            {estimate && (
              <button
                type="button"
                onClick={handleReset}
                className="hig-btn-secondary gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
          </div>

          {error && (
            <Text variant="muted" className="!text-rose-500 text-sm">
              {error}
            </Text>
          )}
        </form>
      </Card>

      <div
        className={`transition-opacity duration-300 ${
          estimate ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {estimate && (
          <EstimateResult
            estimate={estimate}
            address={form.address}
            propertyInput={form}
          />
        )}
      </div>
    </div>
  );
}
