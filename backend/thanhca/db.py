"""Database connection and migrations."""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
# Any fixed number: serialises migrations when several servers start at once (PostgreSQL).
_MIGRATION_LOCK_ID = 7_281_640_219


def create_db_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        if url.startswith("sqlite:///") and ":memory:" not in url:
            Path(url[len("sqlite:///") :]).parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 15})

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_connection: Any, _record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys = ON")
            # WAL: readers do not wait for a writer (members browsing while an admin uploads).
            cursor.execute("PRAGMA journal_mode = WAL")
            cursor.execute("PRAGMA synchronous = NORMAL")
            cursor.execute("PRAGMA busy_timeout = 15000")
            cursor.close()

        return engine
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5, pool_recycle=1800)


class Database:
    def __init__(self, url: str):
        self.url = url
        self.engine = create_db_engine(url)
        self._sessions = sessionmaker(self.engine, expire_on_commit=False)

    @contextmanager
    def session(self) -> Iterator[Session]:
        with self._sessions() as session:
            yield session

    def dispose(self) -> None:
        self.engine.dispose()


def alembic_config(url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


def run_migrations(engine: Engine) -> None:
    """Brings the database schema up to date (creates the tables on first run)."""
    with engine.connect() as connection:
        if engine.dialect.name == "postgresql":
            connection.execute(text("select pg_advisory_lock(:id)"), {"id": _MIGRATION_LOCK_ID})
            connection.commit()
        try:
            config = alembic_config(engine.url.render_as_string(hide_password=False))
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
            connection.commit()
        finally:
            if engine.dialect.name == "postgresql":
                connection.execute(text("select pg_advisory_unlock(:id)"), {"id": _MIGRATION_LOCK_ID})
                connection.commit()
