import { useEffect, useState } from 'react';

export type OrbState = 'thinking' | 'processing' | 'success' | 'error';
export type OrbSize = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<OrbSize, number> = {
  sm: 24,
  md: 40,
  lg: 64,
};

const STATE_LABELS: Record<OrbState, string> = {
  thinking: 'Pensando...',
  processing: 'Procesando...',
  success: 'Completado',
  error: 'Error',
};

const STATE_COLORS: Record<OrbState, string> = {
  thinking: 'var(--color-primary-400)',
  processing: 'var(--color-primary-500)',
  success: 'var(--color-green-500)',
  error: 'var(--color-red-500)',
};

interface ThinkingOrbProps {
  state: OrbState;
  size?: OrbSize;
  label?: string;
  ariaLive?: 'polite' | 'assertive';
  className?: string;
}

export function ThinkingOrb({ 
  state, 
  size = 'md', 
  label, 
  ariaLive = 'polite',
  className = '',
}: ThinkingOrbProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const orbSize = SIZE_MAP[size];
  const orbColor = STATE_COLORS[state];
  const defaultLabel = STATE_LABELS[state];
  const ariaLabel = label || defaultLabel;

  return (
    <div
      className={`thinking-orb ${className}`}
      data-state={state}
      style={{
        '--orb-size': `${orbSize}px`,
        '--orb-color': orbColor,
      } as React.CSSProperties}
      role="status"
      aria-live={ariaLive}
      aria-label={ariaLabel}
      aria-busy={state === 'thinking' || state === 'processing'}
    >
      {prefersReducedMotion && state !== 'success' && state !== 'error' && (
        <span className="sr-only">{ariaLabel}</span>
      )}
      {!prefersReducedMotion && (
        <>
          {state === 'success' && (
            <svg className="w-1/2 h-1/2 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {state === 'error' && (
            <svg className="w-1/2 h-1/2 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
        </>
      )}
    </div>
  );
}

interface ThinkingOrbGroupProps {
  orbs: Array<{
    id: string;
    state: OrbState;
    label?: string;
  }>;
  size?: OrbSize;
  className?: string;
}

export function ThinkingOrbGroup({ 
  orbs, 
  size = 'md', 
  className = '',
}: ThinkingOrbGroupProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`} role="group" aria-label="Estados de proceso">
      {orbs.map(({ id, state, label }) => (
        <ThinkingOrb key={id} state={state} size={size} label={label} />
      ))}
    </div>
  );
}

export function useThinkingOrbState() {
  const [orbs, setOrbs] = useState<Array<{ id: string; state: OrbState; label: string }>>([
    { id: 'validacion', state: 'thinking', label: 'Validando entrada...' },
    { id: 'procesamiento', state: 'thinking', label: 'Procesando lógica...' },
    { id: 'sincronizacion', state: 'thinking', label: 'Sincronizando bóveda...' },
  ]);

  const setOrbState = (id: string, state: OrbState, label?: string) => {
    setOrbs(prev => prev.map(orb => 
      orb.id === id ? { ...orb, state, label: label || orb.label } : orb
    ));
  };

  const resetAll = () => {
    setOrbs(prev => prev.map(orb => ({ ...orb, state: 'thinking' as OrbState })));
  };

  return { orbs, setOrbState, resetAll };
}