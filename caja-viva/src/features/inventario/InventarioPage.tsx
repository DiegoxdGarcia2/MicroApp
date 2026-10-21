import { useState, useEffect, useCallback, useMemo } from 'react';
import { productoRepository, movimientoStockRepository } from '../../db/repositories';
import { sortProducts } from './inventarioUtils';
import { ProductoFormModal } from './ProductoFormModal';
import { AjusteStockModal } from './AjusteStockModal';
import { Layout, PageHeader, Card } from '../../components/layout/Layout';
import { StockBadge } from '../../components/common/StockBadge';

export function InventarioPage() {
  const [productos, setProductos] = useState<Array<any>>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [, setCargandoProductos] = useState(false);
  const [query, setQuery] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState<string>('Todos');
  const [stockFilter, setStockFilter] = useState<'Todos' | 'OK' | 'BAJO' | 'AGOTADO'>('Todos');
  const [ordenCampo, setOrdenCampo] = useState<'nombre' | 'precio_venta' | 'stock_actual' | 'categoria'>('nombre');
  const [ordenDireccion, setOrdenDireccion] = useState<'asc' | 'desc'>('asc');

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editandoProducto, setEditandoProducto] = useState<any | null>(null);
  const [showAjuste, setShowAjuste] = useState(false);
  const [ajusteProducto, setAjusteProducto] = useState<any | null>(null);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    ok: 0,
    bajo: 0,
    agotado: 0,
    valorCosto: 0,
    valorVenta: 0,
  });

  const cargarProductos = useCallback(async () => {
    try {
      setCargandoProductos(true);
      const prods = await productoRepository.getAll();
      setProductos(prods);
      
      // Extraer categorías únicas
      const cats = [...new Set(prods.map(p => p.categoria).filter(Boolean))] as string[];
      setCategorias(['Todos', ...cats.sort()]);
      
      // Calcular stats
      const statsCalc = {
        total: prods.length,
        ok: prods.filter(p => p.stock_actual > p.stock_minimo && p.stock_actual > 0).length,
        bajo: prods.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo).length,
        agotado: prods.filter(p => p.stock_actual === 0).length,
        valorCosto: prods.reduce((s, p) => s + p.costo * p.stock_actual, 0),
        valorVenta: prods.reduce((s, p) => s + p.precio_venta * p.stock_actual, 0),
      };
      setStats(statsCalc);
    } catch (err) {
      console.error('Error cargando productos:', err);
    } finally {
      setCargando(false);
      setCargandoProductos(false);
    }
  }, []);

  useEffect(() => {
    cargarProductos();
  }, [cargarProductos]);

  // Filtrar y ordenar productos
  const productosFiltrados = useMemo(() => {
    let resultado = [...productos];

    // Filtro búsqueda
    if (query.trim()) {
      resultado = resultado.filter(p => 
        p.nombre.toLowerCase().includes(query.toLowerCase()) ||
        p.codigo_barras?.toLowerCase().includes(query.toLowerCase()) ||
        p.categoria?.toLowerCase().includes(query.toLowerCase())
      );
    }

    // Filtro categoría
    if (categoriaActiva !== 'Todos') {
      resultado = resultado.filter(p => p.categoria === categoriaActiva);
    }

    // Filtro stock
    if (stockFilter !== 'Todos') {
      resultado = resultado.filter(p => {
        if (stockFilter === 'AGOTADO') return p.stock_actual === 0;
        if (stockFilter === 'BAJO') return p.stock_actual > 0 && p.stock_actual <= p.stock_minimo;
        if (stockFilter === 'OK') return p.stock_actual > p.stock_minimo;
        return true;
      });
    }

    // Ordenar
    resultado = sortProducts(resultado, ordenCampo, ordenDireccion);
    return resultado;
  }, [productos, query, categoriaActiva, stockFilter, ordenCampo, ordenDireccion]);

  // Stats derivados
  const handleAbrirFormulario = (producto?: any) => {
    if (producto) {
      setEditandoProducto(producto);
    } else {
      setEditandoProducto(null);
    }
    setShowForm(true);
  };

  const handleGuardarProducto = async (data: any) => {
    try {
      if (editandoProducto) {
        await productoRepository.update({ ...editandoProducto, ...data, actualizado_en: new Date().toISOString() });
      } else {
        await productoRepository.create({
          id: crypto.randomUUID(),
          ...data,
          creado_en: new Date().toISOString(),
          actualizado_en: new Date().toISOString(),
        });
      }
      setShowForm(false);
      setEditandoProducto(null);
      await cargarProductos();
    } catch (err) {
      console.error('Error guardando producto:', err);
      alert('Error al guardar producto');
    }
  };

  const handleAbrirAjuste = (producto: any) => {
    setAjusteProducto(producto);
    setShowAjuste(true);
  };

  const handleAjusteGuardado = async (movimiento: any) => {
    try {
      await movimientoStockRepository.createWithStockUpdate(movimiento, productoRepository);
      setShowAjuste(false);
      setAjusteProducto(null);
      await cargarProductos();
    } catch (err) {
      console.error('Error en ajuste:', err);
      alert('Error al realizar ajuste');
    }
  };

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar este producto permanentemente?')) return;
    try {
      await productoRepository.delete(id);
      await cargarProductos();
    } catch (err) {
      console.error('Error eliminando:', err);
      alert('Error al eliminar');
    }
  };

  const handleOrdenChange = (campo: 'nombre' | 'precio_venta' | 'stock_actual' | 'categoria') => {
    if (ordenCampo === campo) {
      setOrdenDireccion(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setOrdenCampo(campo);
      setOrdenDireccion('asc');
    }
  };

  if (cargando) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-muted">Cargando inventario...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Inventario"
        description={`Gestión de stock - ${productos.length} productos | Valor stock: ${(stats.valorVenta || 0).toLocaleString('es-BO')} Bs`}
        action={
          <button 
            onClick={() => handleAbrirFormulario()}
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo Producto
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Total Productos</p>
              <p className="text-h2 font-semibold text-primary mt-1">{stats.total}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Stock OK</p>
              <p className="text-h2 font-semibold text-green-600 mt-1">{stats.ok}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Stock Bajo</p>
              <p className="text-h2 font-semibold text-amber-600 mt-1">{stats.bajo}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Agotados</p>
              <p className="text-h2 font-semibold text-red-600 mt-1">{stats.agotado}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
        </Card>
      </div>

      {/* Filtros y búsqueda */}
      <Card className="mb-6">
        <div className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
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
            <select
              value={categoriaActiva}
              onChange={(e) => setCategoriaActiva(e.target.value)}
              className="input-field py-2 w-full sm:w-48"
              aria-label="Filtrar por categoría"
            >
              <option value="Todas">Todas las categorías</option>
              {categorias.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as any)}
              className="input-field py-2 w-full sm:w-40"
              aria-label="Filtrar por estado de stock"
            >
              <option value="Todos">Todos los estados</option>
              <option value="OK">✓ Stock OK</option>
              <option value="BAJO">⚠ Stock Bajo</option>
              <option value="AGOTADO">✗ Agotados</option>
            </select>
            <select
              value={ordenCampo}
              onChange={(e) => setOrdenCampo(e.target.value as 'nombre' | 'precio_venta' | 'stock_actual' | 'categoria')}
              className="input-field py-2 w-full sm:w-36"
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
      </Card>

      {/* Tabla de productos */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full" role="table">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Producto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Categoría</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Stock</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Precio</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Valor Stock</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-alt">
              {productosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      <p className="text-muted">{query ? 'No se encontraron productos' : 'No hay productos registrados'}</p>
                      {!query && (
                        <button onClick={() => handleAbrirFormulario()} className="btn-primary">
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Crear primer producto
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                productosFiltrados.map(producto => {
                  return (
                    <tr key={producto.id} className="hover:bg-surface-alt transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-surface-alt rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-primary truncate">{producto.nombre}</p>
                            {producto.codigo_barras && (
                              <p className="text-xs text-muted font-mono">{producto.codigo_barras}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {producto.categoria && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
                            {producto.categoria}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <StockBadge producto={producto} size="sm" />
                        </div>
                      </td>
                      <td className="px-4 py-4 text-primary font-medium">
                        {(producto.precio_venta || 0).toLocaleString('es-BO', { style: 'currency', currency: 'BOB', minimumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-4 text-primary font-medium">
                        {((producto.precio_venta || 0) * (producto.stock_actual || 0)).toLocaleString('es-BO', { style: 'currency', currency: 'BOB', minimumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-4">
                        <StockBadge producto={producto} size="md" />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleAbrirAjuste(producto)}
                            className="p-2 text-muted hover:text-primary hover:bg-surface-alt rounded-lg transition-colors"
                            aria-label={`Ajustar stock de ${producto.nombre}`}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21l-3-3 3-3 3.293-3.293 3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleAbrirFormulario(producto)}
                            className="p-2 text-muted hover:text-primary hover:bg-surface-alt rounded-lg transition-colors"
                            aria-label={`Editar ${producto.nombre}`}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleEliminar(producto.id)}
                            className="p-2 text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            aria-label={`Eliminar ${producto.nombre}`}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ProductoFormModal */}
      <ProductoFormModal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditandoProducto(null); }}
        onSubmit={handleGuardarProducto}
        initialData={editandoProducto}
        isEditing={!!editandoProducto}
      />

      {/* AjusteStockModal */}
      <AjusteStockModal
        isOpen={showAjuste}
        onClose={() => { setShowAjuste(false); setAjusteProducto(null); }}
        producto={ajusteProducto}
        onSubmit={handleAjusteGuardado}
      />
    </Layout>
  );
}