export type UUID = string;

export function generateUUID(): UUID {
  return crypto.randomUUID();
}

export interface Producto {
  id: UUID;
  codigo_barras: string | null;
  nombre: string;
  precio_venta: number; // en centésimos de Bs (entero)
  costo: number;
  stock_actual: number;
  stock_minimo: number;
  categoria: string | null;
  creado_en: string; // ISO 8601
  actualizado_en: string;
}

export interface Venta {
  id: UUID;
  fecha: string; // ISO 8601
  total: number; // en centésimos
  metodo_pago: 'EFECTIVO' | 'QR' | 'FIADO' | 'MIXTO';
  estado_sync: 'PENDIENTE' | 'SINCRONIZADO' | 'CONFLICTO';
  client_tx_id: UUID;
  creado_en: string;
  sincronizado_en: string | null;
}

export interface DetalleVenta {
  id: UUID;
  venta_id: UUID;
  producto_id: UUID;
  cantidad: number;
  precio_unitario: number; // snapshot al momento
}

export interface MovimientoStock {
  id: UUID;
  producto_id: UUID;
  tipo: 'ENTRADA' | 'SALIDA' | 'MERMA' | 'AJUSTE';
  cantidad: number; // positivo para entrada, negativo para salida
  fecha: string;
  usuario_id: UUID | null;
  notas: string | null;
}

export interface CuentaPorCobrar {
  id: UUID;
  cliente_nombre: string;
  cliente_telefono: string; // formato +591[67]xxxxxxx
  monto_total: number;
  saldo_pendiente: number;
  fecha_vencimiento: string; // ISO date
  estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'VENCIDO';
  creado_en: string;
  actualizado_en: string;
}

export interface MovimientoCobro {
  id: UUID;
  cuenta_cobrar_id: UUID;
  monto: number;
  metodo: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
  fecha: string;
  notas: string | null;
}

export interface SyncQueueItem {
  id: UUID;
  tipo_entidad: 'PRODUCTO' | 'VENTA' | 'MOVIMIENTO_STOCK' | 'CUENTA_POR_COBRAR' | 'MOVIMIENTO_COBRO';
  accion: 'CREATE' | 'UPDATE' | 'DELETE';
  entity_id: UUID;
  client_tx_id: UUID;
  payload: Record<string, unknown>;
  timestamp: string;
  reintentos: number;
  estado: 'PENDIENTE' | 'PROCESANDO' | 'COMPLETADO' | 'ERROR';
  error_mensaje: string | null;
}

export interface GastoTurno {
  id: UUID;
  descripcion: string;
  monto: number;
  fecha: string;
}

export interface ArqueoCaja {
  id: UUID;
  fecha: string; // ISO 8601 date
  efectivo_fisico_contado: number;
  efectivo_teorico: number;
  ventas_efectivo: number;
  ventas_qr: number;
  ventas_fiado: number;
  gastos_turno: GastoTurno[];
  total_teorico: number;
  diferencia: number;
  estado: 'ABIERTO' | 'CERRADO';
  creado_en: string;
  cerrado_en: string | null;
}

export type StoreName = 
  | 'productos' 
  | 'ventas' 
  | 'detalles_venta' 
  | 'movimientos_stock' 
  | 'cuentas_cobrar' 
  | 'movimientos_cobro' 
  | 'sync_queue'
  | 'arqueos_caja';

export const STORE_NAMES: StoreName[] = [
  'productos',
  'ventas',
  'detalles_venta',
  'movimientos_stock',
  'cuentas_cobrar',
  'movimientos_cobro',
  'sync_queue',
  'arqueos_caja',
];

export const DB_NAME = 'cajaviva-db';
export const DB_VERSION = 1;