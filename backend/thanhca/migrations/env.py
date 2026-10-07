"""Alembic environment. Run migrations with `uv run thanhca migrate` (or automatically at start-up)."""

from logging.config import fileConfig

from alembic import context

from thanhca.config import Settings
from thanhca.db import create_db_engine
from thanhca.models import Base

config = context.config
target_metadata = Base.metadata

if config.config_file_name is not None:
    fileConfig(config.config_file_name)
if not config.get_main_option("sqlalchemy.url"):
    # Command line (alembic.ini): use the app's settings.
    config.set_main_option("sqlalchemy.url", Settings().sqlalchemy_url.replace("%", "%%"))


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return
    engine = create_db_engine(config.get_main_option("sqlalchemy.url"))
    with engine.connect() as connection:
        _run(connection)
        connection.commit()


def _run(connection) -> None:
    # render_as_batch: SQLite cannot alter tables in place; Alembic rebuilds them instead.
    context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
