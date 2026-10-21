import { createBaseRepository } from './base';
import { getDB } from '../schema';
import type { SyncQueueItem, UUID } from '../types';

const baseRepo = createBaseRepository<SyncQueueItem>('sync_queue');

export const syncQueueRepository = {
  ...baseRepo,

  async getPendientes(limit = 50): Promise<SyncQueueItem[]> {
    const db = await getDB();
    const pendientes = await db.getAllFromIndex('sync_queue', 'by-estado', 'PENDIENTE');
    return pendientes
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(0, limit);
  },

  /**
   * Items en ERROR que aun se pueden reintentar (hasta 5 intentos).
   * Se reintentan automaticamente en cada sincronizacion.
   */
  async getReintentables(limit = 50, maxReintentos = 5): Promise<SyncQueueItem[]> {
    const db = await getDB();
    const errores = await db.getAllFromIndex('sync_queue', 'by-estado', 'ERROR');
    return errores
      .filter(item => item.reintentos < maxReintentos)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(0, limit);
  },

  /** Devuelve a PENDIENTE todos los items en ERROR para reintentarlos. */
  async resetErrores(): Promise<number> {
    const db = await getDB();
    const errores = await db.getAllFromIndex('sync_queue', 'by-estado', 'ERROR');
    const tx = db.transaction('sync_queue', 'readwrite');
    for (const item of errores) {
      await tx.objectStore('sync_queue').put({ ...item, estado: 'PENDIENTE', error_mensaje: null });
    }
    await tx.done;
    return errores.length;
  },

  async getByTipo(tipo: SyncQueueItem['tipo_entidad']): Promise<SyncQueueItem[]> {
    const db = await getDB();
    return db.getAllFromIndex('sync_queue', 'by-tipo', tipo);
  },

  async enqueue(item: Omit<SyncQueueItem, 'id' | 'reintentos' | 'estado' | 'error_mensaje'>): Promise<SyncQueueItem> {
    const db = await getDB();
    const newItem: SyncQueueItem = {
      ...item,
      id: crypto.randomUUID(),
      reintentos: 0,
      estado: 'PENDIENTE',
      error_mensaje: null,
    };
    await db.add('sync_queue', newItem);
    return newItem;
  },

  async markProcesando(id: UUID): Promise<void> {
    const db = await getDB();
    const item = await db.get('sync_queue', id);
    if (item) {
      item.estado = 'PROCESANDO';
      await db.put('sync_queue', item);
    }
  },

  async markCompletado(id: UUID): Promise<void> {
    const db = await getDB();
    const item = await db.get('sync_queue', id);
    if (item) {
      item.estado = 'COMPLETADO';
      await db.put('sync_queue', item);
    }
  },

  async markError(id: UUID, error: string): Promise<void> {
    const db = await getDB();
    const item = await db.get('sync_queue', id);
    if (item) {
      item.estado = 'ERROR';
      item.reintentos += 1;
      item.error_mensaje = error;
      await db.put('sync_queue', item);
    }
  },

  async getEstadisticas(): Promise<{ pendientes: number; procesando: number; completados: number; errores: number }> {
    const db = await getDB();
    const all = await db.getAll('sync_queue');
    return {
      pendientes: all.filter(i => i.estado === 'PENDIENTE').length,
      procesando: all.filter(i => i.estado === 'PROCESANDO').length,
      completados: all.filter(i => i.estado === 'COMPLETADO').length,
      errores: all.filter(i => i.estado === 'ERROR').length,
    };
  },

  async limpiarCompletados(antesDe: string): Promise<number> {
    const db = await getDB();
    const all = await db.getAllFromIndex('sync_queue', 'by-estado', 'COMPLETADO');
    const aEliminar = all.filter(i => i.timestamp < antesDe);
    const tx = db.transaction('sync_queue', 'readwrite');
    await Promise.all(aEliminar.map(i => tx.objectStore('sync_queue').delete(i.id)));
    await tx.done;
    return aEliminar.length;
  },
};