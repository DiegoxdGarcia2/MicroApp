import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  calculateArqueoTotals, 
  calculateDiferencia, 
  calculateBilletesTotal,
  formatArqueoReport,
  generateWhatsAppArqueoUrl,
  formatBs,
  validateArqueo,
  calculateGastosTurno,
} from './cajaUtils';
import { ArqueoCaja, GastoTurno } from '../../db/types';
import { generateId, nowISO, todayISO } from '../../db/schema';

describe('Cierre de Caja - Arqueo y Conciliación', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('calculateBilletesTotal', () => {
    it('should calculate total from billetes count', () => {
      const billetes = {
        10: 5,
        20: 10,
        50: 3,
        100: 2,
        200: 1,
      };
      // 5*10 + 10*20 + 3*50 + 2*100 + 1*200 = 50 + 200 + 150 + 200 + 200 = 800
      expect(calculateBilletesTotal(billetes)).toBe(800);
    });

    it('should return 0 for empty billetes', () => {
      expect(calculateBilletesTotal({})).toBe(0);
    });

    it('should handle missing denominations', () => {
      const billetes = { 10: 5, 100: 2 };
      expect(calculateBilletesTotal(billetes)).toBe(250);
    });
  });

  describe('calculateArqueoTotals', () => {
    it('should calculate totals correctly from ventas', () => {
      const ventas = [
        { metodo_pago: 'EFECTIVO', total: 1500 },
        { metodo_pago: 'QR', total: 2000 },
        { metodo_pago: 'FIADO', total: 500 },
        { metodo_pago: 'EFECTIVO', total: 800 },
      ];

      const totals = calculateArqueoTotals(ventas);
      
      expect(totals.efectivo).toBe(2300);
      expect(totals.qr).toBe(2000);
      expect(totals.fiado).toBe(500);
      expect(totals.totalVentas).toBe(4800);
    });

    it('should handle empty ventas', () => {
      const totals = calculateArqueoTotals([]);
      
      expect(totals.efectivo).toBe(0);
      expect(totals.qr).toBe(0);
      expect(totals.fiado).toBe(0);
      expect(totals.totalVentas).toBe(0);
    });

    it('should handle mixed payments correctly', () => {
      const ventas = [
        { metodo_pago: 'EFECTIVO', total: 1000 },
        { metodo_pago: 'QR', total: 500 },
        { metodo_pago: 'FIADO', total: 300 },
      ];

      const totals = calculateArqueoTotals(ventas);
      
      expect(totals.efectivo).toBe(1000);
      expect(totals.qr).toBe(500);
      expect(totals.fiado).toBe(300);
      expect(totals.totalVentas).toBe(1800);
    });
  });

  describe('calculateDiferencia', () => {
    it('should detect exact match', () => {
      const diff = calculateDiferencia(1000, 1000);
      expect(diff).toBe(0);
    });

    it('should detect surplus (sobrante)', () => {
      const diff = calculateDiferencia(1050, 1000);
      expect(diff).toBe(50);
    });

    it('should detect shortage (faltante)', () => {
      const diff = calculateDiferencia(950, 1000);
      expect(diff).toBe(-50);
    });
  });

  describe('calculateGastosTurno', () => {
    it('should sum all gastos correctly', () => {
      const gastos: GastoTurno[] = [
        { id: '1', descripcion: 'Transporte', monto: 50, fecha: nowISO() },
        { id: '2', descripcion: 'Insumos', monto: 120, fecha: nowISO() },
        { id: '3', descripcion: 'Almuerzo', monto: 80, fecha: nowISO() },
      ];
      
      expect(calculateGastosTurno(gastos)).toBe(250);
    });

    it('should return 0 for empty gastos', () => {
      expect(calculateGastosTurno([])).toBe(0);
    });
  });

  describe('validateArqueo', () => {
    it('should validate complete arqueo', () => {
      const arqueo: Partial<ArqueoCaja> = {
        fecha: todayISO(),
        efectivo_fisico_contado: 5000,
        efectivo_teorico: 4800,
        ventas_efectivo: 4800,
        ventas_qr: 3200,
        ventas_fiado: 1500,
        gastos_turno: 200,
        total_teorico: 9300,
        diferencia: 200,
        estado: 'CERRADO',
      };
      
      const result = validateArqueo(arqueo);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing required fields', () => {
      const arqueo: Partial<ArqueoCaja> = {
        fecha: todayISO(),
        efectivo_fisico_contado: 5000,
      };
      
      const result = validateArqueo(arqueo);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate fecha is today', () => {
      const arqueo: Partial<ArqueoCaja> = {
        fecha: '2025-01-01', // Not today
        efectivo_fisico_contado: 5000,
        efectivo_teorico: 4800,
        ventas_efectivo: 4800,
        ventas_qr: 3200,
        ventas_fiado: 1500,
        gastos_turno: 200,
        total_teorico: 5000,
        diferencia: 200,
        estado: 'CERRADO',
      };
      
      const result = validateArqueo(arqueo);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('fecha'))).toBe(true);
    });
  });

  describe('formatArqueoReport', () => {
    it('should generate formatted report text', () => {
      const arqueo: ArqueoCaja = {
        id: 'test-id',
        fecha: todayISO(),
        efectivo_fisico_contado: 5200,
        efectivo_teorico: 5000,
        ventas_efectivo: 4800,
        ventas_qr: 3200,
        ventas_fiado: 1500,
        gastos_turno: [
          { id: '1', descripcion: 'Transporte', monto: 100, fecha: nowISO() },
          { id: '2', descripcion: 'Almuerzo', monto: 150, fecha: nowISO() },
        ],
        total_teorico: 5000,
        diferencia: 200,
        estado: 'CERRADO',
        creado_en: nowISO(),
        cerrado_en: nowISO(),
      };

      const report = formatArqueoReport(arqueo, 'Mi Negocio');
      
      expect(report).toContain('Mi Negocio');
      expect(report).toContain('ARQUEO DE CAJA');
      expect(report).toContain('Teórico:');
      expect(report).toContain('Físico:');
      expect(report).toContain('Diferencia:');
      expect(report).toContain('SOBRANTE');
      expect(report).toContain('GASTOS DEL TURNO');
      expect(report).toContain('Transporte');
      expect(report).toContain('Almuerzo');
    });

    it('should show FALTANTE for negative difference', () => {
      const arqueo: ArqueoCaja = {
        id: 'test-id',
        fecha: todayISO(),
        efectivo_fisico_contado: 4800,
        efectivo_teorico: 5000,
        ventas_efectivo: 4800,
        ventas_qr: 3200,
        ventas_fiado: 1500,
        gastos_turno: [],
        total_teorico: 9300,
        diferencia: -200,
        estado: 'CERRADO',
        creado_en: nowISO(),
        cerrado_en: nowISO(),
      };

      const report = formatArqueoReport(arqueo, 'Test');
      
      expect(report).toContain('FALTANTE');
      expect(report).toContain('-200');
    });
  });

  describe('generateWhatsAppArqueoUrl', () => {
    it('should generate valid WhatsApp URL with report text', () => {
      const arqueo: ArqueoCaja = {
        id: 'test-id',
        fecha: todayISO(),
        efectivo_fisico_contado: 5200,
        efectivo_teorico: 5000,
        ventas_efectivo: 4800,
        ventas_qr: 3200,
        ventas_fiado: 1500,
        gastos_turno: [],
        total_teorico: 5000,
        diferencia: 200,
        estado: 'CERRADO',
        creado_en: nowISO(),
        cerrado_en: nowISO(),
      };

      const url = generateWhatsAppArqueoUrl('+59171234567', arqueo, 'Mi Negocio');
      
      expect(url).toContain('wa.me/59171234567');
      expect(url).toContain('text=');
      expect(url).toContain('ARQUEO%20DE%20CAJA');
      expect(url).toContain('SOBRANTE');
    });
  });
});