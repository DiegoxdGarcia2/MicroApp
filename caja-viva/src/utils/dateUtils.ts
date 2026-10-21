/**
 * Utilidades de fecha en hora local.
 *
 * `new Date('2026-10-15')` se interpreta como medianoche UTC; en Bolivia
 * (UTC-4) eso muestra el dia anterior. Estas funciones trabajan siempre con
 * la fecha local del dispositivo, que es la que ve el cajero.
 */

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Devuelve una fecha local como `YYYY-MM-DD`. */
export function toLocalDateISO(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Fecha de hoy en hora local (`YYYY-MM-DD`). */
export function todayLocal(): string {
  return toLocalDateISO();
}

/** Suma (o resta) dias a una fecha local y devuelve `YYYY-MM-DD`. */
export function addDaysLocal(days: number, base: Date = new Date()): string {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12, 0, 0);
  date.setDate(date.getDate() + days);
  return toLocalDateISO(date);
}

/**
 * Convierte una fecha `YYYY-MM-DD` (o ISO) a un Date local.
 * Para fechas sin hora se usa el mediodia local para evitar saltos de dia.
 */
export function parseFechaLocal(fecha: string | Date): Date {
  if (fecha instanceof Date) return fecha;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  }
  return new Date(fecha);
}

/** Formatea una fecha local para mostrar al usuario. */
export function formatFechaLocal(
  fecha: string | Date,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
): string {
  const date = parseFechaLocal(fecha);
  if (Number.isNaN(date.getTime())) return typeof fecha === 'string' ? fecha : '';
  return date.toLocaleDateString('es-BO', options);
}
