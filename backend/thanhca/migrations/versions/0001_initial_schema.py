"""Initial schema: users, sessions, categories (with the 14 default categories), songs, files, history.

Revision ID: 0001
Revises:
Create Date: 2026-10-07
"""

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BigId = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
Timestamp = sa.DateTime(timezone=True)

# The choir's categories with their location codes and number of binders.
# Accent-free keys are written out: a migration must not depend on application code.
DEFAULT_CATEGORIES = [
    ("Nhập lễ", "NL", "nhap le", "nl", 1),
    ("Đáp ca", "ĐC", "dap ca", "dc", 5),
    ("Dâng lễ", "DL", "dang le", "dl", 2),
    ("Chư Thánh", "CT", "chu thanh", "ct", 3),
    ("Đức Mẹ", "MA", "duc me", "ma", 2),
    ("An Táng", "AT", "an tang", "at", 1),
    ("Ca Nguyện", "CN", "ca nguyen", "cn", 5),
    ("Dân Tộc", "DT", "dan toc", "dt", 2),
    ("Giáng Sinh", "GS", "giang sinh", "gs", 4),
    ("Hôn Phối", "HP", "hon phoi", "hp", 1),
    ("Kính Chúa", "KC", "kinh chua", "kc", 2),
    ("Kết Lễ", "KL", "ket le", "kl", 1),
    ("Phục Sinh", "PS", "phuc sinh", "ps", 5),
    ("Thánh Hiến", "TH", "thanh hien", "th", 1),
]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", BigId, nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", Timestamp, nullable=False),
        sa.Column("updated_at", Timestamp, nullable=False),
        sa.Column("last_sign_in_at", Timestamp, nullable=True),
        sa.CheckConstraint("role in ('admin', 'member')", name=op.f("ck_users_role")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        sqlite_autoincrement=True,
    )

    op.create_table(
        "sessions",
        sa.Column("id", BigId, nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("user_id", BigId, nullable=False),
        sa.Column("created_at", Timestamp, nullable=False),
        sa.Column("last_seen_at", Timestamp, nullable=False),
        sa.Column("expires_at", Timestamp, nullable=False),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_sessions_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sessions")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_sessions_token_hash")),
        sqlite_autoincrement=True,
    )
    op.create_index(op.f("ix_sessions_user_id"), "sessions", ["user_id"])
    op.create_index(op.f("ix_sessions_expires_at"), "sessions", ["expires_at"])

    categories = op.create_table(
        "categories",
        sa.Column("id", BigId, nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("code", sa.String(6), nullable=False),
        sa.Column("name_key", sa.String(60), nullable=False),
        sa.Column("code_key", sa.String(6), nullable=False),
        sa.Column("binder_count", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", Timestamp, nullable=False),
        sa.Column("updated_at", Timestamp, nullable=False),
        sa.CheckConstraint("binder_count between 1 and 50", name=op.f("ck_categories_binder_count")),
        sa.CheckConstraint("length(code) between 1 and 6", name=op.f("ck_categories_code_length")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categories")),
        sa.UniqueConstraint("code_key", name=op.f("uq_categories_code_key")),
        sa.UniqueConstraint("name_key", name=op.f("uq_categories_name_key")),
        sqlite_autoincrement=True,
    )

    op.create_table(
        "songs",
        sa.Column("id", BigId, nullable=False),
        sa.Column("category_id", BigId, nullable=False),
        sa.Column("binder_number", sa.Integer(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("song_number", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("composer", sa.String(200), nullable=True),
        sa.Column("first_sentence", sa.String(500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("title_key", sa.String(200), nullable=False),
        sa.Column("composer_key", sa.String(200), nullable=False),
        sa.Column("first_sentence_key", sa.String(500), nullable=False),
        sa.Column("search_text", sa.Text(), nullable=False),
        sa.Column("search_exact", sa.Text(), nullable=False),
        sa.Column("created_at", Timestamp, nullable=False),
        sa.Column("updated_at", Timestamp, nullable=False),
        sa.Column("created_by", BigId, nullable=True),
        sa.Column("updated_by", BigId, nullable=True),
        sa.CheckConstraint("binder_number between 1 and 50", name=op.f("ck_songs_binder_number")),
        sa.CheckConstraint("page_number between 1 and 999", name=op.f("ck_songs_page_number")),
        sa.CheckConstraint("song_number between 1 and 999999", name=op.f("ck_songs_song_number")),
        sa.CheckConstraint("length(title) >= 1", name=op.f("ck_songs_title")),
        sa.ForeignKeyConstraint(
            ["category_id"], ["categories.id"], name=op.f("fk_songs_category_id_categories"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_songs_created_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["users.id"], name=op.f("fk_songs_updated_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_songs")),
        sa.UniqueConstraint("category_id", "binder_number", "page_number", name="songs_location_key"),
        sa.UniqueConstraint("song_number", name=op.f("uq_songs_song_number")),
        sqlite_autoincrement=True,
    )
    for column in ("category_id", "title_key", "created_at", "updated_at", "created_by", "updated_by"):
        op.create_index(op.f(f"ix_songs_{column}"), "songs", [column])

    op.create_table(
        "song_attachments",
        sa.Column("id", BigId, nullable=False),
        sa.Column("song_id", BigId, nullable=True),
        sa.Column("file_type", sa.String(5), nullable=False),
        sa.Column("storage_key", sa.String(255), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(50), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", Timestamp, nullable=False),
        sa.Column("created_by", BigId, nullable=True),
        sa.CheckConstraint("file_type in ('pdf', 'image')", name=op.f("ck_song_attachments_file_type")),
        sa.CheckConstraint(
            "(file_type = 'pdf' and mime_type = 'application/pdf')"
            " or (file_type = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp'))",
            name=op.f("ck_song_attachments_mime_type"),
        ),
        sa.ForeignKeyConstraint(
            ["song_id"], ["songs.id"], name=op.f("fk_song_attachments_song_id_songs"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_song_attachments_created_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_song_attachments")),
        sa.UniqueConstraint("storage_key", name=op.f("uq_song_attachments_storage_key")),
        sqlite_autoincrement=True,
    )
    op.create_index(op.f("ix_song_attachments_song_id"), "song_attachments", ["song_id"])
    op.create_index(op.f("ix_song_attachments_created_by"), "song_attachments", ["created_by"])
    op.create_index(
        "song_attachments_one_pdf_per_song",
        "song_attachments",
        ["song_id"],
        unique=True,
        sqlite_where=sa.text("file_type = 'pdf'"),
        postgresql_where=sa.text("file_type = 'pdf'"),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", BigId, nullable=False),
        sa.Column("created_at", Timestamp, nullable=False),
        sa.Column("actor_id", sa.BigInteger(), nullable=True),
        sa.Column("actor_name", sa.String(100), nullable=True),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("entity_id", sa.String(40), nullable=True),
        sa.Column("song_id", sa.BigInteger(), nullable=True),
        sa.Column("summary", sa.String(500), nullable=True),
        sa.Column("details", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
        sqlite_autoincrement=True,
    )
    op.create_index(op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_song_id_created_at", "audit_logs", ["song_id", "created_at"])

    now = datetime.now(UTC)
    if op.get_bind().dialect.name == "sqlite":
        now = now.replace(tzinfo=None)
    op.bulk_insert(
        categories,
        [
            {
                "name": name,
                "code": code,
                "name_key": name_key,
                "code_key": code_key,
                "binder_count": binders,
                "sort_order": position,
                "created_at": now,
                "updated_at": now,
            }
            for position, (name, code, name_key, code_key, binders) in enumerate(DEFAULT_CATEGORIES, start=1)
        ],
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("song_attachments")
    op.drop_table("songs")
    op.drop_table("categories")
    op.drop_table("sessions")
    op.drop_table("users")
