import { createBaseRepository } from './base';
import { getDB } from '../schema';
import type { CuentaPorCobrar, MovimientoCobro, UUID } from '../types';

const cuentaBaseRepo = createBaseRepository<CuentaPorCobrar>('cuentas_cobrar');
const cobroBaseRepo = createBaseRepository<MovimientoCobro>('movimientos_cobro');

export const cuentaPorCobrarRepository = {
  ...cuentaBaseRepo,

  async getByTelefono(telefono: string): Promise<CuentaPorCobrar[]> {
    const db = await getDB();
    return db.getAllFromIndex('cuentas_cobrar', 'by-telefono', telefono);
  },

  async getByEstado(estado: CuentaPorCobrar['estado']): Promise<CuentaPorCobrar[]> {
    const db = await getDB();
    return db.getAllFromIndex('cuentas_cobrar', 'by-estado', estado);
  },

  async getVencidas(): Promise<CuentaPorCobrar[]> {
    const db = await getDB();
    const hoy = new Date().toISOString().split('T')[0];
    const todas = await db.getAll('cuentas_cobrar');
    return todas.filter(c => 
      c.estado !== 'PAGADO' && c.fecha_vencimiento < hoy
    );
  },

  async getProximasVencer(dias: number = 7): Promise<CuentaPorCobrar[]> {
    const db = await getDB();
    const hoy = new Date();
    const limite = new Date(hoy);
    limite.setDate(hoy.getDate() + dias);
    const limiteStr = limite.toISOString().split('T')[0];
    
    const todas = await db.getAll('cuentas_cobrar');
    return todas.filter(c => 
      c.estado !== 'PAGADO' && 
      c.fecha_vencimiento >= hoy.toISOString().split('T')[0] &&
      c.fecha_vencimiento <= limiteStr
    );
  },

  async aplicarPago(
    cuentaId: UUID, 
    monto: number, 
    metodo: MovimientoCobro['metodo'],
    notas: string | null
  ): Promise<{ cuenta: CuentaPorCobrar; movimiento: MovimientoCobro } | undefined> {
    const db = await getDB();
    const tx = db.transaction(['cuentas_cobrar', 'movimientos_cobro'], 'readwrite');
    
    const cuenta = await tx.objectStore('cuentas_cobrar').get(cuentaId);
    if (!cuenta) return undefined;
    
    const nuevoSaldo = Math.max(0, cuenta.saldo_pendiente - monto);
    const nuevoEstado: CuentaPorCobrar['estado'] = 
      nuevoSaldo === 0 ? 'PAGADO' : 
      nuevoSaldo < cuenta.monto_total ? 'PARCIAL' : 
      cuenta.estado;
    
    const cuentaActualizada: CuentaPorCobrar = {
      ...cuenta,
      saldo_pendiente: nuevoSaldo,
      estado: nuevoEstado,
      actualizado_en: new Date().toISOString(),
    };
    
    const movimiento: MovimientoCobro = {
      id: crypto.randomUUID(),
      cuenta_cobrar_id: cuentaId,
      monto,
      metodo,
      fecha: new Date().toISOString(),
      notas,
    };
    
    await tx.objectStore('cuentas_cobrar').put(cuentaActualizada);
    await tx.objectStore('movimientos_cobro').add(movimiento);
    await tx.done;
    
    return { cuenta: cuentaActualizada, movimiento };
  },
};

export const movimientoCobroRepository = {
  ...cobroBaseRepo,

  async getByCuenta(cuentaId: UUID): Promise<MovimientoCobro[]> {
    const db = await getDB();
    return db.getAllFromIndex('movimientos_cobro', 'by-cuenta', cuentaId);
  },

  async getByFecha(fecha: string): Promise<MovimientoCobro[]> {
    const db = await getDB();
    return db.getAllFromIndex('movimientos_cobro', 'by-fecha', fecha);
  },
};