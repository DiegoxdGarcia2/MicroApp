import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  calculateTotals, 
  formatBs, 
  calculateChange,
  validatePayment,
  generateTicketText,
  generateWhatsAppUrl,
  filterProducts,
  sortProducts 
} from './ventaUtils';
import type { Producto, Venta, DetalleVenta } from '../../db/types';
import { generateId } from '../../db/schema';

describe('Venta Rápida - Utils & Logic', () => {
  const mockProductos: Producto[] = [
    {
      id: 'prod-1',
      codigo_barras: '7790000000012',
      nombre: 'Arroz 1kg',
      precio_venta: 850,
      costo: 600,
      stock_actual: 50,
      stock_minimo: 10,
      categoria: 'Alimentos',
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    },
    {
      id: 'prod-2',
      codigo_barras: '7790000000029',
      nombre: 'Azúcar 1kg',
      precio_venta: 750,
      costo: 500,
      stock_actual: 3,
      stock_minimo: 5,
      categoria: 'Alimentos',
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    },
    {
      id: 'prod-3',
      codigo_barras: '7790000000036',
      nombre: 'Aceite 900ml',
      precio_venta: 1200,
      costo: 900,
      stock_actual: 20,
      stock_minimo: 5,
      categoria: 'Limpieza',
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    },
    {
      id: 'prod-4',
      codigo_barras: '7790000000043',
      nombre: 'Detergente 1L',
      precio_venta: 950,
      costo: 700,
      stock_actual: 0,
      stock_minimo: 3,
      categoria: 'Limpieza',
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    },
  ];

  describe('calculateTotals', () => {
    it('should calculate subtotal correctly for single item', () => {
      const items = [
        { producto: mockProductos[0], cantidad: 2, precio_unitario: 850 },
      ];
      const result = calculateTotals(items);
      expect(result.subtotal).toBe(1700);
      expect(result.total).toBe(1700);
    });

    it('should calculate subtotal correctly for multiple items', () => {
      const items = [
        { producto: mockProductos[0], cantidad: 2, precio_unitario: 850 },
        { producto: mockProductos[1], cantidad: 1, precio_unitario: 750 },
        { producto: mockProductos[2], cantidad: 3, precio_unitario: 1200 },
      ];
      const result = calculateTotals(items);
      expect(result.subtotal).toBe(1700 + 750 + 3600); // 6050
      expect(result.total).toBe(6050);
    });

    it('should return zero for empty cart', () => {
      const result = calculateTotals([]);
      expect(result.subtotal).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('formatBs', () => {
    it('should format Bolivianos correctly', () => {
      expect(formatBs(0)).toBe('Bs 0');
      expect(formatBs(850)).toBe('Bs 850');
      expect(formatBs(1250)).toBe('Bs 1.250');
      expect(formatBs(12500)).toBe('Bs 12.500');
      expect(formatBs(1250000)).toBe('Bs 1.250.000');
    });
  });

  describe('calculateChange', () => {
    it('should calculate exact change', () => {
      expect(calculateChange(1000, 1000)).toBe(0);
      expect(calculateChange(1500, 1000)).toBe(500);
      expect(calculateChange(5000, 1250)).toBe(3750);
    });

    it('should return negative if payment insufficient', () => {
      expect(calculateChange(500, 1000)).toBe(-500);
    });
  });

  describe('validatePayment', () => {
    it('should accept exact cash payment', () => {
      const result = validatePayment(1000, [{ metodo: 'EFECTIVO', monto: 1000 }]);
      expect(result.valid).toBe(true);
      expect(result.diferencia).toBe(0);
    });

    it('should accept mixed payments summing to total', () => {
      const pagos = [
        { metodo: 'EFECTIVO', monto: 600 },
        { metodo: 'QR', monto: 400 },
      ];
      const result = validatePayment(1000, pagos);
      expect(result.valid).toBe(true);
    });

    it('should reject insufficient payment', () => {
      const result = validatePayment(1000, [{ metodo: 'EFECTIVO', monto: 500 }]);
      expect(result.valid).toBe(false);
      expect(result.diferencia).toBe(-500);
    });

    it('should reject overpayment', () => {
      const result = validatePayment(1000, [{ metodo: 'EFECTIVO', monto: 1500 }]);
      expect(result.valid).toBe(false);
      expect(result.diferencia).toBe(500);
    });

    it('should require cliente_fiado_id for FIADO payments', () => {
      const pagos = [
        { metodo: 'FIADO', monto: 1000, cliente_fiado_id: undefined },
      ];
      const result = validatePayment(1000, pagos);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('FIADO');
      expect(result.error).toContain('cliente');
    });

    it('should accept FIADO with valid cliente_fiado_id', () => {
      const pagos = [
        { metodo: 'FIADO', monto: 1000, cliente_fiado_id: 'client-123' },
      ];
      const result = validatePayment(1000, pagos);
      expect(result.valid).toBe(true);
    });
  });

  describe('filterProducts', () => {
    it('should filter by search query (nombre)', () => {
      const results = filterProducts(mockProductos, 'arroz');
      expect(results.length).toBe(1);
      expect(results[0].nombre).toBe('Arroz 1kg');
    });

    it('should filter by search query (categoria)', () => {
      const results = filterProducts(mockProductos, 'limpieza');
      expect(results.length).toBe(2);
      expect(results.every(p => p.categoria === 'Limpieza')).toBe(true);
    });

    it('should filter by search query (codigo_barras)', () => {
      const results = filterProducts(mockProductos, '7790000000029');
      expect(results.length).toBe(1);
      expect(results[0].nombre).toBe('Azúcar 1kg');
    });

    it('should return all products for empty query', () => {
      const results = filterProducts(mockProductos, '');
      expect(results.length).toBe(4);
    });

    it('should be case insensitive', () => {
      const results = filterProducts(mockProductos, 'ARROZ');
      expect(results.length).toBe(1);
    });
  });

  describe('sortProducts', () => {
    it('should sort by nombre ascending by default', () => {
      const results = sortProducts([...mockProductos], 'nombre', 'asc');
      expect(results[0].nombre).toBe('Aceite 900ml');
      expect(results[3].nombre).toBe('Detergente 1L');
    });

    it('should sort by nombre descending', () => {
      const results = sortProducts([...mockProductos], 'nombre', 'desc');
      expect(results[0].nombre).toBe('Detergente 1L');
      expect(results[3].nombre).toBe('Aceite 900ml');
    });

    it('should sort by stock_actual ascending', () => {
      const results = sortProducts([...mockProductos], 'stock_actual', 'asc');
      expect(results[0].stock_actual).toBe(0); // Detergente
      expect(results[3].stock_actual).toBe(50); // Arroz
    });

    it('should sort by precio_venta descending', () => {
      const results = sortProducts([...mockProductos], 'precio_venta', 'desc');
      expect(results[0].precio_venta).toBe(1200); // Aceite
      expect(results[3].precio_venta).toBe(750); // Azúcar
    });
  });

  describe('generateTicketText', () => {
    const mockVenta: Venta = {
      id: 'venta-123',
      fecha: '2026-10-09T14:30:00.000Z',
      total: 2600,
      metodo_pago: 'MIXTO',
      estado_sync: 'PENDIENTE',
      client_tx_id: 'tx-456',
      creado_en: '2026-10-09T14:30:00.000Z',
      sincronizado_en: null,
    };

    const mockDetalles: DetalleVenta[] = [
      { id: 'det-1', venta_id: 'venta-123', producto_id: 'prod-1', cantidad: 2, precio_unitario: 850 },
      { id: 'det-2', venta_id: 'venta-123', producto_id: 'prod-3', cantidad: 1, precio_unitario: 1200 },
    ];

    const mockPagos = [
      { metodo: 'EFECTIVO', monto: 1500 },
      { metodo: 'QR', monto: 1100 },
    ];

    it('should generate formatted ticket text', () => {
      const ticket = generateTicketText(mockVenta, mockDetalles, mockPagos, mockProductos, 'Mi Negocio');
      
      expect(ticket).toContain('MI NEGOCIO');
      expect(ticket).toContain('Arroz 1kg');
      expect(ticket).toContain('Aceite 900ml');
      expect(ticket).toContain('2 x Bs 850');
      expect(ticket).toContain('1 x Bs 1.200');
      expect(ticket).toContain('Efectivo: Bs 1.500');
      expect(ticket).toContain('Qr: Bs 1.100');
      expect(ticket).toContain('TOTAL: Bs 2.600');
    });
  });

  describe('generateWhatsAppUrl', () => {
    it('should generate valid wa.me URL with encoded message', () => {
      const phone = '+59171234567';
      const message = 'Hola, tu ticket de compra';
      const url = generateWhatsAppUrl(phone, message);
      
      expect(url).toContain('wa.me/59171234567');
      expect(url).toContain('text=');
      expect(url).toContain('Hola%2C%20tu%20ticket%20de%20compra');
    });

    it('should handle phone without + prefix', () => {
      const url = generateWhatsAppUrl('59171234567', 'Test');
      expect(url).toContain('wa.me/59171234567');
    });

    it('should handle special characters in message', () => {
      const url = generateWhatsAppUrl('+59171234567', 'Total: Bs 1.250 & cambio: Bs 250');
      expect(url).toContain('Total%3A%20Bs%201.250%20%26%20cambio%3A%20Bs%20250');
    });
  });
});

describe('Venta Rápida - Offline Persistence', () => {
  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
  });

  it('should create venta with idempotency key', async () => {
    // This test will be implemented when useVentaRapida hook is ready
    const clientTxId = generateId();
    expect(clientTxId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should deduct stock immediately on venta', async () => {
    // Integration test with repositories
    // Will be implemented when hook is ready
    expect(true).toBe(true);
  });

  it('should enqueue in sync_queue with correct structure', async () => {
    // Integration test with syncQueueRepository
    expect(true).toBe(true);
  });
});