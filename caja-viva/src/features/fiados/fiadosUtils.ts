import type { CuentaPorCobrar, MovimientoCobro } from '../../db/types';
import { generateWhatsAppUrl } from '../venta/ventaUtils';
import { parseFechaLocal } from '../../utils/dateUtils';
import { todayISO } from '../../db/schema';

export interface PaymentResult {
  cuenta: CuentaPorCobrar;
  movimiento: MovimientoCobro;
}

export interface AccountStatusResult {
  status: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'VENCIDO';
}

/**
 * Calcula el saldo pendiente de una cuenta por cobrar
 */
export function calculatePendingBalance(cuenta: { 
  monto_total: number; 
  abonos: Array<{ monto: number }> 
}): number {
  const totalAbonos = cuenta.abonos.reduce((sum, abono) => sum + abono.monto, 0);
  return Math.max(0, cuenta.monto_total - totalAbonos);
}

/**
 * Aplica un pago a una cuenta por cobrar
 */
export function applyPayment(
  cuenta: { 
    id: string; 
    monto_total: number; 
    saldo_pendiente: number; 
    estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'VENCIDO';
  },
  monto: number,
  metodo: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA',
  notas: string
): { cuenta: any; movimiento: any } {
  const nuevoSaldo = Math.max(0, cuenta.saldo_pendiente - monto);
  const nuevoEstado =
    nuevoSaldo === 0 ? 'PAGADO'
    : nuevoSaldo < cuenta.monto_total ? 'PARCIAL'
    : cuenta.estado;

  const cuentaActualizada = {
    ...cuenta,
    saldo_pendiente: nuevoSaldo,
    estado: nuevoEstado,
    actualizado_en: new Date().toISOString(),
  };

  const movimiento = {
    id: crypto.randomUUID(),
    cuenta_cobrar_id: cuenta.id,
    monto,
    metodo,
    fecha: new Date().toISOString(),
    notas: notas.trim() || 'Pago aplicado',
  };

  return { cuenta: cuentaActualizada, movimiento };
}

/**
 * Determina el estado de una cuenta por cobrar
 */
export function getAccountStatus(cuenta: { 
  saldo_pendiente: number; 
  monto_total: number; 
  fecha_vencimiento?: string 
}): 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'VENCIDO' {
  if (cuenta.saldo_pendiente === 0) return 'PAGADO';

  // Vencida tiene prioridad sobre PARCIAL: si la fecha pasó y aún debe, está vencida
  if (cuenta.fecha_vencimiento) {
    const hoy = todayISO();
    if (cuenta.fecha_vencimiento < hoy && cuenta.saldo_pendiente > 0) {
      return 'VENCIDO';
    }
  }

  if (cuenta.saldo_pendiente < cuenta.monto_total) return 'PARCIAL';

  return 'PENDIENTE';
}

/**
 * Genera mensaje de recordatorio amable para cobro
 */
export function generatePaymentReminder(cuenta: { 
  cliente_nombre: string; 
  saldo_pendiente: number; 
  fecha_vencimiento: string 
}): string {
  const fechaFormateada = parseFechaLocal(cuenta.fecha_vencimiento).toLocaleDateString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const montoFormateado = formatBs(cuenta.saldo_pendiente);

  return `Hola ${cuenta.cliente_nombre} 👋

Solo un recordatorio amable: tienes un saldo pendiente de ${montoFormateado} con vencimiento el ${fechaFormateada}.

No te preocupes, sabemos que a veces se nos pasa. Puedes pagar cuando te sea cómodo:
💵 EFECTIVO
📱 QR
🏦 TRANSFERENCIA

Si ya pagaste, por favor avísanos para actualizar. ¡Gracias por tu confianza!

— Equipo CajaViva`;
}

/**
 * Formatea un monto en Bolivianos
 */
export function formatBs(amount: number): string {
  if (amount === 0) return 'Bs 0';
  return 'Bs ' + amount.toLocaleString('es-BO');
}

/**
 * Genera URL de WhatsApp con recordatorio de pago
 */
export function generateWhatsAppReminderUrl(cuenta: { 
  cliente_nombre: string; 
  cliente_telefono: string; 
  saldo_pendiente: number; 
  fecha_vencimiento: string 
}): string {
  const message = generatePaymentReminder({
    cliente_nombre: cuenta.cliente_nombre,
    saldo_pendiente: cuenta.saldo_pendiente,
    fecha_vencimiento: cuenta.fecha_vencimiento,
  });
  return generateWhatsAppUrl(cuenta.cliente_telefono, message);
}

/**
 * Valida una cuenta por cobrar antes de guardar
 */
export function validateCuentaPorCobrar(cuenta: { 
  cliente_nombre: string; 
  cliente_telefono: string; 
  monto_total: number; 
  saldo_pendiente?: number;
  fecha_vencimiento?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!cuenta.cliente_nombre || cuenta.cliente_nombre.trim() === '') {
    errors.push('El nombre del cliente es obligatorio');
  }

  // Validar formato de teléfono boliviano
  const phoneRegex = /^\+591[67]\d{7}$/;
  if (!cuenta.cliente_telefono || !phoneRegex.test(cuenta.cliente_telefono)) {
    errors.push('teléfono inválido: debe ser formato boliviano +591[67]XXXXXXX');
  }

  if (cuenta.monto_total === undefined || cuenta.monto_total <= 0) {
    errors.push('El monto total debe ser un número positivo');
  } else if (!Number.isInteger(cuenta.monto_total)) {
    errors.push('El monto total debe ser un número entero de Bolivianos (sin decimales)');
  }

  if (cuenta.saldo_pendiente !== undefined && cuenta.saldo_pendiente < 0) {
    errors.push('El saldo pendiente no puede ser negativo');
  }

  if (cuenta.fecha_vencimiento) {
    const fecha = parseFechaLocal(cuenta.fecha_vencimiento);
    if (isNaN(fecha.getTime())) {
      errors.push('Fecha de vencimiento inválida');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}