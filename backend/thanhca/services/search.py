"""Search, filter, sort and paginate the song library.

The query is matched accent-insensitively against title, composer, first
sentence and category name (every word must appear), against the song number
(prefix), and as a physical location: "NL-1.01" (one song), "NL-1" / "PS 3"
(a binder), "NL" (a category). "DC-3" also finds "ĐC-3".
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import ColumnElement, String, and_, case, cast, exists, func, literal, or_, select
from sqlalchemy.orm import Session

from ..location import format_location, parse_location_query
from ..models import Attachment, Category, Song
from ..schemas import SongListItem, SortOption
from ..text import clean_line, escape_like, fold, lower_exact

MAX_QUERY_LENGTH = 100
_NUMBER = re.compile(r"[0-9]{1,6}")


def _like(column: Any, pattern: str) -> ColumnElement[bool]:
    return column.like(pattern, escape="\\")


def default_sort(query: str) -> SortOption:
    """Best match first while searching; otherwise the order of the binders on the shelf."""
    return "relevance" if clean_line(query) else "location"


def search_songs(
    db: Session,
    *,
    query: str = "",
    category_id: int | None = None,
    binder: int | None = None,
    sort: SortOption | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[SongListItem], int]:
    cleaned = clean_line(query)[:MAX_QUERY_LENGTH]
    folded = fold(cleaned)
    exact = lower_exact(cleaned)
    sort = sort or default_sort(cleaned)

    number = int(folded) if _NUMBER.fullmatch(folded) else None
    number_prefix = _like(cast(Song.song_number, String), f"{number}%") if number is not None else None

    location_match: ColumnElement[bool] | None = None
    location = parse_location_query(folded) if folded else None
    if location:
        location_category = db.scalar(select(Category.id).where(Category.code_key == location.code_key))
        if location_category is not None:
            conditions = [Song.category_id == location_category]
            if location.binder is not None:
                conditions.append(Song.binder_number == location.binder)
            if location.page is not None:
                conditions.append(Song.page_number == location.page)
            location_match = and_(*conditions)

    filters: list[ColumnElement[bool]] = []
    if category_id is not None:
        filters.append(Song.category_id == category_id)
    if binder is not None:
        filters.append(Song.binder_number == binder)
    if folded:
        searchable = Song.search_text + " " + Category.name_key
        alternatives = [and_(*(_like(searchable, f"%{escape_like(word)}%") for word in folded.split(" ")))]
        if number_prefix is not None:
            alternatives.append(number_prefix)
        if location_match is not None:
            alternatives.append(location_match)
        filters.append(or_(*alternatives))

    # Relevance: exact number, then location, then title, first sentence, composer, category.
    whens: list[tuple[ColumnElement[bool], int]] = []
    if number is not None:
        whens.append((Song.song_number == number, 1000))
    if location_match is not None:
        whens.append((location_match, 900))
    if folded:
        like = escape_like(folded)
        whens += [
            (Song.title_key == folded, 800),
            (_like(Song.title_key, f"{like}%"), 700),
            (_like(Song.title_key, f"%{like}%"), 600),
            (_like(Song.first_sentence_key, f"{like}%"), 500),
            (_like(Song.first_sentence_key, f"%{like}%"), 450),
            (_like(Song.composer_key, f"%{like}%"), 400),
            (_like(Category.name_key, f"%{like}%"), 350),
        ]
    if number_prefix is not None:
        whens.append((number_prefix, 300))
    rank: ColumnElement[int] = case(*whens, else_=100) if whens else literal(100)
    if exact != folded:
        # Typed with accents: exact-accent matches come first ("Nguyễn" before "Nguyện").
        rank = rank + case((_like(Song.search_exact, f"%{escape_like(exact)}%"), 1000), else_=0)

    postgres = db.get_bind().dialect.name == "postgresql"
    title_key = Song.title_key.collate("C") if postgres else Song.title_key
    on_the_shelf = [Category.sort_order, Category.id, Song.binder_number, Song.page_number, Song.id]
    first: dict[str, list[Any]] = {
        "relevance": [rank.desc()],
        "number_asc": [Song.song_number.asc().nulls_last()],
        "number_desc": [Song.song_number.desc().nulls_last()],
        "title_asc": [title_key.asc()],
        "title_desc": [title_key.desc()],
        "created_desc": [Song.created_at.desc()],
        "updated_desc": [Song.updated_at.desc()],
    }

    has_pdf = exists().where(Attachment.song_id == Song.id, Attachment.file_type == "pdf")
    image_count = (
        select(func.count(Attachment.id))
        .where(Attachment.song_id == Song.id, Attachment.file_type == "image")
        .scalar_subquery()
    )
    statement = (
        select(
            Song.id,
            Song.song_number,
            Song.title,
            Song.composer,
            Song.first_sentence,
            Song.category_id,
            Category.name.label("category_name"),
            Category.code.label("category_code"),
            Song.binder_number,
            Song.page_number,
            Song.created_at,
            Song.updated_at,
            has_pdf.label("has_pdf"),
            image_count.label("image_count"),
        )
        .join(Category, Song.category_id == Category.id)
        .where(*filters)
        .order_by(*first.get(sort, []), *on_the_shelf)
        .limit(page_size)
        .offset((max(page, 1) - 1) * page_size)
    )
    total = db.scalar(
        select(func.count()).select_from(Song).join(Category, Song.category_id == Category.id).where(*filters)
    )

    items = [
        SongListItem(
            id=row.id,
            song_number=row.song_number,
            title=row.title,
            composer=row.composer,
            first_sentence=row.first_sentence,
            category_id=row.category_id,
            category_name=row.category_name,
            category_code=row.category_code,
            binder_number=row.binder_number,
            page_number=row.page_number,
            location=format_location(row.category_code, row.binder_number, row.page_number),
            created_at=row.created_at,
            updated_at=row.updated_at,
            has_pdf=bool(row.has_pdf),
            image_count=int(row.image_count or 0),
        )
        for row in db.execute(statement)
    ]
    return items, int(total or 0)
