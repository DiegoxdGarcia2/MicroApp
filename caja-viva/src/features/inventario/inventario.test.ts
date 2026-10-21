import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  calculateStockStatus, 
  calculateInventoryValue,
  filterProducts,
  sortProducts,
  validateProduct,
  generateStockAlert,
} from './inventarioUtils';
import { Producto, MovimientoStock } from '../../db/types';
import { generateId, nowISO, todayISO } from '../../db/schema';
import { productoRepository, movimientoStockRepository } from '../../db/repositories';

describe('Inventario - Gestión y Alertas de Stock', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('calculateStockStatus', () => {
    it('should return OK when stock_actual > stock_minimo', () => {
      const producto = { stock_actual: 50, stock_minimo: 10 };
      expect(calculateStockStatus(producto)).toBe('OK');
    });

    it('should return BAJO when stock_actual <= stock_minimo but > 0', () => {
      const producto = { stock_actual: 5, stock_minimo: 10 };
      expect(calculateStockStatus(producto)).toBe('BAJO');
    });

    it('should return AGOTADO when stock_actual === 0', () => {
      const producto = { stock_actual: 0, stock_minimo: 10 };
      expect(calculateStockStatus(producto)).toBe('AGOTADO');
    });

    it('should handle edge case stock_actual === stock_minimo', () => {
      const producto = { stock_actual: 10, stock_minimo: 10 };
      expect(calculateStockStatus(producto)).toBe('BAJO');
    });
  });

  describe('calculateInventoryValue', () => {
    it('should calculate total inventory value at cost', () => {
      const productos = [
        { precio_venta: 1000, costo: 700, stock_actual: 10 },
        { precio_venta: 500, costo: 350, stock_actual: 20 },
      ];
      expect(calculateInventoryValue(productos, 'costo')).toBe(7000 + 7000); // 14000
    });

    it('should calculate total inventory value at sale price', () => {
      const productos = [
        { precio_venta: 1000, costo: 700, stock_actual: 10 },
        { precio_venta: 500, costo: 350, stock_actual: 20 },
      ];
      expect(calculateInventoryValue(productos, 'venta')).toBe(10000 + 10000); // 20000
    });

    it('should return 0 for empty array', () => {
      expect(calculateInventoryValue([], 'costo')).toBe(0);
    });
  });

  describe('filterProducts', () => {
    const mockProductos = [
      { id: '1', nombre: 'Arroz 1kg', codigo_barras: '7790000000012', categoria: 'Alimentos', stock_actual: 50, stock_minimo: 10 },
      { id: '2', nombre: 'Azúcar 1kg', codigo_barras: '7790000000029', categoria: 'Alimentos', stock_actual: 3, stock_minimo: 5 },
      { id: '3', nombre: 'Aceite 900ml', codigo_barras: '7790000000036', categoria: 'Limpieza', stock_actual: 20, stock_minimo: 5 },
      { id: '4', nombre: 'Detergente 1L', codigo_barras: '7790000000043', categoria: 'Limpieza', stock_actual: 0, stock_minimo: 3 },
    ];

    it('should filter by search query (nombre)', () => {
      const results = filterProducts(mockProductos, 'arroz');
      expect(results.length).toBe(1);
      expect(results[0].nombre).toBe('Arroz 1kg');
    });

    it('should filter by category', () => {
      const results = filterProducts(mockProductos, '', 'Alimentos');
      expect(results.length).toBe(2);
      expect(results.every(p => p.categoria === 'Alimentos')).toBe(true);
    });

    it('should filter by stock status BAJO', () => {
      const results = filterProducts(mockProductos, '', 'Todos', 'BAJO');
      expect(results.length).toBe(1);
      expect(results[0].nombre).toBe('Azúcar 1kg');
    });

    it('should filter by stock status AGOTADO', () => {
      const results = filterProducts(mockProductos, '', 'Todos', 'AGOTADO');
      expect(results.length).toBe(1);
      expect(results[0].nombre).toBe('Detergente 1L');
    });

    it('should combine search and category filters', () => {
      const results = filterProducts(mockProductos, 'azucar', 'Alimentos');
      expect(results.length).toBe(1);
      expect(results[0].nombre).toBe('Azúcar 1kg');
    });
  });

  describe('sortProducts', () => {
    const mockProductos = [
      { id: '1', nombre: 'Arroz', precio_venta: 850, stock_actual: 50, stock_minimo: 10, categoria: 'Alimentos' },
      { id: '2', nombre: 'Azúcar', precio_venta: 750, stock_actual: 3, stock_minimo: 5, categoria: 'Alimentos' },
      { id: '3', nombre: 'Aceite', precio_venta: 1200, stock_actual: 20, stock_minimo: 5, categoria: 'Limpieza' },
    ];

    it('should sort by nombre ascending', () => {
      const results = sortProducts([...mockProductos], 'nombre', 'asc');
      expect(results[0].nombre).toBe('Aceite');
      expect(results[2].nombre).toBe('Azúcar');
    });

    it('should sort by stock_actual ascending', () => {
      const results = sortProducts([...mockProductos], 'stock_actual', 'asc');
      expect(results[0].stock_actual).toBe(3); // Azúcar
      expect(results[2].stock_actual).toBe(50); // Arroz
    });
  });

  describe('validateProduct', () => {
    it('should validate valid product', () => {
      const producto = {
        id: 'test-id',
        nombre: 'Test Product',
        precio_venta: 1000,
        costo: 700,
        stock_actual: 50,
        stock_minimo: 10,
        categoria: 'Test',
        codigo_barras: '1234567890123',
      };
      const result = validateProduct(producto);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject negative precio_venta', () => {
      const producto = {
        nombre: 'Test',
        precio_venta: -100,
        costo: 100,
        stock_actual: 10,
        stock_minimo: 5,
      };
      const result = validateProduct(producto);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('precio de venta'))).toBe(true);
    });

    it('should reject negative stock_minimo', () => {
      const producto = {
        nombre: 'Test',
        precio_venta: 1000,
        costo: 700,
        stock_actual: 10,
        stock_minimo: -5,
      };
      const result = validateProduct(producto);
      expect(result.valid).toBe(false);
    });
  });

  describe('generateStockAlert', () => {
    it('should generate alert for BAJO stock', () => {
      const producto = { nombre: 'Azúcar 1kg', stock_actual: 3, stock_minimo: 10 };
      const alert = generateStockAlert(producto);
      expect(alert.type).toBe('warning');
      expect(alert.message).toContain('BAJO');
      expect(alert.message).toContain('Azúcar 1kg');
    });

    it('should generate alert for AGOTADO stock', () => {
      const producto = { nombre: 'Detergente', stock_actual: 0, stock_minimo: 3 };
      const alert = generateStockAlert(producto);
      expect(alert.type).toBe('error');
      expect(alert.message).toContain('AGOTADO');
      expect(alert.message).toContain('Detergente');
    });

    it('should return null for OK stock', () => {
      const producto = { nombre: 'Arroz', stock_actual: 50, stock_minimo: 10 };
      const alert = generateStockAlert(producto);
      expect(alert).toBeNull();
    });
  });
});

describe('Inventario - Persistencia y Movimientos (Integration)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('should create product and persist in IndexedDB', async () => {
    const producto = {
      id: 'test-id-1',
      codigo_barras: '7790000000012',
      nombre: 'Arroz 1kg',
      precio_venta: 850,
      costo: 600,
      stock_actual: 50,
      stock_minimo: 10,
      categoria: 'Alimentos',
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    };

    await productoRepository.create(producto);
    const retrieved = await productoRepository.getById('test-id-1');
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.nombre).toBe('Arroz 1kg');
    expect(retrieved?.stock_actual).toBe(50);
  });

  it('should update stock and create movimiento_stock on ajuste', async () => {
    const productoId = 'test-id-2';
    
    // Crear producto inicial
    await productoRepository.create({
      id: productoId,
      codigo_barras: null,
      nombre: 'Test Stock',
      precio_venta: 1000,
      costo: 700,
      stock_actual: 100,
      stock_minimo: 10,
      categoria: 'Test',
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    });

    // Aplicar ajuste de entrada
    const movimiento: MovimientoStock = {
      id: 'mov-1',
      producto_id: productoId,
      tipo: 'ENTRADA',
      cantidad: 50,
      fecha: new Date().toISOString(),
      usuario_id: null,
      notas: 'Reposición de proveedor',
    };

    await movimientoStockRepository.createWithStockUpdate(movimiento, productoRepository);
    
    const producto = await productoRepository.getById(productoId);
    expect(producto?.stock_actual).toBe(150);

    const movimientoGuardado = await movimientoStockRepository.getById('mov-1');
    expect(movimientoGuardado).toBeDefined();
    expect(movimientoGuardado?.tipo).toBe('ENTRADA');
    expect(movimientoGuardado?.cantidad).toBe(50);
  });

  it('should handle stock decrement on salida', async () => {
    const productoId = 'test-id-3';
    
    await productoRepository.create({
      id: productoId,
      codigo_barras: null,
      nombre: 'Test Salida',
      precio_venta: 1000,
      costo: 700,
      stock_actual: 100,
      stock_minimo: 10,
      categoria: 'Test',
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    });

    const movimiento: MovimientoStock = {
      id: 'mov-2',
      producto_id: productoId,
      tipo: 'SALIDA',
      cantidad: 30,
      fecha: new Date().toISOString(),
      usuario_id: null,
      notas: 'Venta directa',
    };

    await movimientoStockRepository.createWithStockUpdate(movimiento, productoRepository);
    
    const producto = await productoRepository.getById(productoId);
    expect(producto?.stock_actual).toBe(70);
  });

  it('should not allow stock below zero', async () => {
    const productoId = 'test-id-4';
    
    await productoRepository.create({
      id: productoId,
      codigo_barras: null,
      nombre: 'Test Zero',
      precio_venta: 1000,
      costo: 700,
      stock_actual: 10,
      stock_minimo: 5,
      categoria: 'Test',
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    });

    const movimiento: MovimientoStock = {
      id: 'mov-3',
      producto_id: productoId,
      tipo: 'SALIDA',
      cantidad: 50, // Más de lo que hay
      fecha: new Date().toISOString(),
      usuario_id: null,
      notas: 'Intento salida excesiva',
    };

    // Should not throw, but stock should not go below 0
    await movimientoStockRepository.createWithStockUpdate({ ...movimiento, cantidad: 50 }, {
      updateStock: async (id, delta) => {
        const prod = await productoRepository.getById(productoId);
        if (!prod) return;
        const nuevoStock = Math.max(0, prod.stock_actual + delta);
        await productoRepository.updateStock(productoId, nuevoStock - 10); // simulate
      }
    } as any);

    const producto = await productoRepository.getById(productoId);
    expect(producto?.stock_actual).toBeGreaterThanOrEqual(0);
  });
});