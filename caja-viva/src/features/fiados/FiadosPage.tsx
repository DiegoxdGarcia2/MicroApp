import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CuentaPorCobrar } from '../../db/types';
import { cuentaPorCobrarRepository, syncQueueRepository } from '../../db/repositories';
import {
  getAccountStatus,
  generateWhatsAppReminderUrl,
  validateCuentaPorCobrar,
  formatBs,
} from './fiadosUtils';
import { Layout, PageHeader, Card, CardHeader } from '../../components/layout/Layout';

type EstadoFiltro = 'Todos' | 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'VENCIDO';

function fechaEnDias(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().split('T')[0];
}

function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const ESTADO_BADGE: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  PARCIAL: 'bg-blue-100 text-blue-700',
  PAGADO: 'bg-green-100 text-green-700',
  VENCIDO: 'bg-red-100 text-red-700',
};

interface FormState {
  cliente_nombre: string;
  cliente_telefono: string;
  monto_total: string;
  fecha_vencimiento: string;
}

const FORM_INICIAL: FormState = {
  cliente_nombre: '',
  cliente_telefono: '+591',
  monto_total: '',
  fecha_vencimiento: fechaEnDias(15),
};

export function FiadosPage() {
  const [cuentas, setCuentas] = useState<CuentaPorCobrar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EstadoFiltro>('Todos');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [formError, setFormError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargarCuentas = useCallback(async () => {
    try {
      const ctas = await cuentaPorCobrarRepository.getAll();
      setCuentas(ctas);
    } catch (error) {
      console.error('Error cargando fiados:', error);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarCuentas();
  }, [cargarCuentas]);

  const cuentasConEstado = useMemo(
    () => cuentas.map((cuenta) => ({ ...cuenta, estado: getAccountStatus(cuenta) })),
    [cuentas],
  );

  const filtradas = useMemo(() => {
    const termino = query.trim().toLowerCase();
    return cuentasConEstado.filter((cuenta) => {
      const coincideTexto =
        termino.length === 0 ||
        cuenta.cliente_nombre.toLowerCase().includes(termino) ||
        cuenta.cliente_telefono.includes(termino);
      const coincideEstado = statusFilter === 'Todos' || cuenta.estado === statusFilter;
      return coincideTexto && coincideEstado;
    });
  }, [cuentasConEstado, query, statusFilter]);

  const stats = useMemo(
    () => ({
      total: cuentasConEstado.length,
      pendiente: cuentasConEstado.filter((c) => c.estado === 'PENDIENTE').length,
      vencido: cuentasConEstado.filter((c) => c.estado === 'VENCIDO').length,
      totalPorCobrar: cuentasConEstado.reduce((sum, c) => sum + c.saldo_pendiente, 0),
    }),
    [cuentasConEstado],
  );

  const handleRecordarWhatsApp = (cuenta: CuentaPorCobrar) => {
    window.open(generateWhatsAppReminderUrl(cuenta), '_blank');
  };

  const handleGuardar = async () => {
    const monto = Number(form.monto_total);
    const validacion = validateCuentaPorCobrar({
      cliente_nombre: form.cliente_nombre,
      cliente_telefono: form.cliente_telefono,
      monto_total: monto,
      saldo_pendiente: monto,
      fecha_vencimiento: form.fecha_vencimiento,
    });

    if (!validacion.valid) {
      setFormError(validacion.errors[0]);
      return;
    }

    setGuardando(true);
    setFormError(null);
    try {
      const now = new Date().toISOString();
      const cuenta: CuentaPorCobrar = {
        id: crypto.randomUUID(),
        cliente_nombre: form.cliente_nombre.trim(),
        cliente_telefono: form.cliente_telefono.trim(),
        monto_total: monto,
        saldo_pendiente: monto,
        fecha_vencimiento: form.fecha_vencimiento,
        estado: 'PENDIENTE',
        creado_en: now,
        actualizado_en: now,
      };

      await cuentaPorCobrarRepository.create(cuenta);
      await syncQueueRepository.enqueue({
        tipo_entidad: 'CUENTA_POR_COBRAR',
        accion: 'CREATE',
        entity_id: cuenta.id,
        client_tx_id: crypto.randomUUID(),
        payload: cuenta as unknown as Record<string, unknown>,
        timestamp: now,
      });

      setForm(FORM_INICIAL);
      setShowForm(false);
      await cargarCuentas();
    } catch (error) {
      console.error('Error guardando fiado:', error);
      setFormError('No se pudo guardar el fiado');
    } finally {
      setGuardando(false);
    }
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
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nuevo Fiado
            </button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <p className="text-sm text-muted">Total Cuentas</p>
            <p className="text-h2 font-semibold text-primary mt-1">{stats.total}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Pendientes</p>
            <p className="text-h2 font-semibold text-amber-600 mt-1">{stats.pendiente}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Vencidos</p>
            <p className="text-h2 font-semibold text-red-600 mt-1">{stats.vencido}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Por Cobrar</p>
            <p className="text-h2 font-semibold text-primary mt-1">{formatBs(stats.totalPorCobrar)}</p>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Fiados registrados"
            subtitle={`${filtradas.length} de ${cuentas.length} cuentas`}
          />
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por cliente o teléfono..."
              className="input-field flex-1"
              aria-label="Buscar fiados"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as EstadoFiltro)}
              className="input-field sm:w-48"
              aria-label="Filtrar por estado"
            >
              <option value="Todos">Todos los estados</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="PARCIAL">Parcial</option>
              <option value="VENCIDO">Vencido</option>
              <option value="PAGADO">Pagado</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead className="bg-surface-alt">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Teléfono</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Saldo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Vencimiento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-alt">
                {filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted">
                      {cuentas.length === 0
                        ? 'No hay cuentas por cobrar registradas'
                        : 'No se encontraron cuentas con ese filtro'}
                    </td>
                  </tr>
                ) : (
                  filtradas.map((cuenta) => (
                    <tr key={cuenta.id} className="hover:bg-surface-alt transition-colors">
                      <td className="px-4 py-4">
                        <p className="font-medium text-primary">{cuenta.cliente_nombre}</p>
                      </td>
                      <td className="px-4 py-4 text-muted">{cuenta.cliente_telefono}</td>
                      <td className="px-4 py-4">
                        <p className="font-bold text-primary">{formatBs(cuenta.saldo_pendiente)}</p>
                        <p className="text-xs text-muted">de {formatBs(cuenta.monto_total)}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted">
                        {formatearFecha(cuenta.fecha_vencimiento)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_BADGE[cuenta.estado] ?? 'bg-surface-alt text-muted'}`}
                        >
                          {cuenta.estado}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => handleRecordarWhatsApp(cuenta)}
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors"
                          aria-label={`Recordar por WhatsApp a ${cuenta.cliente_nombre}`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 4.54 0 8.24 3.69 8.24 8.23s-3.7 8.24-8.23 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.17-.47-.29z" />
                          </svg>
                          Recordar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <h3 className="text-h3 font-semibold text-primary mb-4">Nuevo Fiado</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="cliente_nombre" className="block text-sm font-medium text-primary mb-1">
                  Nombre del cliente
                </label>
                <input
                  id="cliente_nombre"
                  className="input-field"
                  value={form.cliente_nombre}
                  onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })}
                  placeholder="Ej: Doña Rosa"
                />
              </div>
              <div>
                <label htmlFor="cliente_telefono" className="block text-sm font-medium text-primary mb-1">
                  Teléfono (WhatsApp)
                </label>
                <input
                  id="cliente_telefono"
                  className="input-field"
                  value={form.cliente_telefono}
                  onChange={(e) => setForm({ ...form, cliente_telefono: e.target.value })}
                  placeholder="+59171234567"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="monto_total" className="block text-sm font-medium text-primary mb-1">
                    Monto (Bs)
                  </label>
                  <input
                    id="monto_total"
                    type="number"
                    min="0"
                    step="0.5"
                    className="input-field"
                    value={form.monto_total}
                    onChange={(e) => setForm({ ...form, monto_total: e.target.value })}
                    placeholder="50"
                  />
                </div>
                <div>
                  <label htmlFor="fecha_vencimiento" className="block text-sm font-medium text-primary mb-1">
                    Vence
                  </label>
                  <input
                    id="fecha_vencimiento"
                    type="date"
                    className="input-field"
                    value={form.fecha_vencimiento}
                    onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })}
                  />
                </div>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  setFormError(null);
                }}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button className="btn-primary" onClick={() => void handleGuardar()} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar Fiado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
