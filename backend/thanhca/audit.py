"""Change history ("Activity"). Entries are written in the same transaction as the change."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .models import AuditLog, User


def record(
    db: Session,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: int | str | None,
    *,
    song_id: int | None = None,
    summary: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            actor_name=actor.display_name if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            song_id=song_id,
            summary=(summary or "")[:500] or None,
            details=details or {},
        )
    )


def changes(before: dict[str, Any], after: dict[str, Any]) -> dict[str, list[Any]]:
    """{"title": ["old", "new"], ...} for the fields that changed."""
    return {field: [before[field], after[field]] for field in after if before.get(field) != after[field]}
