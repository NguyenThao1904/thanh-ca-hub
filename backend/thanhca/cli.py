"""Command line tasks: `thanhca migrate | create-admin | seed | cleanup | backup`.

Run them from the backend folder with `uv run thanhca ...` (they use the same
settings as the server: environment variables or backend/.env).
"""

from __future__ import annotations

import argparse
import getpass
import sqlite3
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

from .config import Settings
from .db import Database, run_migrations
from .security import PASSWORD_MAX, PASSWORD_MIN
from .storage import create_storage


def _database(settings: Settings) -> Database:
    return Database(settings.sqlalchemy_url)


def migrate(settings: Settings, _args: argparse.Namespace) -> int:
    database = _database(settings)
    run_migrations(database.engine)
    print(f"Database is up to date ({database.engine.url.get_backend_name()}).")
    return 0


def create_admin(settings: Settings, args: argparse.Namespace) -> int:
    from pydantic_core import PydanticCustomError

    from .schemas import clean_email
    from .services.users import ensure_admin
    from .text import clean_line

    try:
        email = clean_email(args.email)
    except PydanticCustomError:
        print(f"Not a valid email address: {args.email!r}. Example: --email anna@example.org", file=sys.stderr)
        return 1
    name = clean_line(args.name or "")[:100] or None

    password = args.password
    # Ask only in an interactive terminal (on Windows, input from NUL also claims to be one).
    if password is None and sys.stdin.isatty() and sys.stdout.isatty():
        password = getpass.getpass("Password (leave empty to keep an existing account's password): ") or None
    if password is not None and not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
        print(f"The password must be {PASSWORD_MIN} to {PASSWORD_MAX} characters long.", file=sys.stderr)
        return 1

    database = _database(settings)
    run_migrations(database.engine)
    with database.session() as session:
        try:
            user, created = ensure_admin(session, email, password, name)
        except ValueError as error:
            print(error, file=sys.stderr)
            return 1
        action = "Created" if created else "Updated"
        print(f"{action} admin account {user.email} ({user.display_name}). You can now sign in.")
    return 0


def seed(settings: Settings, _args: argparse.Namespace) -> int:
    from .sample_data import load_sample_songs

    database = _database(settings)
    run_migrations(database.engine)
    with database.session() as session:
        added = load_sample_songs(session)
    print(f"Added {added} sample songs.")
    return 0


def cleanup(settings: Settings, _args: argparse.Namespace) -> int:
    from .services.songs import purge_stale_uploads
    from .services.users import purge_expired_sessions

    database = _database(settings)
    with database.session() as session:
        sessions = purge_expired_sessions(session)
        uploads = purge_stale_uploads(session, create_storage(settings))
    print(f"Removed {sessions} expired sessions and {uploads} unused uploads.")
    return 0


def backup(settings: Settings, args: argparse.Namespace) -> int:
    """A zip with a consistent copy of the SQLite database and every uploaded file.

    Safe while the server is running. To restore: stop the server, and unzip the
    file into the data folder (thanhca.db and files/).
    """
    if not settings.is_sqlite:
        print(
            "The database is PostgreSQL: back it up with your provider's backups or `pg_dump`.\n"
            "Uploaded files: copy the files folder or the bucket.",
            file=sys.stderr,
        )
        return 1
    database = Path(settings.sqlalchemy_url.removeprefix("sqlite:///"))
    if not database.is_file():
        print(f"No database at {database}.", file=sys.stderr)
        return 1
    target = Path(args.output or f"thanhca-backup-{datetime.now():%Y-%m-%d-%H%M}.zip").resolve()

    files = 0
    with tempfile.TemporaryDirectory() as folder:
        snapshot = Path(folder) / "thanhca.db"
        source, copy = sqlite3.connect(database), sqlite3.connect(snapshot)
        try:
            # SQLite's online backup: a consistent copy even while people use the app.
            source.backup(copy)
        finally:
            source.close()
            copy.close()
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.write(snapshot, "thanhca.db")
            if settings.storage_backend == "local" and settings.uploads_dir.is_dir():
                for path in sorted(settings.uploads_dir.rglob("*")):
                    if path.is_file() and not path.name.startswith(".upload-"):
                        archive.write(path, (Path("files") / path.relative_to(settings.uploads_dir)).as_posix())
                        files += 1
    note = "" if settings.storage_backend == "local" else " (files are in the S3 bucket, not in this backup)"
    print(f"Backup written to {target}: database and {files} files{note}.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="thanhca", description="Thánh Ca Hub maintenance tasks.")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("migrate", help="create or update the database tables").set_defaults(run=migrate)

    admin = commands.add_parser("create-admin", help="create an admin account (or promote an existing one)")
    admin.add_argument("--email", required=True)
    admin.add_argument("--password", help="at least 8 characters; asked for if omitted")
    admin.add_argument("--name", help="display name, e.g. 'Anna Nguyễn'")
    admin.set_defaults(run=create_admin)

    commands.add_parser("seed", help="add 36 fictional sample songs (to try the app)").set_defaults(run=seed)
    commands.add_parser("cleanup", help="remove expired sessions and unused uploads").set_defaults(run=cleanup)

    save = commands.add_parser("backup", help="zip the SQLite database and uploaded files")
    save.add_argument("--output", help="zip file to write (default: thanhca-backup-<date>.zip)")
    save.set_defaults(run=backup)

    args = parser.parse_args(argv)
    # Vietnamese names print correctly even when the console is not UTF-8.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    return args.run(Settings(), args)


if __name__ == "__main__":
    sys.exit(main())
