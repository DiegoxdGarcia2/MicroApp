import { useCallback, useState } from 'react';
import { generateId, nowISO } from '../db/schema';
import { addDaysLocal } from '../utils/dateUtils';
import { 
  productoRepository, 
  ventaRepository, 
  detalleVentaRepository,
  cuentaPorCobrarRepository,
  syncQueueRepository 
} from '../db/repositories';
import type { CuentaPorCobrar } from '../db/types';
import type { 
  Producto, Venta, DetalleVenta, PagoCreate,
  CartItem, Totals 
} from '../features/venta/ventaUtils';
import { createVentaPayload } from '../features/venta/ventaUtils';

const TELEFONO_BOLIVIANO = /^\+591[67]\d{7}$/;

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
    if (Math.abs(totalPagos - total) > 0.01) {
      return { success: false, error: `El total de pagos (${totalPagos}) no coincide con el total de la venta (${total})` };
    }

    // Validar FIADO: debe tener cliente y telefono para crear la cuenta.
    for (const pago of pagos) {
      if (pago.metodo !== 'FIADO') continue;
      if (!pago.cliente_fiado_nombre?.trim()) {
        return { success: false, error: 'Los pagos a FIADO requieren el nombre del cliente' };
      }
      if (!pago.cliente_fiado_telefono || !TELEFONO_BOLIVIANO.test(pago.cliente_fiado_telefono.trim())) {
        return { success: false, error: 'Teléfono inválido: usa el formato +5917XXXXXXX o +5916XXXXXXX' };
      }
    }

    setCargando(true);
    setError(null);

    try {
      const clientTxId = generateId();
      const { venta, detalles } = createVentaPayload(carrito, pagos, clientTxId);
      const ventaId = generateId();
      const now = nowISO();

      // 1. Crear una cuenta por cobrar por cada pago a fiado.
      //    Es una cuenta nueva por venta (US-003), con vencimiento a 15 dias.
      const pagosConCuenta = await Promise.all(pagos.map(async (pago) => {
        if (pago.metodo !== 'FIADO') return pago;

        const cuenta: CuentaPorCobrar = {
          id: generateId(),
          cliente_nombre: pago.cliente_fiado_nombre!.trim(),
          cliente_telefono: pago.cliente_fiado_telefono!.trim(),
          monto_total: pago.monto,
          saldo_pendiente: pago.monto,
          fecha_vencimiento: addDaysLocal(15),
          estado: 'PENDIENTE',
          creado_en: now,
          actualizado_en: now,
        };
        await cuentaPorCobrarRepository.create(cuenta);

        return {
          ...pago,
          cliente_fiado_id: cuenta.id,
          cliente_fiado_nombre: cuenta.cliente_nombre,
          cliente_fiado_telefono: cuenta.cliente_telefono,
        };
      }));

      // 2. Guardar la venta con el desglose real de pagos (para el cierre).
      const ventaCompleta: Venta = {
        ...venta,
        id: ventaId,
        pagos: pagosConCuenta.map(p => ({
          metodo: p.metodo,
          monto: p.monto,
          referencia_qr: p.referencia_qr,
          cliente_fiado_id: p.cliente_fiado_id,
          cliente_fiado_nombre: p.cliente_fiado_nombre,
          cliente_fiado_telefono: p.cliente_fiado_telefono,
        })),
        creado_en: now,
        sincronizado_en: null,
      };
      await ventaRepository.create(ventaCompleta);

      // 3. Guardar detalles
      const detallesCompletos: DetalleVenta[] = detalles.map(d => ({
        ...d,
        id: generateId(),
        venta_id: ventaCompleta.id,
      }));
      await detalleVentaRepository.createBatch(detallesCompletos);

      // 4. Descontar stock de cada producto (el backend lo hara al sincronizar la venta)
      for (const item of carrito) {
        await productoRepository.updateStock(item.producto.id, -item.cantidad);
      }

      // 5. Encolar la venta en sync_queue
      await syncQueueRepository.enqueue({
        tipo_entidad: 'VENTA',
        accion: 'CREATE',
        entity_id: ventaCompleta.id,
        client_tx_id: clientTxId,
        payload: {
          venta: ventaCompleta,
          detalles: detallesCompletos,
        },
        timestamp: now,
      });

      // Éxito
      setVentaExitosa(ventaCompleta);
      // No usar limpiarCarrito(): resetea ventaExitosa y oculta la pantalla de exito.
      setCarrito([]);
      
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