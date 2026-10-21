import type { SyncQueueItem } from '../db/types';
import { syncQueueRepository } from '../db/repositories';

/** Estado de conexion con el backend/Neon. */
export type SyncConnState = 'checking' | 'synced' | 'pending' | 'offline' | 'error' | 'disabled';

export interface BackendHealth {
  status?: string;
  db_status?: string;
  db_engine?: string;
  db_latency_ms?: number;
  timestamp?: string;
  version?: string;
}

export interface SyncResult {
  ok: boolean;
  sincronizados: number;
  duplicados: number;
  conflictos: number;
  error?: string;
  health?: BackendHealth | null;
  sinPendientes?: boolean;
}

const HEALTH_TIMEOUT_MS = 7000;
const PUSH_TIMEOUT_MS = 20000;

/** URL base del backend inyectada en build time por Vercel (VITE_API_URL). */
export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
  return raw.trim().replace(/\/+$/, '');
}

export function hasRemoteBackend(): boolean {
  return getApiBaseUrl().length > 0;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Comprueba /api/v1/health (incluye ping real a Neon). */
export async function fetchHealth(): Promise<BackendHealth | null> {
  const base = getApiBaseUrl();
  if (!base) return null;

  try {
    const res = await fetchWithTimeout(
      `${base}/api/v1/health`,
      { headers: { Accept: 'application/json' } },
      HEALTH_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    return (await res.json()) as BackendHealth;
  } catch {
    return null;
  }
}

interface BackendTransaction {
  tipo: string;
  accion: string;
  entidad_id: string;
  client_transaction_id: string;
  timestamp_local: string;
  payload: Record<string, unknown>;
}

interface VentaPayload {
  fecha?: string;
  total?: number;
  metodo_pago?: string;
}

interface DetallePayload {
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
}

/**
 * El backend espera un payload plano para VENTA; la cola local guarda
 * { venta, detalles }. Aqui se aplana y se agrega el pago unico.
 */
export function toBackendTransaction(item: SyncQueueItem): BackendTransaction {
  const base: BackendTransaction = {
    tipo: item.tipo_entidad,
    accion: item.accion,
    entidad_id: item.entity_id,
    client_transaction_id: item.client_tx_id,
    timestamp_local: item.timestamp,
    payload: item.payload,
  };

  if (item.tipo_entidad !== 'VENTA') return base;

  const venta = item.payload.venta as VentaPayload | undefined;
  if (!venta) return base;

  const detalles = (item.payload.detalles as DetallePayload[] | undefined) ?? [];
  return {
    ...base,
    payload: {
      id: item.entity_id,
      fecha: venta.fecha ?? item.timestamp,
      total: venta.total ?? 0,
      metodo_pago: venta.metodo_pago ?? 'EFECTIVO',
      items: detalles.map((d) => ({
        producto_id: d.producto_id,
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario,
      })),
      pagos: [{ metodo: venta.metodo_pago ?? 'EFECTIVO', monto: venta.total ?? 0 }],
    },
  };
}

/**
 * Empuja la cola local al backend y devuelve el resumen.
 * Marca cada item COMPLETADO o ERROR segun el resultado.
 */
export async function syncNow(): Promise<SyncResult> {
  const base = getApiBaseUrl();
  if (!base) {
    return {
      ok: false,
      sincronizados: 0,
      duplicados: 0,
      conflictos: 0,
      error: 'Backend no configurado (VITE_API_URL)',
    };
  }

  const health = await fetchHealth();
  if (!health) {
    return {
      ok: false,
      sincronizados: 0,
      duplicados: 0,
      conflictos: 0,
      error: 'Sin conexion con el servidor',
      health: null,
    };
  }

  const pendientes = await syncQueueRepository.getPendientes(100);
  if (pendientes.length === 0) {
    return {
      ok: true,
      sincronizados: 0,
      duplicados: 0,
      conflictos: 0,
      health,
      sinPendientes: true,
    };
  }

  const transacciones = pendientes.map(toBackendTransaction);

  try {
    const res = await fetchWithTimeout(
      `${base}/api/v1/sync/push`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ transacciones }),
      },
      PUSH_TIMEOUT_MS,
    );

    if (!res.ok) {
      const detalle = `HTTP ${res.status}`;
      await Promise.all(pendientes.map((p) => syncQueueRepository.markError(p.id, detalle)));
      return {
        ok: false,
        sincronizados: 0,
        duplicados: 0,
        conflictos: 0,
        error: detalle,
        health,
      };
    }

    const data = (await res.json()) as {
      sincronizados?: number;
      duplicados?: number;
      conflictos?: unknown[];
    };

    await Promise.all(pendientes.map((p) => syncQueueRepository.markCompletado(p.id)));

    return {
      ok: true,
      sincronizados: data.sincronizados ?? pendientes.length,
      duplicados: data.duplicados ?? 0,
      conflictos: data.conflictos?.length ?? 0,
      health,
    };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error de red';
    await Promise.all(pendientes.map((p) => syncQueueRepository.markError(p.id, mensaje)));
    return {
      ok: false,
      sincronizados: 0,
      duplicados: 0,
      conflictos: 0,
      error: mensaje,
      health,
    };
  }
}
