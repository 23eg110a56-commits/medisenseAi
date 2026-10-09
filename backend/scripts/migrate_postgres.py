"""PostgreSQL database migration runner for MediSense AI.

Executes Alembic migrations or generates schema directly on a configured PostgreSQL instance.
Usage:
    python scripts/migrate_postgres.py [--check] [--url postgresql://user:pass@host:5432/dbname]
"""

import argparse
import logging
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from alembic.config import Config
from alembic import command
from app.config import settings
from app.database.models_sql import Base

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("postgres_migrations")


def get_target_url(override_url: str = None) -> str:
    if override_url:
        return override_url
    url = (
        os.getenv("DATABASE_URL")
        or getattr(settings, "DATABASE_URL", "")
        or getattr(settings, "POSTGRES_URL", "")
        or os.getenv("POSTGRES_URL")
    )
    if url:
        if url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
        return url
    return "postgresql://postgres:postgres@localhost:5432/medisense_ai"


def run_migrations(target_url: str) -> bool:
    logger.info("Target PostgreSQL connection: %s", target_url.split("@")[-1] if "@" in target_url else target_url)
    ini_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    
    alembic_cfg = Config(ini_path)
    alembic_cfg.set_main_option("sqlalchemy.url", target_url)
    
    try:
        logger.info("Running database migrations (alembic upgrade head)...")
        command.upgrade(alembic_cfg, "head")
        logger.info("Migrations executed successfully!")
        return True
    except Exception as exc:
        logger.error("Migration failed: %s", exc)
        return False


def verify_models():
    """Verify SQLAlchemy metadata models are valid and loadable."""
    tables = list(Base.metadata.tables.keys())
    logger.info("Verified %d tables in models_sql: %s", len(tables), ", ".join(tables))
    assert len(tables) >= 6, "Expected at least 6 tables defined"
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MediSense AI PostgreSQL Migration Tool")
    parser.add_argument("--url", help="Database connection URL", default=None)
    parser.add_argument("--check-only", action="store_true", help="Verify metadata tables without executing DB calls")
    args = parser.parse_args()

    if args.check_only:
        verify_models()
        sys.exit(0)

    verify_models()
    url = get_target_url(args.url)
    success = run_migrations(url)
    sys.exit(0 if success else 1)
