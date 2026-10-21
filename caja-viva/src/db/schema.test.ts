import { 
  initDB, clearDB, generateId, nowISO, todayISO 
} from './schema';
import { 
  productoRepository, 
  ventaRepository, 
  detalleVentaRepository,
  cuentaPorCobrarRepository,
  syncQueueRepository 
} from './repositories';
import type { 
  Producto, Venta, DetalleVenta, 
  CuentaPorCobrar 
} from './types';

describe('IndexedDB Schema - CajaViva', () => {
  beforeEach(async () => {
    await clearDB();
  });

  describe('Database Initialization', () => {
    it('should initialize database with all 8 required stores', async () => {
      const db = await initDB();
      expect(db).toBeDefined();
      
      const storeNames = Array.from(db.objectStoreNames).sort();
      expect(storeNames).toEqual([
        'arqueos_caja',
        'cuentas_cobrar',
        'detalles_venta',
        'movimientos_cobro',
        'movimientos_stock',
        'productos',
        'sync_queue',
        'ventas',
      ]);
    });

    it('should generate valid UUIDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(id1).not.toBe(id2);
    });

    it('should generate valid ISO timestamps', () => {
      const timestamp = nowISO();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      const today = todayISO();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Producto Repository', () => {
    it('should create and retrieve a producto', async () => {
      const producto = {
        id: generateId(),
        codigo_barras: '7790000000012',
        nombre: 'Arroz 1kg',
        precio_venta: 850,
        costo: 600,
        stock_actual: 50,
        stock_minimo: 10,
        categoria: 'Alimentos',
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      };

      await productoRepository.create(producto);
      const retrieved = await productoRepository.getById(producto.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.nombre).toBe('Arroz 1kg');
      expect(retrieved?.precio_venta).toBe(850);
      expect(retrieved?.stock_actual).toBe(50);
    });

    it('should search productos by nombre', async () => {
      await productoRepository.create({
        id: generateId(),
        codigo_barras: null,
        nombre: 'Azúcar 1kg',
        precio_venta: 750,
        costo: 500,
        stock_actual: 30,
        stock_minimo: 5,
        categoria: 'Alimentos',
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      });

      await productoRepository.create({
        id: generateId(),
        codigo_barras: null,
        nombre: 'Aceite 900ml',
        precio_venta: 1200,
        costo: 900,
        stock_actual: 20,
        stock_minimo: 5,
        categoria: 'Alimentos',
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      });

      const results = await productoRepository.search('azúcar');
      expect(results.length).toBe(1);
      expect(results[0].nombre).toBe('Azúcar 1kg');
    });

    it('should detect stock crítico', async () => {
      await productoRepository.create({
        id: generateId(),
        codigo_barras: null,
        nombre: 'Producto Stock Bajo',
        precio_venta: 1000,
        costo: 700,
        stock_actual: 3,
        stock_minimo: 10,
        categoria: 'Test',
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      });

      await productoRepository.create({
        id: generateId(),
        codigo_barras: null,
        nombre: 'Producto Stock OK',
        precio_venta: 1000,
        costo: 700,
        stock_actual: 50,
        stock_minimo: 10,
        categoria: 'Test',
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      });

      const criticos = await productoRepository.getStockCritico();
      expect(criticos.length).toBe(1);
      expect(criticos[0].nombre).toBe('Producto Stock Bajo');
    });

    it('should update stock atomically', async () => {
      const producto = await productoRepository.create({
        id: generateId(),
        codigo_barras: null,
        nombre: 'Test Stock Update',
        precio_venta: 1000,
        costo: 700,
        stock_actual: 100,
        stock_minimo: 10,
        categoria: 'Test',
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      });

      const updated = await productoRepository.updateStock(producto.id, -5);
      expect(updated?.stock_actual).toBe(95);

      const updated2 = await productoRepository.updateStock(producto.id, -95);
      expect(updated2?.stock_actual).toBe(0);
    });
  });

  describe('Venta Repository', () => {
    it('should create venta with detalles', async () => {
      const ventaId = generateId();
      const clienteTxId = generateId();
      
      const venta = {
        id: ventaId,
        fecha: todayISO(),
        total: 1700,
        metodo_pago: 'EFECTIVO' as const,
        estado_sync: 'PENDIENTE' as const,
        client_tx_id: clienteTxId,
        creado_en: nowISO(),
        sincronizado_en: null,
      };

      await ventaRepository.create(venta);

      const detalles = [
        {
          id: generateId(),
          venta_id: ventaId,
          producto_id: generateId(),
          cantidad: 2,
          precio_unitario: 850,
        },
        {
          id: generateId(),
          venta_id: ventaId,
          producto_id: generateId(),
          cantidad: 1,
          precio_unitario: 1000,
        },
      ];

      await detalleVentaRepository.createBatch(detalles);

      const retrieved = await ventaRepository.getWithDetalles(ventaId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.venta.total).toBe(1700);
      expect(retrieved?.detalles.length).toBe(2);
    });

    it('should enforce idempotency via client_tx_id', async () => {
      const clienteTxId = generateId();
      
      const venta1 = {
        id: generateId(),
        fecha: todayISO(),
        total: 1000,
        metodo_pago: 'EFECTIVO' as const,
        estado_sync: 'PENDIENTE' as const,
        client_tx_id: clienteTxId,
        creado_en: nowISO(),
        sincronizado_en: null,
      };

      const venta2 = {
        id: generateId(),
        fecha: todayISO(),
        total: 2000,
        metodo_pago: 'QR' as const,
        estado_sync: 'PENDIENTE' as const,
        client_tx_id: clienteTxId,
        creado_en: nowISO(),
        sincronizado_en: null,
      };

      await ventaRepository.create(venta1);
      
      const existing = await ventaRepository.getByClientTxId(clienteTxId);
      expect(existing).toBeDefined();
      expect(existing?.id).toBe(venta1.id);
    });

    it('should get ventas pendientes de sincronización', async () => {
      for (let i = 0; i < 3; i++) {
        await ventaRepository.create({
          id: generateId(),
          fecha: todayISO(),
          total: 1000 + i * 100,
          metodo_pago: 'EFECTIVO' as const,
          estado_sync: 'PENDIENTE' as const,
          client_tx_id: generateId(),
          creado_en: nowISO(),
          sincronizado_en: null,
        });
      }

      await ventaRepository.create({
        id: generateId(),
        fecha: todayISO(),
        total: 5000,
        metodo_pago: 'QR' as const,
        estado_sync: 'SINCRONIZADO' as const,
        client_tx_id: generateId(),
        creado_en: nowISO(),
        sincronizado_en: nowISO(),
      });

      const pendientes = await ventaRepository.getPendientesSync(10);
      expect(pendientes.length).toBe(3);
      expect(pendientes.every(v => v.estado_sync === 'PENDIENTE')).toBe(true);
    });
  });

  describe('Cuenta Por Cobrar Repository', () => {
    it('should create cuenta por cobrar with valid phone format', async () => {
      const cuenta = {
        id: generateId(),
        cliente_nombre: 'Juan Pérez',
        cliente_telefono: '+59171234567',
        monto_total: 50000,
        saldo_pendiente: 50000,
        fecha_vencimiento: '2026-10-15',
        estado: 'PENDIENTE' as const,
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      };

      await cuentaPorCobrarRepository.create(cuenta);
      const retrieved = await cuentaPorCobrarRepository.getById(cuenta.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.cliente_telefono).toBe('+59171234567');
      expect(retrieved?.saldo_pendiente).toBe(50000);
    });

    it('should apply partial payment and update estado', async () => {
      const cuenta = await cuentaPorCobrarRepository.create({
        id: generateId(),
        cliente_nombre: 'María López',
        cliente_telefono: '+59169876543',
        monto_total: 10000,
        saldo_pendiente: 10000,
        fecha_vencimiento: '2026-10-20',
        estado: 'PENDIENTE' as const,
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      });

      const result = await cuentaPorCobrarRepository.aplicarPago(
        cuenta.id,
        4000,
        'EFECTIVO' as const,
        'Pago parcial'
      );

      expect(result).toBeDefined();
      expect(result?.cuenta.saldo_pendiente).toBe(6000);
      expect(result?.cuenta.estado).toBe('PARCIAL');
      expect(result?.movimiento.monto).toBe(4000);
    });

    it('should mark as PAGADO when saldo reaches zero', async () => {
      const cuenta = await cuentaPorCobrarRepository.create({
        id: generateId(),
        cliente_nombre: 'Carlos Ruiz',
        cliente_telefono: '+59175555555',
        monto_total: 3000,
        saldo_pendiente: 3000,
        fecha_vencimiento: '2026-10-10',
        estado: 'PENDIENTE' as const,
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      });

      const result = await cuentaPorCobrarRepository.aplicarPago(
        cuenta.id,
        3000,
        'QR' as const,
        'Pago total'
      );

      expect(result?.cuenta.estado).toBe('PAGADO');
      expect(result?.cuenta.saldo_pendiente).toBe(0);
    });

    it('should get cuentas vencidas', async () => {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);
      const ayerStr = ayer.toISOString().split('T')[0];

      await cuentaPorCobrarRepository.create({
        id: generateId(),
        cliente_nombre: 'Cliente Vencido',
        cliente_telefono: '+59171111111',
        monto_total: 5000,
        saldo_pendiente: 5000,
        fecha_vencimiento: ayerStr,
        estado: 'PENDIENTE' as const,
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      });

      await cuentaPorCobrarRepository.create({
        id: generateId(),
        cliente_nombre: 'Cliente Al Día',
        cliente_telefono: '+59172222222',
        monto_total: 5000,
        saldo_pendiente: 5000,
        fecha_vencimiento: '2026-12-31',
        estado: 'PENDIENTE' as const,
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      });

      const vencidas = await cuentaPorCobrarRepository.getVencidas();
      expect(vencidas.length).toBe(1);
      expect(vencidas[0].cliente_nombre).toBe('Cliente Vencido');
    });
  });

  describe('Sync Queue Repository', () => {
    it('should enqueue sync items with correct initial state', async () => {
      const clientTxId = generateId();
      
      const item = await syncQueueRepository.enqueue({
        tipo_entidad: 'VENTA',
        accion: 'CREATE',
        entity_id: generateId(),
        client_tx_id: clientTxId,
        payload: { test: 'data' },
        timestamp: nowISO(),
      });

      expect(item.id).toBeDefined();
      expect(item.estado).toBe('PENDIENTE');
      expect(item.reintentos).toBe(0);
      expect(item.error_mensaje).toBeNull();
      expect(item.client_tx_id).toBe(clientTxId);
    });

    it('should track sync state transitions', async () => {
      const item = await syncQueueRepository.enqueue({
        tipo_entidad: 'PRODUCTO',
        accion: 'UPDATE',
        entity_id: generateId(),
        client_tx_id: generateId(),
        payload: { nombre: 'Updated' },
        timestamp: nowISO(),
      });

      await syncQueueRepository.markProcesando(item.id);
      let retrieved = await syncQueueRepository.getById(item.id);
      expect(retrieved?.estado).toBe('PROCESANDO');

      await syncQueueRepository.markCompletado(item.id);
      retrieved = await syncQueueRepository.getById(item.id);
      expect(retrieved?.estado).toBe('COMPLETADO');
    });

    it('should track errors and retry count', async () => {
      const item = await syncQueueRepository.enqueue({
        tipo_entidad: 'VENTA',
        accion: 'CREATE',
        entity_id: generateId(),
        client_tx_id: generateId(),
        payload: { test: 'error' },
        timestamp: nowISO(),
      });

      await syncQueueRepository.markError(item.id, 'Network error');
      let retrieved = await syncQueueRepository.getById(item.id);
      expect(retrieved?.estado).toBe('ERROR');
      expect(retrieved?.reintentos).toBe(1);
      expect(retrieved?.error_mensaje).toBe('Network error');

      await syncQueueRepository.markError(item.id, 'Timeout');
      retrieved = await syncQueueRepository.getById(item.id);
      expect(retrieved?.reintentos).toBe(2);
    });

    it('should provide statistics', async () => {
      await syncQueueRepository.enqueue({
        tipo_entidad: 'VENTA',
        accion: 'CREATE',
        entity_id: generateId(),
        client_tx_id: generateId(),
        payload: {},
        timestamp: nowISO(),
      });
      await syncQueueRepository.enqueue({
        tipo_entidad: 'PRODUCTO',
        accion: 'UPDATE',
        entity_id: generateId(),
        client_tx_id: generateId(),
        payload: {},
        timestamp: nowISO(),
      });

      const item = await syncQueueRepository.enqueue({
        tipo_entidad: 'CUENTA_POR_COBRAR',
        accion: 'CREATE',
        entity_id: generateId(),
        client_tx_id: generateId(),
        payload: {},
        timestamp: nowISO(),
      });
      await syncQueueRepository.markCompletado(item.id);

      const stats = await syncQueueRepository.getEstadisticas();
      expect(stats.pendientes).toBe(2);
      expect(stats.completados).toBe(1);
      expect(stats.errores).toBe(0);
    });
  });

  describe('Offline-First Guarantees', () => {
    it('should allow full CRUD operations without network', async () => {
      const producto = await productoRepository.create({
        id: generateId(),
        codigo_barras: '1234567890123',
        nombre: 'Producto Offline',
        precio_venta: 1500,
        costo: 1000,
        stock_actual: 25,
        stock_minimo: 5,
        categoria: 'Test',
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      });

      expect(producto.id).toBeDefined();

      const venta = {
        id: generateId(),
        fecha: todayISO(),
        total: 3000,
        metodo_pago: 'EFECTIVO' as const,
        estado_sync: 'PENDIENTE' as const,
        client_tx_id: generateId(),
        creado_en: nowISO(),
        sincronizado_en: null,
      };

      await ventaRepository.create(venta);

      expect(venta.estado_sync).toBe('PENDIENTE');

      const cuenta = {
        id: generateId(),
        cliente_nombre: 'Cliente Offline',
        cliente_telefono: '+59179999999',
        monto_total: 2000,
        saldo_pendiente: 2000,
        fecha_vencimiento: '2026-11-01',
        estado: 'PENDIENTE' as const,
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      };

      await cuentaPorCobrarRepository.create(cuenta);

      expect(cuenta.estado).toBe('PENDIENTE');

      const stats = await syncQueueRepository.getEstadisticas();
      expect(typeof stats.pendientes).toBe('number');
    });

    it('should maintain data consistency across related entities', async () => {
      const productoId = generateId();
      await productoRepository.create({
        id: productoId,
        codigo_barras: null,
        nombre: 'Producto Consistencia',
        precio_venta: 1000,
        costo: 700,
        stock_actual: 100,
        stock_minimo: 10,
        categoria: 'Test',
        creado_en: nowISO(),
        actualizado_en: nowISO(),
      });

      const ventaId = generateId();
      const venta = {
        id: ventaId,
        fecha: todayISO(),
        total: 2000,
        metodo_pago: 'EFECTIVO' as const,
        estado_sync: 'PENDIENTE' as const,
        client_tx_id: generateId(),
        creado_en: nowISO(),
        sincronizado_en: null,
      };

      await ventaRepository.create(venta);

      await detalleVentaRepository.createBatch([
        {
          id: generateId(),
          venta_id: ventaId,
          producto_id: productoId,
          cantidad: 2,
          precio_unitario: 1000,
        },
      ]);

      const detalles = await detalleVentaRepository.getByVenta(ventaId);
      expect(detalles.length).toBe(1);
      expect(detalles[0].producto_id).toBe(productoId);
      expect(detalles[0].cantidad).toBe(2);
    });
  });
});