from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from uuid import UUID
from enum import Enum


class TipoEntidadSync(str, Enum):
    PRODUCTO = "PRODUCTO"
    VENTA = "VENTA"
    MOVIMIENTO_STOCK = "MOVIMIENTO_STOCK"
    CUENTA_POR_COBRAR = "CUENTA_POR_COBRAR"
    MOVIMIENTO_COBRO = "MOVIMIENTO_COBRO"
    ARQUEO_CAJA = "ARQUEO_CAJA"


class AccionSync(str, Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


class EstadoSyncQueue(str, Enum):
    PENDIENTE = "PENDIENTE"
    PROCESANDO = "PROCESANDO"
    COMPLETADO = "COMPLETADO"
    ERROR = "ERROR"


class MetodoPago(str, Enum):
    EFECTIVO = "EFECTIVO"
    QR = "QR"
    FIADO = "FIADO"
    MIXTO = "MIXTO"


class MetodoCobro(str, Enum):
    EFECTIVO = "EFECTIVO"
    QR = "QR"
    TRANSFERENCIA = "TRANSFERENCIA"


class TransaccionOffline(BaseModel):
    tipo: str = Field(..., description="Tipo de entidad: VENTA, MOVIMIENTO_STOCK, CUENTA_POR_COBRAR, MOVIMIENTO_COBRO, ARQUEO_CAJA")
    accion: str = Field(..., description="CREATE, UPDATE, DELETE")
    entidad_id: str = Field(..., description="UUID de la entidad")
    client_transaction_id: str = Field(..., description="UUID v4 generado por el cliente para idempotencia")
    payload: Dict[str, Any] = Field(..., description="Datos serializados de la entidad")
    timestamp_local: str = Field(..., description="ISO 8601 con timezone, hora local del cliente")


class SyncPushRequest(BaseModel):
    transacciones: List[TransaccionOffline] = Field(..., min_length=1, max_length=100)
    cliente_estado: Optional[Dict[str, Any]] = Field(default=None, description="Estado local del cliente para conflicto resolution")


class TransaccionResultado(BaseModel):
    client_transaction_id: str
    entity_id: str
    status: Literal["OK", "DUPLICADO", "CONFLICTO"]
    error: Optional[str] = None


class SyncResponse(BaseModel):
    sincronizados: int = Field(..., description="Número de transacciones procesadas exitosamente")
    duplicados: int = Field(default=0, description="Transacciones ignoradas por idempotencia")
    conflictos: List["ConflictoSync"] = Field(default_factory=list)
    servidor_timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


class ConflictoSync(BaseModel):
    entidad_id: str
    tipo: str
    estrategia: Literal["LWW", "MERGE", "MANUAL"]
    detalle: str
    cliente_data: Optional[Dict[str, Any]] = None
    servidor_data: Optional[Dict[str, Any]] = None


class ConflictoResponse(BaseModel):
    conflictos: List[ConflictoSync]
    mensaje: str = "Conflictos detectados, requieren resolución manual"


class SyncPullRequest(BaseModel):
    ultima_sincronizacion: Optional[str] = Field(None, description="ISO timestamp de última sincronización")
    entidades: Optional[List[str]] = Field(None, description="Entidades a sincronizar: productos, ventas, etc.")


class ProductoSync(BaseModel):
    id: str
    codigo_barras: Optional[str] = None
    nombre: str
    precio_venta: int
    costo: int
    stock_actual: int
    stock_minimo: int
    categoria: Optional[str] = None
    creado_en: str
    actualizado_en: str


class VentaSync(BaseModel):
    id: str
    fecha: str
    total: int
    metodo_pago: str
    estado_sync: str
    client_tx_id: str
    creado_en: str
    sincronizado_en: Optional[str] = None


class DetalleVentaSync(BaseModel):
    id: str
    venta_id: str
    producto_id: str
    cantidad: int
    precio_unitario: int


class MovimientoStockSync(BaseModel):
    id: str
    producto_id: str
    tipo: str
    cantidad: int
    fecha: str
    usuario_id: Optional[str] = None
    notas: Optional[str] = None


class CuentaPorCobrarSync(BaseModel):
    id: str
    cliente_nombre: str
    cliente_telefono: str
    monto_total: int
    saldo_pendiente: int
    fecha_vencimiento: str
    estado: str
    creado_en: str
    actualizado_en: str


class MovimientoCobroSync(BaseModel):
    id: str
    cuenta_cobrar_id: str
    monto: int
    metodo: str
    fecha: str
    notas: Optional[str] = None


class ArqueoCajaSync(BaseModel):
    id: str
    fecha: str
    efectivo_fisico_contado: int
    efectivo_teorico: int
    ventas_efectivo: int
    ventas_qr: int
    ventas_fiado: int
    gastos_turno: int
    total_teorico: int
    diferencia: int
    estado: str
    cerrado_en: Optional[str] = None
    creado_en: str


class SyncPullResponse(BaseModel):
    productos: List[ProductoSync] = []
    ventas: List[VentaSync] = []
    detalles_venta: List[DetalleVentaSync] = []
    movimientos_stock: List[MovimientoStockSync] = []
    cuentas_cobrar: List[CuentaPorCobrarSync] = []
    movimientos_cobro: List[MovimientoCobroSync] = []
    arqueos_caja: List[ArqueoCajaSync] = []
    servidor_timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


class VentaCreateRequest(BaseModel):
    items: List[Dict[str, Any]] = Field(..., min_length=1)
    pagos: List[Dict[str, Any]] = Field(..., min_length=1)
    client_transaction_id: str = Field(..., description="UUID v4 para idempotencia")

    @field_validator("items")
    @classmethod
    def validate_items(cls, v):
        if not v or len(v) == 0:
            raise ValueError("La venta debe tener al menos un item")
        for item in v:
            if item.get("cantidad", 0) <= 0:
                raise ValueError("Cantidad debe ser > 0")
            if item.get("precio_unitario", 0) <= 0:
                raise ValueError("Precio unitario debe ser > 0")
        return v

    @field_validator("pagos")
    @classmethod
    def validate_pagos(cls, v):
        if not v or len(v) == 0:
            raise ValueError("Debe haber al menos un pago")
        total_pagos = sum(p.get("monto", 0) for p in v)
        if total_pagos <= 0:
            raise ValueError("Total de pagos debe ser > 0")
        return v


class VentaResponse(BaseModel):
    id: str
    fecha: str
    total: int
    metodo_pago: str
    estado_sync: str
    client_tx_id: str
    creado_en: str
    sincronizado_en: Optional[str] = None


class ProductoCreateRequest(BaseModel):
    codigo_barras: Optional[str] = None
    nombre: str
    precio_venta: int
    costo: int
    stock_actual: int
    stock_minimo: int
    categoria: Optional[str] = None


class ProductoResponse(BaseModel):
    id: str
    codigo_barras: Optional[str] = None
    nombre: str
    precio_venta: int
    costo: int
    stock_actual: int
    stock_minimo: int
    categoria: Optional[str] = None
    creado_en: str
    actualizado_en: str


class ArqueoCajaCreateRequest(BaseModel):
    fecha: str
    efectivo_fisico_contado: int
    observaciones: Optional[str] = None


class ArqueoCajaResponse(BaseModel):
    id: str
    fecha: str
    efectivo_fisico_contado: int
    efectivo_teorico: int
    ventas_efectivo: int
    ventas_qr: int
    ventas_fiado: int
    gastos_turno: int
    total_teorico: int
    diferencia: int
    estado: str
    cerrado_en: Optional[str] = None
    creado_en: str


class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str
    checks: Dict[str, str]
    db_status: Optional[str] = None
    db_engine: Optional[str] = None
    db_latency_ms: Optional[float] = None