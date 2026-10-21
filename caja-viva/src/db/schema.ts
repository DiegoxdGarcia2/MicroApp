import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { 
  Producto, Venta, DetalleVenta, MovimientoStock, 
  CuentaPorCobrar, MovimientoCobro, SyncQueueItem,
  ArqueoCaja, UUID 
} from './types';
import { STORE_NAMES, DB_NAME, DB_VERSION, generateUUID } from './types';

interface CajaVivaDB extends DBSchema {
  productos: {
    key: UUID;
    value: Producto;
    indexes: { 'by-codigo': string; 'by-categoria': string; 'by-stock-minimo': number };
  };
  ventas: {
    key: UUID;
    value: Venta;
    indexes: { 'by-fecha': string; 'by-estado-sync': string; 'by-client-tx': UUID };
  };
  detalles_venta: {
    key: UUID;
    value: DetalleVenta;
    indexes: { 'by-venta': UUID; 'by-producto': UUID };
  };
  movimientos_stock: {
    key: UUID;
    value: MovimientoStock;
    indexes: { 'by-producto': UUID; 'by-fecha': string; 'by-tipo': string };
  };
  cuentas_cobrar: {
    key: UUID;
    value: CuentaPorCobrar;
    indexes: { 'by-cliente': string; 'by-telefono': string; 'by-estado': string; 'by-vencimiento': string };
  };
  movimientos_cobro: {
    key: UUID;
    value: MovimientoCobro;
    indexes: { 'by-cuenta': UUID; 'by-fecha': string };
  };
  sync_queue: {
    key: UUID;
    value: SyncQueueItem;
    indexes: { 'by-estado': string; 'by-tipo': string; 'by-timestamp': string };
  };
  arqueos_caja: {
    key: UUID;
    value: ArqueoCaja;
    indexes: { 'by-fecha': string; 'by-estado': string; 'by-diferencia': number };
  };
}

let dbInstance: IDBPDatabase<CajaVivaDB> | null = null;

export async function initDB(): Promise<IDBPDatabase<CajaVivaDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<CajaVivaDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Store: productos
      if (!db.objectStoreNames.contains('productos')) {
        const store = db.createObjectStore('productos', { keyPath: 'id' });
        store.createIndex('by-codigo', 'codigo_barras', { unique: false });
        store.createIndex('by-categoria', 'categoria', { unique: false });
        store.createIndex('by-stock-minimo', 'stock_minimo', { unique: false });
      }

      // Store: ventas
      if (!db.objectStoreNames.contains('ventas')) {
        const store = db.createObjectStore('ventas', { keyPath: 'id' });
        store.createIndex('by-fecha', 'fecha', { unique: false });
        store.createIndex('by-estado-sync', 'estado_sync', { unique: false });
        store.createIndex('by-client-tx', 'client_tx_id', { unique: true });
      }

      // Store: detalles_venta
      if (!db.objectStoreNames.contains('detalles_venta')) {
        const store = db.createObjectStore('detalles_venta', { keyPath: 'id' });
        store.createIndex('by-venta', 'venta_id', { unique: false });
        store.createIndex('by-producto', 'producto_id', { unique: false });
      }

      // Store: movimientos_stock
      if (!db.objectStoreNames.contains('movimientos_stock')) {
        const store = db.createObjectStore('movimientos_stock', { keyPath: 'id' });
        store.createIndex('by-producto', 'producto_id', { unique: false });
        store.createIndex('by-fecha', 'fecha', { unique: false });
        store.createIndex('by-tipo', 'tipo', { unique: false });
      }

      // Store: cuentas_cobrar
      if (!db.objectStoreNames.contains('cuentas_cobrar')) {
        const store = db.createObjectStore('cuentas_cobrar', { keyPath: 'id' });
        store.createIndex('by-cliente', 'cliente_nombre', { unique: false });
        store.createIndex('by-telefono', 'cliente_telefono', { unique: false });
        store.createIndex('by-estado', 'estado', { unique: false });
        store.createIndex('by-vencimiento', 'fecha_vencimiento', { unique: false });
      }

      // Store: movimientos_cobro
      if (!db.objectStoreNames.contains('movimientos_cobro')) {
        const store = db.createObjectStore('movimientos_cobro', { keyPath: 'id' });
        store.createIndex('by-cuenta', 'cuenta_cobrar_id', { unique: false });
        store.createIndex('by-fecha', 'fecha', { unique: false });
      }

      // Store: sync_queue
      if (!db.objectStoreNames.contains('sync_queue')) {
        const store = db.createObjectStore('sync_queue', { keyPath: 'id' });
        store.createIndex('by-estado', 'estado', { unique: false });
        store.createIndex('by-tipo', 'tipo_entidad', { unique: false });
        store.createIndex('by-timestamp', 'timestamp', { unique: false });
      }

      // Store: arqueos_caja
      if (!db.objectStoreNames.contains('arqueos_caja')) {
        const store = db.createObjectStore('arqueos_caja', { keyPath: 'id' });
        store.createIndex('by-fecha', 'fecha', { unique: false });
        store.createIndex('by-estado', 'estado', { unique: false });
        store.createIndex('by-diferencia', 'diferencia', { unique: false });
      }
    },
  });

  return dbInstance;
}

export async function getDB(): Promise<IDBPDatabase<CajaVivaDB>> {
  if (!dbInstance) {
    return initDB();
  }
  return dbInstance;
}

export async function clearDB(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAMES, 'readwrite');
  await Promise.all(STORE_NAMES.map(store => tx.objectStore(store).clear()));
  await tx.done;
}

export function generateId(): UUID {
  return generateUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}