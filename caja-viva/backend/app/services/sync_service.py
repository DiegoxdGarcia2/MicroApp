from typing import List, Dict, Any, Optional, Annotated
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from sqlalchemy.exc import IntegrityError
from datetime import datetime
import uuid
import json

from app.models import (
    Venta, DetalleVenta, Producto, MovimientoStock, 
    CuentaPorCobrar, MovimientoCobro, ArqueoCaja, SyncQueueItem,
    EstadoSync, EstadoSyncQueue, TipoEntidadSync, AccionSync, EstadoSyncQueue
)
from app.schemas.sync import (
    SyncPushRequest, SyncResponse, TransaccionOffline, 
    TransaccionResultado, ConflictoSync, SyncResponse, ConflictoSync
)


class SyncService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def procesar_sync_push(self, request: SyncPushRequest) -> SyncResponse:
        """
        Procesa un lote de transacciones offline con idempotencia garantizada.
        """
        sincronizados = 0
        duplicados = 0
        conflictos: List[Dict[str, Any]] = []
        
        for transaccion in request.transacciones:
            resultado = await self._procesar_transaccion(transaccion)
            
            if resultado.status == "OK":
                sincronizados += 1
            elif resultado.status == "DUPLICADO":
                duplicados += 1
            elif resultado.status == "CONFLICTO":
                conflictos.append({
                    "entidad_id": resultado.entity_id,
                    "tipo": transaccion.tipo,
                    "estrategia": "LWW",
                    "detalle": resultado.error or "Conflicto de concurrencia",
                    "cliente_data": transaccion.payload,
                    "servidor_data": None
                })
        
        return SyncResponse(
            sincronizados=sincronizados,
            duplicados=duplicados,
            conflictos=conflictos,
            servidor_timestamp=datetime.utcnow().isoformat() + "Z"
        )

    async def _procesar_transaccion(self, transaccion) -> TransaccionResultado:
        """
        Procesa una sola transacción con verificación de idempotencia.
        """
        client_tx_id = transaccion.client_transaction_id
        
        # Verificar idempotencia: ¿ya existe esta transacción?
        existing = await self.db.execute(
            select(SyncQueueItem).where(SyncQueueItem.client_tx_id == client_tx_id)
        )
        existing_item = existing.scalar_one_or_none()
        
        if existing_item:
            if existing_item.estado == "COMPLETADO":
                return TransaccionResultado(
                    client_transaction_id=client_tx_id,
                    entity_id=transaccion.entidad_id,
                    status="DUPLICADO"
                )
            elif existing_item.estado == "PROCESANDO":
                # Transacción en proceso, evitar duplicados
                return TransaccionResultado(
                    client_transaction_id=client_tx_id,
                    entity_id=transaccion.entidad_id,
                    status="DUPLICADO"
                )
        
        # Marcar como PROCESANDO
        sync_item = SyncQueueItem(
            tipo_entidad=transaccion.tipo,
            accion=transaccion.accion,
            entity_id=transaccion.entidad_id,
            client_tx_id=transaccion.client_transaction_id,
            payload=transaccion.payload,
            timestamp=transaccion.timestamp_local,
            estado="PROCESANDO",
            reintentos=0
        )
        self.db.add(sync_item)
        
        try:
            # Procesar según tipo de entidad
            if transaccion.tipo == "VENTA":
                await self._procesar_venta(transaccion)
            elif transaccion.tipo == "MOVIMIENTO_STOCK":
                await self._procesar_movimiento_stock(transaccion)
            elif transaccion.tipo == "CUENTA_POR_COBRAR":
                await self._procesar_cuenta_cobrar(transaccion)
            elif transaccion.tipo == "MOVIMIENTO_COBRO":
                await self._procesar_movimiento_cobro(transaccion)
            elif transaccion.tipo == "ARQUEO_CAJA":
                await self._procesar_arqueo_caja(transaccion)
            elif transaccion.tipo == "PRODUCTO":
                await self._procesar_producto(transaccion)
            else:
                raise ValueError(f"Tipo de entidad no soportado: {transaccion.tipo}")
            
            # Marcar como completado
            sync_item.estado = "COMPLETADO"
            await self.db.commit()
            
            return TransaccionResultado(
                client_transaction_id=transaccion.client_transaction_id,
                entity_id=transaccion.entidad_id,
                status="OK"
            )
            
        except Exception as e:
            await self.db.rollback()
            
            # Marcar error en cola de sincronización
            sync_item.estado = "ERROR"
            sync_item.error_mensaje = str(e)
            sync_item.reintentos += 1
            await self.db.commit()
            
            return TransaccionResultado(
                client_transaction_id=transaccion.client_transaction_id,
                entity_id=transaccion.entidad_id,
                status="CONFLICTO",
                error=str(e)
            )

    async def _procesar_venta(self, transaccion):
        """Procesa una venta con sus detalles y pagos."""
        payload = transaccion.payload
        now = datetime.utcnow()
        
        # Crear venta
        venta = Venta(
            id=transaccion.entidad_id,
            fecha=transaccion.payload.get("fecha"),
            total=transaccion.payload.get("total"),
            metodo_pago=transaccion.payload.get("metodo_pago"),
            estado_sync="SINCRONIZADO",
            client_tx_id=transaccion.client_transaction_id,
            sincronizado_en=now,
        )
        self.db.add(venta)
        
        # Crear detalles
        for item in transaccion.payload.get("items", []):
            detalle = DetalleVenta(
                id=uuid.uuid4().hex,
                venta_id=transaccion.entidad_id,
                producto_id=item["producto_id"],
                cantidad=item["cantidad"],
                precio_unitario=item["precio_unitario"]
            )
            self.db.add(detalle)
        
        # Descontar stock de productos
        for item in transaccion.payload.get("items", []):
            await self._descontar_stock(transaccion, item["producto_id"], item["cantidad"])
        
        # Crear movimientos de stock para cada item
        for item in transaccion.payload.get("items", []):
            mov = MovimientoStock(
                id=uuid.uuid4().hex,
                producto_id=item["producto_id"],
                tipo="SALIDA",
                cantidad=item["cantidad"],
                fecha=transaccion.payload.get("fecha"),
                usuario_id=None,
                notas=f"Venta {transaccion.entidad_id[:8]}"
            )
            self.db.add(mov)
        
        # Procesar pagos - si hay fiado, crear cuenta por cobrar
        for pago in transaccion.payload.get("pagos", []):
            if pago.get("metodo") == "FIADO" and pago.get("cliente_fiado_id"):
                # Actualizar cuenta por cobrar
                cuenta = await self._get_or_create_cuenta_cobrar(
                    pago["cliente_fiado_id"],
                    transaccion.payload
                )
                # Aplicar pago
                nuevo_saldo = max(0, 0 - pago["monto"])  # se calcula real en repo
                # Nota: la lógica real está en el repository

    async def _descontar_stock(self, transaccion, producto_id: str, cantidad: int):
        """Descuenta stock de un producto de forma atómica."""
        result = await self.db.execute(
            text("""
                UPDATE productos 
                SET stock_actual = CASE 
                    WHEN stock_actual - :cantidad > 0 THEN stock_actual - :cantidad 
                    ELSE 0 
                END,
                    updated_at = :now
                WHERE id = :id
            """),
            {"cantidad": cantidad, "id": producto_id, "now": datetime.utcnow().isoformat()}
        )
        if result.rowcount == 0:
            raise ValueError(f"Producto {producto_id} no encontrado")

    async def _procesar_movimiento_stock(self, transaccion):
        payload = transaccion.payload
        mov = MovimientoStock(
            id=transaccion.entidad_id,
            producto_id=payload["producto_id"],
            tipo=payload["tipo"],
            cantidad=payload["cantidad"],
            fecha=payload["fecha"],
            usuario_id=payload.get("usuario_id"),
            notas=payload.get("notas")
        )
        self.db.add(mov)
        
        # Actualizar stock del producto
        await self._descontar_stock(
            transaccion, 
            payload["producto_id"], 
            payload["cantidad"] if payload["tipo"] == "SALIDA" else -payload["cantidad"]
        )

    async def _procesar_cuenta_cobrar(self, transaccion):
        payload = transaccion.payload
        cuenta = CuentaPorCobrar(
            id=transaccion.entidad_id,
            cliente_nombre=payload["cliente_nombre"],
            cliente_telefono=payload["cliente_telefono"],
            monto_total=payload["monto_total"],
            saldo_pendiente=payload["saldo_pendiente"],
            fecha_vencimiento=payload["fecha_vencimiento"],
            estado=payload.get("estado", "PENDIENTE"),
            creado_en=datetime.utcnow().isoformat(),
            actualizado_en=datetime.utcnow().isoformat(),
        )
        self.db.add(cuenta)

    async def _procesar_movimiento_cobro(self, transaccion):
        payload = transaccion.payload
        mov = MovimientoCobro(
            id=transaccion.entidad_id,
            cuenta_cobrar_id=payload["cuenta_cobrar_id"],
            monto=payload["monto"],
            metodo=payload["metodo"],
            fecha=payload["fecha"],
            notas=payload.get("notas")
        )
        self.db.add(mov)
        
        # Actualizar saldo de la cuenta
        # Nota: la lógica real está en el repository

    async def _procesar_arqueo_caja(self, transaccion):
        payload = transaccion.payload
        arqueo = ArqueoCaja(
            id=transaccion.entidad_id,
            fecha=payload["fecha"],
            efectivo_fisico_contado=payload["efectivo_fisico_contado"],
            efectivo_teorico=payload["efectivo_teorico"],
            ventas_efectivo=payload.get("ventas_efectivo", 0),
            ventas_qr=payload.get("ventas_qr", 0),
            ventas_fiado=payload.get("ventas_fiado", 0),
            gastos_turno=payload.get("gastos_turno", 0),
            total_teorico=payload["total_teorico"],
            diferencia=payload["diferencia"],
            estado=payload.get("estado", "CERRADO"),
            creado_en=datetime.utcnow().isoformat(),
            cerrado_en=datetime.utcnow().isoformat(),
        )
        self.db.add(arqueo)

    async def _procesar_producto(self, transaccion):
        payload = transaccion.payload
        if transaccion.accion == "CREATE":
            producto = Producto(
                id=transaccion.entidad_id,
                codigo_barras=payload.get("codigo_barras"),
                nombre=payload["nombre"],
                precio_venta=payload["precio_venta"],
                costo=payload["costo"],
                stock_actual=payload["stock_actual"],
                stock_minimo=payload.get("stock_minimo", 0),
                categoria=payload.get("categoria"),
                creado_en=datetime.utcnow().isoformat(),
                actualizado_en=datetime.utcnow().isoformat(),
            )
            self.db.add(producto)
        elif transaccion.accion == "UPDATE":
            # Actualización de producto existente
            result = await self.db.execute(
                select(Producto).where(Producto.id == transaccion.entidad_id)
            )
            producto = result.scalar_one_or_none()
            if producto:
                for key, value in transaccion.payload.items():
                    if hasattr(producto, key) and key not in ("id", "creado_en"):
                        setattr(producto, key, value)
                producto.actualizado_en = datetime.utcnow().isoformat()
        elif transaccion.accion == "DELETE":
            await self.db.execute(
                Producto.__table__.delete().where(Producto.id == transaccion.entidad_id)
            )

    async def _procesar_cuenta_cobrar(self, transaccion):
        payload = transaccion.payload
        if transaccion.accion == "CREATE":
            cuenta = CuentaPorCobrar(
                id=transaccion.entidad_id,
                cliente_nombre=payload["cliente_nombre"],
                cliente_telefono=payload["cliente_telefono"],
                monto_total=payload["monto_total"],
                saldo_pendiente=payload["saldo_pendiente"],
                fecha_vencimiento=payload["fecha_vencimiento"],
                estado=payload.get("estado", "PENDIENTE"),
                creado_en=datetime.utcnow().isoformat(),
                actualizado_en=datetime.utcnow().isoformat(),
            )
            self.db.add(cuenta)
        elif transaccion.accion == "UPDATE":
            result = await self.db.execute(
                select(CuentaPorCobrar).where(CuentaPorCobrar.id == transaccion.entidad_id)
            )
            cuenta = result.scalar_one_or_none()
            if cuenta:
                for key, value in transaccion.payload.items():
                    if hasattr(cuenta, key) and key not in ("id", "creado_en"):
                        setattr(cuenta, key, value)
                cuenta.actualizado_en = datetime.utcnow().isoformat()

    async def _procesar_movimiento_cobro(self, transaccion):
        payload = transaccion.payload
        mov = MovimientoCobro(
            id=transaccion.entidad_id,
            cuenta_cobrar_id=payload["cuenta_cobrar_id"],
            monto=payload["monto"],
            metodo=payload["metodo"],
            fecha=payload["fecha"],
            notas=payload.get("notas")
        )
        self.db.add(mov)

    async def _procesar_arqueo_caja(self, transaccion):
        payload = transaccion.payload
        arqueo = ArqueoCaja(
            id=transaccion.entidad_id,
            fecha=payload["fecha"],
            efectivo_fisico_contado=payload["efectivo_fisico_contado"],
            efectivo_teorico=payload["efectivo_teorico"],
            ventas_efectivo=payload.get("ventas_efectivo", 0),
            ventas_qr=payload.get("ventas_qr", 0),
            ventas_fiado=payload.get("ventas_fiado", 0),
            gastos_turno=payload.get("gastos_turno", 0),
            total_teorico=payload["total_teorico"],
            diferencia=payload["diferencia"],
            estado=payload.get("estado", "CERRADO"),
            creado_en=datetime.utcnow().isoformat(),
            cerrado_en=datetime.utcnow().isoformat(),
        )
        self.db.add(arqueo)


async def get_sync_service(db: AsyncSession):
    return SyncService(db)