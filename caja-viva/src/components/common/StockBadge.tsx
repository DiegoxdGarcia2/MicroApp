import type { ReactNode } from 'react';
import { getStockStatusInfo, type StockStatus } from '../../features/inventario/inventarioUtils';
import type { Producto } from '../../db/types';

interface StockBadgeProps {
  producto: Producto;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

const BG_COLORS: Record<StockStatus['type'], string> = {
  OK: 'bg-green-100 text-green-800 border-green-300',
  BAJO: 'bg-amber-100 text-amber-800 border-amber-300',
  AGOTADO: 'bg-red-100 text-red-800 border-red-300',
};

const ICONS: Record<StockStatus['type'], ReactNode> = {
  OK: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  BAJO: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  AGOTADO: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

/** Badge de estado de stock (OK / Bajo / Agotado). */
export function StockBadge({ producto, size = 'md', showLabel = true, className = '' }: StockBadgeProps) {
  const status = getStockStatusInfo(producto);

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${SIZE_CLASSES[size]} font-medium border rounded-full ${BG_COLORS[status.type]} ${className}`}
      title={`Stock: ${producto.stock_actual} / mínimo ${producto.stock_minimo}`}
    >
      {ICONS[status.type]}
      {showLabel && <span>{status.label}</span>}
      {size !== 'sm' && (
        <span className="font-mono text-xs">
          {producto.stock_actual}/{producto.stock_minimo}
        </span>
      )}
    </span>
  );
}
