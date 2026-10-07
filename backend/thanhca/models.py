"""Database tables.

Works with SQLite and PostgreSQL. Accent-free copies of searchable text
(title_key, search_text, ...) are computed here in Python whenever a row is
saved, so search behaves the same on both databases.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .location import format_location
from .text import fold, lower_exact


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Timestamps stored in UTC and always returned with a time zone (SQLite would drop it)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        value = value.astimezone(UTC)
        # SQLite keeps text: store naive UTC so that text order equals time order.
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_N_name)s",
            "uq": "uq_%(table_name)s_%(column_0_N_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )
    type_annotation_map = {datetime: UTCDateTime()}


# Integer primary keys: 64-bit on PostgreSQL; on SQLite the ROWID, with AUTOINCREMENT on every
# table so that the id of a deleted song or file is never given to a new one (old links and
# history must not point to the wrong song).
BigId = BigInteger().with_variant(Integer(), "sqlite")
JsonData = JSON().with_variant(JSONB(), "postgresql")

ROLES = ("admin", "member")
FILE_TYPES = ("pdf", "image")
MAX_BINDERS = 50
MAX_PAGE = 999
MAX_SONG_NUMBER = 999_999


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role in ('admin', 'member')", name="role"), {"sqlite_autoincrement": True})

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    # Stored lower-case; used to sign in. Only admins see other people's email addresses.
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10), default="member")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
    last_sign_in_at: Mapped[datetime | None]

    sessions: Mapped[list[UserSession]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def is_admin(self) -> bool:
        return self.is_active and self.role == "admin"


class UserSession(Base):
    """A signed-in browser. The cookie holds a random token; only its SHA-256 hash is stored."""

    __tablename__ = "sessions"
    __table_args__ = {"sqlite_autoincrement": True}

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(BigId, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(index=True)
    user_agent: Mapped[str | None] = mapped_column(String(255))

    user: Mapped[User] = relationship(back_populates="sessions")


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint(f"binder_count between 1 and {MAX_BINDERS}", name="binder_count"),
        CheckConstraint("length(code) between 1 and 6", name="code_length"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    # Short code used in physical locations, e.g. NL, ĐC, PS.
    code: Mapped[str] = mapped_column(String(6))
    # Accent-free copies: unique, so "DC" and "ĐC" (or "Duc Me" and "Đức Mẹ") can never both exist,
    # and used to match searches typed without accents.
    name_key: Mapped[str] = mapped_column(String(60), unique=True)
    code_key: Mapped[str] = mapped_column(String(6), unique=True)
    binder_count: Mapped[int] = mapped_column(default=1)
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    def refresh_keys(self) -> None:
        self.name_key = fold(self.name)
        self.code_key = fold(self.code)


class Song(Base):
    __tablename__ = "songs"
    __table_args__ = (
        # One physical location holds one song.
        UniqueConstraint("category_id", "binder_number", "page_number", name="songs_location_key"),
        CheckConstraint(f"binder_number between 1 and {MAX_BINDERS}", name="binder_number"),
        CheckConstraint(f"page_number between 1 and {MAX_PAGE}", name="page_number"),
        CheckConstraint(f"song_number between 1 and {MAX_SONG_NUMBER}", name="song_number"),
        CheckConstraint("length(title) >= 1", name="title"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    category_id: Mapped[int] = mapped_column(BigId, ForeignKey("categories.id", ondelete="RESTRICT"), index=True)
    binder_number: Mapped[int]
    page_number: Mapped[int]
    # Optional legacy song number; unique when present.
    song_number: Mapped[int | None] = mapped_column(unique=True)
    title: Mapped[str] = mapped_column(String(200))
    composer: Mapped[str | None] = mapped_column(String(200))
    first_sentence: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)

    # Accent-free copies for search and sorting (see refresh_keys).
    title_key: Mapped[str] = mapped_column(String(200), index=True)
    composer_key: Mapped[str] = mapped_column(String(200), default="")
    first_sentence_key: Mapped[str] = mapped_column(String(500), default="")
    search_text: Mapped[str] = mapped_column(Text, default="")
    # Lower-case with accents, to rank exact-accent matches first.
    search_exact: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    created_by: Mapped[int | None] = mapped_column(BigId, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    updated_by: Mapped[int | None] = mapped_column(BigId, ForeignKey("users.id", ondelete="SET NULL"), index=True)

    category: Mapped[Category] = relationship(lazy="joined", innerjoin=True)
    creator: Mapped[User | None] = relationship(foreign_keys=[created_by])
    updater: Mapped[User | None] = relationship(foreign_keys=[updated_by])
    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="song",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="[Attachment.sort_order, Attachment.id]",
    )

    @property
    def location(self) -> str:
        return format_location(self.category.code, self.binder_number, self.page_number)

    @property
    def pdf(self) -> Attachment | None:
        return next((file for file in self.attachments if file.file_type == "pdf"), None)

    @property
    def images(self) -> list[Attachment]:
        return [file for file in self.attachments if file.file_type == "image"]

    def refresh_keys(self) -> None:
        self.title_key = fold(self.title)
        self.composer_key = fold(self.composer)
        self.first_sentence_key = fold(self.first_sentence)
        self.search_text = " ".join([self.title_key, self.composer_key, self.first_sentence_key])
        self.search_exact = " ".join(lower_exact(part) for part in (self.title, self.composer, self.first_sentence))


class Attachment(Base):
    """A scanned page (image) or the PDF of a song.

    Uploads are stored first without a song (song_id is null, "pending") and
    attached when the admin saves the song form; pending uploads older than a
    day are removed.
    """

    __tablename__ = "song_attachments"
    __table_args__ = (
        CheckConstraint("file_type in ('pdf', 'image')", name="file_type"),
        CheckConstraint(
            "(file_type = 'pdf' and mime_type = 'application/pdf')"
            " or (file_type = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp'))",
            name="mime_type",
        ),
        # Zero or one PDF per song.
        Index(
            "song_attachments_one_pdf_per_song",
            "song_id",
            unique=True,
            sqlite_where=text("file_type = 'pdf'"),
            postgresql_where=text("file_type = 'pdf'"),
        ),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    song_id: Mapped[int | None] = mapped_column(BigId, ForeignKey("songs.id", ondelete="CASCADE"), index=True)
    file_type: Mapped[str] = mapped_column(String(5))
    # Key in the file storage (a folder on disk or an S3 bucket). Never a public URL.
    storage_key: Mapped[str] = mapped_column(String(255), unique=True)
    file_name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(50))
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    created_by: Mapped[int | None] = mapped_column(BigId, ForeignKey("users.id", ondelete="SET NULL"), index=True)

    song: Mapped[Song | None] = relationship(back_populates="attachments")


class AuditLog(Base):
    """History of important changes. No foreign keys on purpose: entries must
    survive the deletion of the song or user they describe."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_song_id_created_at", "song_id", "created_at"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    actor_id: Mapped[int | None] = mapped_column(BigInteger)
    actor_name: Mapped[str | None] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(40))
    entity_type: Mapped[str] = mapped_column(String(20))
    entity_id: Mapped[str | None] = mapped_column(String(40))
    song_id: Mapped[int | None] = mapped_column(BigInteger)
    summary: Mapped[str | None] = mapped_column(String(500))
    details: Mapped[dict[str, Any]] = mapped_column(JsonData, default=dict)


@event.listens_for(Song, "before_insert")
@event.listens_for(Song, "before_update")
def _song_keys(_mapper: Any, _connection: Any, song: Song) -> None:
    song.refresh_keys()


@event.listens_for(Category, "before_insert")
@event.listens_for(Category, "before_update")
def _category_keys(_mapper: Any, _connection: Any, category: Category) -> None:
    category.refresh_keys()
