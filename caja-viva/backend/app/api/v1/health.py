from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime
import time

from app.core.config import get_settings
from app.core.database import get_db, check_db_connection, get_db_engine_type
from app.schemas.sync import HealthResponse

router = APIRouter()
settings = get_settings()


@router.get("/health", response_model=HealthResponse, status_code=status.HTTP_200_OK)
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Health check endpoint con verificación de conectividad a base de datos.
    
    Returns:
        HealthResponse con:
        - status: "healthy" | "degraded" | "unhealthy"
        - db_status: "connected" | "disconnected"
        - db_engine: "postgresql" | "sqlite" | "unknown"
        - db_latency_ms: latencia de la query de prueba
        - checks: dict con estado de componentes
    """
    start_time = time.perf_counter()
    
    # Verificar conexión a base de datos
    db_connected = await check_db_connection()
    db_latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
    db_engine = await get_db_engine_type()
    
    # Determinar estado general
    if db_connected:
        status_str = "healthy"
        db_status = "connected"
    else:
        status_str = "degraded"
        db_status = "disconnected"
    
    return HealthResponse(
        status=status_str,
        timestamp=datetime.utcnow().isoformat() + "Z",
        version="1.0.0-beta",
        checks={
            "database": db_status,
            "sync_queue": "ok",
            "api": "ok",
        },
        db_status=db_status,
        db_engine=db_engine,
        db_latency_ms=db_latency_ms,
    )


@router.get("/health/live", status_code=status.HTTP_200_OK)
async def liveness_check():
    """
    Liveness probe para Kubernetes/Render.
    Verifica solo que la aplicación esté corriendo (sin dependencias externas).
    """
    return {"status": "alive", "timestamp": datetime.utcnow().isoformat() + "Z"}


@router.get("/health/ready", status_code=status.HTTP_200_OK)
async def readiness_check(db: AsyncSession = Depends(get_db)):
    """
    Readiness probe para Kubernetes/Render.
    Verifica que la aplicación puede servir tráfico (con DB).
    """
    db_connected = await check_db_connection()
    
    if not db_connected:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not ready"
        )
    
    return {"status": "ready", "timestamp": datetime.utcnow().isoformat() + "Z"}