import type { Venta, DetalleVenta, Producto } from '../db/types';
import type { UUID } from '../db/types';
import { formatBs, generateWhatsAppUrl } from '../features/venta/ventaUtils';

// Define PagoCreate locally since it's not exported from db/types
interface PagoCreate {
  metodo: 'EFECTIVO' | 'QR' | 'FIADO';
  monto: number;
  referencia_qr?: string;
  cliente_fiado_id?: UUID;
}

export interface TicketData {
  venta: Venta;
  detalles: DetalleVenta[];
  pagos: PagoCreate[];
  productos: Producto[];
  negocio: {
    nombre: string;
    direccion?: string;
    telefono?: string;
    nit?: string;
  };
}

/**
 * Genera el texto formateado del ticket de venta
 */
export function generateTicketText(data: TicketData): string {
  const { venta, detalles, pagos, productos, negocio } = data;
  
  const fecha = new Date(venta.fecha).toLocaleString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const lineas = detalles.map(detalle => {
    const producto = productos.find(p => p.id === detalle.producto_id);
    const nombre = producto?.nombre || 'Producto';
    const subtotal = detalle.cantidad * detalle.precio_unitario;
    return `${detalle.cantidad} x ${formatBs(detalle.precio_unitario)}  ${nombre}  ${formatBs(subtotal)}`;
  });

  const pagosLines = pagos.map(p => {
    const metodoLabel = p.metodo.charAt(0) + p.metodo.slice(1).toLowerCase();
    return `${metodoLabel}: ${formatBs(p.monto)}`;
  });

  const metodoPago = pagos.length === 1 ? pagos[0].metodo : 'MIXTO';
  const metodoLabel = metodoPago.charAt(0) + metodoPago.slice(1).toLowerCase();

  return `
${negocio.nombre.toUpperCase()}
${negocio.direccion ? negocio.direccion : ''}
${negocio.telefono ? `Tel: ${negocio.telefono}` : ''}
${negocio.nit ? `NIT: ${negocio.nit}` : ''}
${'='.repeat(38)}
Fecha: ${fecha}
Venta: #${venta.id.slice(0, 8).toUpperCase()}
Método: ${metodoLabel}
${'-'.repeat(38)}
${lineas.join('\n')}
${'-'.repeat(38)}
${pagosLines.join('\n')}
${'='.repeat(38)}
TOTAL: ${formatBs(venta.total)}
${'='.repeat(38)}
¡Gracias por su compra!
Vuelve pronto
  `.trim();
}

/**
 * Genera el enlace wa.me para enviar el ticket por WhatsApp
 */
export function generateWhatsAppTicketUrl(
  phone: string, 
  ticketText: string
): string {
  return generateWhatsAppUrl(phone, ticketText);
}

/**
 * Genera un ticket compacto para pantalla (menos líneas)
 */
export function generateCompactTicketText(data: TicketData): string {
  const { venta, detalles, pagos, productos, negocio } = data;
  
  const fecha = new Date(venta.fecha).toLocaleString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const itemsText = detalles.map(d => {
    const prod = productos.find(p => p.id === d.producto_id);
    return `${d.cantidad}x ${prod?.nombre || 'Prod'} ${formatBs(d.precio_unitario)}`;
  }).join(', ');

  const pagosText = pagos.map(p => `${p.metodo.slice(0,3)}:${formatBs(p.monto)}`).join(' | ');

  return `${negocio.nombre} | ${fecha} | ${itemsText} | ${pagosText} | TOTAL: ${formatBs(venta.total)}`;
}

/**
 * Genera el mensaje prellenado para WhatsApp con el ticket
 */
export function generateWhatsAppMessage(data: TicketData): string {
  const ticketText = generateTicketText(data);
  return `🧾 *${data.negocio.nombre}*
  
${ticketText}

---
Enviado desde CajaViva`;
}

/**
 * Abre WhatsApp con el ticket prellenado
 */
export function openWhatsAppWithTicket(phone: string, data: TicketData): void {
  const message = generateWhatsAppMessage(data);
  const url = generateWhatsAppTicketUrl(phone, message);
  window.open(url, '_blank');
}

/**
 * Descarga el ticket como archivo de texto
 */
export function downloadTicketAsText(data: TicketData, filename?: string): void {
  const text = generateTicketText(data);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `ticket-${data.venta.id.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Imprime el ticket (abre diálogo de impresión del navegador)
 */
export function printTicket(data: TicketData): void {
  const text = generateTicketText(data);
  const printWindow = window.open('', '_blank', 'width=400,height=600');
  if (printWindow) {
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Ticket - ${data.negocio.nombre}</title>
          <style>
            body { font-family: monospace; padding: 20px; font-size: 12px; }
            .ticket { white-space: pre-wrap; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="ticket">${text}</div>
          <script>window.onload = () => window.print();<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }
}