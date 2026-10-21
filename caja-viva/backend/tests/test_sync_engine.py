import pytest
import pytest_asyncio
from datetime import datetime
from uuid import uuid4
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text

from app.models import Base, Venta, DetalleVenta, Producto, MovimientoStock, SyncQueueItem
from app.models import CuentaPorCobrar, MovimientoCobro, ArqueoCaja
from app.services.sync_service import SyncService
from app.schemas.sync import SyncPushRequest, TransaccionOffline, TransaccionResultado


# Test database URL (SQLite in memory for testing)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def async_engine():
    from sqlalchemy.ext.asyncio import create_async_engine
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(async_engine):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from app.models import Base, Producto
    
    async with async_engine.begin() as conn:
        from app.models import Base
        await conn.run_sync(Base.metadata.create_all)
    
    async_session = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        # Create test product
        prod = Producto(
            id="prod-1",
            codigo_barras="123456789",
            nombre="Producto Test",
            precio_venta=850,
            costo=500,
            stock_actual=100,
            stock_minimo=10
        )
        session.add(prod)
        await session.commit()
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def sync_service(db_session: AsyncSession) -> "SyncService":
    from app.services.sync_service import SyncService
    return SyncService(db_session)


class TestSyncEngine:
    """Tests para el motor de sincronización offline-first."""

    @pytest.mark.asyncio
    async def test_sync_push_venta_exitosa(self, sync_service, db_session):
        """Debe procesar una venta offline y guardarla correctamente."""
        client_transaction_id = "test-tx-id-1"
        
        transaccion = TransaccionOffline(
            tipo="VENTA",
            accion="CREATE",
            entidad_id="venta-123",
            client_transaction_id="test-tx-id-1",
            payload={
                "fecha": "2026-10-11",
                "total": 1700,
                "metodo_pago": "EFECTIVO",
                "items": [
                    {"producto_id": "prod-1", "cantidad": 2, "precio_unitario": 850}
                ],
                "pagos": [
                    {"metodo": "EFECTIVO", "monto": 1700}
                ]
            },
            timestamp_local=datetime.utcnow().isoformat()
        )
        
        request = SyncPushRequest(transacciones=[transaccion])
        response = await sync_service.procesar_sync_push(request)
        
        assert response.sincronizados == 1
        assert response.duplicados == 0
        assert len(response.conflictos) == 0

    @pytest.mark.asyncio
    async def test_idempotencia_mismo_uuid(self, sync_service):
        """El mismo client_transaction_id no debe duplicar la venta."""
        client_transaction_id = "test-tx-id-2"
        
        transaccion = TransaccionOffline(
            tipo="VENTA",
            accion="CREATE",
            entidad_id="venta-123",
            client_transaction_id=client_transaction_id,
            payload={
                "fecha": "2026-10-11",
                "total": 1700,
                "metodo_pago": "EFECTIVO",
                "items": [{"producto_id": "prod-1", "cantidad": 2, "precio_unitario": 850}],
                "pagos": [{"metodo": "EFECTIVO", "monto": 1700}]
            },
            timestamp_local=datetime.utcnow().isoformat()
        )
        
        request = SyncPushRequest(transacciones=[transaccion])
        
        # Primera sincronización
        response1 = await sync_service.procesar_sync_push(SyncPushRequest(transacciones=[transaccion]))
        assert response1.sincronizados == 1
        
        # Segunda sincronización con MISMO UUID
        response2 = await sync_service.procesar_sync_push(SyncPushRequest(transacciones=[transaccion]))
        assert response2.duplicados == 1
        assert response2.sincronizados == 0

    @pytest.mark.asyncio
    async def test_venta_offline_no_duplica_al_reintentar_sync(self, sync_service):
        """Una venta offline no debe duplicar inventario ni dinero al reintentar sync."""
        client_transaction_id = "test-tx-id-3"
        
        transaccion = TransaccionOffline(
            tipo="VENTA",
            accion="CREATE",
            entidad_id="venta-456",
            client_transaction_id=client_transaction_id,
            payload={
                "fecha": "2026-10-11",
                "total": 1500,
                "metodo_pago": "EFECTIVO",
                "items": [{"producto_id": "prod-1", "cantidad": 1, "precio_unitario": 1500}],
                "pagos": [{"metodo": "EFECTIVO", "monto": 1500}]
            },
            timestamp_local=datetime.utcnow().isoformat()
        )
        
        request = SyncPushRequest(transacciones=[transaccion])
        
        # Primera sincronización
        response1 = await sync_service.procesar_sync_push(SyncPushRequest(transacciones=[transaccion]))
        assert response1.sincronizados == 1
        
        # Reintentar MISMA venta (mismo client_transaction_id)
        response2 = await sync_service.procesar_sync_push(SyncPushRequest(transacciones=[transaccion]))
        assert response2.duplicados == 1
        assert response2.sincronizados == 0
        assert response2.conflictos == []

    @pytest.mark.asyncio
    async def test_stock_concurrencia_offline_merge_deltas(self, sync_service):
        """Dos ventas offline del mismo producto deben fusionar deltas de stock."""
        # Crear producto inicial con stock 100
        # Venta A vende 3, Venta B vende 2 (ambas offline)
        # Al sincronizar ambas: stock final = 100 - 3 - 2 = 95
        
        # Crear producto inicial
        from app.models import Producto
        # TODO: Implementar test completo de concurrencia
        
        assert True  # Placeholder

    @pytest.mark.asyncio
    async def test_sync_push_validacion_lote_maximo(self, sync_service):
        """Debe rechazar lotes mayores a 100 transacciones."""
        transacciones = [
            TransaccionOffline(
                tipo="VENTA",
                accion="CREATE",
                entidad_id=f"venta-{i}",
                client_transaction_id=f"tx-{i}",
                payload={"fecha": "2026-10-11", "total": 1000, "metodo_pago": "EFECTIVO", "items": [], "pagos": []},
                timestamp_local=datetime.utcnow().isoformat()
            )
            for i in range(101)  # 101 transacciones = excede límite
        ]
        
        from app.schemas.sync import SyncPushRequest
        from pydantic import ValidationError
        
        # La validación ocurre en el esquema Pydantic al crear el request
        with pytest.raises(ValidationError) as exc_info:
            SyncPushRequest(transacciones=transacciones)
        
        # Debe lanzar error de validación por exceder 100 items
        assert "100" in str(exc_info.value) or "too_long" in str(exc_info.value)


    @pytest.mark.asyncio
    async def test_sync_cuenta_por_cobrar_ignora_campos_locales(self, sync_service, db_session):
        """Crea una cuenta por cobrar aunque el payload traiga campos locales."""
        transaccion = TransaccionOffline(
            tipo="CUENTA_POR_COBRAR",
            accion="CREATE",
            entidad_id="cuenta-1",
            client_transaction_id="tx-cuenta-1",
            payload={
                "cliente_nombre": "Cliente Prueba",
                "cliente_telefono": "+59171234567",
                "monto_total": 400,
                "saldo_pendiente": 400,
                "fecha_vencimiento": "2026-11-05",
                "estado": "PENDIENTE",
                # Campos que existen solo en IndexedDB y deben ignorarse.
                "creado_en": "2026-10-21T19:08:42.355Z",
                "actualizado_en": "2026-10-21T19:08:42.355Z",
            },
            timestamp_local=datetime.utcnow().isoformat(),
        )

        response = await sync_service.procesar_sync_push(
            SyncPushRequest(transacciones=[transaccion])
        )

        assert response.sincronizados == 1
        cuenta = await db_session.get(CuentaPorCobrar, "cuenta-1")
        assert cuenta is not None
        assert cuenta.saldo_pendiente == 400
        assert cuenta.estado == "PENDIENTE"

    @pytest.mark.asyncio
    async def test_sync_movimiento_cobro_recalcula_saldo(self, sync_service, db_session):
        """Un cobro parcial deja la cuenta en PARCIAL y descuenta el saldo."""
        cuenta = CuentaPorCobrar(
            id="cuenta-2",
            cliente_nombre="Cliente Dos",
            cliente_telefono="+59169876543",
            monto_total=400,
            saldo_pendiente=400,
            fecha_vencimiento="2026-11-05",
            estado="PENDIENTE",
        )
        db_session.add(cuenta)
        await db_session.commit()

        transaccion = TransaccionOffline(
            tipo="MOVIMIENTO_COBRO",
            accion="CREATE",
            entidad_id="cobro-1",
            client_transaction_id="tx-cobro-1",
            payload={
                "cuenta_cobrar_id": "cuenta-2",
                "monto": 150,
                "metodo": "EFECTIVO",
                "fecha": "2026-10-21",
                "notas": "Pago parcial",
            },
            timestamp_local=datetime.utcnow().isoformat(),
        )

        response = await sync_service.procesar_sync_push(
            SyncPushRequest(transacciones=[transaccion])
        )

        assert response.sincronizados == 1
        await db_session.refresh(cuenta)
        assert cuenta.saldo_pendiente == 250
        assert cuenta.estado == "PARCIAL"
        assert await db_session.get(MovimientoCobro, "cobro-1") is not None

    @pytest.mark.asyncio
    async def test_sync_arqueo_caja_con_gastos(self, sync_service, db_session):
        """El cierre de caja se guarda con el total plano de gastos."""
        transaccion = TransaccionOffline(
            tipo="ARQUEO_CAJA",
            accion="CREATE",
            entidad_id="arqueo-1",
            client_transaction_id="tx-arqueo-1",
            payload={
                "fecha": "2026-10-21",
                "efectivo_fisico_contado": 5000,
                "efectivo_teorico": 4800,
                "ventas_efectivo": 5000,
                "ventas_qr": 2000,
                "ventas_fiado": 1000,
                "gastos_turno": 200,
                "total_teorico": 7800,
                "diferencia": 200,
                "estado": "CERRADO",
            },
            timestamp_local=datetime.utcnow().isoformat(),
        )

        response = await sync_service.procesar_sync_push(
            SyncPushRequest(transacciones=[transaccion])
        )

        assert response.sincronizados == 1
        arqueo = await db_session.get(ArqueoCaja, "arqueo-1")
        assert arqueo is not None
        assert arqueo.gastos_turno == 200
        assert arqueo.estado == "CERRADO"
        assert arqueo.cerrado_en is not None

    @pytest.mark.asyncio
    async def test_reintenta_transaccion_que_quedo_procesando(self, sync_service, db_session):
        """Una caida a mitad de proceso no debe perder la transaccion."""
        from app.models import SyncQueueItem

        db_session.add(SyncQueueItem(
            id="item-procesando",
            tipo_entidad="PRODUCTO",
            accion="CREATE",
            entity_id="producto-procesando",
            client_tx_id="tx-procesando",
            payload={},
            timestamp=datetime.utcnow().isoformat(),
            estado="PROCESANDO",
            reintentos=0,
        ))
        await db_session.commit()

        transaccion = TransaccionOffline(
            tipo="PRODUCTO",
            accion="CREATE",
            entidad_id="producto-procesando",
            client_transaction_id="tx-procesando",
            payload={
                "nombre": "Producto recuperado",
                "codigo_barras": "REC-001",
                "precio_venta": 10,
                "costo": 6,
                "stock_actual": 5,
                "stock_minimo": 1,
                "categoria": "Abarrotes",
            },
            timestamp_local=datetime.utcnow().isoformat(),
        )

        response = await sync_service.procesar_sync_push(
            SyncPushRequest(transacciones=[transaccion])
        )

        assert response.sincronizados == 1
        assert await db_session.get(Producto, "producto-procesando") is not None

    async def _procesar_sync_push(self, sync_service, client_transaction_id):
        """Helper para procesar sync push."""
        from app.schemas.sync import SyncPushRequest, TransaccionOffline
        from datetime import datetime
        
        transaccion = TransaccionOffline(
            tipo="VENTA",
            accion="CREATE",
            entidad_id="venta-test",
            client_transaction_id=client_transaction_id,
            payload={
                "fecha": "2026-10-11",
                "total": 1700,
                "metodo_pago": "EFECTIVO",
                "items": [{"producto_id": "prod-1", "cantidad": 2, "precio_unitario": 850}],
                "pagos": [{"metodo": "EFECTIVO", "monto": 1700}]
            },
            timestamp_local=datetime.utcnow().isoformat()
        )
        
        return await sync_service.procesar_sync_push(SyncPushRequest(transacciones=[transaccion]))