import { useState, useCallback } from 'react';
import type { CartItem, PaymentValidation, PagoCreate } from './ventaUtils';
import { formatBs, validatePayment } from './ventaUtils';
import { ThinkingOrb } from '../../components/common/ThinkingOrb';

// SVG Icons as separate components
function EfectivoIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599 1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function QRIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  );
}

function FiadoIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function TrashIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PlusIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function MinusIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
    </svg>
  );
}

function AlertIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function CartIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 17a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2H7a2 2 0 00-2 2v4z" />
    </svg>
  );
}

interface CarritoPanelProps {
  items: CartItem[];
  totales: { subtotal: number; total: number };
  onActualizarCantidad: (productoId: string, cantidad: number) => void;
  onQuitarProducto: (productoId: string) => void;
  onLimpiarCarrito: () => void;
  onCobrar: (pagos: PagoCreate[]) => Promise<void>;
  cargando: boolean;
  ventaExitosa: boolean;
}

type MetodoPago = 'EFECTIVO' | 'QR' | 'FIADO';

const METODOS_PAGO: { value: MetodoPago; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { value: 'EFECTIVO', label: 'Efectivo', Icon: EfectivoIcon },
  { value: 'QR', label: 'QR / Transferencia', Icon: QRIcon },
  { value: 'FIADO', label: 'Fiado', Icon: FiadoIcon },
];

interface PagoFormProps {
  metodo: MetodoPago;
  monto: number;
  onMontoChange: (monto: number) => void;
  onRemove: () => void;
  total: number;
  pagos: Array<{ metodo: MetodoPago; monto: number }>;
  index: number;
  validation: PaymentValidation;
}

function PagoForm({ 
  metodo, 
  monto, 
  onMontoChange, 
  onRemove, 
  total, 
  pagos, 
  index,
  validation
}: PagoFormProps) {
  const MetodoIcon = METODOS_PAGO.find(m => m.value === metodo)?.Icon;
  const esUltimo = index === pagos.length - 1;
  const montoSugerido = esUltimo ? total - pagos.slice(0, -1).reduce((s, p) => s + p.monto, 0) : 0;
  const montoConSugerido = monto || (esUltimo ? Math.max(0, montoSugerido) : 0);

  const otrosPagos = pagos.filter((_, i) => i !== index).reduce((s, p) => s + p.monto, 0);
  const maxMonto = total - otrosPagos;

  return (
    <div className="card p-4 space-y-3 animate-slide-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600">
            {MetodoIcon && <MetodoIcon className="w-5 h-5" />}
          </div>
          <div>
            <label className="font-medium text-primary">{METODOS_PAGO.find(m => m.value === metodo)?.label}</label>
            <p className="text-xs text-muted">Pago #{index + 1}</p>
          </div>
        </div>
        {pagos.length > 1 && (
          <button
            onClick={onRemove}
            className="text-red-500 hover:text-red-700 text-sm font-medium"
            aria-label={`Eliminar pago ${METODOS_PAGO.find(m => m.value === metodo)?.label}`}
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-primary mb-1">Monto (Bs)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">Bs</span>
            <input
              type="number"
              min="0"
              max={maxMonto}
              step="1"
              value={montoConSugerido}
              onChange={(e) => onMontoChange(parseInt(e.target.value) || 0)}
              className="input-field pl-8 text-right"
              placeholder={esUltimo && montoSugerido > 0 ? `Sugerido: ${montoSugerido}` : '0'}
              aria-label={`Monto para ${METODOS_PAGO.find(m => m.value === metodo)?.label}`}
            />
          </div>
        </div>

        {metodo === 'FIADO' && (
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Cliente (obligatorio para fiado)</label>
            <select
              className="input-field"
              aria-label="Seleccionar cliente para fiado"
            >
              <option value="">Seleccionar cliente...</option>
            </select>
            <p className="text-xs text-muted">Los pagos a fiado requieren seleccionar un cliente</p>
          </div>
        )}

        {metodo === 'EFECTIVO' && (
          <div className="bg-surface-alt rounded-lg p-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted">Entregado:</span>
              <span className="font-medium">{montoConSugerido > 0 ? `Bs ${montoConSugerido.toLocaleString('es-BO')}` : 'Bs 0'}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted">Total venta:</span>
              <span className="font-medium">Bs {total.toLocaleString('es-BO')}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--color-green-500)' }}>
              <span className="font-medium">Cambio:</span>
              <span className="font-bold">Bs {(montoConSugerido - total).toLocaleString('es-BO')}</span>
            </div>
          </div>
        )}

        {!validation.valid && validation.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm flex items-center gap-2">
            <AlertIcon className="w-4 h-4 flex-shrink-0" />
            {validation.error}
          </div>
        )}
      </div>
    </div>
  );
}

export function CarritoPanel({ 
  items, 
  totales, 
  onActualizarCantidad, 
  onQuitarProducto, 
  onLimpiarCarrito, 
  onCobrar, 
  cargando, 
  ventaExitosa 
}: CarritoPanelProps) {
  const [pagos, setPagos] = useState<Array<{ metodo: 'EFECTIVO' | 'QR' | 'FIADO'; monto: number; cliente_fiado_id?: string }>>([
    { metodo: 'EFECTIVO', monto: 0 },
  ]);
  const [validation, setValidation] = useState<PaymentValidation>({ valid: true, diferencia: 0 });
  const [_clientesFiados] = useState<Array<{ id: string; nombre: string; telefono: string }>>([
    { id: 'cli-1', nombre: 'Juan Pérez', telefono: '+59171234567' },
    { id: 'cli-2', nombre: 'María López', telefono: '+59169876543' },
    { id: 'cli-3', nombre: 'Carlos Ruiz', telefono: '+59175555555' },
  ]);

  const total = totales.total;
  const subtotal = totales.subtotal;

  const actualizarPago = useCallback((index: number, campo: 'metodo' | 'monto' | 'cliente_fiado_id', valor: any) => {
    setPagos(prev => prev.map((p, i) => i === index ? { ...p, [campo]: valor } : p));
  }, []);

  const agregarPago = useCallback((metodo: 'EFECTIVO' | 'QR' | 'FIADO') => {
    const totalPagos = pagos.reduce((s, p) => s + p.monto, 0);
    const restante = total - totalPagos;
    if (restante <= 0) return;
    
    setPagos(prev => [...prev, { metodo, monto: restante }]);
  }, [pagos, total]);

  const quitarPago = useCallback((index: number) => {
    if (pagos.length <= 1) return;
    setPagos(prev => prev.filter((_, i) => i !== index));
  }, [pagos]);

  const montoPagos = pagos.reduce((s, p) => s + p.monto, 0);
  const validationResult = validatePayment(total, pagos as any);
  setValidation(validationResult);

  const pagoCompleto = validationResult.valid && montoPagos === total && total > 0;

  const handleCobrar = useCallback(async () => {
    if (!pagoCompleto) return;
    
    const pagosParaCobrar = pagos.map(p => ({
      metodo: p.metodo,
      monto: p.monto,
      cliente_fiado_id: p.metodo === 'FIADO' ? p.cliente_fiado_id : undefined,
      referencia_qr: p.metodo === 'QR' ? `QR-${Date.now()}` : undefined,
    }));
    
    await onCobrar(pagosParaCobrar);
  }, [pagos, total, onCobrar, pagoCompleto]);

  if (ventaExitosa) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <ThinkingOrb state="success" size="lg" label="Venta completada" />
        <h3 className="text-h3 font-semibold text-primary mt-4">¡Venta Completada!</h3>
        <p className="text-muted mt-2">La venta se registró correctamente offline</p>
        <button 
          onClick={() => window.location.reload()} 
          className="btn-primary mt-6"
        >
          Nueva Venta
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="p-4 border-b border-surface-alt">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-h3 font-semibold text-primary">Carrito ({items.length})</h2>
          {items.length > 0 && (
            <button 
              onClick={onLimpiarCarrito}
              className="text-sm text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
            >
              <TrashIcon className="w-4 h-4" />
              Limpiar
            </button>
          )}
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Subtotal:</span>
          <span className="font-medium text-primary">{formatBs(subtotal)}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-muted">
            <CartIcon className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-body">Carrito vacío</p>
            <p className="text-sm">Agrega productos desde el catálogo</p>
          </div>
        ) : (
          <>
            {items.map(item => (
              <div key={item.producto.id} className="card p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-primary truncate">{item.producto.nombre}</h4>
                  <p className="text-sm text-muted">{formatBs(item.precio_unitario)} c/u</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onActualizarCantidad(item.producto.id, item.cantidad - 1)}
                    disabled={item.cantidad <= 1}
                    className="w-8 h-8 rounded-lg border border-surface-alt flex items-center justify-center hover:bg-surface-alt disabled:opacity-50"
                    aria-label="Disminuir cantidad"
                  >
                    <MinusIcon className="w-4 h-4" />
                  </button>
                  <span className="w-10 text-center font-medium text-primary">{item.cantidad}</span>
                  <button
                    onClick={() => onActualizarCantidad(item.producto.id, item.cantidad + 1)}
                    disabled={item.cantidad >= item.producto.stock_actual}
                    className="w-8 h-8 rounded-lg border border-surface-alt flex items-center justify-center hover:bg-surface-alt disabled:opacity-50"
                    aria-label="Aumentar cantidad"
                  >
                    <PlusIcon className="w-4 h-4" />
                  </button>
                  <div className="w-24 text-right ml-2">
                    <p className="font-bold text-primary">{formatBs(item.cantidad * item.precio_unitario)}</p>
                    <button
                      onClick={() => onQuitarProducto(item.producto.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="border-t border-surface-alt p-4 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {METODOS_PAGO.map(m => (
            <button
              key={m.value}
              onClick={() => agregarPago(m.value)}
              disabled={pagos.reduce((s, p) => s + p.monto, 0) >= total}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                pagos.some(p => p.metodo === m.value)
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-surface-alt text-muted hover:border-primary-300'
              }`}
            >
              <m.Icon className="w-5 h-5" />
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {pagos.map((pago, index) => (
            <PagoForm
              key={index}
              metodo={pago.metodo}
              monto={pago.monto}
              onMontoChange={(monto) => actualizarPago(index, 'monto', monto)}
              onRemove={() => quitarPago(index)}
              total={total}
              pagos={pagos}
              index={index}
              validation={index === pagos.length - 1 ? validation : { valid: true, diferencia: 0 }}
            />
          ))}
        </div>

        <div className="border-t border-surface-alt pt-4 space-y-3">
          <div className="flex justify-between text-lg">
            <span className="font-medium text-primary">Total a cobrar:</span>
            <span className="font-bold text-h3 text-primary">{formatBs(total)}</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-muted">Recibido:</span>
            <span className={`font-medium ${montoPagos >= total ? 'text-green-600' : 'text-muted'}`}>
              {formatBs(montoPagos)}
            </span>
          </div>

          {montoPagos > total && (
            <div className="flex justify-between text-sm text-green-600">
              <span className="font-medium">Cambio:</span>
              <span className="font-bold">{formatBs(montoPagos - total)}</span>
            </div>
          )}

          <button
            onClick={handleCobrar}
            disabled={!pagoCompleto || cargando}
            className={`btn-primary w-full py-4 text-lg font-semibold ${!pagoCompleto ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {cargando ? (
              <>
                <ThinkingOrb state="processing" size="sm" label="Procesando venta..." />
                <span className="ml-2">Procesando...</span>
              </>
            ) : (
              `Cobrar ${formatBs(total)}`
            )}
          </button>

          {!pagoCompleto && (
            <p className="text-center text-sm text-muted">
              {montoPagos === 0 
                ? 'Selecciona un método de pago para comenzar' 
                : `Faltan ${formatBs(total - montoPagos)} para completar el pago`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}