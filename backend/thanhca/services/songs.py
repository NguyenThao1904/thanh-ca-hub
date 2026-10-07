"""Songs: details, create/update/delete, location check, and file changes."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import audit
from ..errors import AppError, not_found
from ..location import format_location, song_label
from ..models import MAX_PAGE, Attachment, Category, Song, User, utcnow
from ..schemas import AttachmentOut, CategoryRef, FileChanges, LocationCheck, SongDetail, SongInput
from ..storage import Storage

logger = logging.getLogger(__name__)

PENDING_UPLOAD_LIFETIME = timedelta(hours=24)


def load_song(db: Session, song_id: int, *, lock: bool = False) -> Song:
    statement = (
        select(Song)
        .where(Song.id == song_id)
        .options(selectinload(Song.attachments))
        # Reload the files even if this session already has the song (their order may have changed).
        .execution_options(populate_existing=True)
    )
    if lock and db.get_bind().dialect.name == "postgresql":
        statement = statement.with_for_update(of=Song)
    song = db.scalar(statement)
    if song is None:
        raise not_found()
    return song


def song_detail(song: Song) -> SongDetail:
    pdf = song.pdf
    return SongDetail(
        id=song.id,
        song_number=song.song_number,
        title=song.title,
        composer=song.composer,
        first_sentence=song.first_sentence,
        notes=song.notes,
        binder_number=song.binder_number,
        page_number=song.page_number,
        location=song.location,
        created_at=song.created_at,
        updated_at=song.updated_at,
        created_by_name=song.creator.display_name if song.creator else None,
        updated_by_name=song.updater.display_name if song.updater else None,
        category=CategoryRef.model_validate(song.category),
        pdf=AttachmentOut.model_validate(pdf) if pdf else None,
        images=[AttachmentOut.model_validate(image) for image in song.images],
    )


def _snapshot(song: Song) -> dict[str, Any]:
    return {
        "location": song.location,
        "song_number": song.song_number,
        "title": song.title,
        "composer": song.composer,
        "first_sentence": song.first_sentence,
        "notes": song.notes,
    }


def _check_song(db: Session, values: SongInput, song_id: int | None) -> Category:
    """Friendly messages for the rules the database also enforces."""
    category = db.get(Category, values.category_id)
    if category is None:
        raise AppError(422, "errors.categoryRequired", field_errors={"categoryId": "errors.categoryRequired"})
    if values.binder_number > category.binder_count:
        raise AppError(
            422,
            "errors.binderOutOfRange",
            params={"category": category.name, "count": category.binder_count, "binder": values.binder_number},
            field_errors={"binderNumber": "errors.binderOutOfRange"},
        )

    others = select(Song.id)
    if song_id is not None:
        others = others.where(Song.id != song_id)
    location_owner = db.scalar(
        others.where(
            Song.category_id == category.id,
            Song.binder_number == values.binder_number,
            Song.page_number == values.page_number,
        )
    )
    number_owner = (
        db.scalar(others.where(Song.song_number == values.song_number)) if values.song_number is not None else None
    )

    field_errors: dict[str, str] = {}
    if location_owner is not None:
        field_errors["pageNumber"] = "errors.duplicateLocation"
    if number_owner is not None:
        field_errors["songNumber"] = "errors.duplicateNumber"
    if field_errors:
        location = format_location(category.code, values.binder_number, values.page_number)
        raise AppError(
            409,
            "errors.duplicateLocation" if location_owner is not None else "errors.duplicateNumber",
            params={"location": location, "number": values.song_number or ""},
            field_errors=field_errors,
            href=f"/songs/{location_owner if location_owner is not None else number_owner}",
        )
    return category


def _commit_song(db: Session, values: SongInput, song_id: int | None) -> None:
    try:
        db.commit()
    except IntegrityError:
        # Someone else took the location or number at the same moment: report it like the checks do.
        db.rollback()
        _check_song(db, values, song_id)
        raise


def create_song(db: Session, actor: User, values: SongInput) -> Song:
    category = _check_song(db, values, None)
    song = Song(
        category=category,
        binder_number=values.binder_number,
        page_number=values.page_number,
        song_number=values.song_number,
        title=values.title,
        composer=values.composer,
        first_sentence=values.first_sentence,
        notes=values.notes,
        created_by=actor.id,
        updated_by=actor.id,
    )
    db.add(song)
    db.flush()
    audit.record(
        db,
        actor,
        "song.created",
        "song",
        song.id,
        song_id=song.id,
        summary=song_label(category.code, song.binder_number, song.page_number, song.title),
        details={"location": song.location, "title": song.title, "song_number": song.song_number},
    )
    _commit_song(db, values, None)
    return load_song(db, song.id)


def update_song(db: Session, actor: User, song_id: int, values: SongInput) -> Song:
    song = load_song(db, song_id, lock=True)
    category = _check_song(db, values, song.id)
    before = _snapshot(song)

    song.category = category
    song.binder_number = values.binder_number
    song.page_number = values.page_number
    song.song_number = values.song_number
    song.title = values.title
    song.composer = values.composer
    song.first_sentence = values.first_sentence
    song.notes = values.notes

    changed = audit.changes(before, _snapshot(song))
    if not changed:
        db.rollback()
        return load_song(db, song_id)

    song.updated_at = utcnow()
    song.updated_by = actor.id
    audit.record(
        db,
        actor,
        "song.updated",
        "song",
        song.id,
        song_id=song.id,
        summary=song_label(category.code, song.binder_number, song.page_number, song.title),
        details={"changes": changed},
    )
    _commit_song(db, values, song.id)
    return load_song(db, song_id)


def delete_song(db: Session, storage: Storage, actor: User, song_id: int) -> None:
    song = load_song(db, song_id, lock=True)
    keys = [file.storage_key for file in song.attachments]
    audit.record(
        db,
        actor,
        "song.deleted",
        "song",
        song.id,
        song_id=song.id,
        summary=song_label(song.category.code, song.binder_number, song.page_number, song.title),
        details={"location": song.location, "title": song.title, "song_number": song.song_number},
    )
    db.delete(song)
    db.commit()
    # The song is gone; remove its files too.
    storage.delete(keys)


def check_location(
    db: Session, category_id: int, binder_number: int, page_number: int | None, exclude_song_id: int | None
) -> LocationCheck:
    """Live check for the song form: is this location free, and what is the next free page in the binder?"""
    in_binder = [Song.category_id == category_id, Song.binder_number == binder_number]
    if exclude_song_id is not None:
        in_binder.append(Song.id != exclude_song_id)
    taken = (
        db.execute(select(Song.id, Song.title).where(*in_binder, Song.page_number == page_number)).first()
        if page_number
        else None
    )
    last_page = db.scalar(select(func.max(Song.page_number)).where(*in_binder))
    return LocationCheck(
        taken_by={"id": taken.id, "title": taken.title} if taken else None,
        next_free_page=min((last_page or 0) + 1, MAX_PAGE),
    )


# --- Files ----------------------------------------------------------------------


def purge_stale_uploads(db: Session, storage: Storage) -> int:
    """Uploads that were never attached to a song (the admin closed the form) are removed after a day."""
    stale = db.scalars(
        select(Attachment).where(
            Attachment.song_id.is_(None), Attachment.created_at < utcnow() - PENDING_UPLOAD_LIFETIME
        )
    ).all()
    if not stale:
        return 0
    keys = [file.storage_key for file in stale]
    for file in stale:
        db.delete(file)
    db.commit()
    storage.delete(keys)
    return len(keys)


def _pending_upload(db: Session, actor: User, upload_id: int, file_type: str) -> Attachment:
    upload = db.get(Attachment, upload_id)
    if upload is None or upload.song_id is not None or upload.file_type != file_type or upload.created_by != actor.id:
        raise AppError(422, "errors.uploadPdf" if file_type == "pdf" else "errors.invalidInput")
    return upload


def apply_file_changes(db: Session, storage: Storage, actor: User, song_id: int, changes: FileChanges) -> Song:
    """Attaches finished uploads, removes files, orders the pages and replaces the PDF, in one transaction."""
    song = load_song(db, song_id, lock=True)
    label = song_label(song.category.code, song.binder_number, song.page_number, song.title)
    removed_keys: list[str] = []
    changed = False

    def log(action: str, file: Attachment, **extra: Any) -> None:
        audit.record(
            db,
            actor,
            action,
            "attachment",
            file.id,
            song_id=song.id,
            summary=label,
            details={"file_type": file.file_type, "file_name": file.file_name, **extra},
        )

    images = {image.id: image for image in song.images}
    for image_id in dict.fromkeys(changes.remove_image_ids):
        image = images.pop(image_id, None)
        if image is not None:
            log("attachment.removed", image)
            removed_keys.append(image.storage_key)
            song.attachments.remove(image)
            changed = True

    if changes.images is not None:
        position = 0
        for ref in changes.images:
            if ref.id is not None and ref.id in images:
                image = images[ref.id]
                if image.sort_order != position:
                    image.sort_order = position
                    changed = True
            elif ref.upload_id is not None:
                upload = _pending_upload(db, actor, ref.upload_id, "image")
                upload.sort_order = position
                song.attachments.append(upload)
                db.flush()
                log("attachment.added", upload)
                changed = True
            else:
                continue
            position += 1

    if changes.pdf is not None:
        current = song.pdf
        if changes.pdf.upload_id is not None:
            upload = _pending_upload(db, actor, changes.pdf.upload_id, "pdf")
            if current is not None:
                removed_keys.append(current.storage_key)
                song.attachments.remove(current)
                db.flush()
            song.attachments.append(upload)
            db.flush()
            if current is not None:
                log("attachment.replaced", upload, previous_file_name=current.file_name)
            else:
                log("attachment.added", upload)
            changed = True
        elif changes.pdf.remove and current is not None:
            log("attachment.removed", current)
            removed_keys.append(current.storage_key)
            song.attachments.remove(current)
            changed = True

    if changed:
        # File changes count as an update of the song ("last updated").
        song.updated_at = utcnow()
        song.updated_by = actor.id
    db.commit()
    storage.delete(removed_keys)
    return load_song(db, song_id)
