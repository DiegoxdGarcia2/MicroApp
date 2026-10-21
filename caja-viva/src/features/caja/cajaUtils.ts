import type { ArqueoCaja, GastoTurno } from '../../db/types';
import { generateWhatsAppUrl } from '../venta/ventaUtils';

/**
 * Formatea un monto en Bolivianos
 */
export function formatBs(amount: number): string {
  if (amount === 0) return 'Bs 0';
  return 'Bs ' + amount.toLocaleString('es-BO');
}

export interface ArqueoTotals {
  efectivo: number;
  qr: number;
  fiado: number;
  totalVentas: number;
}

export interface ArqueoValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Calcula los totales de un arqueo a partir de las ventas
 */
export function calculateArqueoTotals(ventas: Array<{ metodo_pago: string; total: number }>): ArqueoTotals {
  const totals: ArqueoTotals = { efectivo: 0, qr: 0, fiado: 0, totalVentas: 0 };

  for (const venta of ventas) {
    totals.totalVentas += venta.total;
    switch (venta.metodo_pago) {
      case 'EFECTIVO':
        totals.efectivo += venta.total;
        break;
      case 'QR':
        totals.qr += venta.total;
        break;
      case 'FIADO':
        totals.fiado += venta.total;
        break;
      case 'MIXTO':
        // Para ventas mixtas, asumimos que el total ya está desglosado en otras ventas
        break;
    }
  }

  return totals;
}

/**
 * Calcula el total de billetes contados
 */
export function calculateBilletesTotal(billetes: Record<number, number>): number {
  const denominaciones = [10, 20, 50, 100, 200];
  let total = 0;

  for (const denominacion of denominaciones) {
    const cantidad = billetes[denominacion] || 0;
    total += denominacion * cantidad;
  }

  return total;
}

/**
 * Calcula la diferencia entre efectivo físico y teórico
 */
export function calculateDiferencia(efectivoFisico: number, efectivoTeorico: number): number {
  return efectivoFisico - efectivoTeorico;
}

/**
 * Calcula el total de gastos del turno
 */
export function calculateGastosTurno(gastos: GastoTurno[]): number {
  return gastos.reduce((sum, gasto) => sum + gasto.monto, 0);
}

/**
 * Valida un arqueo completo
 */
export function validateArqueo(arqueo: Partial<{
  fecha: string;
  efectivo_fisico_contado: number;
  efectivo_teorico: number;
  ventas_efectivo: number;
  ventas_qr: number;
  ventas_fiado: number;
  gastos_turno: number;
  total_teorico: number;
  diferencia: number;
  estado: string;
}>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validar fecha (debe ser hoy)
  const hoy = new Date().toISOString().split('T')[0];
  if (!arqueo.fecha || arqueo.fecha !== hoy) {
    errors.push('La fecha debe ser la de hoy');
  }

  // Validar campos numéricos requeridos
  const requiredFields = [
    { field: 'efectivo_fisico_contado', label: 'Efectivo físico contado' },
    { field: 'efectivo_teorico', label: 'Efectivo teórico' },
    { field: 'ventas_efectivo', label: 'Ventas efectivo' },
    { field: 'ventas_qr', label: 'Ventas QR' },
    { field: 'ventas_fiado', label: 'Ventas fiado' },
    { field: 'gastos_turno', label: 'Gastos del turno' },
    { field: 'total_teorico', label: 'Total teórico' },
    { field: 'diferencia', label: 'Diferencia' },
  ];

  for (const { field, label } of requiredFields) {
    const value = (arqueo as Record<string, unknown>)[field];
    if (value === undefined || value === null) {
      errors.push(`Campo requerido faltante: ${label}`);
    } else if (typeof value !== 'number' || isNaN(value)) {
      errors.push(`Campo inválido: ${label} debe ser un número`);
    }
  }

  // Validar estado
  if (!arqueo.estado || !['ABIERTO', 'CERRADO'].includes(arqueo.estado)) {
    errors.push('Estado inválido: debe ser ABIERTO o CERRADO');
  }

  // Validar consistencia numérica
  if (
    arqueo.efectivo_teorico !== undefined &&
    arqueo.ventas_efectivo !== undefined &&
    arqueo.ventas_qr !== undefined &&
    arqueo.ventas_fiado !== undefined &&
    arqueo.gastos_turno !== undefined
  ) {
    const totalCalculado = 
      (arqueo.ventas_efectivo || 0) +
      (arqueo.ventas_qr || 0) +
      (arqueo.ventas_fiado || 0) -
      (arqueo.gastos_turno || 0);

    if (arqueo.total_teorico !== undefined && 
        Math.abs(totalCalculado - arqueo.total_teorico) > 1) {
      errors.push(`Total teórico inconsistente: calculado ${totalCalculado}, registrado ${arqueo.total_teorico}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function formatArqueoReport(arqueo: ArqueoCaja, negocioNombre: string): string {
  const fechaFormateada = new Date(arqueo.fecha).toLocaleDateString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return `
${negocioNombre}
${'='.repeat(38)}
ARQUEO DE CAJA - ${fechaFormateada}
${'='.repeat(38)}

RESUMEN DE VENTAS:
  Efectivo:      ${formatBs(arqueo.ventas_efectivo)}
  QR/Transferencia: ${formatBs(arqueo.ventas_qr)}
  Fiados:        ${formatBs(arqueo.ventas_fiado)}
  ${'-'.repeat(38)}
  Total Ventas:  ${formatBs(arqueo.ventas_efectivo + arqueo.ventas_qr + arqueo.ventas_fiado)}

EFECTIVO EN CAJA:
  Teórico:    ${formatBs(arqueo.efectivo_teorico)}
  Físico:     ${formatBs(arqueo.efectivo_fisico_contado)}
  ${'-'.repeat(38)}
  Diferencia: ${formatBs(arqueo.diferencia)} (${arqueo.diferencia > 0 ? 'SOBRANTE' : arqueo.diferencia < 0 ? 'FALTANTE' : 'CUADRE EXACTO'})

GASTOS DEL TURNO:
${arqueo.gastos_turno.length > 0
    ? arqueo.gastos_turno
        .map((g: GastoTurno) => `  - ${g.descripcion}: ${formatBs(g.monto)}`)
        .join('\n')
    : '  (Sin gastos registrados)'}

${'='.repeat(38)}
Total en Caja: ${formatBs(arqueo.efectivo_fisico_contado - arqueo.gastos_turno.reduce((s: number, g: GastoTurno) => s + g.monto, 0))}
${'='.repeat(38)}
Cierre: ${new Date(arqueo.cerrado_en || Date.now()).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
`.trim();
}

/**
 * Genera URL de WhatsApp con el reporte de arqueo
 */
export function generateWhatsAppArqueoUrl(phone: string, arqueo: ArqueoCaja, negocioNombre: string): string {
  const reportText = formatArqueoReport(arqueo, '');
  const message = `🏪 *${negocioNombre}*\n\n${reportText}`;
  return generateWhatsAppUrl(phone, message);
}