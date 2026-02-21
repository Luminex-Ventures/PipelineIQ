import { ReactNode, useState, useEffect, useRef } from 'react';

interface CrossFadeProps {
  /** true while data is loading (shows fallback) */
  loading: boolean;
  /** Skeleton / placeholder UI */
  fallback: ReactNode;
  /** Real content to reveal once loading is false */
  children: ReactNode;
  /** Crossfade duration in ms (default 300) */
  duration?: number;
  /** Optional className on the outer wrapper */
  className?: string;
}

/**
 * Smoothly crossfades from a skeleton `fallback` to `children` when
 * `loading` flips from true → false.
 *
 * Both layers are stacked in the same grid cell so they overlap
 * during the transition — the skeleton dissolves out while the
 * content materializes in. After the transition, only the content
 * remains in the DOM.
 */
export function CrossFade({
  loading,
  fallback,
  children,
  duration = 300,
  className,
}: CrossFadeProps) {
  const [phase, setPhase] = useState<'loading' | 'fading' | 'done'>(
    loading ? 'loading' : 'done',
  );
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Data arrived → start crossfade
    if (!loading && phase === 'loading') {
      setPhase('fading');
      timerRef.current = setTimeout(() => setPhase('done'), duration + 50);
    }
    // Data reset → back to loading
    if (loading && phase === 'done') {
      setPhase('loading');
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loading, phase, duration]);

  // After crossfade, render content only (clean DOM)
  if (phase === 'done') {
    return <div className={className}>{children}</div>;
  }

  const isFading = phase === 'fading';

  return (
    <div
      className={`grid ${className ?? ''}`}
      style={{ gridTemplateColumns: '1fr' }}
    >
      {/* Skeleton layer — fades out */}
      <div
        className="ease-out"
        style={{
          gridArea: '1 / 1',
          transitionProperty: 'opacity',
          transitionDuration: `${duration}ms`,
          opacity: isFading ? 0 : 1,
          pointerEvents: isFading ? 'none' : 'auto',
        }}
      >
        {fallback}
      </div>

      {/* Content layer — fades in */}
      {isFading && (
        <div
          className="animate-content-in"
          style={{ gridArea: '1 / 1' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
