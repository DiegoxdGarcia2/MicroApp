import { useState } from 'react';
import { Card, CardHeader } from '../../components/layout/Layout';

interface AjusteStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto: any;
  onSubmit: (movimiento: any) => Promise<void>;
  cargando?: boolean;
}

const TIPO_OPCIONES = [
  { value: 'ENTRADA', label: 'Entrada (Compra/Reposición)', color: 'green', icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ) },
  { value: 'SALIDA', label: 'Salida (Venta directa/Merma)', color: 'red', icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
    </svg>
  ) },
  { value: 'MERMA', label: 'Merma (Pérdida/Daño/Vencido)', color: 'amber', icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ) },
  { value: 'AJUSTE', label: 'Ajuste (Corrección inventario)', color: 'blue', icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21l-3-3 3-3 3.293-3.293 3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ) },
];

export function AjusteStockModal({ 
  isOpen, 
  onClose, 
  producto, 
  onSubmit, 
  cargando = false 
}: AjusteStockModalProps) {
  const [tipo, setTipo] = useState<'ENTRADA' | 'SALIDA' | 'MERMA' | 'AJUSTE'>('ENTRADA');
  const [cantidad, setCantidad] = useState<number>(0);
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (cantidad <= 0) {
      setError('La cantidad debe ser mayor a 0');
      return;
    }
    
    if (!notas.trim()) {
      setError('Las notas son obligatorias');
      return;
    }

    const movimiento = {
      tipo: tipo,
      cantidad: cantidad,
      notas: notas.trim(),
      producto_id: producto.id,
      producto_nombre: producto.nombre,
    };

    await onSubmit(movimiento);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-surface rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto animate-slide-in">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21l-3-3 3-3 3.293-3.293 3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-h3 font-semibold text-primary">Ajuste de Stock</h2>
                <p className="text-sm text-muted">{producto?.nombre}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted hover:text-primary transition-colors"
              aria-label="Cerrar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {producto && (
            <Card className="mb-4">
              <CardHeader title="Stock Actual" subtitle={`${producto.stock_actual} unidades (Mín: ${producto.stock_minimo})`} />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted">Stock Actual</p>
                  <p className="text-h3 font-semibold text-primary">{producto.stock_actual}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted">Mínimo</p>
                  <p className="text-h3 font-semibold text-amber-600">{producto.stock_minimo}</p>
                </div>
              </div>
            </Card>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-primary mb-2">Tipo de Ajuste</label>
              <div className="grid grid-cols-2 gap-2">
                {TIPO_OPCIONES.map(opcion => (
                  <button
                    key={opcion.value}
                    type="button"
                    onClick={() => setTipo(opcion.value as any)}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      tipo === opcion.value
                        ? `border-${opcion.color}-500 bg-${opcion.color}-50 text-${opcion.color}-700`
                        : 'border-surface-alt text-muted hover:border-primary-300'
                    }`}
                    aria-pressed={tipo === opcion.value}
                  >
                    <span className={`w-5 h-5 ${tipo === opcion.value ? `text-${opcion.color}-600` : 'text-muted'}`}>
                      {opcion.icon}
                    </span>
                    <span>{opcion.label}</span>
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-primary mb-1">Cantidad <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">unid.</span>
                  <input
                    type="number"
                    value={cantidad}
                    onChange={(e) => setCantidad(parseInt(e.target.value) || 0)}
                    min="1"
                    step="1"
                    className="input-field pl-8 text-right"
                    placeholder="Cantidad"
                    required
                    disabled={cargando}
                    aria-label="Cantidad a ajustar"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-primary mb-1">Notas / Motivo <span className="text-red-500">*</span></label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={3}
                  className="input-field"
                  placeholder="Ej: Reposición de proveedor, Merma por vencimiento, Ajuste por inventario físico..."
                  required
                  disabled={cargando}
                  aria-label="Motivo del ajuste"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={cargando}
                className={`btn-primary w-full py-4 text-lg font-semibold ${cargando ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {cargando ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="none" stroke="currentColor" d="M4 12a8 8 0 018-8V0" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                    Procesando...
                  </>
                ) : (
                  `Registrar ${tipo === 'ENTRADA' ? 'Entrada' : tipo === 'SALIDA' ? 'Salida' : tipo === 'MERMA' ? 'Merma' : 'Ajuste'}`
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}