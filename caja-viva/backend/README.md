# Backend API - CajaViva Sync API

FastAPI-based synchronization engine for CajaViva offline-first POS system.

## Features

- **Offline-First Sync**: Idempotent sync engine for offline-first POS
- **FastAPI**: Modern, fast web framework
- **SQLAlchemy 2.0**: Async ORM with PostgreSQL/SQLite
- **Pydantic v2**: Data validation and serialization
- **Idempotent Sync**: Client-generated UUIDs prevent duplicate processing

## Quick Start

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your DATABASE_URL
uvicorn app.main:app --reload
```

## API Endpoints

- `POST /api/v1/sync/push` - Push offline transactions
- `GET /api/v1/sync/pull` - Pull server updates
- `POST /api/v1/ventas/` - Create venta (online)
- `GET /api/v1/health` - Health check

## Database

Supports PostgreSQL (production) and SQLite (development/testing).

```bash
# Run migrations
alembic upgrade head
```

## Testing

```bash
pytest backend/tests/
```

## Project Structure

```
backend/
├── app/
│   ├── api/v1/
│   │   └── sync.py          # Sync endpoints
│   ├── core/
│   │   ├── config.py        # Settings
│   │   └── database.py      # DB connection
│   ├── models/
│   │   ├── __init__.py      # Exports
│   │   ├── base.py          # Base classes
│   │   └── models.py        # SQLAlchemy models
│   ├── schemas/
│   │   └── sync.py          # Pydantic schemas
│   ├── services/
│   │   └── sync_service.py  # Sync logic
│   └── main.py              # FastAPI app
├── tests/
│   ├── conftest.py
│   └── test_sync_engine.py
├── requirements.txt
├── .env.example
└── README.md
```

## Sync Protocol

### Push (Client → Server)
```
POST /api/v1/sync/push
Headers: Idempotency-Key: <uuid>
Body: {
  "transacciones": [{
    "tipo": "VENTA",
    "accion": "CREATE",
    "entidad_id": "uuid",
    "client_tx_id": "uuid-v4",
    "payload": {...},
    "timestamp_local": "2026-10-11T10:30:00.000Z"
  }]
```

Response:
```json
{
  "sincronizados": 1,
  "duplicados": 0,
  "conflictos": [],
  "servidor_timestamp": "2026-10-11T10:30:00Z"
}
```

### Pull (Server → Client)

```
GET /api/v1/sync/pull?ultima_sincronizacion=2026-10-10T10:00:00Z
```

## Idempotency

- Client generates UUID v4 per transaction (`client_tx_id`)
- Server tracks processed `client_tx_id` in `sync_queue`
- Duplicate requests with same `client_tx_id` are ignored (idempotent)

## Conflict Resolution

- **LWW (Last Writer Wins)**: Default for most entities
- **MERGE**: For stock deltas (sum quantities)
- **MANUAL**: Conflicts requiring manual resolution

## Testing

```bash
cd backend
pytest -v
```

## Deployment

```bash
docker build -t cajaviva-backend .
docker run -p 8000:8000 -e DATABASE_URL=postgresql://... cajaviva-backend
```

## License

MIT