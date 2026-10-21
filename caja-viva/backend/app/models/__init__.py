from sqlalchemy import String, Integer, Enum as SQLEnum, ForeignKey, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid as uuid_lib
from .base import Base, TimestampMixin, UUIDMixin
import enum


class TipoMovimiento(str, enum.Enum):
    ENTRADA = "ENTRADA"
    SALIDA = "SALIDA"
    MERMA = "MERMA"
    AJUSTE = "AJUSTE"


class EstadoSync(str, enum.Enum):
    PENDIENTE = "PENDIENTE"
    SINCRONIZADO = "SINCRONIZADO"
    CONFLICTO = "CONFLICTO"


class Venta(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "ventas"

    fecha: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    total: Mapped[int] = mapped_column(Integer, nullable=False)  # en centésimos de Bs
    metodo_pago: Mapped[str] = mapped_column(
        SQLEnum("EFECTIVO", "QR", "FIADO", "MIXTO", name="metodo_pago_enum"),
        nullable=False
    )
    estado_sync: Mapped[str] = mapped_column(
        SQLEnum(EstadoSync, name="estado_sync_enum"),
        default=EstadoSync.PENDIENTE,
        nullable=False
    )
    client_tx_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    sincronizado_en: Mapped[datetime] = mapped_column(nullable=True)

    # Relaciones
    detalles: Mapped[list["DetalleVenta"]] = relationship(
        back_populates="venta",
        cascade="all, delete-orphan"
    )


class DetalleVenta(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "detalles_venta"

    venta_id: Mapped[str] = mapped_column(String(36), ForeignKey("ventas.id", ondelete="CASCADE"), nullable=False, index=True)
    producto_id: Mapped[str] = mapped_column(String(36), ForeignKey("productos.id"), nullable=False, index=True)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    precio_unitario: Mapped[int] = mapped_column(Integer, nullable=False)  # snapshot en centésimos

    # Relaciones
    venta: Mapped["Venta"] = relationship(back_populates="detalles")
    producto: Mapped["Producto"] = relationship(back_populates="detalles_venta")


class Producto(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "productos"

    codigo_barras: Mapped[str] = mapped_column(String(50), unique=True, nullable=True, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    precio_venta: Mapped[int] = mapped_column(Integer, nullable=False)  # en centésimos de Bs
    costo: Mapped[int] = mapped_column(Integer, nullable=False)
    stock_actual: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stock_minimo: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    categoria: Mapped[str] = mapped_column(String(100), nullable=True, index=True)

    # Relaciones
    detalles_venta: Mapped[list["DetalleVenta"]] = relationship(back_populates="producto")
    movimientos_stock: Mapped[list["MovimientoStock"]] = relationship(back_populates="producto")


class MovimientoStock(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "movimientos_stock"

    producto_id: Mapped[str] = mapped_column(String(36), ForeignKey("productos.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(SQLEnum(TipoMovimiento, name="tipo_movimiento_enum"), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)  # positivo para entrada, negativo para salida
    fecha: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    usuario_id: Mapped[str] = mapped_column(String(36), nullable=True)
    notas: Mapped[str] = mapped_column(String(500), nullable=True)

    # Relaciones
    producto: Mapped["Producto"] = relationship(back_populates="movimientos_stock")


class EstadoCuenta(str, enum.Enum):
    PENDIENTE = "PENDIENTE"
    PARCIAL = "PARCIAL"
    PAGADO = "PAGADO"
    VENCIDO = "VENCIDO"


class CuentaPorCobrar(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "cuentas_cobrar"

    cliente_nombre: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    cliente_telefono: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    monto_total: Mapped[int] = mapped_column(Integer, nullable=False)  # en centésimos
    saldo_pendiente: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fecha_vencimiento: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    estado: Mapped[str] = mapped_column(
        SQLEnum(EstadoCuenta, name="estado_cuenta_enum"),
        default=EstadoCuenta.PENDIENTE,
        nullable=False
    )

    # Relaciones
    movimientos: Mapped[list["MovimientoCobro"]] = relationship(
        back_populates="cuenta",
        cascade="all, delete-orphan"
    )


class MetodoCobro(str, enum.Enum):
    EFECTIVO = "EFECTIVO"
    QR = "QR"
    TRANSFERENCIA = "TRANSFERENCIA"


class MovimientoCobro(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "movimientos_cobro"

    cuenta_cobrar_id: Mapped[str] = mapped_column(String(36), ForeignKey("cuentas_cobrar.id", ondelete="CASCADE"), nullable=False, index=True)
    monto: Mapped[int] = mapped_column(Integer, nullable=False)
    metodo: Mapped[str] = mapped_column(
        SQLEnum(MetodoCobro, name="metodo_cobro_enum"),
        nullable=False
    )
    fecha: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    notas: Mapped[str] = mapped_column(String(500), nullable=True)

    # Relaciones
    cuenta: Mapped["CuentaPorCobrar"] = relationship(back_populates="movimientos")


class EstadoArqueo(str, enum.Enum):
    ABIERTO = "ABIERTO"
    CERRADO = "CERRADO"


class ArqueoCaja(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "arqueos_caja"

    fecha: Mapped[str] = mapped_column(String(10), nullable=False, unique=True, index=True)  # YYYY-MM-DD
    efectivo_fisico_contado: Mapped[int] = mapped_column(Integer, nullable=False)
    efectivo_teorico: Mapped[int] = mapped_column(Integer, nullable=False)
    ventas_efectivo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ventas_qr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ventas_fiado: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    gastos_turno: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_teorico: Mapped[int] = mapped_column(Integer, nullable=False)
    diferencia: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estado: Mapped[str] = mapped_column(
        SQLEnum(EstadoArqueo, name="estado_arqueo_enum"),
        default=EstadoArqueo.ABIERTO,
        nullable=False
    )
    cerrado_en: Mapped[str] = mapped_column(nullable=True)  # ISO datetime


class TipoEntidadSync(str, enum.Enum):
    PRODUCTO = "PRODUCTO"
    VENTA = "VENTA"
    MOVIMIENTO_STOCK = "MOVIMIENTO_STOCK"
    CUENTA_POR_COBRAR = "CUENTA_POR_COBRAR"
    MOVIMIENTO_COBRO = "MOVIMIENTO_COBRO"
    ARQUEO_CAJA = "ARQUEO_CAJA"


class AccionSync(str, enum.Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


class EstadoSyncQueue(str, enum.Enum):
    PENDIENTE = "PENDIENTE"
    PROCESANDO = "PROCESANDO"
    COMPLETADO = "COMPLETADO"
    ERROR = "ERROR"


class SyncQueueItem(Base, TimestampMixin, UUIDMixin):
    __tablename__ = "sync_queue"

    tipo_entidad: Mapped[str] = mapped_column(
        SQLEnum(TipoEntidadSync, name="tipo_entidad_sync_enum"),
        nullable=False
    )
    accion: Mapped[str] = mapped_column(
        SQLEnum(AccionSync, name="accion_sync_enum"),
        nullable=False
    )
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    client_tx_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    timestamp: Mapped[str] = mapped_column(nullable=False, index=True)  # ISO datetime string
    reintentos: Mapped[int] = mapped_column(Integer, default=0)
    estado: Mapped[str] = mapped_column(
        SQLEnum(EstadoSyncQueue, name="estado_sync_queue_enum"),
        default=EstadoSyncQueue.PENDIENTE,
        nullable=False
    )
    error_mensaje: Mapped[str] = mapped_column(nullable=True)


# Índices compuestos (definidos en __table_args__ de cada modelo)