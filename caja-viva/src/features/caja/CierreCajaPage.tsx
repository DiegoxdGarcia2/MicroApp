import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArqueoCaja, GastoTurno, Venta } from '../../db/types';
import { arqueoRepository, ventaRepository } from '../../db/repositories';
import { generateId, nowISO, todayISO } from '../../db/schema';
import { formatFechaLocal } from '../../utils/dateUtils';
import { Layout, PageHeader, Card, CardHeader } from '../../components/layout/Layout';
import {
  calculateCierreTotals,
  calculateDiferencia,
  formatArqueoReport,
  formatBs,
  getDiferenciaInfo,
} from './cajaUtils';

const UMBRAL_KEY = 'cajaviva_umbral_caja';

function leerUmbral(): number {
  try {
    const guardado = Number(localStorage.getItem(UMBRAL_KEY));
    return Number.isInteger(guardado) && guardado >= 0 ? guardado : 5;
  } catch {
    return 5;
  }
}

const DIFERENCIA_CLASES = {
  verde: 'border-green-200 bg-green-50 text-green-800',
  ambar: 'border-amber-200 bg-amber-50 text-amber-800',
  rojo: 'border-red-200 bg-red-50 text-red-800',
};

export function CierreCajaPage() {
  const hoy = todayISO();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [arqueo, setArqueo] = useState<ArqueoCaja | null>(null);
  const [historial, setHistorial] = useState<ArqueoCaja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [gastos, setGastos] = useState<GastoTurno[]>([]);
  const [nuevoGasto, setNuevoGasto] = useState({ descripcion: '', monto: '' });
  const [fisico, setFisico] = useState('');
  const [umbral, setUmbral] = useState<number>(leerUmbral);
  const [confirmado, setConfirmado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [ventasHoy, cierreHoy, historialCierres] = await Promise.all([
        ventaRepository.getByFecha(hoy),
        arqueoRepository.getByFecha(hoy),
        arqueoRepository.getHistorial(10),
      ]);
      setVentas(ventasHoy);
      setArqueo(cierreHoy ?? null);
      setHistorial(historialCierres);
    } catch (err) {
      console.error('Error cargando cierre de caja:', err);
      setError('No se pudieron cargar los datos de caja');
    } finally {
      setCargando(false);
    }
  }, [hoy]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    try {
      localStorage.setItem(UMBRAL_KEY, String(umbral));
    } catch {
      // localStorage no disponible (modo privado): no es critico.
    }
  }, [umbral]);

  const cierre = useMemo(() => calculateCierreTotals(ventas, gastos), [ventas, gastos]);
  const fisicoIngresado = fisico.trim() !== '';
  const fisicoNumero = Number(fisico) || 0;
  const diferencia = calculateDiferencia(fisicoNumero, cierre.efectivoTeorico);
  const diferenciaInfo = getDiferenciaInfo(diferencia, umbral);

  const agregarGasto = () => {
    const monto = Number(nuevoGasto.monto);
    if (!nuevoGasto.descripcion.trim() || !Number.isInteger(monto) || monto <= 0) {
      setError('Indica una descripción y un monto entero mayor a 0 para el gasto');
      return;
    }
    setGastos(prev => [
      ...prev,
      {
        id: generateId(),
        descripcion: nuevoGasto.descripcion.trim(),
        monto,
        fecha: hoy,
      },
    ]);
    setNuevoGasto({ descripcion: '', monto: '' });
    setError(null);
  };

  const quitarGasto = (id: string) => {
    setGastos(prev => prev.filter(g => g.id !== id));
  };

  const cerrarCaja = async () => {
    setError(null);
    if (!fisico.trim() || !Number.isInteger(Number(fisico)) || Number(fisico) < 0) {
      setError('Ingresa el efectivo físico contado como entero (puede ser 0)');
      return;
    }
    if (!confirmado) {
      setError('Confirma que contaste el efectivo antes de cerrar la caja');
      return;
    }

    const now = nowISO();
    const nuevo: ArqueoCaja = {
      id: generateId(),
      fecha: hoy,
      efectivo_fisico_contado: fisicoNumero,
      efectivo_teorico: cierre.efectivoTeorico,
      ventas_efectivo: cierre.efectivo,
      ventas_qr: cierre.qr,
      ventas_fiado: cierre.fiado,
      gastos_turno: gastos,
      total_teorico: cierre.totalTeorico,
      diferencia,
      estado: 'CERRADO',
      creado_en: now,
      cerrado_en: now,
    };

    setGuardando(true);
    try {
      const creado = await arqueoRepository.crearCierre(nuevo);
      setArqueo(creado);
      setHistorial(prev => [creado, ...prev.filter(a => a.id !== creado.id)].slice(0, 10));
      setMensaje('Cierre de caja guardado. El día quedó bloqueado para edición.');
      setConfirmado(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cierre de caja');
    } finally {
      setGuardando(false);
    }
  };

  const imprimir = () => window.print();

  if (cargando) {
    return (
      <Layout>
        <div className="flex h-[calc(100vh-80px)] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
            <p className="text-muted">Cargando cierre de caja...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Impresión: reporte completo del cierre guardado.
  const reporteImprimible = arqueo ? formatArqueoReport(arqueo, 'CajaViva') : '';

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Cierre de Caja"
          description={`Conciliación del turno · ${formatFechaLocal(hoy)}`}
          action={
            <button
              onClick={imprimir}
              disabled={!arqueo}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
              </svg>
              Imprimir reporte
            </button>
          }
        />

        {mensaje && (
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 print:hidden">
            <span className="flex-1">{mensaje}</span>
            <button onClick={() => setMensaje(null)} aria-label="Cerrar mensaje" className="font-semibold">×</button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 print:hidden">
            {error}
          </div>
        )}

        {arqueo ? (
          <>
            <Card className="border-green-200 bg-green-50 print:hidden">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-green-800">Caja cerrada</p>
                  <p className="text-xs text-green-700">
                    {formatFechaLocal(arqueo.fecha)} · {arqueo.estado === 'CERRADO' ? 'Día inmutable' : 'Abierta'}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-green-800">
                  Diferencia: {formatBs(arqueo.diferencia)}
                </span>
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card>
                <p className="text-sm text-muted">Efectivo</p>
                <p className="mt-1 text-h3 font-semibold text-primary">{formatBs(arqueo.ventas_efectivo)}</p>
              </Card>
              <Card>
                <p className="text-sm text-muted">QR / Transferencia</p>
                <p className="mt-1 text-h3 font-semibold text-primary">{formatBs(arqueo.ventas_qr)}</p>
              </Card>
              <Card>
                <p className="text-sm text-muted">Fiado</p>
                <p className="mt-1 text-h3 font-semibold text-primary">{formatBs(arqueo.ventas_fiado)}</p>
              </Card>
              <Card>
                <p className="text-sm text-muted">Gastos</p>
                <p className="mt-1 text-h3 font-semibold text-primary">
                  {formatBs(arqueo.gastos_turno.reduce((s, g) => s + g.monto, 0))}
                </p>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Arqueo de efectivo" />
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-muted">Efectivo teórico (neto de gastos)</dt><dd className="font-medium">{formatBs(arqueo.efectivo_teorico)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Efectivo físico contado</dt><dd className="font-medium">{formatBs(arqueo.efectivo_fisico_contado)}</dd></div>
                  <div className="flex justify-between border-t border-surface-alt pt-2"><dt className="font-medium">Diferencia</dt><dd className="font-bold">{formatBs(arqueo.diferencia)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Total ventas del día</dt><dd className="font-medium">{formatBs(arqueo.ventas_efectivo + arqueo.ventas_qr + arqueo.ventas_fiado)}</dd></div>
                </dl>
              </Card>

              <Card>
                <CardHeader title="Gastos del turno" />
                {arqueo.gastos_turno.length === 0 ? (
                  <p className="text-sm text-muted">Sin gastos registrados.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {arqueo.gastos_turno.map(g => (
                      <li key={g.id} className="flex justify-between gap-3">
                        <span className="text-muted">{g.descripcion}</span>
                        <span className="font-medium">{formatBs(g.monto)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className={`rounded-xl border p-4 text-sm print:hidden ${DIFERENCIA_CLASES[getDiferenciaInfo(arqueo.diferencia, umbral).color]}`}>
              <p className="font-semibold">{getDiferenciaInfo(arqueo.diferencia, umbral).mensaje}</p>
              <p className="mt-1 text-xs opacity-80">El cierre del día ya está guardado y no puede modificarse.</p>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card>
                <p className="text-sm text-muted">Ventas efectivo</p>
                <p className="mt-1 text-h3 font-semibold text-primary">{formatBs(cierre.efectivo)}</p>
                <p className="text-xs text-muted">{cierre.cantidadVentas} venta(s)</p>
              </Card>
              <Card>
                <p className="text-sm text-muted">Ventas QR / Transf.</p>
                <p className="mt-1 text-h3 font-semibold text-primary">{formatBs(cierre.qr)}</p>
              </Card>
              <Card>
                <p className="text-sm text-muted">Ventas fiado</p>
                <p className="mt-1 text-h3 font-semibold text-primary">{formatBs(cierre.fiado)}</p>
              </Card>
              <Card>
                <p className="text-sm text-muted">Total vendido</p>
                <p className="mt-1 text-h3 font-semibold text-primary">{formatBs(cierre.totalVentas)}</p>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Gastos del turno" subtitle="Salidas de efectivo (transporte, insumos, etc.)" />
                {gastos.length > 0 && (
                  <ul className="mb-4 space-y-2">
                    {gastos.map(g => (
                      <li key={g.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-alt px-3 py-2 text-sm">
                        <span className="text-primary">{g.descripcion}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{formatBs(g.monto)}</span>
                          <button onClick={() => quitarGasto(g.id)} className="text-red-600 hover:underline" aria-label={`Quitar gasto ${g.descripcion}`}>Quitar</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                  <input
                    className="input-field sm:col-span-3"
                    placeholder="Descripción del gasto"
                    value={nuevoGasto.descripcion}
                    onChange={(e) => setNuevoGasto(prev => ({ ...prev, descripcion: e.target.value }))}
                    aria-label="Descripción del gasto"
                  />
                  <input
                    className="input-field sm:col-span-1"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Bs"
                    value={nuevoGasto.monto}
                    onChange={(e) => setNuevoGasto(prev => ({ ...prev, monto: e.target.value }))}
                    aria-label="Monto del gasto"
                  />
                  <button className="btn-secondary" onClick={agregarGasto}>Agregar</button>
                </div>
                <div className="mt-3 flex justify-between border-t border-surface-alt pt-3 text-sm">
                  <span className="text-muted">Total gastos</span>
                  <span className="font-semibold">{formatBs(cierre.gastos)}</span>
                </div>
              </Card>

              <Card>
                <CardHeader title="Efectivo en caja" subtitle="Cuenta el dinero físico antes de cerrar" />
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Ventas en efectivo</span>
                    <span className="font-medium">{formatBs(cierre.efectivo)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Menos gastos del turno</span>
                    <span className="font-medium">
                      {cierre.gastos > 0 ? `-${formatBs(cierre.gastos)}` : formatBs(0)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-surface-alt pt-2 text-sm">
                    <span className="font-medium">Efectivo teórico en caja</span>
                    <span className="font-bold">{formatBs(cierre.efectivoTeorico)}</span>
                  </div>
                  <div>
                    <label htmlFor="efectivo_fisico" className="mb-1 block text-sm font-medium text-primary">
                      Efectivo físico contado
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">Bs</span>
                      <input
                        id="efectivo_fisico"
                        type="number"
                        min="0"
                        step="1"
                        className="input-field pl-8 text-right"
                        value={fisico}
                        onChange={(e) => setFisico(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {fisicoIngresado ? (
                    <div className={`rounded-lg border p-3 text-sm ${DIFERENCIA_CLASES[diferenciaInfo.color]}`}>
                      <p className="font-semibold">{diferenciaInfo.mensaje}</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-surface-alt bg-surface-alt p-3 text-sm text-muted">
                      Ingresa el efectivo contado para calcular la diferencia.
                    </div>
                  )}

                  <div className="flex items-end justify-between gap-3">
                    <div className="flex-1">
                      <label htmlFor="umbral" className="mb-1 block text-xs text-muted">
                        Umbral de tolerancia (Bs)
                      </label>
                      <input
                        id="umbral"
                        type="number"
                        min="0"
                        step="1"
                        className="input-field py-2"
                        value={umbral}
                        onChange={(e) => setUmbral(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                      />
                    </div>
                    <p className="pb-2 text-xs text-muted">Alerta roja si el faltante supera este monto.</p>
                  </div>

                  <label className="flex items-start gap-2 text-sm text-primary">
                    <input
                      type="checkbox"
                      checked={confirmado}
                      onChange={(e) => setConfirmado(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Confirmo que conté el efectivo físico y que los datos son correctos.</span>
                  </label>

                  <button
                    onClick={() => void cerrarCaja()}
                    disabled={guardando || !confirmado || !fisico.trim()}
                    className="btn-primary w-full py-3 text-lg font-semibold disabled:opacity-50"
                  >
                    {guardando ? 'Guardando cierre...' : 'Cerrar Caja del Día'}
                  </button>
                </div>
              </Card>
            </div>
          </>
        )}

        <Card className="print:hidden">
          <CardHeader title="Historial de cierres" subtitle="Últimos 10 días cerrados" />
          {historial.length === 0 ? (
            <p className="text-sm text-muted">Aún no hay cierres de caja registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted">Fecha</th>
                    <th className="px-3 py-2 text-right font-medium text-muted">Ventas</th>
                    <th className="px-3 py-2 text-right font-medium text-muted">Efectivo</th>
                    <th className="px-3 py-2 text-right font-medium text-muted">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-alt">
                  {historial.map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{formatFechaLocal(item.fecha)}</td>
                      <td className="px-3 py-2 text-right">{formatBs(item.ventas_efectivo + item.ventas_qr + item.ventas_fiado)}</td>
                      <td className="px-3 py-2 text-right">{formatBs(item.efectivo_fisico_contado)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${item.diferencia < 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {formatBs(item.diferencia)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Reporte imprimible */}
      <div className="hidden print:block">
        <pre className="whitespace-pre-wrap font-mono text-sm">{reporteImprimible}</pre>
      </div>
    </Layout>
  );
}
