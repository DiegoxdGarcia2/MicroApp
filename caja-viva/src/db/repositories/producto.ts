import { createBaseRepository } from './base';
import { getDB } from '../schema';
import { nowISO } from '../schema';
import { syncQueueRepository } from './syncQueue';
import type { Producto, UUID } from '../types';

const baseRepo = createBaseRepository<Producto>('productos');

async function encolar(producto: Producto, accion: 'CREATE' | 'UPDATE' | 'DELETE'): Promise<void> {
  try {
    await syncQueueRepository.enqueue({
      tipo_entidad: 'PRODUCTO',
      accion,
      entity_id: producto.id,
      client_tx_id: crypto.randomUUID(),
      payload: accion === 'DELETE' ? { id: producto.id } : (producto as unknown as Record<string, unknown>),
      timestamp: nowISO(),
    });
  } catch (error) {
    // La operacion local ya quedo guardada; la cola se puede reintentar luego.
    console.error('No se pudo encolar el producto para sincronizar:', error);
  }
}

export const productoRepository = {
  ...baseRepo,

  async create(entity: Producto): Promise<Producto> {
    const created = await baseRepo.create(entity);
    await encolar(created, 'CREATE');
    return created;
  },

  async update(entity: Producto): Promise<Producto> {
    const updated = await baseRepo.update(entity);
    await encolar(updated, 'UPDATE');
    return updated;
  },

  async delete(id: UUID): Promise<void> {
    const existente = await baseRepo.getById(id);
    await baseRepo.delete(id);
    if (existente) await encolar(existente, 'DELETE');
  },

  async getByCodigo(codigo: string): Promise<Producto | undefined> {
    const db = await getDB();
    return db.getFromIndex('productos', 'by-codigo', codigo);
  },

  async getByCategoria(categoria: string): Promise<Producto[]> {
    const db = await getDB();
    return db.getAllFromIndex('productos', 'by-categoria', categoria);
  },

  async getStockCritico(): Promise<Producto[]> {
    const db = await getDB();
    const all = await db.getAll('productos');
    return all.filter(p => p.stock_actual <= p.stock_minimo && p.stock_minimo > 0);
  },

  async search(query: string): Promise<Producto[]> {
    const db = await getDB();
    const all = await db.getAll('productos');
    const normalizar = (texto: string) =>
      texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const lower = normalizar(query);
    return all.filter(p =>
      normalizar(p.nombre).includes(lower) ||
      (p.codigo_barras ? normalizar(p.codigo_barras).includes(lower) : false) ||
      (p.categoria ? normalizar(p.categoria).includes(lower) : false)
    );
  },

  /**
   * Actualiza stock localmente. No encola un PRODUCTO UPDATE: en las ventas el
   * backend descuenta el stock desde la transaccion VENTA, y en los ajustes
   * manuales desde MOVIMIENTO_STOCK. Encolar ambos duplicaria el descuento.
   */
  async updateStock(id: UUID, delta: number): Promise<Producto | undefined> {
    const db = await getDB();
    const producto = await db.get('productos', id);
    if (!producto) return undefined;
    
    const nuevoStock = Math.max(0, producto.stock_actual + delta);
    const updated: Producto = {
      ...producto,
      stock_actual: nuevoStock,
      actualizado_en: new Date().toISOString(),
    };
    await db.put('productos', updated);
    return updated;
  },
};
