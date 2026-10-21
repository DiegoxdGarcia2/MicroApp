#!/usr/bin/env python3
"""
cloud_deployer_mcp.py — Servidor MCP + CLI de despliegue autonomo para CajaViva.

Lee credenciales SOLO desde `.ai/mcp/.env.secrets` (git-ignored) y expone:

    deploy_render_backend()            -> backend FastAPI en Render (Docker + Neon)
    deploy_vercel_frontend(backend_url) -> PWA en Vercel con VITE_API_URL
    fetch_logs_and_heal()              -> lee logs, corrige, commitea, empuja y reintenta

Uso CLI:
    python .ai/mcp/cloud_deployer_mcp.py status
    python .ai/mcp/cloud_deployer_mcp.py render
    python .ai/mcp/cloud_deployer_mcp.py vercel --backend-url https://xxx.onrender.com
    python .ai/mcp/cloud_deployer_mcp.py heal
    python .ai/mcp/cloud_deployer_mcp.py serve      # MCP stdio (JSON-RPC 2.0)

Uso como modulo:
    from cloud_deployer_mcp import deploy_render_backend, deploy_vercel_frontend
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

# --------------------------------------------------------------------------- #
# Rutas y constantes
# --------------------------------------------------------------------------- #

MCP_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = MCP_DIR.parents[1]            # D:\Proyectos\MicroApps
FRONTEND_DIR = PROJECT_ROOT / "caja-viva"
BACKEND_DIR = FRONTEND_DIR / "backend"
SECRETS_FILE = MCP_DIR / ".env.secrets"
EXAMPLE_FILE = MCP_DIR / ".env.mcp.example"
RENDER_YAML = BACKEND_DIR / "render.yaml"
VERCEL_JSON = FRONTEND_DIR / "vercel.json"

RENDER_API = "https://api.render.com/v1"
VERCEL_API = "https://api.vercel.com"

BACKEND_ROOT_DIR = "caja-viva/backend"
FRONTEND_ROOT_DIR = "caja-viva"
SERVICE_NAME_DEFAULT = "cajaviva-api"
VERCEL_PROJECT_DEFAULT = "cajaviva"

# Rutas que jamas deben viajar al remoto
FORBIDDEN_TRACKED = (".env.secrets", ".env", ".env.local", ".env.production")

VERCEL_JSON_CONTENT = {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "framework": "vite",
    "buildCommand": "npm run build",
    "outputDirectory": "dist",
    "rewrites": [{"source": "/((?!api/).*)", "destination": "/index.html"}],
    "headers": [
        {
            "source": "/assets/(.*)",
            "headers": [
                {"key": "Cache-Control", "value": "public, max-age=31536000, immutable"}
            ],
        },
        {
            "source": "/sw.js",
            "headers": [{"key": "Cache-Control", "value": "no-cache, no-store, must-revalidate"}],
        },
    ],
}


# --------------------------------------------------------------------------- #
# Secretos
# --------------------------------------------------------------------------- #

def load_secrets(path: Path = SECRETS_FILE) -> dict[str, str]:
    """Parser .env minimo. No imprime valores. Falla con mensaje accionable."""
    if not path.exists():
        raise FileNotFoundError(
            f"No existe {path}. Copia .ai/mcp/.env.mcp.example a .ai/mcp/.env.secrets "
            "y rellena las credenciales."
        )

    data: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        data[key.strip()] = value

    # Override explicito por entorno (util en CI)
    for key in list(data) + [
        "NEON_DATABASE_URL",
        "RENDER_API_KEY",
        "VERCEL_TOKEN",
        "GITHUB_REPO_URL",
        "RENDER_SERVICE_NAME",
        "RENDER_OWNER_ID",
        "VERCEL_PROJECT_NAME",
        "VERCEL_TEAM_ID",
    ]:
        if os.environ.get(key):
            data[key] = os.environ[key]

    return data


def require(secrets: dict[str, str], *keys: str) -> None:
    missing = [k for k in keys if not secrets.get(k)]
    if missing:
        raise RuntimeError(f"Faltan variables en .env.secrets: {', '.join(missing)}")


# --------------------------------------------------------------------------- #
# HTTP helpers (stdlib, cero dependencias extra)
# --------------------------------------------------------------------------- #

def _request(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    payload: Any | None = None,
    timeout: int = 120,
) -> Any:
    body = None
    hdrs = {"Accept": "application/json", **(headers or {})}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        hdrs["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1200]
        raise RuntimeError(f"HTTP {exc.code} {method} {url}\n{detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Sin conexion a {url}: {exc.reason}") from exc


def _render_headers(secrets: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {secrets['RENDER_API_KEY']}"}


def _vercel_headers(secrets: dict[str, str], team_id: str | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {secrets['VERCEL_TOKEN']}"}
    if team_id:
        headers["x-vercel-team-id"] = team_id
    return headers


def _git(*args: str, cwd: Path = PROJECT_ROOT, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=str(cwd), capture_output=True, text=True, check=check
    )


# --------------------------------------------------------------------------- #
# RENDER
# --------------------------------------------------------------------------- #

def _render_owner_id(secrets: dict[str, str]) -> str:
    if secrets.get("RENDER_OWNER_ID"):
        return secrets["RENDER_OWNER_ID"]
    owners = _request("GET", f"{RENDER_API}/owners?limit=20", _render_headers(secrets))
    if not owners:
        raise RuntimeError("La cuenta de Render no tiene workspaces visibles.")
    return owners[0]["owner"]["id"]


def _find_render_service(secrets: dict[str, str], name: str, owner_id: str) -> dict | None:
    data = _request(
        "GET",
        f"{RENDER_API}/services?ownerId={owner_id}&limit=100",
        _render_headers(secrets),
    )
    for item in data or []:
        service = item.get("service", item)
        if service.get("name") == name:
            return service
    return None


def _render_service_url(service: dict) -> str | None:
    details = service.get("serviceDetails") or {}
    return details.get("url") or service.get("url")


def _render_set_env(secrets: dict[str, str], service_id: str, env_vars: dict[str, str]) -> None:
    _request(
        "PUT",
        f"{RENDER_API}/services/{service_id}/env-vars",
        _render_headers(secrets),
        [{"key": k, "value": v} for k, v in env_vars.items()],
    )


def _render_latest_deploy(secrets: dict[str, str], service_id: str) -> dict | None:
    data = _request(
        "GET",
        f"{RENDER_API}/services/{service_id}/deploys?limit=1",
        _render_headers(secrets),
    )
    if not data:
        return None
    return data[0].get("deploy", data[0])


def _wait_render_deploy(
    secrets: dict[str, str],
    service_id: str,
    deploy_id: str | None,
    timeout: int = 900,
    interval: int = 15,
) -> dict:
    """Espera a que el deploy salga de 'build_in_progress'/'created'."""
    deadline = time.time() + timeout
    last: dict = {}
    while time.time() < deadline:
        if deploy_id:
            last = _request(
                "GET",
                f"{RENDER_API}/services/{service_id}/deploys/{deploy_id}",
                _render_headers(secrets),
            )
        else:
            last = _render_latest_deploy(secrets, service_id) or {}
        status = (last.get("status") or "").lower()
        if status in {"live", "build_failed", "update_failed", "canceled", "deactivated"}:
            return last
        time.sleep(interval)
    return last or {"status": "timeout"}


def deploy_render_backend(wait: bool = True, timeout: int = 900) -> dict:
    """
    Crea (o actualiza) el web service Docker del backend en Render.

    - repo: GITHUB_REPO_URL
    - rootDir: caja-viva/backend  (Dockerfile en la raiz de ese directorio)
    - DATABASE_URL: NEON_DATABASE_URL
    - ENVIRONMENT: production
    - CORS_ORIGINS: ["*"]
    """
    secrets = load_secrets()
    require(secrets, "RENDER_API_KEY", "NEON_DATABASE_URL", "GITHUB_REPO_URL")

    repo_url = secrets["GITHUB_REPO_URL"].strip().rstrip("/")
    if repo_url.endswith(".git"):
        repo_url = repo_url[:-4]
    if repo_url.startswith("["):  # tolera markdown pegado por accidente
        repo_url = re.sub(r"^\[|\]\(.*\)$", "", repo_url)

    name = secrets.get("RENDER_SERVICE_NAME", SERVICE_NAME_DEFAULT)
    owner_id = _render_owner_id(secrets)

    neon_url = secrets["NEON_DATABASE_URL"]
    env_vars = {
        "DATABASE_URL": neon_url,
        "ENVIRONMENT": "production",
        "DEBUG": "false",
        "CORS_ORIGINS": '["*"]',
        "BACKEND_CORS_ORIGINS": '["*"]',
        "SECRET_KEY": base64.urlsafe_b64encode(os.urandom(48)).decode().rstrip("="),
        "DB_POOL_SIZE": "5",
        "DB_MAX_OVERFLOW": "10",
        "DB_POOL_TIMEOUT": "30",
        "DB_POOL_RECYCLE": "1800",
    }

    service = _find_render_service(secrets, name, owner_id)

    if service:
        service_id = service["id"]
        _render_set_env(secrets, service_id, env_vars)
        deploy = _request(
            "POST",
            f"{RENDER_API}/services/{service_id}/deploys",
            _render_headers(secrets),
            {"clearCache": "do_not_clear"},
        )
        deploy_id = (deploy or {}).get("id")
        action = "updated"
    else:
        payload = {
            "type": "web_service",
            "name": name,
            "ownerId": owner_id,
            "repo": repo_url,
            "branch": "main",
            "autoDeploy": "yes",
            "rootDir": BACKEND_ROOT_DIR,
            "envVars": [{"key": k, "value": v} for k, v in env_vars.items()],
            "serviceDetails": {
                "env": "docker",
                "runtime": "docker",
                "plan": "free",
                "region": secrets.get("RENDER_REGION", "oregon"),
                "healthCheckPath": "/api/v1/health",
                "envSpecificDetails": {
                    "dockerfilePath": "./Dockerfile",
                    "dockerContext": ".",
                    "dockerCommand": "",
                },
            },
        }
        created = _request("POST", f"{RENDER_API}/services", _render_headers(secrets), payload)
        service = created.get("service", created)
        service_id = service["id"]
        deploy_id = created.get("deployId")
        action = "created"

    result: dict[str, Any] = {
        "provider": "render",
        "action": action,
        "service_id": service_id,
        "service_name": name,
        "dashboard": service.get("dashboardUrl"),
        "url": _render_service_url(service),
        "deploy_id": deploy_id,
        "status": "queued",
    }

    if wait:
        final = _wait_render_deploy(secrets, service_id, deploy_id, timeout=timeout)
        result["status"] = final.get("status", "unknown")
        result["deploy_id"] = final.get("id", deploy_id)
        result["url"] = result["url"] or _render_service_url({"serviceDetails": final})
        if result["status"] != "live":
            result["hint"] = "Ejecuta fetch_logs_and_heal() para leer logs y reparar."

    if result.get("url"):
        result["health_url"] = result["url"].rstrip("/") + "/api/v1/health"

    return result


def verify_render_health(backend_url: str, timeout: int = 180) -> dict:
    """Hace polling a /api/v1/health hasta que responda connected a Neon."""
    deadline = time.time() + timeout
    url = backend_url.rstrip("/") + "/api/v1/health"
    last: dict = {}
    while time.time() < deadline:
        try:
            last = _request("GET", url, timeout=30)
            if last.get("db_status") == "connected":
                return last
            if last.get("status") == "healthy":
                return last
        except RuntimeError as exc:
            last = {"error": str(exc)[:400]}
        time.sleep(10)
    return last


# --------------------------------------------------------------------------- #
# VERCEL
# --------------------------------------------------------------------------- #

def ensure_vercel_json() -> Path:
    """Escribe caja-viva/vercel.json con rewrites SPA (idempotente)."""
    FRONTEND_DIR.mkdir(parents=True, exist_ok=True)
    VERCEL_JSON.write_text(
        json.dumps(VERCEL_JSON_CONTENT, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return VERCEL_JSON


def _vercel_project(secrets: dict[str, str], name: str, team_id: str | None) -> dict:
    headers = _vercel_headers(secrets, team_id)
    qs = f"?teamId={team_id}" if team_id else ""
    try:
        return _request("GET", f"{VERCEL_API}/v9/projects/{name}{qs}", headers)
    except RuntimeError as exc:
        if "HTTP 404" not in str(exc):
            raise

    payload = {
        "name": name,
        "framework": "vite",
        "buildCommand": "npm run build",
        "outputDirectory": "dist",
        "installCommand": "npm install",
        "publicSource": False,
    }
    return _request("POST", f"{VERCEL_API}/v9/projects{qs}", headers, payload)


def _vercel_upsert_env(
    secrets: dict[str, str], project_id: str, key: str, value: str, team_id: str | None
) -> None:
    headers = _vercel_headers(secrets, team_id)
    qs = f"?teamId={team_id}" if team_id else ""
    existing = _request("GET", f"{VERCEL_API}/v9/projects/{project_id}/env{qs}", headers)
    envs = existing.get("envs", existing if isinstance(existing, list) else [])
    current = next((e for e in envs if e.get("key") == key), None)

    if current:
        _request(
            "PATCH",
            f"{VERCEL_API}/v9/projects/{project_id}/env/{current['id']}{qs}",
            headers,
            {"value": value},
        )
    else:
        _request(
            "POST",
            f"{VERCEL_API}/v9/projects/{project_id}/env{qs}",
            headers,
            {
                "key": key,
                "value": value,
                "type": "plain",
                "target": ["production", "preview", "development"],
            },
        )


def deploy_vercel_frontend(
    backend_url: str,
    prod: bool = True,
    timeout: int = 900,
) -> dict:
    """
    Despliega la PWA en Vercel con rewrites SPA y VITE_API_URL apuntando al backend.

    Usa la CLI de Vercel via npx (sube el codigo fuente; Vercel compila en la nube,
    por lo que no se requiere node_modules local).
    """
    secrets = load_secrets()
    require(secrets, "VERCEL_TOKEN")
    if not backend_url:
        raise ValueError("backend_url es obligatorio (URL publica del backend en Render)")

    ensure_vercel_json()

    project_name = secrets.get("VERCEL_PROJECT_NAME", VERCEL_PROJECT_DEFAULT)
    team_id = secrets.get("VERCEL_TEAM_ID") or None
    project = _vercel_project(secrets, project_name, team_id)
    project_id = project.get("id", project_name)

    # Vincula el directorio local al proyecto (evita prompts interactivos del CLI)
    org_id = project.get("accountId") or team_id
    if org_id and project_id:
        vercel_dir = FRONTEND_DIR / ".vercel"
        vercel_dir.mkdir(exist_ok=True)
        (vercel_dir / "project.json").write_text(
            json.dumps({"projectId": project_id, "orgId": org_id}, indent=2),
            encoding="utf-8",
        )

    _vercel_upsert_env(secrets, project_id, "VITE_API_URL", backend_url.rstrip("/"), team_id)

    cmd = [
        "npx",
        "--yes",
        "vercel@latest",
        "deploy",
        "--yes",
        "--token",
        secrets["VERCEL_TOKEN"],
    ]
    if prod:
        cmd.append("--prod")
    if team_id:
        cmd += ["--scope", team_id]

    proc = subprocess.run(
        cmd,
        cwd=str(FRONTEND_DIR),
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=(os.name == "nt"),
    )
    output = (proc.stdout or "") + "\n" + (proc.stderr or "")
    if proc.returncode != 0:
        raise RuntimeError(f"Vercel CLI fallo (exit {proc.returncode}):\n{output[-3000:]}")

    urls = re.findall(r"https://[a-zA-Z0-9._-]+\.vercel\.app", output)
    deploy_url = urls[-1] if urls else None

    return {
        "provider": "vercel",
        "project": project_name,
        "project_id": project_id,
        "url": deploy_url,
        "prod": prod,
        "env": {"VITE_API_URL": backend_url.rstrip("/")},
        "log_tail": output.strip().splitlines()[-5:],
    }


# --------------------------------------------------------------------------- #
# LOGS + AUTO-HEALING
# --------------------------------------------------------------------------- #

def fetch_render_logs(service_id: str, limit: int = 100) -> str:
    secrets = load_secrets()
    owner_id = _render_owner_id(secrets)
    url = (
        f"{RENDER_API}/logs?ownerId={owner_id}&resourceId={service_id}"
        f"&limit={limit}&direction=backward"
    )
    try:
        data = _request("GET", url, _render_headers(secrets))
    except RuntimeError as exc:
        return f"[no se pudieron leer logs de Render] {exc}"

    lines: list[str] = []
    for entry in data.get("logs", data if isinstance(data, list) else []):
        msg = entry.get("message") or entry.get("text") or json.dumps(entry)[:300]
        lines.append(str(msg))
    return "\n".join(lines[-limit:]) or "(sin entradas de log)"


def fetch_vercel_logs(deployment_id: str) -> str:
    secrets = load_secrets()
    team_id = secrets.get("VERCEL_TEAM_ID") or None
    qs = f"?teamId={team_id}" if team_id else ""
    data = _request(
        "GET",
        f"{VERCEL_API}/v2/deployments/{deployment_id}/events{qs}",
        _vercel_headers(secrets, team_id),
    )
    events = data if isinstance(data, list) else data.get("events", [])
    return "\n".join(str(e.get("text", e)) for e in events[-150:])


def _diagnose_and_patch(logs: str) -> list[str]:
    """
    Aplica reparaciones deterministas a fallos conocidos.
    Devuelve la lista de archivos modificados.
    """
    patched: list[str] = []
    low = logs.lower()

    # 1. asyncpg no acepta `sslmode` como kwarg -> se limpia del DSN y se usa SSLContext
    if "sslmode" in low and ("unexpected keyword" in low or "connect() got" in low):
        db_file = BACKEND_DIR / "app" / "core" / "database.py"
        text = db_file.read_text(encoding="utf-8")
        if "def _strip_unsupported_pg_params" not in text:
            text = text.replace(
                "def create_engine_with_config(database_url: str, debug: bool):",
                _SANITIZER + "\n\ndef create_engine_with_config(database_url: str, debug: bool):",
            )
            text = text.replace(
                "    is_sqlite = database_url.startswith(\"sqlite\")",
                "    database_url = _strip_unsupported_pg_params(database_url)\n"
                "    is_sqlite = database_url.startswith(\"sqlite\")",
            )
            db_file.write_text(text, encoding="utf-8")
            patched.append(str(db_file))

    # 2. Render exige escuchar en $PORT
    docker_file = BACKEND_DIR / "Dockerfile"
    if docker_file.exists() and ("$PORT" not in docker_file.read_text(encoding="utf-8")):
        content = docker_file.read_text(encoding="utf-8")
        content = re.sub(
            r'CMD \["uvicorn", "app\.main:app", "--host", "0\.0\.0\.0", "--port", "8000"\]',
            'CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]',
            content,
        )
        if "$PORT" in content:
            docker_file.write_text(content, encoding="utf-8")
            patched.append(str(docker_file))

    # 3. Falta vercel.json con rewrites SPA
    if ("404" in low and "vercel" in low) or not VERCEL_JSON.exists():
        if not VERCEL_JSON.exists():
            patched.append(str(ensure_vercel_json()))

    return patched


_SANITIZER = '''
def _strip_unsupported_pg_params(database_url: str) -> str:
    """asyncpg no entiende sslmode/channel_binding en el DSN; el SSL se pasa aparte."""
    if not database_url.startswith("postgresql"):
        return database_url
    from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
    parts = urlsplit(database_url)
    blocked = {"sslmode", "channel_binding", "ssl"}
    query = [(k, v) for k, v in parse_qsl(parts.query) if k not in blocked]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
'''


def _assert_no_secrets_staged() -> None:
    status = _git("status", "--porcelain").stdout
    leaked = [
        line for line in status.splitlines()
        if any(token in line for token in FORBIDDEN_TRACKED)
        and not line.strip().endswith(".env.example")
        and not line.strip().endswith(".env.mcp.example")
    ]
    if leaked:
        raise RuntimeError(
            "ABORTADO: hay archivos de secretos en staging:\n" + "\n".join(leaked)
        )


def commit_and_push(message: str, branch: str = "main") -> dict:
    """Commit + push verificando que ningun secreto quede staged."""
    _git("add", "-A")
    _assert_no_secrets_staged()
    diff = _git("status", "--porcelain").stdout.strip()
    if not diff:
        return {"committed": False, "reason": "sin cambios"}

    _git("commit", "-m", message)
    push = _git("push", "-u", "origin", branch, check=False)
    return {
        "committed": True,
        "pushed": push.returncode == 0,
        "push_output": (push.stdout + push.stderr).strip()[-800:],
        "files": len(diff.splitlines()),
    }


def fetch_logs_and_heal(max_attempts: int = 3) -> dict:
    """
    Ciclo de auto-reparacion:
      1. Lee el ultimo deploy de Render y sus logs.
      2. Aplica parches deterministas a errores conocidos.
      3. commit + push (nunca incluye secretos) y reintenta.
    """
    secrets = load_secrets()
    require(secrets, "RENDER_API_KEY")
    name = secrets.get("RENDER_SERVICE_NAME", SERVICE_NAME_DEFAULT)
    owner_id = _render_owner_id(secrets)
    service = _find_render_service(secrets, name, owner_id)
    if not service:
        raise RuntimeError("No existe el servicio en Render. Ejecuta deploy_render_backend().")

    service_id = service["id"]
    history: list[dict] = []

    for attempt in range(1, max_attempts + 1):
        deploy = _render_latest_deploy(secrets, service_id) or {}
        status = (deploy.get("status") or "unknown").lower()
        logs = fetch_render_logs(service_id)

        entry: dict[str, Any] = {
            "attempt": attempt,
            "deploy_id": deploy.get("id"),
            "status": status,
            "log_tail": "\n".join(logs.splitlines()[-8:]),
        }
        history.append(entry)

        if status == "live":
            entry["healthy"] = True
            return {"healthy": True, "service_id": service_id, "attempts": history}

        patched = _diagnose_and_patch(logs)
        entry["patched_files"] = patched

        if not patched:
            entry["note"] = "Sin parche automatico aplicable; requiere revision humana."
            return {"healthy": False, "service_id": service_id, "attempts": history}

        commit_and_push(
            f"fix(deploy): auto-healing intento {attempt} — {Path(patched[0]).name}"
        )
        time.sleep(10)
        _request(
            "POST",
            f"{RENDER_API}/services/{service_id}/deploys",
            _render_headers(secrets),
            {"clearCache": "clear"},
        )
        _wait_render_deploy(secrets, service_id, None, timeout=900)

    return {"healthy": False, "service_id": service_id, "attempts": history}


# --------------------------------------------------------------------------- #
# Estado global
# --------------------------------------------------------------------------- #

def get_status() -> dict:
    secrets = load_secrets()
    status: dict[str, Any] = {"secrets_file": str(SECRETS_FILE)}

    if secrets.get("RENDER_API_KEY"):
        try:
            owner_id = _render_owner_id(secrets)
            service = _find_render_service(
                secrets, secrets.get("RENDER_SERVICE_NAME", SERVICE_NAME_DEFAULT), owner_id
            )
            status["render"] = {
                "service": service.get("name") if service else None,
                "url": _render_service_url(service) if service else None,
                "last_deploy": (_render_latest_deploy(secrets, service["id"]) or {}).get("status")
                if service else None,
            }
        except Exception as exc:  # noqa: BLE001
            status["render"] = {"error": str(exc)[:300]}

    if secrets.get("VERCEL_TOKEN"):
        try:
            team_id = secrets.get("VERCEL_TEAM_ID") or None
            project = _vercel_project(
                secrets, secrets.get("VERCEL_PROJECT_NAME", VERCEL_PROJECT_DEFAULT), team_id
            )
            status["vercel"] = {"project": project.get("name"), "id": project.get("id")}
        except Exception as exc:  # noqa: BLE001
            status["vercel"] = {"error": str(exc)[:300]}

    return status


# --------------------------------------------------------------------------- #
# MCP stdio (JSON-RPC 2.0, sin dependencias)
# --------------------------------------------------------------------------- #

TOOLS = [
    {
        "name": "deploy_render_backend",
        "description": "Crea/actualiza el backend FastAPI en Render (Docker + Neon) y espera el deploy.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "wait": {"type": "boolean", "default": True},
                "timeout": {"type": "integer", "default": 900},
            },
        },
    },
    {
        "name": "deploy_vercel_frontend",
        "description": "Configura vercel.json (rewrites SPA) y despliega la PWA inyectando VITE_API_URL.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "backend_url": {"type": "string"},
                "prod": {"type": "boolean", "default": True},
            },
            "required": ["backend_url"],
        },
    },
    {
        "name": "fetch_logs_and_heal",
        "description": "Lee logs del deploy, aplica parches, commitea/pushea sin secretos y reintenta.",
        "inputSchema": {
            "type": "object",
            "properties": {"max_attempts": {"type": "integer", "default": 3}},
        },
    },
    {
        "name": "get_status",
        "description": "Estado actual de Render y Vercel.",
        "inputSchema": {"type": "object", "properties": {}},
    },
]


def _dispatch_tool(name: str, args: dict) -> Any:
    if name == "deploy_render_backend":
        return deploy_render_backend(
            wait=bool(args.get("wait", True)), timeout=int(args.get("timeout", 900))
        )
    if name == "deploy_vercel_frontend":
        return deploy_vercel_frontend(
            args["backend_url"], prod=bool(args.get("prod", True))
        )
    if name == "fetch_logs_and_heal":
        return fetch_logs_and_heal(max_attempts=int(args.get("max_attempts", 3)))
    if name == "get_status":
        return get_status()
    raise ValueError(f"Tool desconocida: {name}")


def serve_stdio() -> None:
    """Servidor MCP minimalista sobre stdin/stdout (Content-Length framing)."""
    def send(payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        sys.stdout.buffer.write(f"Content-Length: {len(body)}\r\n\r\n".encode())
        sys.stdout.buffer.write(body)
        sys.stdout.buffer.flush()

    stdin = sys.stdin.buffer
    while True:
        header = b""
        while b"\r\n\r\n" not in header:
            chunk = stdin.read(1)
            if not chunk:
                return
            header += chunk
        length = 0
        for line in header.decode().split("\r\n"):
            if line.lower().startswith("content-length:"):
                length = int(line.split(":", 1)[1].strip())
        body = json.loads(stdin.read(length).decode("utf-8"))
        method = body.get("method")
        msg_id = body.get("id")

        try:
            if method == "initialize":
                result: Any = {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "cajaviva-cloud-deployer", "version": "1.0.0"},
                }
            elif method == "tools/list":
                result = {"tools": TOOLS}
            elif method == "tools/call":
                params = body.get("params", {})
                output = _dispatch_tool(params.get("name"), params.get("arguments", {}))
                result = {
                    "content": [{"type": "text", "text": json.dumps(output, indent=2)}],
                    "isError": False,
                }
            elif method in {"notifications/initialized", "ping"}:
                if msg_id is None:
                    continue
                result = {}
            else:
                raise ValueError(f"Metodo no soportado: {method}")

            send({"jsonrpc": "2.0", "id": msg_id, "result": result})
        except Exception as exc:  # noqa: BLE001
            send({"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32000, "message": str(exc)}})


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def main() -> int:
    parser = argparse.ArgumentParser(description="CajaViva Cloud Deployer (Render + Vercel + Neon)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status")
    p_render = sub.add_parser("render")
    p_render.add_argument("--no-wait", action="store_true")
    p_vercel = sub.add_parser("vercel")
    p_vercel.add_argument("--backend-url", required=True)
    p_heal = sub.add_parser("heal")
    p_heal.add_argument("--attempts", type=int, default=3)
    sub.add_parser("serve")

    args = parser.parse_args()
    try:
        if args.cmd == "status":
            out = get_status()
        elif args.cmd == "render":
            out = deploy_render_backend(wait=not args.no_wait)
        elif args.cmd == "vercel":
            out = deploy_vercel_frontend(args.backend_url)
        elif args.cmd == "heal":
            out = fetch_logs_and_heal(max_attempts=args.attempts)
        else:
            serve_stdio()
            return 0
        print(json.dumps(out, indent=2, ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}, indent=2, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
