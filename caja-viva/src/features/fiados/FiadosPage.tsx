import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CuentaPorCobrar, MovimientoCobro } from '../../db/types';
import { cuentaPorCobrarRepository } from '../../db/repositories';
import {
  getAccountStatus,
  generateWhatsAppReminderUrl,
  validateCuentaPorCobrar,
  formatBs,
} from './fiadosUtils';
import { normalizarTexto } from '../venta/ventaUtils';
import { addDaysLocal, formatFechaLocal } from '../../utils/dateUtils';
import { Layout, PageHeader, Card, CardHeader } from '../../components/layout/Layout';

type EstadoFiltro = 'Todos' | 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'VENCIDO';

function formatearFecha(iso: string): string {
  return formatFechaLocal(iso);
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
  fecha_vencimiento: addDaysLocal(15),
};

interface PagoFormState {
  monto: string;
  metodo: MovimientoCobro['metodo'];
  notas: string;
}

const PAGO_INICIAL: PagoFormState = {
  monto: '',
  metodo: 'EFECTIVO',
  notas: '',
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

  // Cobro de un fiado existente
  const [cuentaPago, setCuentaPago] = useState<CuentaPorCobrar | null>(null);
  const [pagoForm, setPagoForm] = useState<PagoFormState>(PAGO_INICIAL);
  const [pagoError, setPagoError] = useState<string | null>(null);
  const [procesandoPago, setProcesandoPago] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

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
    const termino = normalizarTexto(query.trim());
    return cuentasConEstado.filter((cuenta) => {
      const coincideTexto =
        termino.length === 0 ||
        normalizarTexto(cuenta.cliente_nombre).includes(termino) ||
        cuenta.cliente_telefono.includes(termino);
      const coincideEstado = statusFilter === 'Todos' || cuenta.estado === statusFilter;
      return coincideTexto && coincideEstado;
    });
  }, [cuentasConEstado, query, statusFilter]);

  const stats = useMemo(
    () => ({
      total: cuentasConEstado.length,
      pendiente: cuentasConEstado.filter((c) => c.estado === 'PENDIENTE' || c.estado === 'PARCIAL').length,
      vencido: cuentasConEstado.filter((c) => c.estado === 'VENCIDO').length,
      totalPorCobrar: cuentasConEstado.reduce((sum, c) => sum + c.saldo_pendiente, 0),
    }),
    [cuentasConEstado],
  );

  const handleRecordarWhatsApp = (cuenta: CuentaPorCobrar) => {
    window.open(generateWhatsAppReminderUrl(cuenta), '_blank');
  };

  const abrirCobro = (cuenta: CuentaPorCobrar) => {
    setCuentaPago(cuenta);
    setPagoForm({ ...PAGO_INICIAL, monto: String(cuenta.saldo_pendiente) });
    setPagoError(null);
  };

  const cerrarCobro = () => {
    if (procesandoPago) return;
    setCuentaPago(null);
    setPagoForm(PAGO_INICIAL);
    setPagoError(null);
  };

  const handleRegistrarPago = async () => {
    if (!cuentaPago) return;
    const monto = Number(pagoForm.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setPagoError('Ingresa un monto mayor a 0');
      return;
    }
    if (monto > cuentaPago.saldo_pendiente) {
      setPagoError(`El monto no puede superar el saldo de ${formatBs(cuentaPago.saldo_pendiente)}`);
      return;
    }

    setProcesandoPago(true);
    setPagoError(null);
    try {
      const resultado = await cuentaPorCobrarRepository.aplicarPago(
        cuentaPago.id,
        monto,
        pagoForm.metodo,
        pagoForm.notas.trim() || null,
      );
      if (!resultado) {
        setPagoError('La cuenta ya no existe');
        return;
      }
      setMensaje(
        `Pago de ${formatBs(monto)} registrado. Saldo pendiente: ${formatBs(resultado.cuenta.saldo_pendiente)}`,
      );
      setCuentaPago(null);
      setPagoForm(PAGO_INICIAL);
      await cargarCuentas();
    } catch (error) {
      setPagoError(error instanceof Error ? error.message : 'No se pudo registrar el pago');
    } finally {
      setProcesandoPago(false);
    }
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

        {mensaje && (
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <span className="flex-1">{mensaje}</span>
            <button onClick={() => setMensaje(null)} className="font-semibold" aria-label="Cerrar mensaje">×</button>
          </div>
        )}

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
                        <div className="flex items-center justify-end gap-1">
                          {cuenta.saldo_pendiente > 0 && (
                            <button
                              onClick={() => abrirCobro(cuenta)}
                              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 transition-colors"
                              aria-label={`Registrar pago de ${cuenta.cliente_nombre}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              Cobrar
                            </button>
                          )}
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
                        </div>
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
                    min="1"
                    step="1"
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
      {cuentaPago && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <h3 className="text-h3 font-semibold text-primary mb-1">Registrar pago</h3>
            <p className="text-sm text-muted mb-4">
              {cuentaPago.cliente_nombre} · Saldo {formatBs(cuentaPago.saldo_pendiente)}
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="pago_monto" className="block text-sm font-medium text-primary mb-1">
                  Monto a cobrar (Bs)
                </label>
                <div className="flex gap-2">
                  <input
                    id="pago_monto"
                    type="number"
                    min="1"
                    max={cuentaPago.saldo_pendiente}
                    step="1"
                    className="input-field flex-1"
                    value={pagoForm.monto}
                    onChange={(e) => setPagoForm({ ...pagoForm, monto: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn-secondary whitespace-nowrap"
                    onClick={() => setPagoForm({ ...pagoForm, monto: String(cuentaPago.saldo_pendiente) })}
                  >
                    Saldo total
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="pago_metodo" className="block text-sm font-medium text-primary mb-1">
                  Método
                </label>
                <select
                  id="pago_metodo"
                  className="input-field"
                  value={pagoForm.metodo}
                  onChange={(e) => setPagoForm({ ...pagoForm, metodo: e.target.value as MovimientoCobro['metodo'] })}
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="QR">QR</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select>
              </div>
              <div>
                <label htmlFor="pago_notas" className="block text-sm font-medium text-primary mb-1">
                  Notas (opcional)
                </label>
                <input
                  id="pago_notas"
                  className="input-field"
                  value={pagoForm.notas}
                  onChange={(e) => setPagoForm({ ...pagoForm, notas: e.target.value })}
                  placeholder="Ej: pago parcial acordado"
                />
              </div>
              {pagoError && <p className="text-sm text-red-600">{pagoError}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button className="btn-secondary" onClick={cerrarCobro} disabled={procesandoPago}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={() => void handleRegistrarPago()} disabled={procesandoPago}>
                {procesandoPago ? 'Registrando...' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
