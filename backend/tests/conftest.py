"""Test set-up.

Tests run against a temporary SQLite database. To run them against PostgreSQL
as well, point TEST_DATABASE_URL at an empty database:

    TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/thanhca_test uv run pytest

Everything in that database is deleted.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from thanhca import security
from thanhca.app import create_app
from thanhca.config import Settings
from thanhca.db import run_migrations
from thanhca.models import Attachment, AuditLog, Category, Song, User, UserSession
from thanhca.sample_data import load_sample_songs

from helpers import new_client, signed_in

# Fast password hashing: the real settings take ~50 ms per hash on purpose.
security.hasher = PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1)


@pytest.fixture(scope="session")
def settings(tmp_path_factory: pytest.TempPathFactory) -> Settings:
    data = tmp_path_factory.mktemp("data")
    return Settings(
        _env_file=None,
        data_dir=data,
        database_url=os.environ.get("TEST_DATABASE_URL", ""),
        auto_migrate=False,
        frontend_dist=data / "no-web-app",
        storage_backend="local",
        files_dir=data / "files",
    )


@pytest.fixture(scope="session")
def app(settings: Settings):
    application = create_app(settings)
    engine = application.state.db.engine
    if engine.dialect.name == "postgresql":
        with engine.begin() as connection:
            connection.exec_driver_sql("drop schema public cascade; create schema public")
    run_migrations(engine)
    with application.state.db.session() as session:
        application.state.default_categories = [
            {"name": c.name, "code": c.code, "binder_count": c.binder_count, "sort_order": c.sort_order}
            for c in session.scalars(select(Category).order_by(Category.sort_order))
        ]
    yield application
    application.state.db.dispose()


@pytest.fixture(autouse=True)
def clean(app) -> Iterator[None]:
    """Every test starts with the 14 default categories and nothing else."""
    with app.state.db.session() as session:
        for table in (AuditLog, Attachment, Song, UserSession, User, Category):
            session.execute(delete(table))
        session.add_all(Category(**values) for values in app.state.default_categories)
        session.commit()
    for path in Path(app.state.settings.uploads_dir).rglob("*"):
        if path.is_file():
            path.unlink()
    app.state.login_limiter._failures.clear()
    yield


@pytest.fixture
def db(app) -> Iterator[Session]:
    with app.state.db.session() as session:
        yield session


@pytest.fixture
def admin(app) -> TestClient:
    return signed_in(app, "admin@choir.test", role="admin", name="Anna Admin")


@pytest.fixture
def member(app) -> TestClient:
    return signed_in(app, "member@choir.test", name="Minh Member")


@pytest.fixture
def anonymous(app) -> TestClient:
    return new_client(app)


@pytest.fixture
def sample_songs(app) -> int:
    with app.state.db.session() as session:
        return load_sample_songs(session)
