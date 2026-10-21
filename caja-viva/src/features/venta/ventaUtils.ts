import type { Producto, DetalleVenta, Venta } from '../../db/types';
import type { UUID } from '../../db/types';

// Re-export types needed by other modules
export type { Producto, DetalleVenta, Venta, UUID };

export interface PagoCreate {
  metodo: 'EFECTIVO' | 'QR' | 'FIADO';
  monto: number;
  referencia_qr?: string;
  cliente_fiado_id?: UUID;
}

export interface CartItem {
  producto: Producto;
  cantidad: number;
  precio_unitario: number;
}

export interface Totals {
  subtotal: number;
  total: number;
}

export interface PaymentValidation {
  valid: boolean;
  diferencia: number;
  error?: string;
}

export function calculateTotals(items: CartItem[]): Totals {
  const subtotal = items.reduce((sum, item) => sum + item.cantidad * item.precio_unitario, 0);
  return { subtotal, total: subtotal };
}

export function formatBs(amount: number): string {
  if (amount === 0) return 'Bs 0';
  return 'Bs ' + amount.toLocaleString('es-BO');
}

export function calculateChange(efectivoEntregado: number, total: number): number {
  return efectivoEntregado - total;
}

export function validatePayment(total: number, pagos: Array<{ metodo: string; monto: number; cliente_fiado_id?: string }>): PaymentValidation {
  const totalPagos = pagos.reduce((sum, p) => sum + p.monto, 0);
  const diferencia = totalPagos - total;

  if (diferencia < 0) {
    return { valid: false, diferencia, error: `Faltan ${formatBs(Math.abs(diferencia))} para completar el pago` };
  }
  if (diferencia > 0) {
    return { valid: false, diferencia, error: `Pago excede el total en ${formatBs(diferencia)}` };
  }

  // Validar que los pagos FIADO tengan cliente_fiado_id
  for (const pago of pagos) {
    if (pago.metodo === 'FIADO' && !pago.cliente_fiado_id) {
      return { 
        valid: false, 
        diferencia: 0, 
        error: 'Los pagos a FIADO requieren seleccionar un cliente' 
      };
    }
  }

  return { valid: true, diferencia: 0 };
}

export function filterProducts(
  products: Producto[], 
  query: string, 
  categoria?: string
): Producto[] {
  let results = products;

  if (query.trim()) {
    const lowerQuery = query.toLowerCase();
    results = results.filter(p => 
      p.nombre.toLowerCase().includes(lowerQuery) ||
      p.codigo_barras?.toLowerCase().includes(lowerQuery) ||
      p.categoria?.toLowerCase().includes(lowerQuery)
    );
  }

  if (categoria && categoria !== 'Todas') {
    results = results.filter(p => p.categoria === categoria);
  }

  return results;
}

export function sortProducts(
  products: Producto[], 
  field: keyof Producto, 
  direction: 'asc' | 'desc'
): Producto[] {
  return [...products].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    
    if (aVal === undefined || aVal === null) return direction === 'asc' ? 1 : -1;
    if (bVal === undefined || bVal === null) return direction === 'asc' ? -1 : 1;
    
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return direction === 'asc' 
        ? aVal.localeCompare(bVal) 
        : bVal.localeCompare(aVal);
    }
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    
    return 0;
  });
}

export function getStockStatus(producto: Producto): 'normal' | 'critico' | 'agotado' {
  if (producto.stock_actual === 0) return 'agotado';
  if (producto.stock_actual <= producto.stock_minimo) return 'critico';
  return 'normal';
}

export function getStockStatusLabel(status: ReturnType<typeof getStockStatus>): string {
  switch (status) {
    case 'critico': return 'Stock Crítico';
    case 'agotado': return 'Agotado';
    default: return 'Disponible';
  }
}

export function generateTicketText(
  venta: Venta,
  detalles: DetalleVenta[],
  pagos: Array<{ metodo: string; monto: number; cliente_fiado_id?: string }>,
  productos: Producto[],
  negocioNombre: string
): string {
  const fecha = new Date(venta.fecha).toLocaleString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const lineas = detalles.map(detalle => {
    const producto = productos.find(p => p.id === detalle.producto_id);
    const nombre = producto?.nombre || 'Producto';
    return `${detalle.cantidad} x ${formatBs(detalle.precio_unitario)}  ${nombre}`;
  });

  const pagosLines = pagos.map(p => 
    `${p.metodo.charAt(0) + p.metodo.slice(1).toLowerCase()}: ${formatBs(p.monto)}`
  );

  return `
${negocioNombre.toUpperCase()}
${'='.repeat(32)}
Fecha: ${fecha}
Venta: #${venta.id.slice(0, 8)}
${'-'.repeat(32)}
${lineas.join('\n')}
${'-'.repeat(32)}
${pagosLines.join('\n')}
${'='.repeat(32)}
TOTAL: ${formatBs(venta.total)}
${'='.repeat(32)}
¡Gracias por su compra!
  `.trim();
}

export function generateWhatsAppUrl(phone: string, message: string): string {
  // Normalize phone: remove +, spaces, dashes
  const cleanPhone = phone.replace(/[+\s-]/g, '');
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

export function createVentaPayload(
  items: CartItem[],
  pagos: Array<{ metodo: string; monto: number; cliente_fiado_id?: string }>,
  clientTxId: string
): { venta: Omit<Venta, 'id' | 'creado_en' | 'sincronizado_en'>; detalles: Omit<DetalleVenta, 'id'>[] } {
  const { total } = calculateTotals(items);
  const metodoPago = (pagos.length === 1 
    ? pagos[0].metodo 
    : 'MIXTO') as Venta['metodo_pago'];

  const venta = {
    fecha: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    total,
    metodo_pago: metodoPago,
    estado_sync: 'PENDIENTE' as const,
    client_tx_id: clientTxId,
  };

  const detalles = items.map(item => ({
    venta_id: '', // Se llena después
    producto_id: item.producto.id,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
  }));

  return { venta, detalles };
}