import { useState, useEffect, useCallback } from 'react';
import { Layout, PageHeader, Card, CardHeader } from './components/layout/Layout';
import { ThinkingOrb } from './components/common/ThinkingOrb';
import { SyncBadge, SyncToast } from './components/common/SyncBadge';
import { initDB } from './db/schema';
import { productoRepository } from './db/repositories';
import { VentaRapidaPage } from './features/venta/VentaRapidaPage';
import { InventarioPage } from './features/inventario/InventarioPage';
import { FiadosPage } from './features/fiados/FiadosPage';
import { seedDemoData } from './features/demo/demoData';
import { useSyncStatus } from './hooks/useSyncStatus';

type Vista = 'dashboard' | 'venta' | 'inventario' | 'fiados';

function formatHora(iso: string | null): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const [vista, setVista] = useState<Vista>('dashboard');
  const [dbReady, setDbReady] = useState(false);
  const [productosCount, setProductosCount] = useState(0);
  const [ventasCount, setVentasCount] = useState(0);
  const [fiadosCount, setFiadosCount] = useState(0);
  const [syncStats, setSyncStats] = useState({ pendientes: 0, procesando: 0, completados: 0, errores: 0 });
  const [seeding, setSeeding] = useState(false);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);
  const sync = useSyncStatus();

  const loadStats = useCallback(async () => {
    try {
      const [productos, ventas, fiados, queue] = await Promise.all([
        productoRepository.getAll(),
        import('./db/repositories').then(m => m.ventaRepository.getAll()),
        import('./db/repositories').then(m => m.cuentaPorCobrarRepository.getAll()),
        import('./db/repositories').then(m => m.syncQueueRepository.getEstadisticas()),
      ]);
      setProductosCount(productos.length);
      setVentasCount(ventas.length);
      setFiadosCount(fiados.length);
      setSyncStats(queue);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }, []);

  useEffect(() => {
    async function initialize() {
      await initDB();
      setDbReady(true);
      await loadStats();
    }
    void initialize();
  }, [loadStats]);

  // Refresca contadores tras cada sincronizacion exitosa
  useEffect(() => {
    if (dbReady && sync.lastSyncAt) void loadStats();
  }, [dbReady, sync.lastSyncAt, loadStats]);

  const handleSeedDemo = async () => {
    setSeeding(true);
    setDemoMsg(null);
    try {
      const result = await seedDemoData();
      setDemoMsg(
        result.insertados > 0
          ? `${result.insertados} productos de Santa Cruz cargados`
          : `Los ${result.omitidos} productos demo ya estaban cargados`,
      );
      await loadStats();
    } catch (error) {
      console.error('Error cargando datos demo:', error);
      setDemoMsg('No se pudieron cargar los datos demo');
    } finally {
      setSeeding(false);
    }
  };

  const syncSlot = (
    <SyncBadge
      state={sync.state}
      pending={sync.pending}
      syncing={sync.syncing}
      onSync={() => void sync.runSync()}
    />
  );

  if (!dbReady) {
    return (
      <Layout syncSlot={syncSlot}>
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <ThinkingOrb state="processing" size="lg" label="Inicializando base de datos..." />
        </div>
      </Layout>
    );
  }

  const renderDashboard = () => (
    <div className="space-y-6">
      <PageHeader 
        title="Dashboard" 
        description="Resumen rápido de tu negocio"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Productos</p>
              <p className="text-h2 font-semibold text-primary mt-1">{productosCount}</p>
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
              <p className="text-sm text-muted">Ventas Hoy</p>
              <p className="text-h2 font-semibold text-primary mt-1">{ventasCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 17a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2H7a2 2 0 00-2 2v4z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Fiados Activos</p>
              <p className="text-h2 font-semibold text-primary mt-1">{fiadosCount}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Pendientes Sync</p>
              <p className="text-h2 font-semibold text-primary mt-1">{syncStats.pendientes}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Acciones Rápidas" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button 
              onClick={() => setVista('venta')}
              className="btn-primary w-full justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nueva Venta
            </button>
            <button
              onClick={() => setVista('inventario')}
              className="btn-secondary w-full justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Nuevo Producto
            </button>
            <button
              onClick={() => setVista('fiados')}
              className="btn-secondary w-full justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Registrar Fiado
            </button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Probar con datos de demostración"
            subtitle="10 productos típicos de una tienda de Santa Cruz de la Sierra"
          />
          <p className="text-sm text-muted mb-4">
            Carga el catálogo de ejemplo para probar ventas, fiados y cierre de caja en tu celular
            sin registrar productos uno por uno. Si ya existen, no se duplican.
          </p>
          <button
            onClick={() => void handleSeedDemo()}
            disabled={seeding}
            className="btn-primary w-full justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            {seeding ? 'Cargando catálogo...' : 'Cargar Datos de Demostración'}
          </button>
          {demoMsg && (
            <p className="mt-3 text-sm text-green-700" role="status">
              {demoMsg}
            </p>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Sincronización con Neon"
            subtitle={`Última verificación: ${formatHora(sync.lastSyncAt)}`}
            action={
              <span
                className={`text-xs font-medium ${
                  sync.state === 'synced'
                    ? 'text-green-600'
                    : sync.state === 'error'
                      ? 'text-red-600'
                      : 'text-amber-600'
                }`}
              >
                {sync.state === 'synced'
                  ? 'Al día'
                  : sync.state === 'pending'
                    ? 'Pendiente'
                    : sync.state === 'offline'
                      ? 'Sin conexión'
                      : sync.state === 'disabled'
                        ? 'Modo local'
                        : sync.state === 'error'
                          ? 'Error'
                          : 'Verificando'}
              </span>
            }
          />
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Pendientes</span>
              <span className="font-medium text-amber-600">{syncStats.pendientes}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Procesando</span>
              <span className="font-medium text-primary">{syncStats.procesando}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Completados</span>
              <span className="font-medium text-green-600">{syncStats.completados}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Errores</span>
              <span className="font-medium text-red-600">{syncStats.errores}</span>
            </div>
            <div className="mt-3 space-y-2 border-t border-surface-alt pt-3 text-xs text-muted">
              <div className="flex items-center justify-between">
                <span>Servidor</span>
                <span className="font-medium text-primary">
                  {sync.state === 'disabled' ? 'No configurado' : 'Render + Neon'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Base de datos</span>
                <span>
                  {sync.engine ?? '—'}
                  {sync.latencyMs !== null ? ` · ${Math.round(sync.latencyMs)} ms` : ''}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => void sync.runSync()}
            disabled={sync.syncing || sync.state === 'disabled'}
            className="btn-primary w-full mt-4 justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {sync.syncing ? 'Sincronizando...' : 'Sincronizar Ahora'}
          </button>
        </Card>
      </div>

      <Card>
        <CardHeader 
          title="Thinking Orbs - Demo Estados" 
          subtitle="Componentes visuales de carga con licencia MIT"
        />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          <div className="flex flex-col items-center gap-3 p-4">
            <ThinkingOrb state="thinking" size="lg" label="Pensando..." />
            <div className="text-center">
              <p className="font-medium text-primary">Thinking</p>
              <p className="text-xs text-muted">Pulse + Rotate</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 p-4">
            <ThinkingOrb state="processing" size="lg" label="Procesando..." />
            <div className="text-center">
              <p className="font-medium text-primary">Processing</p>
              <p className="text-xs text-muted">Spin + Pulse</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 p-4">
            <ThinkingOrb state="success" size="lg" label="Completado" />
            <div className="text-center">
              <p className="font-medium text-green-600">Success</p>
              <p className="text-xs text-muted">Pop + Checkmark</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 p-4">
            <ThinkingOrb state="error" size="lg" label="Error" />
            <div className="text-center">
              <p className="font-medium text-red-600">Error</p>
              <p className="text-xs text-muted">Shake + Pulse</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );

  return (
    <Layout syncSlot={syncSlot}>
      {vista === 'dashboard' ? renderDashboard() : vista === 'venta' ? <VentaRapidaPage /> : vista === 'inventario' ? <InventarioPage /> : <FiadosPage />}
      {sync.state === 'synced' && sync.lastMessage && <SyncToast message={sync.lastMessage} />}
    </Layout>
  );
}