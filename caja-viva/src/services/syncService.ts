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
  errores: number;
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
  pagos?: Array<{ metodo: string; monto: number }>;
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
      pagos: venta.pagos && venta.pagos.length > 0
        ? venta.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto }))
        : [{ metodo: venta.metodo_pago ?? 'EFECTIVO', monto: venta.total ?? 0 }],
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
      errores: 0,
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
      errores: 0,
      conflictos: 0,
      error: 'Sin conexion con el servidor',
      health: null,
    };
  }

  const pendientesNuevos = await syncQueueRepository.getPendientes(100);
  const reintentos = await syncQueueRepository.getReintentables(Math.max(0, 100 - pendientesNuevos.length));
  // Orden cronologico global: un PRODUCTO fallido debe reintentarse antes que
  // la VENTA posterior que depende de el.
  const pendientes = [...pendientesNuevos, ...reintentos].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  if (pendientes.length === 0) {
    return {
      ok: true,
      sincronizados: 0,
      duplicados: 0,
      errores: 0,
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
        errores: pendientes.length,
        conflictos: 0,
        error: detalle,
        health,
      };
    }

    const data = (await res.json()) as {
      sincronizados?: number;
      duplicados?: number;
      conflictos?: unknown[];
      resultados?: Array<{
        client_transaction_id: string;
        entity_id: string;
        status: 'OK' | 'DUPLICADO' | 'CONFLICTO';
        error?: string | null;
      }>;
    };

    const porTransaccion = new Map(
      (data.resultados ?? []).map((r) => [r.client_transaction_id, r]),
    );

    let sincronizados = 0;
    let duplicados = 0;
    let errores = 0;

    for (const item of pendientes) {
      const resultado = porTransaccion.get(item.client_tx_id);
      // Backend antiguo sin `resultados`: asumimos que el lote fue aceptado.
      if (!resultado) {
        await syncQueueRepository.markCompletado(item.id);
        sincronizados += 1;
        continue;
      }
      if (resultado.status === 'CONFLICTO') {
        await syncQueueRepository.markError(item.id, resultado.error ?? 'Conflicto al sincronizar');
        errores += 1;
      } else {
        await syncQueueRepository.markCompletado(item.id);
        if (resultado.status === 'DUPLICADO') duplicados += 1;
        else sincronizados += 1;
      }
    }

    return {
      ok: errores === 0,
      sincronizados,
      duplicados,
      errores,
      conflictos: data.conflictos?.length ?? errores,
      health,
      error: errores > 0 ? `${errores} movimiento(s) no se pudieron sincronizar` : undefined,
    };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error de red';
    await Promise.all(pendientes.map((p) => syncQueueRepository.markError(p.id, mensaje)));
    return {
      ok: false,
      sincronizados: 0,
      duplicados: 0,
      errores: pendientes.length,
      conflictos: 0,
      error: mensaje,
      health,
    };
  }
}
