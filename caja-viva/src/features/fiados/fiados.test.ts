import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  calculatePendingBalance,
  applyPayment,
  getAccountStatus,
  generatePaymentReminder,
  generateWhatsAppReminderUrl,
  validateCuentaPorCobrar,
  formatBs,
} from './fiadosUtils';
import { CuentaPorCobrar, MovimientoCobro } from '../../db/types';
import { generateId, nowISO, todayISO } from '../../db/schema';
import { cuentaPorCobrarRepository, movimientoCobroRepository, syncQueueRepository } from '../../db/repositories';

describe('Fiados - Cuentas por Cobrar y Recordatorios WhatsApp', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('calculatePendingBalance', () => {
    it('should calculate initial pending balance correctly', () => {
      const cuenta = { monto_total: 5000, abonos: [] };
      expect(calculatePendingBalance(cuenta)).toBe(5000);
    });

    it('should calculate pending balance after partial payments', () => {
      const cuenta = { 
        monto_total: 5000, 
        abonos: [
          { monto: 2000, fecha: '2026-01-15' },
          { monto: 1000, fecha: '2026-01-20' },
        ]
      };
      expect(calculatePendingBalance(cuenta)).toBe(2000);
    });

    it('should return zero when fully paid', () => {
      const cuenta = { 
        monto_total: 5000, 
        abonos: [
          { monto: 3000, fecha: '2026-01-15' },
          { monto: 2000, fecha: '2026-01-20' },
        ]
      };
      expect(calculatePendingBalance(cuenta)).toBe(0);
    });

    it('should not go below zero', () => {
      const cuenta = { 
        monto_total: 1000, 
        abonos: [
          { monto: 500, fecha: '2026-01-15' },
          { monto: 600, fecha: '2026-01-20' },
        ]
      };
      expect(calculatePendingBalance(cuenta)).toBe(0);
    });
  });

  describe('applyPayment', () => {
    it('should apply payment and return updated account', () => {
      const cuenta = {
        id: 'test-1',
        monto_total: 5000,
        saldo_pendiente: 5000,
        estado: 'PENDIENTE' as const,
      };

      const result = applyPayment(cuenta, 2000, 'EFECTIVO', 'Pago parcial');

      expect(result.cuenta.saldo_pendiente).toBe(3000);
      expect(result.cuenta.estado).toBe('PARCIAL');
      expect(result.movimiento.monto).toBe(2000);
      expect(result.movimiento.metodo).toBe('EFECTIVO');
    });

    it('should mark as PAGADO when balance reaches zero', () => {
      const cuenta = {
        id: 'test-1',
        monto_total: 1000,
        saldo_pendiente: 1000,
        estado: 'PENDIENTE' as const,
      };

      const result = applyPayment(cuenta, 1000, 'QR', 'Pago total');

      expect(result.cuenta.estado).toBe('PAGADO');
      expect(result.cuenta.saldo_pendiente).toBe(0);
    });

    it('should create movimiento_cobro record', () => {
      const cuenta = {
        id: 'test-1',
        monto_total: 5000,
        saldo_pendiente: 5000,
        estado: 'PENDIENTE' as const,
      };

      const result = applyPayment(cuenta, 2000, 'EFECTIVO', 'Pago parcial');

      expect(result.movimiento).toBeDefined();
      expect(result.movimiento.cuenta_cobrar_id).toBe(cuenta.id);
      expect(result.movimiento.monto).toBe(2000);
      expect(result.movimiento.metodo).toBe('EFECTIVO');
      expect(result.movimiento.notas).toBe('Pago parcial');
    });
  });

  describe('getAccountStatus', () => {
    it('should return PENDIENTE for full balance', () => {
      const cuenta = { saldo_pendiente: 5000, monto_total: 5000 };
      expect(getAccountStatus(cuenta)).toBe('PENDIENTE');
    });

    it('should return PARCIAL for partial payment', () => {
      const cuenta = { saldo_pendiente: 3000, monto_total: 5000 };
      expect(getAccountStatus(cuenta)).toBe('PARCIAL');
    });

    it('should return PAGADO when fully paid', () => {
      const cuenta = { saldo_pendiente: 0, monto_total: 5000 };
      expect(getAccountStatus(cuenta)).toBe('PAGADO');
    });

    it('should return VENCIDO when past due date and not paid', () => {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);
      const ayerStr = ayer.toISOString().split('T')[0];

      const cuenta = { 
        saldo_pendiente: 1000, 
        monto_total: 5000, 
        fecha_vencimiento: ayerStr 
      };
      expect(getAccountStatus(cuenta)).toBe('VENCIDO');
    });
  });

  describe('generatePaymentReminder', () => {
    it('should generate friendly reminder message', () => {
      const cuenta = {
        cliente_nombre: 'Juan Pérez',
        saldo_pendiente: 2500,
        fecha_vencimiento: '2026-10-15',
      };

      const reminder = generatePaymentReminder(cuenta);

      expect(reminder).toContain('Juan Pérez');
      expect(reminder).toContain('2.500');
      expect(reminder).toContain('15/10/2026');
      expect(reminder).toContain('recordatorio');
    });

    it('should use respectful tone without threats', () => {
      const cuenta = {
        cliente_nombre: 'María López',
        saldo_pendiente: 1500,
        fecha_vencimiento: '2026-10-10',
      };

      const reminder = generatePaymentReminder(cuenta);

      // No amenazas
      expect(reminder).not.toContain('legal');
      expect(reminder).not.toContain('demanda');
      expect(reminder).not.toContain('embargo');
      expect(reminder).not.toContain('abogado');
      
      // Tono amable
      expect(reminder).toContain('amable');
      expect(reminder).toContain('recordatorio');
    });

    it('should include payment methods', () => {
      const cuenta = {
        cliente_nombre: 'Juan Pérez',
        saldo_pendiente: 2500,
        fecha_vencimiento: '2026-10-15',
      };

      const reminder = generatePaymentReminder(cuenta);

      expect(reminder).toContain('EFECTIVO');
      expect(reminder).toContain('QR');
      expect(reminder).toContain('TRANSFERENCIA');
    });
  });

  describe('generateWhatsAppReminderUrl', () => {
    it('should generate valid wa.me URL', () => {
      const cuenta = {
        cliente_nombre: 'Juan Pérez',
        cliente_telefono: '+59171234567',
        saldo_pendiente: 2500,
        fecha_vencimiento: '2026-10-15',
      };

      const url = generateWhatsAppReminderUrl(cuenta);

      expect(url).toContain('wa.me/59171234567');
      expect(url).toContain('text=');
      expect(url).toContain('Juan%20P%C3%A9rez');
      expect(url).toContain('2.500');
    });

    it('should handle phone without + prefix', () => {
      const cuenta = {
        cliente_telefono: '59171234567',
        saldo_pendiente: 1000,
      };

      const url = generateWhatsAppReminderUrl(cuenta);
      expect(url).toContain('wa.me/59171234567');
    });
  });

  describe('validateCuentaPorCobrar', () => {
    it('should validate complete cuenta', () => {
      const cuenta = {
        cliente_nombre: 'Juan Pérez',
        cliente_telefono: '+59171234567',
        monto_total: 5000,
        saldo_pendiente: 5000,
        fecha_vencimiento: '2026-10-15',
      };

      const result = validateCuentaPorCobrar(cuenta);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing required fields', () => {
      const cuenta = {
        cliente_nombre: '',
        cliente_telefono: '+59171234567',
        monto_total: 5000,
      };

      const result = validateCuentaPorCobrar(cuenta);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('nombre'))).toBe(true);
    });

    it('should validate Bolivian phone format', () => {
      const cuenta = {
        cliente_nombre: 'Juan Pérez',
        cliente_telefono: '123456789', // Invalid format
        monto_total: 5000,
      };

      const result = validateCuentaPorCobrar(cuenta);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('teléfono'))).toBe(true);
    });

    it('should validate positive amounts', () => {
      const cuenta = {
        cliente_nombre: 'Juan Pérez',
        cliente_telefono: '+59171234567',
        monto_total: -100,
      };

      const result = validateCuentaPorCobrar(cuenta);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('positivo'))).toBe(true);
    });
  });
});

describe('Fiados - Integración con IndexedDB', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('should create cuenta por cobrar and persist', async () => {
    const cuenta = {
      id: 'test-id-1',
      cliente_nombre: 'Juan Pérez',
      cliente_telefono: '+59171234567',
      monto_total: 5000,
      saldo_pendiente: 5000,
      fecha_vencimiento: '2026-10-15',
      estado: 'PENDIENTE' as const,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    };

    await cuentaPorCobrarRepository.create(cuenta);
    const retrieved = await cuentaPorCobrarRepository.getById('test-id-1');
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.cliente_nombre).toBe('Juan Pérez');
    expect(retrieved?.saldo_pendiente).toBe(5000);
  });

  it('should apply payment and update balance', async () => {
    const cuenta = await cuentaPorCobrarRepository.create({
      id: 'test-payment-1',
      cliente_nombre: 'María López',
      cliente_telefono: '+59169876543',
      monto_total: 10000,
      saldo_pendiente: 10000,
      fecha_vencimiento: '2026-10-20',
      estado: 'PENDIENTE' as const,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    });

    const result = await cuentaPorCobrarRepository.aplicarPago(
      cuenta.id,
      4000,
      'EFECTIVO',
      'Pago parcial'
    );

    expect(result).toBeDefined();
    expect(result?.cuenta.saldo_pendiente).toBe(6000);
    expect(result?.cuenta.estado).toBe('PARCIAL');
    expect(result?.movimiento.monto).toBe(4000);
  });

  it('should mark as PAGADO when fully paid', async () => {
    const cuenta = await cuentaPorCobrarRepository.create({
      id: 'test-payment-full',
      cliente_nombre: 'Carlos Ruiz',
      cliente_telefono: '+59175555555',
      monto_total: 3000,
      saldo_pendiente: 3000,
      fecha_vencimiento: '2026-10-10',
      estado: 'PENDIENTE' as const,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    });

    const result = await cuentaPorCobrarRepository.aplicarPago(
      cuenta.id,
      3000,
      'QR',
      'Pago total'
    );

    expect(result?.cuenta.estado).toBe('PAGADO');
    expect(result?.cuenta.saldo_pendiente).toBe(0);
  });

  it('should get overdue accounts', async () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const ayerStr = ayer.toISOString().split('T')[0];

    await cuentaPorCobrarRepository.create({
      id: generateId(),
      cliente_nombre: 'Cliente Vencido',
      cliente_telefono: '+59171111111',
      monto_total: 5000,
      saldo_pendiente: 5000,
      fecha_vencimiento: ayerStr,
      estado: 'PENDIENTE' as const,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    });

    await cuentaPorCobrarRepository.create({
      id: generateId(),
      cliente_nombre: 'Cliente Al Día',
      cliente_telefono: '+59172222222',
      monto_total: 5000,
      saldo_pendiente: 5000,
      fecha_vencimiento: '2026-12-31',
      estado: 'PENDIENTE' as const,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    });

    const vencidas = await cuentaPorCobrarRepository.getVencidas();
    expect(vencidas.length).toBe(1);
    expect(vencidas[0].cliente_nombre).toBe('Cliente Vencido');
  });

  it('should enqueue sync for cobro movements', async () => {
    const cuenta = await cuentaPorCobrarRepository.create({
      id: generateId(),
      cliente_nombre: 'Test Sync',
      cliente_telefono: '+59179999999',
      monto_total: 1000,
      saldo_pendiente: 1000,
      fecha_vencimiento: '2026-11-01',
      estado: 'PENDIENTE',
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    });

    await cuentaPorCobrarRepository.aplicarPago(
      cuenta.id,
      500,
      'EFECTIVO',
      'Test payment'
    );

    const stats = await syncQueueRepository.getEstadisticas();
    expect(typeof stats.pendientes).toBe('number');
    expect(stats.pendientes).toBeGreaterThan(0);
  });
});