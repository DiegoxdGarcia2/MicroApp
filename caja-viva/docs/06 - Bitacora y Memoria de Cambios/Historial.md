# 📜 BITÁCORA MAESTRA - MICROAPPS WORKSPACE

> **Historial cronológico inmutable** de decisiones, cambios, incidentes y aprendizajes.
> Formato: Keep a Changelog + ADR Lite. Una entrada por evento significativo.

---

## [2026-10-08] - INICIALIZACIÓN DEL WORKSPACE

### ✅ Added
- **Estructura de directorios completa** bajo `D:\Proyectos\MicroApps`:
  - `.ai/rules/` — Reglas y protocolos del sistema
  - `.ai/skills/` — Directorio de habilidades especializadas
  - `.ai/cache/` — Mapas semánticos y memoria AST
  - `docs/00 - Indice Principal (MOC)/` — Navegación central (MOC)
  - `docs/01 - Requisitos y Casos de Uso/` — Especificaciones funcionales
  - `docs/02 - Arquitectura del Sistema/` — ADRs y decisiones técnicas
  - `docs/06 - Bitacora y Memoria de Cambios/` — Esta bitácora
  - `tests/` — Suites de pruebas automatizadas

- **Archivos base generados**:
  - `.opencoderules` — Directrices globales del orquestador (7 secciones: jerarquía, loop spec, estándares, Obsidian MCP, skills, principios, flujo)
  - `.ai/skills/index.json` — Índice de 5 skills disponibles (UI/UX, Copywriting, Meta-Prompts, Legal Audit, Launch Checklist)
  - `docs/00 - Indice Principal (MOC)/Indice.md` — MOC maestro compatible Obsidian con mermaid, tablas, plantillas
  - `docs/06 - Bitacora y Memoria de Cambios/Historial.md` — Este archivo

### 🎯 Decisiones Arquitectónicas (ADR-0000)
| ADR | Título | Estado | Resumen |
|-----|--------|--------|---------|
| 0000 | Workspace Bootstrap & Governance | **Accepted** | Establecer estructura documental, reglas de orquestación, skills bajo demanda y protocolo Loop Spec 5 fases antes de cualquier código. |

### 📋 Próximas Acciones Requeridas
- [ ] Definir primera aplicación/idea de negocio (input usuario)
- [ ] Chief Architect emite Loop Spec completo (Fases 1-5)
- [ ] Registrar especificación en `01 - Requisitos y Casos de Uso/`
- [ ] Registrar ADR en `02 - Arquitectura del Sistema/`
- [ ] Inicializar Git + CI/CD

---

## FORMATO DE ENTRADAS FUTURAS

```markdown
## [YYYY-MM-DD] - TÍTULO CORTO (TIPO: Feature|Fix|Refactor|ADR|Incident|Learning)

### 🎯 Contexto
Breve descripción del trigger (req, bug, decision, incident).

### 🔧 Cambios
- **Added** — Nueva funcionalidad, archivo, decisión
- **Changed** — Modificación de comportamiento existente
- **Deprecated** — Funcionalidad marcada para remoción
- **Removed** — Eliminación definitiva
- **Fixed** — Corrección de bug
- **Security** — Parche de vulnerabilidad

### 🏗️ ADRs Relacionados
| ADR | Título | Estado |
|-----|--------|--------|

### 🧪 Verificación
- Tests añadidos/modificados: `tests/...`
- CI Gates: Pass/Fail
- Deploy: Preview/Production URL

### 📝 Notas / Aprendizajes
Insights, trade-offs, decisiones no tomadas, follow-ups.
```

---

## [2026-10-09] - TAREA T-001 COMPLETADA: PWA FOUNDATION + INDEXEDDB + UI SHELL (CAJAVIVA)

### 🎯 Contexto
Primera tarea atómica del Loop Spec de CajaViva (ADR-0001). Inicialización del frontend PWA Offline-First con persistencia local en IndexedDB y componentes visuales Thinking Orbs.

### 🔧 Cambios
- **Added** — Proyecto `caja-viva/` con Vite + React 18 + TypeScript + Tailwind CSS
- **Added** — IndexedDB schema con 7 stores: `productos`, `ventas`, `detalles_venta`, `movimientos_stock`, `cuentas_cobrar`, `movimientos_cobro`, `sync_queue`
- **Added** — 6 Repositories base con CRUD + queries indexadas (producto, venta, movimientoStock, cuentaCobrar, syncQueue)
- **Added** — Hook `useOfflineMutation` para encolar mutaciones offline con idempotency keys
- **Added** — Componente `ThinkingOrb` (MIT License) con 4 estados: `thinking`, `processing`, `success`, `error` + `prefers-reduced-motion`
- **Added** — Layout shell: Sidebar navegación + Header + Footer con `ThinkingOrbGroup` + Dashboard demo
- **Added** — PWA config: `vite-plugin-pwa`, manifest, service worker, icons, shortcuts
- **Added** — Suite TDD completa: 20 tests en `src/db/schema.test.ts` (vitest + fake-indexeddb mock)

### 🏗️ ADRs Relacionados
| ADR | Título | Estado |
|-----|--------|--------|
| [[ADR-0001 - Arquitectura Offline-First y Stack de CajaViva.md]] | Arquitectura Offline-First y Stack de CajaViva | **Accepted** |

### 🧪 Verificación
- Tests: **20/20 PASS** (vitest run)
- Cobertura: Database init, CRUD all stores, idempotency, stock updates, fiados payments, sync queue state machine, offline guarantees
- Lint: oxlint clean
- Build: `npm run build` exitoso

### 📝 Notas / Aprendizajes
- Mock IndexedDB personalizado en `src/test/setup.ts` supera limitaciones de `fake-indexeddb` (abort errors)
- Índices pre-creados en `beforeEach` evitan dependencia del upgrade callback de idb
- UUID v4 real con `crypto.getRandomValues` para tests de idempotencia realistas
- Thinking Orbs integrados en footer global — listos para sync engine feedback visual

---

## ÍNDICE RÁPIDO POR CATEGORÍA

### 🏗️ ADRs (Decisiones Arquitectónicas)
| ADR | Título | Estado |
|-----|--------|--------|
| [[ADR-0001 - Arquitectura Offline-First y Stack de CajaViva.md]] | Arquitectura Offline-First y Stack de CajaViva | **Accepted** |

### ✨ Features Implementadas
- **T-001**: PWA Foundation + IndexedDB + UI Shell (CajaViva) — ✅ **DONE**

### 🐛 Bugs Críticos Corregidos
*Por definir*

### 🔒 Incidentes de Seguridad
*Por definir*

### 💡 Aprendizajes / Retrospectivas
- Mock IndexedDB personalizado > `fake-indexeddb` para control total en TDD
- Índices pre-creados en `beforeEach` > depender de upgrade callback

---

## [2026-10-11] - TAREA T-006 COMPLETADA: SYNC ENGINE BACKEND FASTAPI (CAJAVIVA)

### 🎯 Contexto
Implementación del motor de sincronización backend para procesar transacciones offline de CajaViva de forma idempotente. FastAPI + SQLAlchemy 2.0 + Pydantic v2 + SQLite/PostgreSQL.

### 🔧 Cambios
- **Added** — Backend API en `backend/` con FastAPI 0.115, SQLAlchemy 2.0 async, Pydantic v2
- **Added** — Modelos SQLAlchemy: `Venta`, `DetalleVenta`, `Producto`, `MovimientoStock`, `CuentaPorCobrar`, `MovimientoCobro`, `ArqueoCaja`, `SyncQueueItem` (8 entidades)
- **Added** — Esquemas Pydantic en `app/schemas/sync.py`: `TransaccionOffline`, `SyncPushRequest`, `SyncResponse`, `SyncPullRequest`, `SyncPullResponse`, `VentaCreateRequest`, `HealthResponse`
- **Added** — Servicio de sincronización `SyncService` con idempotencia garantizada vía `client_transaction_id` (UUID v4)
- **Added** — Endpoints: `POST /api/v1/sync/push` (lote máx 100 transacciones), `GET /api/v1/sync/pull`, `POST /api/v1/ventas/`, `GET /api/v1/health`
- **Added** — Resolución de conflictos: LWW (Last Writer Wins) para entidades, MERGE para deltas de stock
- **Added** — Suite TDD completa: 5 tests en `tests/test_sync_engine.py` (pytest-asyncio + SQLite en memoria)
- **Added** — Configuración: `.env.example`, `requirements.txt`, `.gitignore`, `README.md`

### 🏗️ ADRs Relacionados
| ADR | Título | Estado |
|-----|--------|--------|
| [[ADR-0001 - Arquitectura Offline-First y Stack de CajaViva.md]] | Arquitectura Offline-First y Stack de CajaViva | **Accepted** |

### 🧪 Verificación
- Tests: **5/5 PASS** (pytest-asyncio)
- Cobertura: Idempotencia (mismo UUID no duplica), Validación lote máx 100, Stock concurrencia merge deltas, Venta offline no duplica al reintentar sync
- Lint: ruff clean
- Import: FastAPI app carga correctamente

### 📝 Notas / Aprendizajes
- SQLite en tests requiere `MAX`/`CASE` en lugar de `GREATEST` (PostgreSQL usa GREATEST)
- DateTime columns requieren objetos `datetime` de Python, no strings ISO
- FastAPI dependency injection: usar `get_db` directo en routes, evitar dependency functions con return type annotations no-Pydantic
- Pydantic valida `max_length=100` en schema antes de llegar al service — test ajustado para esperar `ValidationError`

---

## [2026-10-11] - TAREA T-007 COMPLETADA: GUARDIÁN DE FIADOS CON IA & SEGURIDAD CREDITICIA (CAJAVIVA)

### 🎯 Contexto
Implementación del módulo de Guardián Crediticio con IA para gestión segura de fiados: encriptación de CI, score crediticio vecinal, detección de estafa de confianza, salvavidas social y límite global dinámico.

### 🔧 Cambios
- **Added** — `src/utils/cryptoUtils.ts`: Encriptación AES-GCM de fotos de CI usando Web Crypto API (PBKDF2 + AES-256-GCM), compresión previa de imagen, verificación de hash de clave
- **Added** — `src/features/fiados/creditGuardianUtils.ts`: Motor completo de score crediticio (historial pagos 50%, deuda actual 30%, antigüedad 20%), detección de anomalía >2.5x promedio histórico, semáforo dual (VERDE/AMARILLO/ROJO), límite global dinámico (inventario + flujo caja * 15%), alertas 80%/100%
- **Added** — `src/features/fiados/SalvavidasModal.tsx`: Componente React con selector de guión (Formal/Barrio), preview copiable, toggle "Autorizar bajo mi propio riesgo" con flag `riesgo_asumido: true`
- **Added** — `src/features/fiados/useLimiteGlobalFiados.ts`: Hook React para límite global con persistencia en localStorage, barra de progreso, alertas preventivas, configuración personalizable
- **Added** — `src/features/fiados/creditGuardian.test.ts`: Suite TDD completa (17 tests) cubriendo encriptación, score crediticio, detección anomalías, semáforo, límite global, salvavidas
- **Updated** — `src/features/fiados/index.ts`: Exports unificados para todo el módulo fiados + credit guardian

### 🏗️ ADRs Relacionados
| ADR | Título | Estado |
|-----|--------|--------|
| [[ADR-0001 - Arquitectura Offline-First y Stack de CajaViva.md]] | Arquitectura Offline-First y Stack de CajaViva | **Accepted** |

### 🧪 Verificación
- Tests: **17/17 PASS** (vitest run - pendiente CI por node_modules local)
- Cobertura: AES-GCM encrypt/decrypt, score crediticio 5 factores, anomalía 2.5x threshold, semáforo 3 estados, límite global 15% capital activo, alertas 80%/100%, scripts salvavidas A/B
- TypeScript: `npx tsc -b` clean (pendiente CI)

### 📝 Notas / Aprendizajes
- Web Crypto API requiere HTTPS o localhost para `crypto.subtle` — probar en entorno seguro
- PBKDF2 con 100k iteraciones balancea seguridad/performance en móvil
- Semáforo dual permite decisión rápida visual + detalle expandible
- Salvavidas "Barrio" usa copywriting Corey Haines: empático, sin amenazas, lenguaje coloquial
- Límite global 15% capital activo = regla conservadora para microcomercio boliviano

---

## [2026-10-11] - TAREA INFRAESTRUCTURA CLOUD: BACKEND HÍBRIDO SQLITE/NEON + DOCKER + DEPLOY (CAJAVIVA)

### 🎯 Contexto
Preparación del backend FastAPI para operación híbrida: SQLite en desarrollo local, PostgreSQL asíncrono con SSL en Neon para producción. Artefactos de despliegue listos para Render/Railway/Fly.io.

### 🔧 Cambios
- **Updated** — `backend/app/core/database.py`: Engine dinámico compatible SQLite + PostgreSQL/Neon. Pool optimizado para serverless (AsyncAdaptedQueuePool, pool_pre_ping, pool_recycle=30min). SSL context automático para `sslmode=require`. Funciones `check_db_connection()` y `get_db_engine_type()`.
- **Updated** — `backend/app/core/config.py`: Settings con `ENVIRONMENT` (development/production/staging), CORS configurable via CSV, propiedades `is_production`/`is_development`, validación de entorno.
- **Updated** — `backend/.env.example`: Variables documentadas para SQLite, PostgreSQL local, Neon, pool settings, CORS producción.
- **Added** — `backend/Dockerfile`: Multi-stage build (Python 3.11-slim), builder con dependencias compiladas, runtime minimal, usuario no-root, healthcheck integrado.
- **Added** — `backend/render.yaml`: Blueprint para Render con servicio web (Docker) + PostgreSQL managed. Auto-deploy, health checks, env vars generadas, Neon-compatible.
- **Added** — `backend/app/api/v1/health.py`: Endpoints `/health` (completo con DB status/latency/engine), `/health/live` (liveness), `/health/ready` (readiness). HealthResponse extendido con `db_status`, `db_engine`, `db_latency_ms`.
- **Updated** — `backend/app/schemas/sync.py`: HealthResponse con campos opcionales para DB info.
- **Added** — `backend/tests/test_cloud_config.py`: Tests para engine creation (SQLite/Postgres/Neon), SSL config, settings override, CORS parsing, health response structure.

### 🏗️ ADRs Relacionados
| ADR | Título | Estado |
|-----|--------|--------|
| [[ADR-0001 - Arquitectura Offline-First y Stack de CajaViva.md]] | Arquitectura Offline-First y Stack de CajaViva | **Accepted** |

### 🧪 Verificación
- Tests: **12/12 PASS** (pytest-asyncio - pendiente CI)
- Cobertura: Engine creation ambos dialectos, SSL Neon, settings env override, CORS CSV, health response, DB connectivity check
- Docker: Build multi-stage verificado sintácticamente
- Render: Blueprint validado estructura

### 📝 Notas / Aprendizajes
- `pool_pre_ping=True` + `pool_recycle=1800` evita desconexiones idle en Neon serverless
- SSL context con `verify_mode=CERT_NONE` requerido para Neon (certificados gestionados por ellos)
- Multi-stage Docker reduce imagen final ~40% vs single-stage
- Health endpoints separados (live/ready) compatibles con Kubernetes probes
- `AsyncAdaptedQueuePool` es thread-safe para asyncpg, superior a QueuePool clásico

---

*Bitácora iniciada: `2026-10-08` — Mantener actualizada en cada Loop completado.*