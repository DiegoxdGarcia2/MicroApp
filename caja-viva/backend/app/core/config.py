from pydantic_settings import BaseSettings, NoDecode
from typing import Annotated, Optional, List
from functools import lru_cache
from pydantic import Field, field_validator


class Settings(BaseSettings):
    # App
    APP_NAME: str = "CajaViva Sync API"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"  # development, production, staging

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./cajaviva.db"

    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS - configurable via env (comma-separated or JSON array)
    # NoDecode evita que pydantic-settings intente json.loads antes del validador.
    BACKEND_CORS_ORIGINS: Annotated[List[str], NoDecode] = Field(
        default=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000"]
    )

    # Sync
    MAX_BATCH_SIZE: int = 100
    SYNC_TIMEOUT_SECONDS: int = 30

    # Database pool settings (for PostgreSQL)
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            valor = v.strip()
            if not valor:
                return []
            if valor.startswith("["):
                import json
                return json.loads(valor)
            return [origin.strip() for origin in valor.split(",") if origin.strip()]
        return v

    @field_validator("ENVIRONMENT")
    @classmethod
    def validate_environment(cls, v):
        allowed = ["development", "production", "staging", "test"]
        if v not in allowed:
            raise ValueError(f"ENVIRONMENT must be one of {allowed}")
        return v

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()