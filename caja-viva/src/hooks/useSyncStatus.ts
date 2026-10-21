import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchHealth,
  hasRemoteBackend,
  syncNow,
  type SyncConnState,
} from '../services/syncService';
import { syncQueueRepository } from '../db/repositories';

export interface SyncStatus {
  state: SyncConnState;
  pending: number;
  engine: string | null;
  latencyMs: number | null;
  lastSyncAt: string | null;
  lastMessage: string | null;
  syncing: boolean;
  refresh: () => Promise<void>;
  runSync: () => Promise<void>;
}

const REFRESH_MS = 60_000;
const CELEBRATION_MS = 5_000;

/**
 * Estado de sincronizacion con Neon.
 * - 'disabled': no hay VITE_API_URL (build local/offline puro)
 * - 'offline': backend inalcanzable (Render dormido o sin red)
 * - 'pending': hay items en la cola local
 * - 'synced': cola vacia + health OK
 */
export function useSyncStatus(): SyncStatus {
  const [state, setState] = useState<SyncConnState>(hasRemoteBackend() ? 'checking' : 'disabled');
  const [pending, setPending] = useState(0);
  const [engine, setEngine] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const mounted = useRef(true);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!mounted.current) return;

    let colaPendiente = 0;
    try {
      const stats = await syncQueueRepository.getEstadisticas();
      colaPendiente = stats.pendientes;
    } catch {
      colaPendiente = 0;
    }
    if (mounted.current) setPending(colaPendiente);

    if (!hasRemoteBackend()) {
      if (mounted.current) setState('disabled');
      return;
    }

    const health = await fetchHealth();
    if (!mounted.current) return;

    if (!health) {
      setState('offline');
      setEngine(null);
      return;
    }

    setEngine(health.db_engine ?? null);
    setLatencyMs(typeof health.db_latency_ms === 'number' ? health.db_latency_ms : null);

    if (health.db_status === 'connected') {
      setLastSyncAt(health.timestamp ?? new Date().toISOString());
      setState(colaPendiente > 0 ? 'pending' : 'synced');
    } else {
      setState('error');
    }
  }, []);

  const runSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncNow();
      if (!mounted.current) return;

      if (!result.ok) {
        setState(result.health ? 'error' : 'offline');
        setLastMessage(result.error ?? 'No se pudo sincronizar');
        await refresh();
        return;
      }

      setLastSyncAt(new Date().toISOString());
      setLastMessage(
        result.sinPendientes
          ? 'Todo al dia'
          : `${result.sincronizados} movimiento(s) sincronizado(s)`,
      );
      setState('synced');

      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      celebrationTimer.current = setTimeout(() => {
        if (mounted.current) setLastMessage(null);
      }, CELEBRATION_MS);

      await refresh();
    } finally {
      if (mounted.current) setSyncing(false);
    }
  }, [refresh, syncing]);

  useEffect(() => {
    mounted.current = true;
    void refresh();

    const interval = setInterval(() => void refresh(), REFRESH_MS);
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);

    return () => {
      mounted.current = false;
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOnline);
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    };
  }, [refresh]);

  return {
    state,
    pending,
    engine,
    latencyMs,
    lastSyncAt,
    lastMessage,
    syncing,
    refresh,
    runSync,
  };
}
