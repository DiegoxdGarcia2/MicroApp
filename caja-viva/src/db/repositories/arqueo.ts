import { createBaseRepository } from './base';
import { getDB, nowISO } from '../schema';
import { syncQueueRepository } from './syncQueue';
import type { ArqueoCaja, UUID } from '../types';

const baseRepo = createBaseRepository<ArqueoCaja>('arqueos_caja');

/** Serializa un arqueo al payload plano que espera el backend. */
function toBackendPayload(arqueo: ArqueoCaja): Record<string, unknown> {
  return {
    fecha: arqueo.fecha,
    efectivo_fisico_contado: arqueo.efectivo_fisico_contado,
    efectivo_teorico: arqueo.efectivo_teorico,
    ventas_efectivo: arqueo.ventas_efectivo,
    ventas_qr: arqueo.ventas_qr,
    ventas_fiado: arqueo.ventas_fiado,
    gastos_turno: arqueo.gastos_turno.reduce((sum, gasto) => sum + gasto.monto, 0),
    total_teorico: arqueo.total_teorico,
    diferencia: arqueo.diferencia,
    estado: arqueo.estado,
  };
}

export const arqueoRepository = {
  ...baseRepo,

  async getByFecha(fecha: string): Promise<ArqueoCaja | undefined> {
    const db = await getDB();
    const arqueos = await db.getAllFromIndex('arqueos_caja', 'by-fecha', fecha);
    return arqueos[0];
  },

  async getHistorial(limit = 30): Promise<ArqueoCaja[]> {
    const db = await getDB();
    const todos = await db.getAll('arqueos_caja');
    return todos
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, limit);
  },

  /**
   * Guarda el cierre del dia. Un dia ya cerrado es inmutable: se rechaza
   * cualquier intento de cerrarlo dos veces.
   */
  async crearCierre(arqueo: ArqueoCaja): Promise<ArqueoCaja> {
    const existente = await this.getByFecha(arqueo.fecha);
    if (existente && existente.estado === 'CERRADO') {
      throw new Error(`La caja del ${arqueo.fecha} ya fue cerrada y no se puede modificar`);
    }

    const created = await baseRepo.create(arqueo);

    try {
      await syncQueueRepository.enqueue({
        tipo_entidad: 'ARQUEO_CAJA',
        accion: 'CREATE',
        entity_id: created.id,
        client_tx_id: crypto.randomUUID(),
        payload: toBackendPayload(created),
        timestamp: nowISO(),
      });
    } catch (error) {
      console.error('No se pudo encolar el cierre de caja:', error);
    }

    return created;
  },
};

export type { UUID };
