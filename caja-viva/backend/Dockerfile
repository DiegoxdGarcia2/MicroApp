# ============================================
# CajaViva Sync API - Multi-stage Dockerfile
# Optimizado para FastAPI + Uvicorn en Python 3.11-slim
# ============================================

# ---- Build Stage ----
FROM python:3.11-slim AS builder

# Instalar dependencias del sistema para compilar
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Crear usuario no-root
RUN useradd --create-home --shell /bin/bash app

# Directorio de trabajo
WORKDIR /app

# Copiar solo archivos de dependencias primero (cache layer)
COPY requirements.txt .

# Instalar dependencias Python en directorio virtual
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt


# ---- Runtime Stage ----
FROM python:3.11-slim AS runtime

# Instalar solo runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Crear usuario no-root
RUN useradd --create-home --shell /bin/bash app

# Copiar virtualenv desde builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Directorio de trabajo
WORKDIR /app

# Copiar código de la aplicación
COPY --chown=app:app ./app ./app

# Cambiar a usuario no-root
USER app

# Exponer puerto
EXPOSE 8000

# Variables de entorno por defecto
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

# Healthcheck (Render inyecta $PORT; por defecto 8000 en local)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import os,urllib.request; p=os.getenv('PORT','8000'); urllib.request.urlopen(f'http://127.0.0.1:{p}/api/v1/health', timeout=5)" || exit 1

# Comando de inicio (Render/Railway/Fly inyectan $PORT)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]