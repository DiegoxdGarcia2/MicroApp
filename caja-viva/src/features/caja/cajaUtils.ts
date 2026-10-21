import type { ArqueoCaja, GastoTurno, PagoVenta } from '../../db/types';
import { generateWhatsAppUrl } from '../venta/ventaUtils';
import { parseFechaLocal } from '../../utils/dateUtils';
import { todayISO } from '../../db/schema';

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
  cantidadVentas: number;
}

export interface CierreTotals extends ArqueoTotals {
  gastos: number;
  efectivoTeorico: number;
  totalTeorico: number;
}

export interface ArqueoValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Calcula los totales de un arqueo a partir de las ventas.
 *
 * Si la venta guarda el desglose `pagos` (ventas nuevas) se usa ese desglose;
 * para ventas antiguas se cae al `metodo_pago` unico.
 */
export function calculateArqueoTotals(
  ventas: Array<{ metodo_pago: string; total: number; pagos?: PagoVenta[] }>,
): ArqueoTotals {
  const totals: ArqueoTotals = {
    efectivo: 0,
    qr: 0,
    fiado: 0,
    totalVentas: 0,
    cantidadVentas: ventas.length,
  };

  for (const venta of ventas) {
    totals.totalVentas += venta.total;

    if (venta.pagos && venta.pagos.length > 0) {
      for (const pago of venta.pagos) {
        if (pago.metodo === 'EFECTIVO') totals.efectivo += pago.monto;
        else if (pago.metodo === 'QR') totals.qr += pago.monto;
        else if (pago.metodo === 'FIADO') totals.fiado += pago.monto;
      }
      continue;
    }

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
        // Venta antigua sin desglose: no se puede conciliar por metodo.
        break;
    }
  }

  return totals;
}

/**
 * Totales completos del cierre: ventas por metodo, gastos y efectivo esperado.
 */
export function calculateCierreTotals(
  ventas: Array<{ metodo_pago: string; total: number; pagos?: PagoVenta[] }>,
  gastos: GastoTurno[],
): CierreTotals {
  const totales = calculateArqueoTotals(ventas);
  const gastosTotal = calculateGastosTurno(gastos);
  return {
    ...totales,
    gastos: gastosTotal,
    efectivoTeorico: Math.max(0, totales.efectivo - gastosTotal),
    totalTeorico: totales.efectivo + totales.qr + totales.fiado - gastosTotal,
  };
}

export interface DiferenciaInfo {
  nivel: 'CUADRADO' | 'SOBRANTE' | 'FALTANTE' | 'DESCUADRE';
  mensaje: string;
  color: 'verde' | 'ambar' | 'rojo';
  requiereRevision: boolean;
}

/**
 * Clasifica la diferencia de caja segun el umbral configurable.
 * - Cuadre exacto: verde.
 * - Sobrante: verde (segun especificacion US-004).
 * - Faltante dentro del umbral: ambar.
 * - Faltante mayor al umbral: rojo (DESCUADRE) y requiere revision.
 */
export function getDiferenciaInfo(diferencia: number, umbral = 5): DiferenciaInfo {
  if (Math.abs(diferencia) < 0.01) {
    return {
      nivel: 'CUADRADO',
      mensaje: 'CUADRE EXACTO: la caja coincide.',
      color: 'verde',
      requiereRevision: false,
    };
  }
  if (diferencia > 0) {
    return {
      nivel: 'SOBRANTE',
      mensaje: `SOBRANTE: +${formatBs(diferencia)}. Verifica si falta registrar una venta.`,
      color: 'verde',
      requiereRevision: false,
    };
  }
  const faltante = Math.abs(diferencia);
  if (faltante <= umbral) {
    return {
      nivel: 'FALTANTE',
      mensaje: `FALTANTE: -${formatBs(faltante)} (dentro del umbral de ${formatBs(umbral)}).`,
      color: 'ambar',
      requiereRevision: false,
    };
  }
  return {
    nivel: 'DESCUADRE',
    mensaje: `DESCUADRE: -${formatBs(faltante)} - Revisar ventas anuladas / cambio mal dado (umbral ${formatBs(umbral)}).`,
    color: 'rojo',
    requiereRevision: true,
  };
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
  // El modelo persistido guarda el detalle; los tests/compatibilidad usan el total.
  gastos_turno: number | GastoTurno[];
  total_teorico: number;
  diferencia: number;
  estado: string;
}>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const gastosTotal = Array.isArray(arqueo.gastos_turno)
    ? calculateGastosTurno(arqueo.gastos_turno)
    : arqueo.gastos_turno;

  // Validar fecha (debe ser hoy, en hora local)
  const hoy = todayISO();
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
    } else if (field === 'gastos_turno' && Array.isArray(value)) {
      // El detalle de gastos es válido si cada item tiene un monto numérico.
      const invalido = value.some(
        (gasto) => typeof gasto?.monto !== 'number' || !Number.isInteger(gasto.monto),
      );
      if (invalido) errors.push(`Campo inválido: ${label} contiene montos inválidos`);
    } else if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.push(`Campo inválido: ${label} debe ser un número entero de Bolivianos`);
    }
  }

  // Validar estado
  if (!arqueo.estado || !['ABIERTO', 'CERRADO'].includes(arqueo.estado)) {
    errors.push('Estado inválido: debe ser ABIERTO o CERRADO');
  }

  // Validar consistencia numérica (gastos puede venir como total o como detalle)
  if (
    arqueo.efectivo_teorico !== undefined &&
    arqueo.ventas_efectivo !== undefined &&
    arqueo.ventas_qr !== undefined &&
    arqueo.ventas_fiado !== undefined &&
    gastosTotal !== undefined
  ) {
    const totalCalculado =
      (arqueo.ventas_efectivo || 0) +
      (arqueo.ventas_qr || 0) +
      (arqueo.ventas_fiado || 0) -
      gastosTotal;

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
  const fechaFormateada = parseFechaLocal(arqueo.fecha).toLocaleDateString('es-BO', {
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
Total contado: ${formatBs(arqueo.efectivo_fisico_contado)}
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