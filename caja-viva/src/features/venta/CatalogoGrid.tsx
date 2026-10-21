import { useState, useMemo } from 'react';
import type { Producto } from '../../db/types';
import { 
  filterProducts, 
  sortProducts, 
  getStockStatus, 
  getStockStatusLabel,
  formatBs 
} from './ventaUtils';
import { ThinkingOrb } from '../../components/common/ThinkingOrb';

interface CatalogoGridProps {
  productos: Producto[];
  onAgregarAlCarrito: (producto: Producto) => void;
  carritoIds: Set<string>;
  categorias: string[];
}

export function CatalogoGrid({ 
  productos, 
  onAgregarAlCarrito, 
  carritoIds,
  categorias 
}: CatalogoGridProps) {
  const [query, setQuery] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState<string>('Todas');
  const [ordenCampo, setOrdenCampo] = useState<keyof Producto>('nombre');
  const [ordenDireccion, setOrdenDireccion] = useState<'asc' | 'desc'>('asc');
  const [cargando] = useState(false);

  // Filtrar y ordenar productos
  const productosFiltrados = useMemo(() => {
    let resultado = filterProducts(productos, query, categoriaActiva !== 'Todas' ? categoriaActiva : undefined);
    resultado = sortProducts(resultado, ordenCampo, ordenDireccion);
    return resultado;
  }, [productos, query, categoriaActiva, ordenCampo, ordenDireccion]);

  const handleOrdenChange = (campo: keyof Producto) => {
    if (ordenCampo === campo) {
      setOrdenDireccion(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setOrdenCampo(campo);
      setOrdenDireccion('asc');
    }
  };

  const getStockClass = (producto: Producto) => {
    const status = getStockStatus(producto);
    switch (status) {
      case 'critico': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'agotado': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-green-100 text-green-800 border-green-300';
    }
  };

  const getStockIcon = (producto: Producto) => {
    const status = getStockStatus(producto);
    switch (status) {
      case 'critico': return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
      case 'agotado': return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
      default: return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Barra de búsqueda y filtros */}
      <div className="p-4 border-b border-surface-alt space-y-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, código o categoría..."
            className="input-field pl-10"
            aria-label="Buscar productos"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={categoriaActiva}
            onChange={(e) => setCategoriaActiva(e.target.value)}
            className="input-field py-2 flex-1 min-w-[150px]"
            aria-label="Filtrar por categoría"
          >
            <option value="Todas">Todas las categorías</option>
            {categorias.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={ordenCampo}
            onChange={(e) => setOrdenCampo(e.target.value as keyof Producto)}
            className="input-field py-2 w-36"
            aria-label="Ordenar por"
          >
            <option value="nombre">Nombre</option>
            <option value="precio_venta">Precio</option>
            <option value="stock_actual">Stock</option>
            <option value="categoria">Categoría</option>
          </select>

          <button
            onClick={() => handleOrdenChange(ordenCampo)}
            className="input-field py-2 w-10"
            aria-label={ordenDireccion === 'asc' ? 'Orden descendente' : 'Orden ascendente'}
          >
            <svg className={`w-5 h-5 mx-auto ${ordenDireccion === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h13m0 0v8m0-8l4 4-4 4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Grid de productos */}
      <div className="flex-1 overflow-y-auto p-4">
        {cargando ? (
          <div className="flex items-center justify-center h-64">
            <ThinkingOrb state="thinking" size="lg" label="Cargando catálogo..." />
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-body">No se encontraron productos</p>
            <p className="text-sm">Intenta ajustar tu búsqueda o filtros</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" role="list">
            {productosFiltrados.map(producto => {
              const enCarrito = carritoIds.has(producto.id);
              const stockStatus = getStockStatus(producto);
              const noDisponible = stockStatus === 'agotado';

              return (
                <article
                  key={producto.id}
                  className={`card relative flex flex-col ${enCarrito ? 'ring-2 ring-primary-500' : ''} ${noDisponible ? 'opacity-50' : ''}`}
                  role="listitem"
                >
                  {/* Badge de stock */}
                  <div className="absolute top-2 right-2 z-10">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStockClass(producto)}`}>
                      {getStockIcon(producto)}
                      <span>{getStockStatusLabel(stockStatus)}</span>
                      {stockStatus !== 'agotado' && <span className="ml-1">({producto.stock_actual})</span>}
                    </span>
                  </div>

                  {/* Imagen/Placeholder */}
                  <div className="aspect-square bg-surface-alt rounded-lg flex items-center justify-center mb-3 relative">
                    {producto.codigo_barras && (
                      <div className="absolute bottom-1 right-1 text-xs text-muted bg-surface/80 px-1 rounded">
                        {producto.codigo_barras.slice(-6)}
                      </div>
                    )}
                    <svg className="w-16 h-16 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>

                  {/* Info del producto */}
                  <div className="flex-1 flex flex-col">
                    <h3 className="font-medium text-primary line-clamp-1 mb-1">{producto.nombre}</h3>
                    {producto.categoria && (
                      <span className="text-xs text-muted mb-2">{producto.categoria}</span>
                    )}
                    <div className="mt-auto pt-2 border-t border-surface-alt">
                      <div className="flex items-center justify-between">
                        <span className="text-h3 font-bold text-primary">{formatBs(producto.precio_venta)}</span>
                        <button
                          onClick={() => onAgregarAlCarrito(producto)}
                          disabled={noDisponible || enCarrito || cargando}
                          className={`btn-primary px-3 py-1.5 text-sm ${noDisponible ? 'opacity-50 cursor-not-allowed' : ''}`}
                          aria-label={enCarrito ? 'Ya en carrito' : noDisponible ? 'Sin stock' : `Agregar ${producto.nombre} al carrito`}
                        >
                          {enCarrito ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}