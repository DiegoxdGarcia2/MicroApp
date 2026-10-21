import { useState, useEffect, useCallback, useMemo } from 'react';
import { Producto } from '../../db/types';
import { cuentaPorCobrarRepository, movimientoCobroRepository } from '../../db/repositories';
import { 
  calculatePendingBalance,
  applyPayment,
  getAccountStatus,
  generatePaymentReminder,
  generateWhatsAppReminderUrl,
  validateCuentaPorCobrar,
  formatBs,
} from './fiadosUtils';
import { Layout, PageHeader, Card, CardHeader } from '../../components/layout/Layout';
import { StockBadge } from '../../components/common/StockBadge';
import { ProductoFormModal } from '../venta/ProductoFormModal'; // Reusing modal structure

interface FiadosPageProps {}

export function FiadosPage() {
  const [cuentas, setCuentas] = useState<Array<any>>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoCuentas, setCargandoCuentas] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'VENCIDO'>('Todos');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editandoCuenta, setEditandoCuenta] = useState<any | null>(null);
  const [cargandoCuentas, setCargandoCuentas] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    pendiente: 0,
    parcial: 0,
    pagado: 0,
    vencido: 0,
    totalPorCobrar: 0,
  });

  const cargarCuentas = useCallback(async () => {
    try {
      setCargandoCuentas(true);
      const ctas = await cuentaPorCobrarRepository.getAll();
      setCuentas(ctas);
      
      // Calcular stats
      const statsCalc = {
        total: ctas.length,
        pendiente: ctas.filter(c => c.estado === 'PENDIENTE').length,
        parcial: ctas.filter(c => c.estado === 'PARCIAL').length,
        pagado: ctas.filter(c => c.estado === 'PAGADO').length,
        vencido: ctas.filter(c => c.estado === 'VENCIDO').length,
        totalPorCobrar: ctas.reduce((s, c) => s + c.saldo_pendiente, 0),
      };
      setStats(statsCalc);
    } catch (err) {
      console.error('Error cargando cuentas:', err);
    } finally {
      setCargando(false);
      setCargandoCuentas(false);
    }
  }, []);

  useEffect(() => {
    cargarCuentas();
  }, [cargarCuentas]);

  const cuentasFiltradas = useMemo(() => {
    let resultado = [...cuentas];

    // Filtro búsqueda
    if (query.trim()) {
      const lower = query.toLowerCase();
      resultado = resultado.filter(c => 
        c.cliente_nombre.toLowerCase().includes(lower) ||
        c.cliente_telefono?.toLowerCase().includes(lower)
      );
    }

    // Filtro estado
    if (statusFilter !== 'Todos') {
      resultado = resultado.filter(c => c.estado === statusFilter);
    }

    return resultado;
  }, [cuentas, query, statusFilter]);

  const handleAbrirFormulario = (cuenta?: any) => {
    if (cuenta) {
      setEditandoCuenta(cuenta);
    } else {
      setEditandoCuenta(null);
    }
    setShowForm(true);
  };

  const handleGuardarCuenta = async (data: any) => {
    try {
      if (editandoCuenta) {
        await cuentaPorCobrarRepository.update({ ...editandoCuenta, ...data, actualizado_en: new Date().toISOString() });
      } else {
        await cuentaPorCobrarRepository.create({
          id: crypto.randomUUID(),
          ...data,
          creado_en: new Date().toISOString(),
          actualizado_en: new Date().toISOString(),
        });
      }
      setShowForm(false);
      setEditandoCuenta(null);
      await cargarCuentas();
    } catch (err) {
      console.error('Error guardando cuenta:', err);
      alert('Error al guardar cuenta');
    }
  };

  const handleAbrirCobro = (cuenta: any) => {
    setShowCobro(true);
    setCobroCuenta(cuenta);
  };

  const handleCobroGuardado = async (data: any) => {
    try {
      await cuentaPorCobrarRepository.aplicarPago(
        cobroCuenta.id,
        data.monto,
        data.metodo,
        data.notas
      );
      setShowCobro(false);
      setCobroCuenta(null);
      await cargarCuentas();
    } catch (err) {
      console.error('Error en cobro:', err);
      alert('Error al registrar cobro');
    }
  };

  const handleRecordarWhatsApp = (cuenta: any) => {
    const url = generateWhatsAppReminderUrl(cuenta);
    window.open(url, '_blank');
  };

  const handleVerDetalle = (cuenta: any) => {
    setVerDetalle(cuenta);
    setShowDetalle(true);
  };

  if (cargando) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-muted">Cargando cuentas por cobrar...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Cuentas por Cobrar"
          description="Gestión de fiados y recordatorios de cobro"
          action={
            <button 
              onClick={() => handleAbrirFormulario()}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nuevo Fiado
            </button>
          }
        />

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Total Cuentas</p>
                <p className="text-h2 font-semibold text-primary mt-1">{stats.total}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Pendientes</p>
              <p className="text-h2 font-semibold text-amber-600 mt-1">{stats.pendiente}</p>
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
              <p className="text-sm text-muted">Vencidos</p>
              <p className="text-h2 font-semibold text-red-600 mt-1">{stats.vencido}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Por Cobrar</p>
              <p className="text-h2 font-semibold text-primary mt-1">{formatBs(stats.totalPorCobrar)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <Card className="lg:col-span-3">
          <CardHeader title="Cuentas por Cobrar" subtitle={`${cuentasFiltradas.length} de ${cuentas.length} cuentas`} />
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead className="bg-surface-alt">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Teléfono</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Monto Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Saldo Pendiente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Vencimiento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-alt">
                {cuentasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <p className="text-body">{query ? 'No se encontraron cuentas' : 'No hay cuentas por cobrar registradas'}</p>
                        {cuentas.length === 0 && (
                          <button onClick={() => handleAbrirFormulario()} className="btn-primary mt-4">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Registrar primer fiado
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {cuentasFiltradas.map(cuenta => (
                      <tr key={cuenta.id} className="hover:bg-surface-alt transition-colors">
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-primary truncate max-w-xs">{cuenta.cliente_nombre}</p>
                            <p className="text-xs text-muted">{cuenta.cliente_telefono}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-muted">
                          {cuenta.cliente_telefono}
                        </td>
                        <td className="px-4 py-4 font-medium text-primary">
                          {cuenta.monto_total.toLocaleString('es-BO', { style: 'currency', currency: 'BOB', minimumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-4 font-bold text-primary">
                          {cuenta.saldo_pendiente.toLocaleString('es-BO', { style: 'currency', currency: 'BOB', minimumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-4 text-sm text-muted">
                          {new Date(cuenta.fecha_vencimiento).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            cuenta.estado === 'PENDIENTE' ? 'bg-amber-100 text-amber-800' :
                            cuenta.estado === 'PARCIAL' ? 'bg-blue-100 text-blue-700' :
                            cuenta.estado === 'PAGADO' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {cuenta.estado}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleRecordarWhatsApp(cuenta)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              aria-label={`Recordar por WhatsApp a ${cuenta.cliente_nombre}`}
                              title="Recordar por WhatsApp"
                            >
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.03-.138-.06-.277-.1-.41l1.708-5.862a.502.502 0 00-.114-.542L12.375 2.25c-.143-.461-.68-.757-1.248-.757H6.286c-.56 0-1.044.42-.855 1.013l-1.306 2.801A14.727 14.727 0 002 13.365a14.7 14.7 0 003.566 7.16l2.177 2.858a14.9 14.9 0 006.312 1.931l1.759-.912a21.029 21.029 0 007.264-5.974l3.537-6.038c.502-.86.86-1.87.86-2.91v-.02c0-2.29-1.88-4.222-4.5-4.5-2.67-.05-5.27.78-5.5 1.5-.14.45-.22.95-.22 1.44v.06c0 .66.14 1.3.4.9.26.4.6.8.98 1.1.5.27.35.82 1.04 1.42 1.04.56 0 1.06-.2 1.33-.65a2.8 2.8 0 001.12-1.88l.8-.97c.89-.87 1.32-2.12 1.32-3.56 0-.88-.27-1.7-.82-2.5l-.7-.71c-.3-.3-.7-.46-1.1-.46h-.02c-.47 0-.92.19-1.3.52L2.5 11.4c-.6.52-.6 1.27-.03 1.73l2.2 3.06c.18.18.2.42.14.64-.13.37-.53 1.47-1.6 1.47H2.5c-1.38 0-2.5-1.12-2.5-2.5S3.5 3 4.5 3h7.86l1.69-2.38c.36-.5.24-1.31-.35-1.74-.8-.6-.9-1.16-.6-1.79.26-.5.24-1 .54-1.44.03-.06.05-.12.08-.19.04-.1.04-.21.02-.31-.02-.22 0-.43.08-.62.22-.31.38-.55.84-1.25 1.46-1.46 2.5 0 1.07.57 2.06 1.41 2.33.18.33.18.68 0 .92.13.3.09.6.1.82a.5.5 0 00.63-.15l3.57-2.58a1 1 0 011.41-.34h1.67a1 1 0 011 1v7.2c0 .55-.45 1-1 1H3.5a.5.5 0 01-.35-.86l1.85-2.66c.38-.52.3-1.1.5-1.5.2-.3.7-.9 1.5-1.5.17-.3.47-.6.9-.9.34-.33.84-.73 1.4-.83.3-.05.6-.13.8-.12 1.13-.04.66.2 1.2.85 1.2.23.23.1.47.1 1.7-.05 1.33-.78 2.6-.98 3.1-.7.14-.2.27-.4.5-.54.18-.1.25-.25.25-.39.15-.42-.11-.83-.5-1.2-1.2-1.4zm14.5 1.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0 0" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Card>
              <CardHeader title="Estadísticas" subtitle="Resumen general" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-primary-50 rounded-xl">
                  <p className="text-sm text-muted">Total por Cobrar</p>
                  <p className="text-h2 font-semibold text-primary mt-1">{formatBs(stats.totalPorCobrar || 0)}</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-xl">
                  <p className="text-sm text-muted">Pendientes</p>
                  <p className="text-h2 font-semibold text-amber-600 mt-1">{cuentas.filter(c => c.estado === 'PENDIENTE').length}</p>
                </div>
                <div className="p-4 bg-red-50 rounded-xl">
                  <p className="text-sm text-muted">Vencidos</p>
                  <p className="text-h2 font-semibold text-red-600 mt-1">{cuentas.filter(c => c.estado === 'VENCIDO').length}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-xl">
                  <p className="text-sm text-muted">Pagados</p>
                  <p className="text-h2 font-semibold text-green-600 mt-1">{cuentas.filter(c => c.estado === 'PAGADO').length}</p>
                </div>
              </div>
            </Card>

            {/* FiadoFormModal - reutilizar estructura de ProductoFormModal */}
          </div>
        </Layout>
      );
    };
  };

  return (
    <Layout>
      {vista === 'dashboard' ? renderDashboard() : vista === 'venta' ? <VentaRapidaPage /> : vista === 'inventario' ? <InventarioPage /> : <FiadosPage />}
    </Layout>
  );
}