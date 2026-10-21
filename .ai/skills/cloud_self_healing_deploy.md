---
id: cloud_self_healing_deploy
name: Cloud Self-Healing Deploy (Render + Vercel + Neon)
version: 1.0.0
tags: [devops, deploy, render, vercel, neon, mcp, secrets, self-healing]
trigger_keywords:
  - deploy
  - despliegue
  - render
  - vercel
  - neon
  - produccion
  - produccion
  - auto-healing
  - self-healing
  - logs de build
  - api key
  - .env.secrets
---

# Cloud Self-Healing Deploy

Skill operativa para publicar CajaViva (FastAPI + PWA) en Render + Vercel con
PostgreSQL serverless en Neon, sin filtrar credenciales y con reparacion
automatica de builds fallidos.

## Regla de oro

> Las credenciales viven SOLO en `.ai/mcp/.env.secrets`.
> Ese archivo esta git-ignored, nunca se imprime, nunca se commitea, nunca se
> copia a `backend/.env` en el repo.

## Artefactos

| Ruta | Proposito |
|------|-----------|
| `.ai/mcp/.env.secrets` | Boveda local (git-ignored) con Neon/Render/Vercel/GitHub |
| `.ai/mcp/.env.mcp.example` | Plantilla versionable, sin valores reales |
| `.ai/mcp/cloud_deployer_mcp.py` | MCP + CLI con las 3 funciones de despliegue |
| `caja-viva/vercel.json` | Rewrites SPA (evita 404 al refrescar rutas) |
| `caja-viva/backend/Dockerfile` | Build multi-stage, escucha `${PORT}` |
| `caja-viva/backend/render.yaml` | Blueprint alternativo (Infra as Code) |

## Protocolo de ejecucion (orden estricto)

1. **Blindaje**
   ```powershell
   git check-ignore -v .ai/mcp/.env.secrets   # debe devolver una regla
   ```
   Si no devuelve regla: NO crear credenciales. Corregir `.gitignore` primero.

2. **Backend en Render**
   ```powershell
   python .ai/mcp/cloud_deployer_mcp.py render
   ```
   - rootDir = `caja-viva/backend`, runtime Docker, plan free, healthcheck `/api/v1/health`.
   - Inyecta `DATABASE_URL` (Neon), `ENVIRONMENT=production`, `CORS_ORIGINS='["*"]'`.

3. **Verificacion Neon**
   ```powershell
   curl https://<servicio>.onrender.com/api/v1/health
   ```
   Esperado: `{ "status": "healthy", "db_status": "connected", "db_engine": "postgresql" }`.
   Si `db_status=disconnected`: revisar DSN, SSL y pool (ver "Fallos conocidos").

4. **Frontend en Vercel**
   ```powershell
   python .ai/mcp/cloud_deployer_mcp.py vercel --backend-url https://<servicio>.onrender.com
   ```
   - Escribe `vercel.json` con rewrite `/(.*) -> /index.html`.
   - Define `VITE_API_URL` antes del build (Vite la incrusta en tiempo de build).

5. **Auto-healing**
   ```powershell
   python .ai/mcp/cloud_deployer_mcp.py heal
   ```
   Lee logs, aplica parches deterministas, `git add -A`, verifica que ningun
   `.env*` este staged, commit, push y reintenta (max 3).

6. **Registro**
   Actualizar `docs/06 - Bitacora y Memoria de Cambios/Historial.md` y
   `docs/00 - Indice Principal (MOC)/Indice.md` con URLs publicas y estado.

## Fallos conocidos y parche

| Sintoma en logs | Causa | Parche |
|-----------------|-------|--------|
| `unexpected keyword argument 'sslmode'` | asyncpg no acepta `sslmode` en el DSN | `_strip_unsupported_pg_params()` + `SSLContext` explicito |
| `No open ports detected` / healthcheck timeout | Uvicorn no escucha `$PORT` | `CMD ["sh","-c","uvicorn ... --port ${PORT:-8000}"]` |
| 404 al refrescar `/venta` en Vercel | Falta rewrite SPA | `vercel.json` |
| `db_status: disconnected` | DSN con `channel_binding`, IP allowlist o pool agotado | limpiar query params, `pool_pre_ping=True`, `pool_recycle=1800` |
| Build falla por TypeScript | Error real de tipos | corregir local, `npx tsc -b`, push |
| `VITE_API_URL` vacio en el bundle | env definida despues del build | redeploy tras `_vercel_upsert_env` |

## Checklist de seguridad antes de cada push

```powershell
git status --porcelain          # no debe aparecer .env / .env.secrets
git check-ignore -v .ai/mcp/.env.secrets
git diff --cached --name-only   # revision visual final
```

`commit_and_push()` aborta automaticamente si detecta un secreto en staging.

## Notas

- Render free duerme tras ~15 min de inactividad: el primer request tarda ~50 s.
- Neon free autosuspende el compute: `pool_pre_ping` + reintento resuelven el cold start.
- La PWA funciona offline sin backend; el indicador de sync es informativo.
