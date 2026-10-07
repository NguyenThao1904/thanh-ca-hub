"""Settings, read from environment variables or backend/.env (see .env.example)."""

import logging
from functools import cached_property
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent

logger = logging.getLogger(__name__)


def _resolve(path: Path) -> Path:
    """Relative paths are relative to the backend folder, wherever the server is started from."""
    return path if path.is_absolute() else (BACKEND_DIR / path).resolve()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Shown in the browser tab, on the sign-in page and in the sidebar.
    app_name: str = "Thánh Ca Hub"
    # Language for people who have not chosen one yet: "vi" or "en".
    default_locale: Literal["vi", "en"] = "vi"
    # Dates are shown in the choir's time zone.
    time_zone: str = "Asia/Ho_Chi_Minh"

    # Folder for the SQLite database and uploaded files (local storage).
    data_dir: Path = Path("data")
    # Empty: SQLite file in data_dir. Or postgresql://user:password@host:5432/dbname
    database_url: str = ""
    # Apply database migrations when the server starts.
    auto_migrate: bool = True

    # Where uploaded scans and PDFs are kept: "local" (data_dir/files) or "s3"
    # (Amazon S3, Cloudflare R2, Google Cloud Storage, MinIO, Supabase Storage...).
    storage_backend: Literal["local", "s3"] = "local"
    files_dir: Path | None = None
    s3_bucket: str = ""
    s3_endpoint_url: str = ""
    s3_region: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_prefix: str = ""

    # Members stay signed in this many days after their last visit.
    session_days: int = 30
    # "auto": secure cookies when the site is served over HTTPS.
    cookie_secure: Literal["auto", "true", "false"] = "auto"

    # The built web app (frontend/dist). Served by this server when it exists.
    frontend_dist: Path = PROJECT_DIR / "frontend" / "dist"

    log_level: str = "INFO"

    @field_validator("data_dir", "frontend_dist")
    @classmethod
    def _absolute(cls, value: Path) -> Path:
        return _resolve(value)

    @field_validator("files_dir")
    @classmethod
    def _absolute_optional(cls, value: Path | None) -> Path | None:
        return _resolve(value) if value else None

    @field_validator("time_zone")
    @classmethod
    def _known_time_zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            logger.warning("Unknown TIME_ZONE %r, using UTC", value)
            return "UTC"
        return value

    @field_validator("session_days")
    @classmethod
    def _positive_days(cls, value: int) -> int:
        return max(1, min(value, 365))

    @cached_property
    def zone(self) -> ZoneInfo:
        return ZoneInfo(self.time_zone)

    @property
    def uploads_dir(self) -> Path:
        return self.files_dir or self.data_dir / "files"

    @property
    def sqlalchemy_url(self) -> str:
        """DATABASE_URL in the form SQLAlchemy expects (hosting providers often give postgres://...)."""
        url = self.database_url.strip()
        if not url:
            return f"sqlite:///{(self.data_dir / 'thanhca.db').as_posix()}"
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix) :]
        if url.startswith("sqlite:///") and not url.startswith("sqlite:////"):
            path = url[len("sqlite:///") :]
            if path and path != ":memory:" and not Path(path).is_absolute():
                return f"sqlite:///{_resolve(Path(path)).as_posix()}"
        return url

    @property
    def is_sqlite(self) -> bool:
        return self.sqlalchemy_url.startswith("sqlite")
