import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Simple in-memory IndexedDB mock for testing
const createMockStore = (name: string) => {
  const data = new Map<string, any>();
  const indexes = new Map<string, Map<string, Set<string>>>();
  const indexDefinitions = new Map<string, { keyPath: string; unique: boolean }>();

  return {
    name,
    data,
    indexes,
    indexDefinitions,

    add: vi.fn(async (value: any) => {
      if (data.has(value.id)) {
        throw new DOMException('Key already exists', 'ConstraintError');
      }
      data.set(value.id, { ...value });
      indexes.forEach((indexMap, indexName) => {
        const keyPath = indexDefinitions.get(indexName)?.keyPath;
        if (keyPath) {
          const indexValue = value[keyPath];
          if (indexValue !== undefined) {
            if (!indexMap.has(indexValue)) indexMap.set(indexValue, new Set());
            indexMap.get(indexValue)!.add(value.id);
          }
        }
      });
      return value.id;
    }),

    get: vi.fn(async (key: string) => {
      return data.get(key) ? { ...data.get(key) } : undefined;
    }),

    getAll: vi.fn(async () => {
      return Array.from(data.values()).map(v => ({ ...v }));
    }),

    put: vi.fn(async (value: any) => {
      const oldValue = data.get(value.id);
      data.set(value.id, { ...value });
      indexes.forEach((indexMap, indexName) => {
        const keyPath = indexDefinitions.get(indexName)?.keyPath;
        if (keyPath) {
          if (oldValue) {
            const oldIndexValue = oldValue[keyPath];
            if (oldIndexValue !== undefined && indexMap.has(oldIndexValue)) {
              indexMap.get(oldIndexValue)!.delete(value.id);
            }
          }
          const newIndexValue = value[keyPath];
          if (newIndexValue !== undefined) {
            if (!indexMap.has(newIndexValue)) indexMap.set(newIndexValue, new Set());
            indexMap.get(newIndexValue)!.add(value.id);
          }
        }
      });
      return value.id;
    }),

    delete: vi.fn(async (key: string) => {
      const value = data.get(key);
      if (value) {
        indexes.forEach((indexMap, indexName) => {
          const keyPath = indexDefinitions.get(indexName)?.keyPath;
          if (keyPath) {
            const indexValue = value[keyPath];
            if (indexValue !== undefined && indexMap.has(indexValue)) {
              indexMap.get(indexValue)!.delete(key);
            }
          }
        });
      }
      data.delete(key);
    }),

    clear: vi.fn(async () => {
      data.clear();
      indexes.forEach(indexMap => indexMap.clear());
    }),

    createIndex: vi.fn((indexName: string, keyPath: string, options?: { unique?: boolean }) => {
      indexDefinitions.set(indexName, { keyPath, unique: options?.unique || false });
      indexes.set(indexName, new Map());
      data.forEach((value, id) => {
        const indexValue = value[keyPath];
        if (indexValue !== undefined) {
          const indexMap = indexes.get(indexName)!;
          if (!indexMap.has(indexValue)) indexMap.set(indexValue, new Set());
          indexMap.get(indexValue)!.add(id);
        }
      });
      return {
        name: indexName,
        keyPath,
        unique: options?.unique || false,
        get: vi.fn(async (key: string) => {
          const keyStr: string = key;
          const ids = indexes.get(indexName)?.get(keyStr);
          if (ids && ids.size > 0) {
            const firstId = ids.values().next().value;
            if (firstId === undefined) return undefined;
            const value = data.get(firstId);
            return value ? { ...value } : undefined;
          }
          return undefined;
        }),
        getAll: vi.fn(async (key?: string) => {
          if (key === undefined) {
            return Array.from(data.values()).map(v => ({ ...v }));
          }
          const idx = indexes.get(indexName);
          if (!idx) return [];
          const ids = idx.get(key);
          if (!ids) return [];
          return Array.from(ids).map(id => {
            const value = data.get(id);
            return value ? { ...value } : {};
          });
        }),
        getAllKeys: vi.fn(async (key?: string) => {
          if (key === undefined) {
            return Array.from(data.keys());
          }
          const idx = indexes.get(indexName);
          if (!idx) return [];
          const ids = idx.get(key);
          return ids ? Array.from(ids) : [];
        }),
      };
    }),

    index: vi.fn((indexName: string) => {
      const idx = indexes.get(indexName);
      if (!idx) throw new Error(`Index ${indexName} not found`);
      return {
        name: indexName,
        get: vi.fn(async (key: string) => {
          const ids = idx.get(key);
          if (ids && ids.size > 0) {
            const firstId = ids.values().next().value;
            if (firstId === undefined) return undefined;
            const value = data.get(firstId);
            return value ? { ...value } : undefined;
          }
          return undefined;
        }),
        getAll: vi.fn(async (key?: string) => {
          if (key === undefined) {
            return Array.from(data.values()).map(v => ({ ...v }));
          }
          const ids = idx.get(key!);
          if (!ids) return [];
          return Array.from(ids).map(id => {
            const value = data.get(id);
            return value ? { ...value } : {};
          });
        }),
        getAllKeys: vi.fn(async (key?: string) => {
          if (key === undefined) {
            return Array.from(data.keys());
          }
          const ids = idx.get(key!);
          return ids ? Array.from(ids) : [];
        }),
      };
    }),

    count: vi.fn(async (key?: string) => {
      if (key === undefined) return data.size;
      return data.size;
    }),
  };
};

// Function to create fresh mock stores with all indexes pre-created
const createFreshMockStores = () => {
  const stores: Record<string, ReturnType<typeof createMockStore>> = {};
  const storeNames = [
    'productos', 'ventas', 'detalles_venta',
    'movimientos_stock', 'cuentas_cobrar',
    'movimientos_cobro', 'sync_queue'
  ];
  storeNames.forEach(name => {
    stores[name] = createMockStore(name);
  });

  // Pre-create all indexes as defined in the schema
  // productos
  stores.productos.createIndex('by-codigo', 'codigo_barras', { unique: false });
  stores.productos.createIndex('by-categoria', 'categoria', { unique: false });
  stores.productos.createIndex('by-stock-minimo', 'stock_minimo', { unique: false });

  // ventas
  stores.ventas.createIndex('by-fecha', 'fecha', { unique: false });
  stores.ventas.createIndex('by-estado-sync', 'estado_sync', { unique: false });
  stores.ventas.createIndex('by-client-tx', 'client_tx_id', { unique: true });

  // detalles_venta
  stores.detalles_venta.createIndex('by-venta', 'venta_id', { unique: false });
  stores.detalles_venta.createIndex('by-producto', 'producto_id', { unique: false });

  // movimientos_stock
  stores.movimientos_stock.createIndex('by-producto', 'producto_id', { unique: false });
  stores.movimientos_stock.createIndex('by-fecha', 'fecha', { unique: false });
  stores.movimientos_stock.createIndex('by-tipo', 'tipo', { unique: false });

  // cuentas_cobrar
  stores.cuentas_cobrar.createIndex('by-cliente', 'cliente_nombre', { unique: false });
  stores.cuentas_cobrar.createIndex('by-telefono', 'cliente_telefono', { unique: false });
  stores.cuentas_cobrar.createIndex('by-estado', 'estado', { unique: false });
  stores.cuentas_cobrar.createIndex('by-vencimiento', 'fecha_vencimiento', { unique: false });

  // movimientos_cobro
  stores.movimientos_cobro.createIndex('by-cuenta', 'cuenta_cobrar_id', { unique: false });
  stores.movimientos_cobro.createIndex('by-fecha', 'fecha', { unique: false });

  // sync_queue
  stores.sync_queue.createIndex('by-estado', 'estado', { unique: false });
  stores.sync_queue.createIndex('by-tipo', 'tipo_entidad', { unique: false });
  stores.sync_queue.createIndex('by-timestamp', 'timestamp', { unique: false });

  return stores;
};

// Global stores - recreated in beforeEach
let mockStores = createFreshMockStores();

const mockTransaction = {
  objectStore: vi.fn((name: string) => {
    if (!mockStores[name]) {
      mockStores[name] = createMockStore(name);
    }
    return mockStores[name];
  }),
  done: Promise.resolve(),
  abort: vi.fn(),
};

const createMockDB = () => ({
  objectStoreNames: {
    contains: vi.fn((name: string) => !!mockStores[name]),
    [Symbol.iterator]: function* () {
      yield* Object.keys(mockStores);
    },
  },
  createObjectStore: vi.fn((name: string) => {
    mockStores[name] = createMockStore(name);
    return mockStores[name];
  }),
  transaction: vi.fn((_names: string | string[], _mode?: string) => {
    return mockTransaction;
  }),
  getAll: vi.fn(async (name: string) => mockStores[name]?.getAll() || []),
  get: vi.fn(async (name: string, key: string) => mockStores[name]?.get(key)),
  add: vi.fn(async (name: string, value: any) => mockStores[name]?.add(value)),
  put: vi.fn(async (name: string, value: any) => mockStores[name]?.put(value)),
  delete: vi.fn(async (name: string, key: string) => mockStores[name]?.delete(key)),
  clear: vi.fn(async (name: string) => mockStores[name]?.clear()),
  getFromIndex: vi.fn(async (storeName: string, indexName: string, key: string) => {
    return mockStores[storeName]?.index(indexName)?.get(key) || undefined;
  }),
  getAllFromIndex: vi.fn(async (storeName: string, indexName: string, key?: string) => {
    return mockStores[storeName]?.index(indexName)?.getAll(key) || [];
  }),
  close: vi.fn(),
});

let mockDB = createMockDB();

vi.mock('idb', () => {
  return {
    openDB: vi.fn().mockImplementation(async (dbName: string, ver: number, options?: any) => {
      if (options?.upgrade) {
        options.upgrade(mockDB, 0, ver, null);
      }
      return mockDB;
    }),
  };
});

// Mock crypto.randomUUID with proper UUID v4 format
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => {
      const bytes = new Uint8Array(16);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = Math.floor(Math.random() * 256);
        }
      }
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      return Array.from(bytes, b => b.toString(16).padStart(2, '0'))
        .join('')
        .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
    },
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  },
});

// Mock matchMedia for prefers-reduced-motion
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Reset mocks completely before each test
beforeEach(async () => {
  vi.clearAllMocks();
  mockStores = createFreshMockStores();
  mockDB = createMockDB();

  mockTransaction.objectStore.mockImplementation((name: string) => {
    if (!mockStores[name]) {
      mockStores[name] = createMockStore(name);
    }
    return mockStores[name];
  });
});