import { productoRepository } from '../../db/repositories';
import type { Producto } from '../../db/types';

/**
 * Catalogo de demostracion: 10 productos tipicos de una tienda de barrio
 * de Santa Cruz de la Sierra. Precios en Bs (la app trabaja en Bs).
 *
 * Los codigos usan el prefijo DEMO- para poder detectar si ya se cargaron
 * y evitar duplicados.
 */
export interface DemoProducto {
  nombre: string;
  codigo_barras: string;
  precio_venta: number;
  costo: number;
  stock_actual: number;
  stock_minimo: number;
  categoria: string;
}

export const DEMO_PRODUCTS: readonly DemoProducto[] = [
  {
    nombre: 'Pan de arroz',
    codigo_barras: 'DEMO-001',
    precio_venta: 5,
    costo: 2.5,
    stock_actual: 40,
    stock_minimo: 10,
    categoria: 'Panificados',
  },
  {
    nombre: 'Cuñapé',
    codigo_barras: 'DEMO-002',
    precio_venta: 3,
    costo: 1.5,
    stock_actual: 60,
    stock_minimo: 15,
    categoria: 'Panificados',
  },
  {
    nombre: 'Empanada de queso',
    codigo_barras: 'DEMO-003',
    precio_venta: 4,
    costo: 2,
    stock_actual: 35,
    stock_minimo: 10,
    categoria: 'Panificados',
  },
  {
    nombre: 'Sonso de yuca',
    codigo_barras: 'DEMO-004',
    precio_venta: 4,
    costo: 2,
    stock_actual: 30,
    stock_minimo: 8,
    categoria: 'Panificados',
  },
  {
    nombre: 'Charque (porcion)',
    codigo_barras: 'DEMO-005',
    precio_venta: 15,
    costo: 10,
    stock_actual: 20,
    stock_minimo: 5,
    categoria: 'Comida',
  },
  {
    nombre: 'Queso fresco (kg)',
    codigo_barras: 'DEMO-006',
    precio_venta: 35,
    costo: 26,
    stock_actual: 12,
    stock_minimo: 4,
    categoria: 'Lácteos',
  },
  {
    nombre: 'Arroz flor (kg)',
    codigo_barras: 'DEMO-007',
    precio_venta: 8,
    costo: 6.5,
    stock_actual: 50,
    stock_minimo: 15,
    categoria: 'Abarrotes',
  },
  {
    nombre: 'Azucar (kg)',
    codigo_barras: 'DEMO-008',
    precio_venta: 7,
    costo: 5.5,
    stock_actual: 45,
    stock_minimo: 12,
    categoria: 'Abarrotes',
  },
  {
    nombre: 'Aceite de girasol 1L',
    codigo_barras: 'DEMO-009',
    precio_venta: 12,
    costo: 9.5,
    stock_actual: 24,
    stock_minimo: 6,
    categoria: 'Abarrotes',
  },
  {
    nombre: 'Gaseosa 2L',
    codigo_barras: 'DEMO-010',
    precio_venta: 10,
    costo: 7,
    stock_actual: 18,
    stock_minimo: 6,
    categoria: 'Bebidas',
  },
];

export interface SeedResult {
  insertados: number;
  omitidos: number;
}

/** Inserta el catalogo demo de forma idempotente. */
export async function seedDemoData(): Promise<SeedResult> {
  const now = new Date().toISOString();
  let insertados = 0;
  let omitidos = 0;

  for (const demo of DEMO_PRODUCTS) {
    const existente = await productoRepository.getByCodigo(demo.codigo_barras);
    if (existente) {
      omitidos += 1;
      continue;
    }

    const producto: Producto = {
      ...demo,
      id: crypto.randomUUID(),
      creado_en: now,
      actualizado_en: now,
    };
    await productoRepository.create(producto);
    insertados += 1;
  }

  return { insertados, omitidos };
}
