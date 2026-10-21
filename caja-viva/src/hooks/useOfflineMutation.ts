import type { UUID } from '../db/types';
import { generateId, nowISO } from '../db/schema';
import { syncQueueRepository } from '../db/repositories';

export type EntityType = 
  | 'PRODUCTO' 
  | 'VENTA' 
  | 'MOVIMIENTO_STOCK' 
  | 'CUENTA_POR_COBRAR' 
  | 'MOVIMIENTO_COBRO';

export type EntityAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface OfflineMutationOptions<T> {
  entityType: EntityType;
  action: EntityAction;
  entityId: UUID;
  payload: T;
  clientTxId?: UUID;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export async function executeOfflineMutation<T>(options: OfflineMutationOptions<T>): Promise<UUID> {
  const clientTxId = options.clientTxId || generateId();
  
  await syncQueueRepository.enqueue({
    tipo_entidad: options.entityType,
    accion: options.action,
    entity_id: options.entityId,
    client_tx_id: clientTxId,
    payload: options.payload as Record<string, unknown>,
    timestamp: nowISO(),
  });

  if (options.onSuccess) options.onSuccess();
  
  return clientTxId;
}

export async function executeOfflineMutationWithRepo<T>(
  entityType: EntityType,
  action: EntityAction,
  entityId: UUID,
  payload: T,
  clientTxId?: UUID
): Promise<UUID> {
  return executeOfflineMutation({
    entityType,
    action,
    entityId,
    payload,
    clientTxId,
  });
}