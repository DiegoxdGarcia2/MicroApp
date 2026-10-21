import { describe, expect, it } from 'vitest';
import type { GastoTurno, PagoVenta } from '../../db/types';
import { todayISO } from '../../db/schema';
import {
  calculateArqueoTotals,
  calculateCierreTotals,
  getDiferenciaInfo,
  validateArqueo,
} from './cajaUtils';

const pago = (metodo: PagoVenta['metodo'], monto: number): PagoVenta => ({
  metodo,
  monto,
});

const gasto = (monto: number, descripcion = 'Gasto'): GastoTurno => ({
  id: `g-${monto}-${descripcion}`,
  descripcion,
  monto,
  fecha: '2026-10-21',
});

describe('calculateArqueoTotals', () => {
  it('usa el desglose de pagos en ventas mixtas', () => {
    const totals = calculateArqueoTotals([
      { metodo_pago: 'MIXTO', total: 100, pagos: [pago('EFECTIVO', 60), pago('QR', 40)] },
      { metodo_pago: 'EFECTIVO', total: 30 },
      { metodo_pago: 'FIADO', total: 20 },
    ]);

    expect(totals).toMatchObject({
      efectivo: 90,
      qr: 40,
      fiado: 20,
      totalVentas: 150,
      cantidadVentas: 3,
    });
  });

  it('no pierde ventas antiguas sin desglose', () => {
    const totals = calculateArqueoTotals([
      { metodo_pago: 'EFECTIVO', total: 10 },
      { metodo_pago: 'QR', total: 20 },
      { metodo_pago: 'FIADO', total: 30 },
      { metodo_pago: 'MIXTO', total: 40 },
    ]);

    expect(totals.efectivo).toBe(10);
    expect(totals.qr).toBe(20);
    expect(totals.fiado).toBe(30);
    expect(totals.totalVentas).toBe(100);
  });
});

describe('calculateCierreTotals', () => {
  it('descuenta gastos solo del efectivo esperado', () => {
    const totals = calculateCierreTotals(
      [
        { metodo_pago: 'MIXTO', total: 120, pagos: [pago('EFECTIVO', 100), pago('QR', 20)] },
        { metodo_pago: 'FIADO', total: 50 },
      ],
      [gasto(30, 'Transporte'), gasto(20, 'Insumos')],
    );

    expect(totals.gastos).toBe(50);
    expect(totals.efectivoTeorico).toBe(50);
    expect(totals.totalTeorico).toBe(120);
  });

  it('nunca deja efectivo teórico negativo', () => {
    const totals = calculateCierreTotals(
      [{ metodo_pago: 'EFECTIVO', total: 10 }],
      [gasto(25)],
    );

    expect(totals.efectivoTeorico).toBe(0);
    expect(totals.totalTeorico).toBe(-15);
  });
});

describe('getDiferenciaInfo', () => {
  it('marca cuadre exacto en verde', () => {
    expect(getDiferenciaInfo(0, 5)).toMatchObject({ nivel: 'CUADRADO', color: 'verde' });
  });

  it('marca sobrante en verde', () => {
    const info = getDiferenciaInfo(10, 5);
    expect(info.nivel).toBe('SOBRANTE');
    expect(info.color).toBe('verde');
  });

  it('marca faltante dentro del umbral en ámbar', () => {
    expect(getDiferenciaInfo(-5, 5)).toMatchObject({ nivel: 'FALTANTE', color: 'ambar' });
  });

  it('marca descuadre fuera del umbral en rojo', () => {
    const info = getDiferenciaInfo(-5.01, 5);
    expect(info).toMatchObject({ nivel: 'DESCUADRE', color: 'rojo', requiereRevision: true });
  });
});

describe('validateArqueo con gastos detallados', () => {
  it('acepta gastos_turno como arreglo y calcula su total', () => {
    const result = validateArqueo({
      fecha: todayISO(),
      efectivo_fisico_contado: 100,
      efectivo_teorico: 100,
      ventas_efectivo: 150,
      ventas_qr: 50,
      ventas_fiado: 0,
      gastos_turno: [gasto(50)],
      total_teorico: 150,
      diferencia: 0,
      estado: 'CERRADO',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rechaza un arreglo de gastos con montos inválidos', () => {
    const result = validateArqueo({
      fecha: todayISO(),
      efectivo_fisico_contado: 100,
      efectivo_teorico: 100,
      ventas_efectivo: 100,
      ventas_qr: 0,
      ventas_fiado: 0,
      gastos_turno: [{ ...gasto(10), monto: Number.NaN }],
      total_teorico: 90,
      diferencia: 0,
      estado: 'CERRADO',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('Gastos'))).toBe(true);
  });
});
