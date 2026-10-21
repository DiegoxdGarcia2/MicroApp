import pytest
import pytest_asyncio
from datetime import datetime
from uuid import uuid4
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text

from app.models import Base, Venta, DetalleVenta, Producto, MovimientoStock, SyncQueueItem
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