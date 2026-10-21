import { createBaseRepository } from './base';
import { getDB } from '../schema';
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

  async createWithStockUpdate(
    movimiento: MovimientoStock,
    _productoRepository: { updateStock: (id: UUID, delta: number) => Promise<any> }
  ): Promise<MovimientoStock> {
    const db = await getDB();
    const tx = db.transaction(['movimientos_stock', 'productos'], 'readwrite');
    
    await tx.objectStore('movimientos_stock').add(movimiento);
    
    const delta = movimiento.tipo === 'ENTRADA' ? movimiento.cantidad : -movimiento.cantidad;
    const producto = await tx.objectStore('productos').get(movimiento.producto_id);
    if (producto) {
      const nuevoStock = Math.max(0, producto.stock_actual + delta);
      await tx.objectStore('productos').put({
        ...producto,
        stock_actual: nuevoStock,
        actualizado_en: new Date().toISOString(),
      });
    }
    
    await tx.done;
    return movimiento;
  },
};