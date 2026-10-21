import { useCallback, useState } from 'react';
import { generateId, nowISO } from '../db/schema';
import { 
  productoRepository, 
  ventaRepository, 
  detalleVentaRepository,
  syncQueueRepository 
} from '../db/repositories';
import type { 
  Producto, Venta, DetalleVenta, PagoCreate,
  CartItem, Totals 
} from '../features/venta/ventaUtils';
import { createVentaPayload } from '../features/venta/ventaUtils';

export interface UseVentaRapidaReturn {
  // Estado
  carrito: CartItem[];
  totales: Totals;
  cargando: boolean;
  error: string | null;
  ventaExitosa: Venta | null;

  // Acciones carrito
  agregarProducto: (producto: Producto, cantidad?: number) => void;
  quitarProducto: (productoId: string) => void;
  actualizarCantidad: (productoId: string, cantidad: number) => void;
  limpiarCarrito: () => void;

  // Proceso de venta
  procesarVenta: (pagos: PagoCreate[]) => Promise<{ success: boolean; venta?: Venta; error?: string }>;
  
  // Utilidades
  puedeCobrar: boolean;
}

export function useVentaRapida(): UseVentaRapidaReturn {
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ventaExitosa, setVentaExitosa] = useState<Venta | null>(null);

  // Totales reactivos
  const subtotal = carrito.reduce((sum, item) => sum + item.cantidad * item.precio_unitario, 0);
  const totales: Totals = { subtotal, total: subtotal };

  const agregarProducto = useCallback((producto: Producto, cantidad = 1) => {
    setCarrito(prev => {
      const existing = prev.find(item => item.producto.id === producto.id);
      if (existing) {
        const nuevaCantidad = existing.cantidad + cantidad;
        if (nuevaCantidad > producto.stock_actual) {
          return prev;
        }
        return prev.map(item => 
          item.producto.id === producto.id 
            ? { ...item, cantidad: nuevaCantidad }
            : item
        );
      }
      if (cantidad > producto.stock_actual) return prev;
      return [...prev, { producto, cantidad, precio_unitario: producto.precio_venta }];
    });
    setError(null);
  }, []);

  const quitarProducto = useCallback((productoId: string) => {
    setCarrito(prev => prev.filter(item => item.producto.id !== productoId));
  }, []);

  const actualizarCantidad = useCallback((productoId: string, cantidad: number) => {
    if (cantidad <= 0) {
      quitarProducto(productoId);
      return;
    }
    setCarrito(prev => prev.map(item => 
      item.producto.id === productoId 
        ? { ...item, cantidad: Math.min(cantidad, item.producto.stock_actual) }
        : item
    ));
  }, [quitarProducto]);

  const limpiarCarrito = useCallback(() => {
    setCarrito([]);
    setVentaExitosa(null);
    setError(null);
  }, []);

  const procesarVenta = useCallback(async (pagos: PagoCreate[]): Promise<{ success: boolean; venta?: Venta; error?: string }> => {
    if (carrito.length === 0) {
      return { success: false, error: 'El carrito está vacío' };
    }

    // Validar pagos
    const { total } = totales;
    const totalPagos = pagos.reduce((sum, p) => sum + p.monto, 0);
    if (totalPagos !== total) {
      return { success: false, error: `El total de pagos (${totalPagos}) no coincide con el total de la venta (${total})` };
    }

    // Validar FIADO
    for (const pago of pagos) {
      if (pago.metodo === 'FIADO' && !pago.cliente_fiado_id) {
        return { success: false, error: 'Los pagos a FIADO requieren seleccionar un cliente' };
      }
    }

    setCargando(true);
    setError(null);

    try {
      const clientTxId = generateId();
      const { venta, detalles } = createVentaPayload(carrito, pagos, clientTxId);

      // 1. Guardar venta en IndexedDB
      const ventaCompleta: Venta = {
        ...venta,
        id: generateId(),
        creado_en: nowISO(),
        sincronizado_en: null,
      };
      await ventaRepository.create(ventaCompleta);

      // 2. Guardar detalles
      const detallesCompletos: DetalleVenta[] = detalles.map(d => ({
        ...d,
        id: generateId(),
        venta_id: ventaCompleta.id,
      }));
      await detalleVentaRepository.createBatch(detallesCompletos);

      // 3. Descontar stock de cada producto
      for (const item of carrito) {
        await productoRepository.updateStock(item.producto.id, -item.cantidad);
      }

      // 4. Encolar en sync_queue
      await syncQueueRepository.enqueue({
        tipo_entidad: 'VENTA',
        accion: 'CREATE',
        entity_id: ventaCompleta.id,
        client_tx_id: clientTxId,
        payload: {
          venta: ventaCompleta,
          detalles: detallesCompletos,
        },
        timestamp: nowISO(),
      });

      // 5. Si hay pagos FIADO, crear/en actualizar cuentas por cobrar
      for (const pago of pagos) {
        if (pago.metodo === 'FIADO' && pago.cliente_fiado_id) {
          await syncQueueRepository.enqueue({
            tipo_entidad: 'MOVIMIENTO_COBRO',
            accion: 'CREATE',
            entity_id: generateId(),
            client_tx_id: generateId(),
            payload: {
              cuenta_cobrar_id: pago.cliente_fiado_id,
              monto: pago.monto,
              metodo: 'FIADO',
              fecha: new Date().toISOString(),
              notas: `Venta #${ventaCompleta.id.slice(0, 8)}`,
            },
            timestamp: nowISO(),
          });
        }
      }

      // Éxito
      setVentaExitosa(ventaCompleta);
      limpiarCarrito();
      
      return { success: true, venta: ventaCompleta };

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido al procesar la venta';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setCargando(false);
    }
  }, [carrito, totales]);

  const puedeCobrar = carrito.length > 0 && !cargando;

  return {
    carrito,
    totales,
    cargando,
    error,
    ventaExitosa,
    agregarProducto,
    quitarProducto,
    actualizarCantidad,
    limpiarCarrito,
    procesarVenta,
    puedeCobrar,
  };
}