import { createBaseRepository } from './base';
import { getDB, nowISO, todayISO } from '../schema';
import { syncQueueRepository } from './syncQueue';
import type { CuentaPorCobrar, MovimientoCobro, UUID } from '../types';

const cuentaBaseRepo = createBaseRepository<CuentaPorCobrar>('cuentas_cobrar');

async function encolarCuenta(cuenta: CuentaPorCobrar, accion: 'CREATE' | 'UPDATE'): Promise<void> {
  try {
    await syncQueueRepository.enqueue({
      tipo_entidad: 'CUENTA_POR_COBRAR',
      accion,
      entity_id: cuenta.id,
      client_tx_id: crypto.randomUUID(),
      payload: cuenta as unknown as Record<string, unknown>,
      timestamp: nowISO(),
    });
  } catch (error) {
    console.error('No se pudo encolar la cuenta por cobrar:', error);
  }
}

async function encolarCobro(movimiento: MovimientoCobro): Promise<void> {
  try {
    await syncQueueRepository.enqueue({
      tipo_entidad: 'MOVIMIENTO_COBRO',
      accion: 'CREATE',
      entity_id: movimiento.id,
      client_tx_id: crypto.randomUUID(),
      payload: movimiento as unknown as Record<string, unknown>,
      timestamp: nowISO(),
    });
  } catch (error) {
    console.error('No se pudo encolar el cobro:', error);
  }
}

export const cuentaPorCobrarRepository = {
  ...cuentaBaseRepo,

  async create(entity: CuentaPorCobrar): Promise<CuentaPorCobrar> {
    const created = await cuentaBaseRepo.create(entity);
    await encolarCuenta(created, 'CREATE');
    return created;
  },

  async update(entity: CuentaPorCobrar): Promise<CuentaPorCobrar> {
    const updated = await cuentaBaseRepo.update(entity);
    await encolarCuenta(updated, 'UPDATE');
    return updated;
  },

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
    const hoy = todayISO();
    const todas = await db.getAll('cuentas_cobrar');
    return todas.filter(c => 
      c.estado !== 'PAGADO' && c.fecha_vencimiento < hoy
    );
  },

  /**
   * Aplica un pago (parcial o total) a una cuenta y registra el MovimientoCobro.
   * Ambas entidades se encolan para sincronizarse con el backend.
   */
  async aplicarPago(
    cuentaId: UUID, 
    monto: number, 
    metodo: MovimientoCobro['metodo'],
    notas: string | null
  ): Promise<{ cuenta: CuentaPorCobrar; movimiento: MovimientoCobro } | undefined> {
    if (!Number.isInteger(monto) || monto <= 0) {
      throw new Error('El monto del pago debe ser un entero mayor a 0 (Bs sin decimales)');
    }

    const db = await getDB();
    const tx = db.transaction(['cuentas_cobrar', 'movimientos_cobro'], 'readwrite');
    
    const cuenta = await tx.objectStore('cuentas_cobrar').get(cuentaId);
    if (!cuenta) {
      await tx.done;
      return undefined;
    }

    if (monto > cuenta.saldo_pendiente) {
      await tx.done;
      throw new Error(`El pago (${monto} Bs) excede el saldo pendiente (${cuenta.saldo_pendiente} Bs)`);
    }
    
    const nuevoSaldo = Math.max(0, cuenta.saldo_pendiente - monto);
    const nuevoEstado: CuentaPorCobrar['estado'] = 
      nuevoSaldo === 0 ? 'PAGADO' : 
      nuevoSaldo < cuenta.monto_total ? 'PARCIAL' : 
      cuenta.estado;
    
    const cuentaActualizada: CuentaPorCobrar = {
      ...cuenta,
      saldo_pendiente: nuevoSaldo,
      estado: nuevoEstado,
      actualizado_en: nowISO(),
    };
    
    const movimiento: MovimientoCobro = {
      id: crypto.randomUUID(),
      cuenta_cobrar_id: cuentaId,
      monto,
      metodo,
      fecha: todayISO(),
      notas: notas?.trim() || null,
    };

    await tx.objectStore('cuentas_cobrar').put(cuentaActualizada);
    await tx.objectStore('movimientos_cobro').add(movimiento);
    await tx.done;

    // Primero la cuenta (saldo autoritativo) y luego el movimiento.
    await encolarCuenta(cuentaActualizada, 'UPDATE');
    await encolarCobro(movimiento);

    return { cuenta: cuentaActualizada, movimiento };
  },
};

export const movimientoCobroRepository = createBaseRepository<MovimientoCobro>('movimientos_cobro');
