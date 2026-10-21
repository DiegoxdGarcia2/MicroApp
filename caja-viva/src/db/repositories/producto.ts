import { createBaseRepository } from './base';
import { getDB } from '../schema';
import type { Producto, UUID } from '../types';

const baseRepo = createBaseRepository<Producto>('productos');

export const productoRepository = {
  ...baseRepo,

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
    const lower = query.toLowerCase();
    return all.filter(p => 
      p.nombre.toLowerCase().includes(lower) ||
      p.codigo_barras?.toLowerCase().includes(lower) ||
      p.categoria?.toLowerCase().includes(lower)
    );
  },

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