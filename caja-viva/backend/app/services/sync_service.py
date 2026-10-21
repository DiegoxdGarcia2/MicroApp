from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from datetime import datetime
import uuid

from app.models import (
    Venta, DetalleVenta, Producto, MovimientoStock,
    CuentaPorCobrar, MovimientoCobro, ArqueoCaja, SyncQueueItem,
)
from app.schemas.sync import (
    SyncPushRequest, SyncResponse, TransaccionResultado,
)


METODOS_COBRO_VALIDOS = {"EFECTIVO", "QR", "TRANSFERENCIA"}
ESTADOS_CUENTA_VALIDOS = {"PENDIENTE", "PARCIAL", "PAGADO", "VENCIDO"}
TIPOS_MOVIMIENTO_VALIDOS = {"ENTRADA", "SALIDA", "MERMA", "AJUSTE"}


class SyncService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def procesar_sync_push(self, request: SyncPushRequest) -> SyncResponse:
        """Procesa un lote de transacciones offline con idempotencia garantizada."""
        sincronizados = 0
        duplicados = 0
        conflictos: List[Dict[str, Any]] = []
        resultados: List[TransaccionResultado] = []

        for transaccion in request.transacciones:
            resultado = await self._procesar_transaccion(transaccion)
            resultados.append(resultado)

            if resultado.status == "OK":
                sincronizados += 1
            elif resultado.status == "DUPLICADO":
                duplicados += 1
            else:
                conflictos.append({
                    "entidad_id": resultado.entity_id,
                    "tipo": transaccion.tipo,
                    "estrategia": "LWW",
                    "detalle": resultado.error or "Conflicto de concurrencia",
                    "cliente_data": transaccion.payload,
                    "servidor_data": None,
                })

        return SyncResponse(
            sincronizados=sincronizados,
            duplicados=duplicados,
            conflictos=conflictos,
            resultados=resultados,
            servidor_timestamp=datetime.utcnow().isoformat() + "Z",
        )

    async def _procesar_transaccion(self, transaccion) -> TransaccionResultado:
        """Procesa una sola transaccion con verificacion de idempotencia."""
        client_tx_id = transaccion.client_transaction_id

        existing = await self.db.scalar(
            select(SyncQueueItem).where(SyncQueueItem.client_tx_id == client_tx_id)
        )

        # Solo COMPLETADO es duplicado. Un PROCESSANDO puede quedar de un
        # reinicio/caida a mitad de proceso; hay que reintentarlo para no
        # perder la transaccion (los handlers son idempotentes por entidad).
        if existing and existing.estado == "COMPLETADO":
            return TransaccionResultado(
                client_transaction_id=client_tx_id,
                entity_id=transaccion.entidad_id,
                status="DUPLICADO",
            )

        item_id = existing.id if existing else uuid.uuid4().hex
        if existing:
            existing.tipo_entidad = transaccion.tipo
            existing.accion = transaccion.accion
            existing.payload = transaccion.payload
            existing.timestamp = transaccion.timestamp_local
            existing.estado = "PROCESANDO"
            existing.error_mensaje = None
        else:
            existing = SyncQueueItem(
                id=item_id,
                tipo_entidad=transaccion.tipo,
                accion=transaccion.accion,
                entity_id=transaccion.entidad_id,
                client_tx_id=client_tx_id,
                payload=transaccion.payload,
                timestamp=transaccion.timestamp_local,
                estado="PROCESANDO",
                reintentos=0,
            )
            self.db.add(existing)

        # Persistimos el marcador antes de aplicar cambios de negocio, para
        # poder registrar el error aun si el procesamiento falla.
        await self.db.commit()

        try:
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

            item = await self.db.get(SyncQueueItem, item_id)
            if item is not None:
                item.estado = "COMPLETADO"
                item.error_mensaje = None
            await self.db.commit()

            return TransaccionResultado(
                client_transaction_id=client_tx_id,
                entity_id=transaccion.entidad_id,
                status="OK",
            )

        except Exception as exc:  # noqa: BLE001 - se reporta al cliente
            await self.db.rollback()

            item = await self.db.get(SyncQueueItem, item_id)
            if item is None:
                item = SyncQueueItem(
                    id=item_id,
                    tipo_entidad=transaccion.tipo,
                    accion=transaccion.accion,
                    entity_id=transaccion.entidad_id,
                    client_tx_id=client_tx_id,
                    payload=transaccion.payload,
                    timestamp=transaccion.timestamp_local,
                    estado="ERROR",
                    reintentos=1,
                    error_mensaje=str(exc)[:500],
                )
                self.db.add(item)
            else:
                item.estado = "ERROR"
                item.error_mensaje = str(exc)[:500]
                item.reintentos = (item.reintentos or 0) + 1
            await self.db.commit()

            return TransaccionResultado(
                client_transaction_id=client_tx_id,
                entity_id=transaccion.entidad_id,
                status="CONFLICTO",
                error=str(exc),
            )

    # ------------------------------------------------------------------
    # VENTAS
    # ------------------------------------------------------------------
    async def _procesar_venta(self, transaccion):
        payload = transaccion.payload
        now = datetime.utcnow()

        if await self.db.get(Venta, transaccion.entidad_id):
            return

        fecha = payload.get("fecha")
        total = payload.get("total")
        metodo_pago = payload.get("metodo_pago") or "EFECTIVO"
        if not fecha or total is None:
            raise ValueError("Venta sin fecha o total")

        venta = Venta(
            id=transaccion.entidad_id,
            fecha=str(fecha)[:10],
            total=total,
            metodo_pago=metodo_pago,
            estado_sync="SINCRONIZADO",
            client_tx_id=transaccion.client_transaction_id,
            sincronizado_en=now,
        )
        self.db.add(venta)

        items = payload.get("items", [])
        for item in items:
            detalle = DetalleVenta(
                id=uuid.uuid4().hex,
                venta_id=transaccion.entidad_id,
                producto_id=item["producto_id"],
                cantidad=item["cantidad"],
                precio_unitario=item["precio_unitario"],
            )
            self.db.add(detalle)

        for item in items:
            await self._descontar_stock(item["producto_id"], -item["cantidad"])

            self.db.add(MovimientoStock(
                id=uuid.uuid4().hex,
                producto_id=item["producto_id"],
                tipo="SALIDA",
                cantidad=item["cantidad"],
                fecha=str(fecha)[:10],
                usuario_id=None,
                notas=f"Venta {transaccion.entidad_id[:8]}",
            ))

        # Los pagos a fiado se sincronizan como CUENTA_POR_COBRAR independientes.

    # ------------------------------------------------------------------
    # INVENTARIO
    # ------------------------------------------------------------------
    async def _descontar_stock(self, producto_id: str, delta: int) -> None:
        result = await self.db.execute(
            text("""
                UPDATE productos
                SET stock_actual = CASE
                        WHEN stock_actual + :delta < 0 THEN 0
                        ELSE stock_actual + :delta
                    END,
                    updated_at = :now
                WHERE id = :id
            """),
            {"delta": delta, "id": producto_id, "now": datetime.utcnow()},
        )
        if result.rowcount == 0:
            raise ValueError(f"Producto {producto_id} no encontrado")

    async def _fijar_stock(self, producto_id: str, stock: int) -> None:
        result = await self.db.execute(
            text("""
                UPDATE productos
                SET stock_actual = CASE WHEN :stock < 0 THEN 0 ELSE :stock END,
                    updated_at = :now
                WHERE id = :id
            """),
            {"stock": stock, "id": producto_id, "now": datetime.utcnow()},
        )
        if result.rowcount == 0:
            raise ValueError(f"Producto {producto_id} no encontrado")

    async def _procesar_movimiento_stock(self, transaccion):
        payload = transaccion.payload

        if await self.db.get(MovimientoStock, transaccion.entidad_id):
            return

        tipo = payload.get("tipo")
        if tipo not in TIPOS_MOVIMIENTO_VALIDOS:
            raise ValueError(f"Tipo de movimiento invalido: {tipo}")

        cantidad = int(payload["cantidad"])
        if cantidad <= 0:
            raise ValueError("La cantidad del movimiento debe ser mayor a 0")

        self.db.add(MovimientoStock(
            id=transaccion.entidad_id,
            producto_id=payload["producto_id"],
            tipo=tipo,
            cantidad=cantidad,
            fecha=str(payload["fecha"])[:10],
            usuario_id=payload.get("usuario_id"),
            notas=payload.get("notas"),
        ))

        if tipo == "AJUSTE":
            await self._fijar_stock(payload["producto_id"], cantidad)
        elif tipo == "ENTRADA":
            await self._descontar_stock(payload["producto_id"], cantidad)
        else:  # SALIDA / MERMA
            await self._descontar_stock(payload["producto_id"], -cantidad)

    async def _procesar_producto(self, transaccion):
        payload = transaccion.payload
        producto = await self.db.get(Producto, transaccion.entidad_id)

        if transaccion.accion == "DELETE":
            if producto is not None:
                await self.db.delete(producto)
            return

        campos = {
            "codigo_barras": payload.get("codigo_barras"),
            "nombre": payload.get("nombre"),
            "precio_venta": payload.get("precio_venta"),
            "costo": payload.get("costo"),
            "stock_actual": payload.get("stock_actual"),
            "stock_minimo": payload.get("stock_minimo", 0),
            "categoria": payload.get("categoria"),
        }

        if producto is None:
            if not campos["nombre"] or campos["precio_venta"] is None or campos["costo"] is None:
                raise ValueError("Producto incompleto")
            self.db.add(Producto(
                id=transaccion.entidad_id,
                codigo_barras=campos["codigo_barras"],
                nombre=campos["nombre"],
                precio_venta=campos["precio_venta"],
                costo=campos["costo"],
                stock_actual=campos["stock_actual"] or 0,
                stock_minimo=campos["stock_minimo"] or 0,
                categoria=campos["categoria"],
            ))
        else:
            for key, value in campos.items():
                if value is not None or key in ("codigo_barras", "categoria"):
                    setattr(producto, key, value)

    # ------------------------------------------------------------------
    # FIADOS Y COBROS
    # ------------------------------------------------------------------
    async def _procesar_cuenta_cobrar(self, transaccion):
        payload = transaccion.payload
        estado = payload.get("estado", "PENDIENTE")
        if estado not in ESTADOS_CUENTA_VALIDOS:
            raise ValueError(f"Estado de cuenta invalido: {estado}")

        cuenta = await self.db.get(CuentaPorCobrar, transaccion.entidad_id)
        if cuenta is None:
            cuenta = CuentaPorCobrar(id=transaccion.entidad_id)
            self.db.add(cuenta)

        cuenta.cliente_nombre = payload["cliente_nombre"]
        cuenta.cliente_telefono = payload["cliente_telefono"]
        cuenta.monto_total = payload["monto_total"]
        cuenta.saldo_pendiente = payload["saldo_pendiente"]
        cuenta.fecha_vencimiento = str(payload["fecha_vencimiento"])[:10]
        cuenta.estado = estado

    async def _procesar_movimiento_cobro(self, transaccion):
        payload = transaccion.payload

        if await self.db.get(MovimientoCobro, transaccion.entidad_id):
            return

        metodo = payload.get("metodo")
        if metodo not in METODOS_COBRO_VALIDOS:
            raise ValueError(f"Metodo de cobro invalido: {metodo}")

        cuenta = await self.db.get(CuentaPorCobrar, payload["cuenta_cobrar_id"])
        if cuenta is None:
            raise ValueError(f"Cuenta por cobrar {payload['cuenta_cobrar_id']} no encontrada")

        self.db.add(MovimientoCobro(
            id=transaccion.entidad_id,
            cuenta_cobrar_id=payload["cuenta_cobrar_id"],
            monto=payload["monto"],
            metodo=metodo,
            fecha=str(payload["fecha"])[:10],
            notas=payload.get("notas"),
        ))
        await self.db.flush()

        total_cobrado = await self.db.scalar(
            select(func.coalesce(func.sum(MovimientoCobro.monto), 0)).where(
                MovimientoCobro.cuenta_cobrar_id == payload["cuenta_cobrar_id"]
            )
        )
        nuevo_saldo = max(0, cuenta.monto_total - int(total_cobrado or 0))
        cuenta.saldo_pendiente = nuevo_saldo
        cuenta.estado = "PAGADO" if nuevo_saldo == 0 else "PARCIAL"

    # ------------------------------------------------------------------
    # CIERRE DE CAJA
    # ------------------------------------------------------------------
    async def _procesar_arqueo_caja(self, transaccion):
        payload = transaccion.payload
        arqueo = await self.db.get(ArqueoCaja, transaccion.entidad_id)

        if arqueo is None:
            arqueo = await self.db.scalar(
                select(ArqueoCaja).where(ArqueoCaja.fecha == str(payload["fecha"])[:10])
            )

        if arqueo is None:
            arqueo = ArqueoCaja(
                id=transaccion.entidad_id,
                fecha=str(payload["fecha"])[:10],
            )
            self.db.add(arqueo)

        arqueo.efectivo_fisico_contado = payload["efectivo_fisico_contado"]
        arqueo.efectivo_teorico = payload["efectivo_teorico"]
        arqueo.ventas_efectivo = payload.get("ventas_efectivo", 0)
        arqueo.ventas_qr = payload.get("ventas_qr", 0)
        arqueo.ventas_fiado = payload.get("ventas_fiado", 0)
        arqueo.gastos_turno = payload.get("gastos_turno", 0)
        arqueo.total_teorico = payload["total_teorico"]
        arqueo.diferencia = payload["diferencia"]
        arqueo.estado = payload.get("estado", "CERRADO")
        arqueo.cerrado_en = datetime.utcnow().isoformat()


async def get_sync_service(db: AsyncSession):
    return SyncService(db)
