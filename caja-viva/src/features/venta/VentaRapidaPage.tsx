import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Producto } from '../../db/types';
import { productoRepository } from '../../db/repositories';
import { useVentaRapida } from '../../hooks/useVentaRapida';
import { CatalogoGrid } from './CatalogoGrid';
import { CarritoPanel } from './CarritoPanel';
import { Layout, PageHeader, Card, CardHeader } from '../../components/layout/Layout';
import { ThinkingOrb } from '../../components/common/ThinkingOrb';
import { formatBs } from './ventaUtils';
import type { PagoCreate } from './ventaUtils';

export function VentaRapidaPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);
  const [vistaMovil, setVistaMovil] = useState<'catalogo' | 'carrito'>('catalogo');

  const {
    carrito,
    totales,
    cargando: cargandoVenta,
    error,
    ventaExitosa,
    agregarProducto,
    quitarProducto,
    actualizarCantidad,
    limpiarCarrito,
    procesarVenta,
  } = useVentaRapida();

  // Cargar productos al montar
  const cargarProductos = useCallback(async () => {
    try {
      setCargandoProductos(true);
      const prods = await productoRepository.getAll();
      setProductos(prods);
      
      // Extraer categorías únicas
      const cats = [...new Set(prods.map(p => p.categoria).filter(Boolean))] as string[];
      setCategorias(['Todas', ...cats.sort()]);
    } catch (err) {
      console.error('Error cargando productos:', err);
    } finally {
      setCargandoProductos(false);
    }
  }, []);

  useEffect(() => {
    cargarProductos();
  }, [cargarProductos]);

  // Detectar móvil
  useEffect(() => {
    const checkMobile = () => {
      setVistaMovil(window.innerWidth < 768 ? 'catalogo' : 'catalogo');
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const carritoIds = new Set(carrito.map(item => item.producto.id));

  const handleCobrar = useCallback(async (pagos: PagoCreate[]) => {
    await procesarVenta(pagos);
  }, [procesarVenta]);

  // Filtrar y ordenar productos
  const productosFiltrados = useMemo(() => {
    // Aquí se podría agregar lógica de filtrado si se necesita
    return productos;
  }, [productos]);

  if (cargandoProductos) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <ThinkingOrb state="processing" size="lg" label="Cargando productos..." />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {vistaMovil === 'catalogo' && carrito.length > 0 && (
        <div className="lg:hidden fixed bottom-4 right-4 z-50">
          <button
            onClick={() => setVistaMovil('carrito')}
            className="btn-primary flex items-center gap-2 shadow-lg px-6 py-3"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 17a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2H7a2 2 0 00-2 2v4z" />
            </svg>
            <span>Carrito ({carrito.length})</span>
            <span className="bg-primary-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {formatBs(totales.total)}
            </span>
          </button>
        </div>
      )}

      <div className={vistaMovil === 'carrito' && window.innerWidth < 768 ? 'lg:hidden' : ''}>
        <PageHeader
          title="Nueva Venta"
          description="Registra una venta rápida: efectivo, QR o fiado"
          action={
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted hidden sm:block">
                {carrito.length} items · {formatBs(totales.total)}
              </span>
              {carrito.length > 0 && (
                <button
                  onClick={limpiarCarrito}
                  className="btn-secondary text-sm hidden sm:block"
                >
                  Limpiar carrito
                </button>
              )}
            </div>
          }
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77-1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
            <button 
              onClick={() => window.location.reload()} 
              className="ml-auto text-sm font-medium underline"
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Catálogo - 2/3 en desktop */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader 
                title="Catálogo de Productos" 
                subtitle={`${productosFiltrados.length} de ${productos.length} productos`}
              />
              <div className="h-[calc(100vh-280px)] min-h-[500px]">
                <CatalogoGrid
                  productos={productosFiltrados}
                  onAgregarAlCarrito={agregarProducto}
                  carritoIds={carritoIds}
                  categorias={categorias}
                />
              </div>
            </Card>
          </div>

          {/* Carrito - 1/3 en desktop, full en mobile cuando vistaMovil === 'carrito' */}
          <div className={`lg:col-span-1 ${vistaMovil === 'carrito' && window.innerWidth < 768 ? 'fixed inset-0 z-50 bg-surface overflow-y-auto' : ''}`}>
            <Card className="h-full min-h-[500px] flex flex-col">
              <CarritoPanel
                items={carrito}
                totales={totales}
                onActualizarCantidad={actualizarCantidad}
                onQuitarProducto={quitarProducto}
                onLimpiarCarrito={limpiarCarrito}
                onCobrar={handleCobrar}
                cargando={cargandoVenta}
                ventaExitosa={!!ventaExitosa}
              />
            </Card>
            
            {vistaMovil === 'carrito' && window.innerWidth < 768 && (
              <button
                onClick={() => setVistaMovil('catalogo')}
                className="fixed bottom-4 left-4 right-4 lg:hidden btn-secondary"
              >
                ← Volver al catálogo
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}