from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime

from app.core.config import get_settings
from app.core.database import get_db
from app.schemas.sync import (
    SyncPushRequest, SyncResponse, SyncPullRequest, SyncPullResponse,
    VentaCreateRequest, VentaResponse
)
from app.services.sync_service import SyncService

router = APIRouter()
settings = get_settings()


@router.post("/sync/push", response_model=SyncResponse, status_code=status.HTTP_200_OK)
async def sync_push(
    request: SyncPushRequest,
    db: AsyncSession = Depends(get_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """
    Sincroniza un lote de transacciones offline desde el cliente.
    
    - **transacciones**: Lista de transacciones offline (máx 100)
    - **Idempotency-Key**: UUID v4 único por request para idempotencia HTTP
    - Retorna: cantidad sincronizados, duplicados ignorados, conflictos
    """
    if not request.transacciones:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La lista de transacciones no puede estar vacía"
        )
    
    if len(request.transacciones) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Máximo 100 transacciones por lote"
        )
    
    sync_service = SyncService(db)
    return await sync_service.procesar_sync_push(request)


@router.get("/sync/pull", response_model=SyncPullResponse)
async def sync_pull(
    request: SyncPullRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Obtiene datos actualizados del servidor para sincronizar el cliente.
    
    - **ultima_sincronizacion**: Timestamp ISO de última sincronización (opcional)
    - **entidades**: Lista de entidades a sincronizar (opcional, por defecto todas)
    - Retorna: datos actualizados desde la última sincronización
    """
    # TODO: Implementar lógica de pull
    # Por ahora retorna estructura vacía
    from app.schemas.sync import SyncPullResponse, ProductoSync, VentaSync, DetalleVentaSync, MovimientoStockSync, CuentaPorCobrarSync, MovimientoCobroSync, ArqueoCajaSync
    
    return SyncPullResponse(
        productos=[],
        ventas=[],
        detalles_venta=[],
        movimientos_stock=[],
        cuentas_cobrar=[],
        movimientos_cobro=[],
        arqueos_caja=[],
        servidor_timestamp=datetime.utcnow().isoformat() + "Z"
    )


@router.post("/ventas/", response_model=VentaResponse, status_code=status.HTTP_201_CREATED)
async def crear_venta(
    request: VentaCreateRequest,
    db: AsyncSession = Depends(get_db),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    """
    Registra una venta rápida (online).
    
    - **items**: Lista de productos con cantidad y precio
    - **pagos**: Lista de pagos (EFECTIVO, QR, FIADO)
    - **Idempotency-Key**: UUID v4 único para idempotencia
    """
    # TODO: Implementar lógica de venta online
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Endpoint en desarrollo"
    )