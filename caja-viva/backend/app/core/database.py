from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool, AsyncAdaptedQueuePool
from sqlalchemy import text
from app.core.config import get_settings

settings = get_settings()


def _strip_unsupported_pg_params(database_url: str) -> str:
    """
    asyncpg no entiende `sslmode`, `channel_binding` ni `ssl` como parámetros
    del DSN (los recibe como kwargs inválidos de connect()). El SSL se aplica
    mediante un SSLContext explícito; aquí limpiamos el query string.
    """
    if not database_url.startswith("postgresql") or "?" not in database_url:
        return database_url

    from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

    parts = urlsplit(database_url)
    blocked = {"sslmode", "channel_binding", "ssl", "options"}
    query = [(k, v) for k, v in parse_qsl(parts.query) if k not in blocked]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def create_engine_with_config(database_url: str, debug: bool):
    """
    Crea el engine async configurado según el tipo de base de datos.
    
    - SQLite: NullPool para desarrollo
    - PostgreSQL/Neon: AsyncAdaptedQueuePool con SSL y reconexión automática
    """
    raw_url = database_url
    is_neon = database_url.startswith("postgresql") and (
        "sslmode=require" in database_url or "neon.tech" in database_url
    )
    is_pooler = "-pooler" in database_url

    # asyncpg rechaza parámetros web-style en el DSN
    database_url = _strip_unsupported_pg_params(database_url)

    is_sqlite = database_url.startswith("sqlite")
    is_postgres = database_url.startswith("postgresql")

    if is_sqlite:
        # SQLite: pool nulo para desarrollo
        return create_async_engine(
            database_url,
            echo=debug,
            poolclass=NullPool,
            connect_args={"check_same_thread": False},
        )

    if is_postgres:
        # PostgreSQL: pool optimizado para serverless (Neon, Railway, Render, etc.)
        connect_args = {
            "server_settings": {
                "application_name": "cajaviva",
                "timezone": "UTC",
            },
            "command_timeout": 60,
        }

        # Configuración SSL para Neon
        if is_neon:
            import ssl
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            connect_args["ssl"] = ssl_context

        # PgBouncer (endpoint *-pooler de Neon) no soporta prepared statements
        # con nombre; desactivamos el cache de statements de asyncpg.
        if is_pooler:
            connect_args["statement_cache_size"] = 0

        return create_async_engine(
            database_url,
            echo=debug,
            poolclass=AsyncAdaptedQueuePool,
            pool_size=settings.DB_POOL_SIZE if settings else 5,
            max_overflow=settings.DB_MAX_OVERFLOW if settings else 10,
            pool_timeout=settings.DB_POOL_TIMEOUT if settings else 30,
            pool_recycle=settings.DB_POOL_RECYCLE if settings else 1800,
            pool_pre_ping=True,    # Verificar conexión antes de usar (reconexión automática)
            connect_args=connect_args,
        )

    # Fallback genérico
    return create_async_engine(
        database_url,
        echo=debug,
        poolclass=NullPool,
    )


# Engine async global
engine = create_engine_with_config(settings.DATABASE_URL, settings.DEBUG)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Inicializa la base de datos creando todas las tablas."""
    from app.models import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def check_db_connection() -> bool:
    """
    Verifica la conectividad con la base de datos.
    Returns True si la conexión es exitosa, False en caso contrario.
    """
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


async def get_db_engine_type() -> str:
    """Retorna el tipo de motor de base de datos: 'postgresql' o 'sqlite'."""
    if settings.DATABASE_URL.startswith("postgresql"):
        return "postgresql"
    elif settings.DATABASE_URL.startswith("sqlite"):
        return "sqlite"
    return "unknown"


async def close_db():
    await engine.dispose()