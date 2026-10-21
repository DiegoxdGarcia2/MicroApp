import type { SyncConnState } from '../../services/syncService';

interface SyncBadgeProps {
  state: SyncConnState;
  pending: number;
  syncing: boolean;
  onSync: () => void;
}

const CONFIG: Record<SyncConnState, { label: string; dot: string; text: string; help: string }> = {
  checking: {
    label: 'Verificando',
    dot: 'bg-slate-400',
    text: 'text-muted',
    help: 'Comprobando conexion con el servidor',
  },
  synced: {
    label: 'Sincronizado',
    dot: 'bg-green-500',
    text: 'text-green-700',
    help: 'Todo sincronizado con Neon. Clic para volver a sincronizar',
  },
  pending: {
    label: 'Pendiente',
    dot: 'bg-amber-500',
    text: 'text-amber-700',
    help: 'Hay movimientos esperando sincronizacion. Clic para sincronizar',
  },
  offline: {
    label: 'Sin conexion',
    dot: 'bg-slate-400',
    text: 'text-muted',
    help: 'No se alcanza el servidor. Tus datos siguen seguros en el dispositivo',
  },
  error: {
    label: 'Error de sync',
    dot: 'bg-red-500',
    text: 'text-red-600',
    help: 'El servidor no pudo confirmar la sincronizacion. Clic para reintentar',
  },
  disabled: {
    label: 'Modo local',
    dot: 'bg-slate-300',
    text: 'text-muted',
    help: 'Sin backend configurado: la app funciona 100% offline',
  },
};

/** Indicador compacto del header: punto de color + estado + pendientes. */
export function SyncBadge({ state, pending, syncing, onSync }: SyncBadgeProps) {
  const cfg = CONFIG[state];
  const disabled = syncing || state === 'disabled';

  return (
    <button
      type="button"
      onClick={onSync}
      disabled={disabled}
      title={cfg.help}
      aria-live="polite"
      aria-label={`Estado de sincronizacion: ${cfg.label}${pending > 0 ? `, ${pending} pendientes` : ''}`}
      className="inline-flex items-center gap-2 rounded-full border border-surface-alt bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-alt disabled:cursor-default disabled:opacity-80"
    >
      {syncing ? (
        <span
          className="h-3 w-3 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      )}
      <span className={cfg.text}>{syncing ? 'Sincronizando' : cfg.label}</span>
      {pending > 0 && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
          {pending}
        </span>
      )}
    </button>
  );
}

interface SyncToastProps {
  message: string;
}

/** Aviso flotante tras una sincronizacion exitosa con Neon. */
export function SyncToast({ message }: SyncToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
