import { createBaseRepository } from './base';
import { getDB } from '../schema';
import type { Venta, DetalleVenta, UUID } from '../types';

const ventaBaseRepo = createBaseRepository<Venta>('ventas');
const detalleBaseRepo = createBaseRepository<DetalleVenta>('detalles_venta');

export const ventaRepository = {
  ...ventaBaseRepo,

  async getByFecha(fecha: string): Promise<Venta[]> {
    const db = await getDB();
    return db.getAllFromIndex('ventas', 'by-fecha', fecha);
  },

  async getByEstadoSync(estado: Venta['estado_sync']): Promise<Venta[]> {
    const db = await getDB();
    return db.getAllFromIndex('ventas', 'by-estado-sync', estado);
  },

  async getByClientTxId(clientTxId: UUID): Promise<Venta | undefined> {
    const db = await getDB();
    return db.getFromIndex('ventas', 'by-client-tx', clientTxId);
  },

  async getPendientesSync(limit = 100): Promise<Venta[]> {
    const db = await getDB();
    const pendientes = await db.getAllFromIndex('ventas', 'by-estado-sync', 'PENDIENTE');
    return pendientes.slice(0, limit);
  },

  async markSynced(ids: UUID[], sincronizadoEn: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('ventas', 'readwrite');
    await Promise.all(ids.map(id => 
      tx.objectStore('ventas').get(id).then(venta => {
        if (venta) {
          venta.estado_sync = 'SINCRONIZADO';
          venta.sincronizado_en = sincronizadoEn;
          return tx.objectStore('ventas').put(venta);
        }
      })
    ));
    await tx.done;
  },

  async getWithDetalles(id: UUID): Promise<{ venta: Venta; detalles: DetalleVenta[] } | undefined> {
    const db = await getDB();
    const venta = await db.get('ventas', id);
    if (!venta) return undefined;
    const detalles = await db.getAllFromIndex('detalles_venta', 'by-venta', id);
    return { venta, detalles };
  },
};

export const detalleVentaRepository = {
  ...detalleBaseRepo,

  async getByVenta(ventaId: UUID): Promise<DetalleVenta[]> {
    const db = await getDB();
    return db.getAllFromIndex('detalles_venta', 'by-venta', ventaId);
  },

  async getByProducto(productoId: UUID): Promise<DetalleVenta[]> {
    const db = await getDB();
    return db.getAllFromIndex('detalles_venta', 'by-producto', productoId);
  },

  async createBatch(detalles: DetalleVenta[]): Promise<DetalleVenta[]> {
    const db = await getDB();
    const tx = db.transaction('detalles_venta', 'readwrite');
    await Promise.all(detalles.map(d => tx.objectStore('detalles_venta').add(d)));
    await tx.done;
    return detalles;
  },
};