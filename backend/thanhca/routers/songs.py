"""The song library: search, details, add/edit/delete, files and the Excel export."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, Query, Response, UploadFile

from ..deps import AdminUser, CurrentUser, DbSession, SettingsDep, StorageDep
from ..errors import AppError, not_found
from ..files import (
    IMAGE_MIME_TYPES,
    PDF_MIME_TYPE,
    clean_file_name,
    format_megabytes,
    max_bytes,
    new_storage_key,
    sniff_mime_type,
)
from ..models import Attachment, Category
from ..schemas import (
    AuditEntry,
    FileChanges,
    LibraryStats,
    LocationCheck,
    SongDetail,
    SongInput,
    SongPage,
    SortOption,
    UploadOut,
)
from ..services import export, library, songs
from ..services.search import MAX_QUERY_LENGTH, search_songs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["songs"])

SearchText = Annotated[str, Query(max_length=500)]


def _library_filters(db: DbSession, category: int | None, binder: int | None) -> tuple[int | None, int | None]:
    """Unknown categories and binders a category does not have are ignored (old links keep working)."""
    if category is None:
        return None, None
    found = db.get(Category, category)
    if found is None:
        return None, None
    return found.id, binder if binder is not None and 1 <= binder <= found.binder_count else None


@router.get("/songs", response_model=SongPage)
def list_songs(
    _user: CurrentUser,
    db: DbSession,
    q: SearchText = "",
    category: int | None = None,
    binder: int | None = None,
    sort: SortOption | None = None,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 50,
) -> SongPage:
    category_id, binder_number = _library_filters(db, category, binder)
    items, total = search_songs(
        db,
        query=q[:MAX_QUERY_LENGTH],
        category_id=category_id,
        binder=binder_number,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    return SongPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/songs/location-check", response_model=LocationCheck)
def location_check(
    _admin: AdminUser,
    db: DbSession,
    category_id: Annotated[int, Query(alias="categoryId")],
    binder_number: Annotated[int, Query(alias="binderNumber", ge=1, le=50)],
    page_number: Annotated[int | None, Query(alias="pageNumber", ge=1, le=999)] = None,
    exclude_song_id: Annotated[int | None, Query(alias="excludeSongId")] = None,
) -> LocationCheck:
    return songs.check_location(db, category_id, binder_number, page_number, exclude_song_id)


@router.get("/songs/{song_id}", response_model=SongDetail)
def get_song(song_id: int, _user: CurrentUser, db: DbSession) -> SongDetail:
    return songs.song_detail(songs.load_song(db, song_id))


@router.post("/songs", response_model=SongDetail, status_code=201)
def create_song(body: SongInput, admin: AdminUser, db: DbSession) -> SongDetail:
    return songs.song_detail(songs.create_song(db, admin, body))


@router.put("/songs/{song_id}", response_model=SongDetail)
def update_song(song_id: int, body: SongInput, admin: AdminUser, db: DbSession) -> SongDetail:
    return songs.song_detail(songs.update_song(db, admin, song_id, body))


@router.delete("/songs/{song_id}", status_code=204)
def delete_song(song_id: int, admin: AdminUser, db: DbSession, storage: StorageDep) -> Response:
    songs.delete_song(db, storage, admin, song_id)
    return Response(status_code=204)


@router.put("/songs/{song_id}/files", response_model=SongDetail)
def save_song_files(
    song_id: int, body: FileChanges, admin: AdminUser, db: DbSession, storage: StorageDep
) -> SongDetail:
    return songs.song_detail(songs.apply_file_changes(db, storage, admin, song_id, body))


@router.get("/songs/{song_id}/history", response_model=list[AuditEntry])
def song_history(song_id: int, _admin: AdminUser, db: DbSession) -> list[AuditEntry]:
    return library.song_history(db, song_id)


@router.get("/stats", response_model=LibraryStats)
def stats(_user: CurrentUser, db: DbSession) -> LibraryStats:
    return library.library_stats(db)


# --- Files ---------------------------------------------------------------------------


@router.post("/uploads", response_model=UploadOut, status_code=201)
def upload_file(
    admin: AdminUser,
    db: DbSession,
    storage: StorageDep,
    file: Annotated[UploadFile, File()],
    file_type: Annotated[Literal["image", "pdf"], Form(alias="fileType")],
) -> UploadOut:
    """Stores one scanned page or PDF. It is attached to the song when the song form is saved."""
    songs.purge_stale_uploads(db, storage)

    name = clean_file_name(file.filename, "sheet-music.pdf" if file_type == "pdf" else "page.jpg")
    data = file.file
    mime_type = sniff_mime_type(data.read(1024))
    data.seek(0, 2)
    size = data.tell()
    data.seek(0)

    if file_type == "pdf" and mime_type != PDF_MIME_TYPE:
        raise AppError(415, "errors.pdfType", params={"name": name})
    if file_type == "image" and mime_type not in IMAGE_MIME_TYPES:
        raise AppError(415, "errors.imageType", params={"name": name})
    if size > max_bytes(file_type):
        raise AppError(
            413, "errors.fileTooLarge", params={"name": name, "size": format_megabytes(max_bytes(file_type))}
        )
    if size == 0:
        raise AppError(422, "errors.invalidInput")

    key = new_storage_key(mime_type)
    try:
        storage.save(key, data, mime_type)
    except Exception as error:
        logger.exception("Storing an upload failed")
        raise AppError(
            502, "errors.uploadPdf" if file_type == "pdf" else "errors.uploadImage", params={"name": name}
        ) from error

    upload = Attachment(
        song_id=None,
        file_type=file_type,
        storage_key=key,
        file_name=name,
        mime_type=mime_type,
        size_bytes=size,
        created_by=admin.id,
    )
    db.add(upload)
    db.commit()
    return UploadOut.model_validate(upload)


@router.get("/files/{file_id}")
def get_file(
    file_id: int,
    user: CurrentUser,
    db: DbSession,
    storage: StorageDep,
    download: Annotated[str | None, Query()] = None,
) -> Response:
    """A song's file for signed-in members. Add ?download=1 to download instead of viewing."""
    file = db.get(Attachment, file_id)
    # Uploads not yet attached to a song are only visible to the admin who uploaded them.
    if file is None or (file.song_id is None and file.created_by != user.id):
        raise not_found()
    response = storage.response(
        file.storage_key, content_type=file.mime_type, file_name=file.file_name, download=download is not None
    )
    if response.status_code == 404:
        raise not_found()
    return response


@router.get("/export/songs")
def export_songs(
    _user: CurrentUser,
    db: DbSession,
    settings: SettingsDep,
    q: SearchText = "",
    category: int | None = None,
    binder: int | None = None,
    sort: SortOption | None = None,
    lang: Literal["vi", "en"] | None = None,
) -> Response:
    category_id, binder_number = _library_filters(db, category, binder)
    rows = export.all_matching_songs(
        db, query=q[:MAX_QUERY_LENGTH], category_id=category_id, binder=binder_number, sort=sort
    )
    content = export.build_workbook(rows, lang or settings.default_locale, settings.zone)
    filename = f"songs-{datetime.now(settings.zone):%Y-%m-%d}.xlsx"
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "private, no-store"},
    )
