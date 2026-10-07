"""Dashboard numbers and the change history."""

from __future__ import annotations

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from ..models import Attachment, AuditLog, Category, Song
from ..schemas import AuditEntry, LibraryStats


def library_stats(db: Session) -> LibraryStats:
    def with_file(file_type: str):
        return exists().where(Attachment.song_id == Song.id, Attachment.file_type == file_type)

    total = db.scalar(select(func.count(Song.id))) or 0
    with_pdf = db.scalar(select(func.count(Song.id)).where(with_file("pdf"))) or 0
    return LibraryStats(
        total_songs=total,
        total_categories=db.scalar(select(func.count(Category.id))) or 0,
        songs_with_pdf=with_pdf,
        songs_without_pdf=total - with_pdf,
        songs_with_images=db.scalar(select(func.count(Song.id)).where(with_file("image"))) or 0,
    )


def _entries(db: Session, rows: list[AuditLog]) -> list[AuditEntry]:
    song_ids = {row.song_id for row in rows if row.song_id is not None}
    existing = set(db.scalars(select(Song.id).where(Song.id.in_(song_ids)))) if song_ids else set()
    return [
        AuditEntry(
            id=row.id,
            created_at=row.created_at,
            actor_name=row.actor_name,
            action=row.action,
            entity_type=row.entity_type,
            song_id=row.song_id,
            summary=row.summary,
            details=row.details or {},
            song_exists=row.song_id in existing,
        )
        for row in rows
    ]


def song_history(db: Session, song_id: int, limit: int = 20) -> list[AuditEntry]:
    rows = db.scalars(
        select(AuditLog)
        .where(AuditLog.song_id == song_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
    ).all()
    return _entries(db, list(rows))


def activity(db: Session, page: int, page_size: int) -> tuple[list[AuditEntry], int]:
    rows = db.scalars(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    total = db.scalar(select(func.count(AuditLog.id))) or 0
    return _entries(db, list(rows)), total
