import { createBaseRepository } from './base';
import { getDB } from '../schema';
import { nowISO } from '../schema';
import { syncQueueRepository } from './syncQueue';
import type { MovimientoStock, UUID } from '../types';

const baseRepo = createBaseRepository<MovimientoStock>('movimientos_stock');

export const movimientoStockRepository = {
  ...baseRepo,

  async getByProducto(productoId: UUID): Promise<MovimientoStock[]> {
    const db = await getDB();
    return db.getAllFromIndex('movimientos_stock', 'by-producto', productoId);
  },

  async getByFecha(fecha: string): Promise<MovimientoStock[]> {
    const db = await getDB();
    return db.getAllFromIndex('movimientos_stock', 'by-fecha', fecha);
  },

  async getByTipo(tipo: MovimientoStock['tipo']): Promise<MovimientoStock[]> {
    const db = await getDB();
    return db.getAllFromIndex('movimientos_stock', 'by-tipo', tipo);
  },

  /**
   * Registra un movimiento de stock y actualiza el producto en una sola
   * transaccion local. Luego lo encola para que el backend aplique el mismo
   * ajuste (ENTRADA suma, SALIDA/MERMA restan, AJUSTE fija el stock final).
   */
  async createWithStockUpdate(
    movimiento: MovimientoStock,
    _productoRepository?: { updateStock: (id: UUID, delta: number) => Promise<unknown> },
  ): Promise<MovimientoStock> {
    const db = await getDB();
    const tx = db.transaction(['movimientos_stock', 'productos'], 'readwrite');
    
    await tx.objectStore('movimientos_stock').add(movimiento);
    
    const producto = await tx.objectStore('productos').get(movimiento.producto_id);
    if (producto) {
      const nuevoStock = movimiento.tipo === 'AJUSTE'
        ? Math.max(0, movimiento.cantidad)
        : Math.max(0, producto.stock_actual + (movimiento.tipo === 'ENTRADA' ? movimiento.cantidad : -movimiento.cantidad));
      await tx.objectStore('productos').put({
        ...producto,
        stock_actual: nuevoStock,
        actualizado_en: new Date().toISOString(),
      });
    }
    
    await tx.done;

    try {
      await syncQueueRepository.enqueue({
        tipo_entidad: 'MOVIMIENTO_STOCK',
        accion: 'CREATE',
        entity_id: movimiento.id,
        client_tx_id: crypto.randomUUID(),
        payload: movimiento as unknown as Record<string, unknown>,
        timestamp: nowISO(),
      });
    } catch (error) {
      console.error('No se pudo encolar el movimiento de stock:', error);
    }

    return movimiento;
  },
};
