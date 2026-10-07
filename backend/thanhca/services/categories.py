"""Categories: each has a location code (NL, ĐC, ...) and a number of binders."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import audit
from ..errors import AppError, not_found
from ..models import Category, Song
from ..schemas import CategoryInput, CategoryOut
from ..text import fold


def list_categories(db: Session) -> list[CategoryOut]:
    """All categories in display order, with their song counts and the highest binder in use."""
    rows = db.execute(
        select(Category, func.count(Song.id), func.max(Song.binder_number))
        .outerjoin(Song, Song.category_id == Category.id)
        .group_by(Category.id)
        .order_by(Category.sort_order, Category.name, Category.id)
    ).all()
    return [
        CategoryOut(
            id=category.id,
            name=category.name,
            code=category.code,
            binder_count=category.binder_count,
            sort_order=category.sort_order,
            song_count=song_count,
            max_binder_used=max_binder,
        )
        for category, song_count, max_binder in rows
    ]


def _label(category: Category) -> str:
    return f"{category.name} ({category.code})"


def _snapshot(category: Category) -> dict[str, object]:
    return {"name": category.name, "code": category.code, "binder_count": category.binder_count}


def _check(db: Session, values: CategoryInput, category: Category | None) -> None:
    others = select(Category.id)
    if category is not None:
        others = others.where(Category.id != category.id)
    if db.scalar(others.where(Category.name_key == fold(values.name))) is not None:
        raise AppError(
            409,
            "errors.duplicateCategoryName",
            params={"name": values.name},
            field_errors={"name": "errors.duplicateCategoryName"},
        )
    if db.scalar(others.where(Category.code_key == fold(values.code))) is not None:
        raise AppError(
            409,
            "errors.duplicateCategoryCode",
            params={"code": values.code},
            field_errors={"code": "errors.duplicateCategoryCode"},
        )
    if category is not None and values.binder_count < category.binder_count:
        highest = db.scalar(select(func.max(Song.binder_number)).where(Song.category_id == category.id))
        if highest is not None and highest > values.binder_count:
            raise AppError(
                409,
                "errors.binderInUse",
                params={"binder": highest},
                field_errors={"binderCount": "errors.binderInUse"},
            )


def _commit(db: Session, values: CategoryInput, category: Category | None) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        _check(db, values, category)
        raise


def create_category(db: Session, actor, values: CategoryInput) -> CategoryOut:
    _check(db, values, None)
    last = db.scalar(select(func.max(Category.sort_order))) or 0
    category = Category(name=values.name, code=values.code, binder_count=values.binder_count, sort_order=last + 1)
    db.add(category)
    db.flush()
    audit.record(
        db, actor, "category.created", "category", category.id, summary=_label(category), details=_snapshot(category)
    )
    _commit(db, values, None)
    return next(item for item in list_categories(db) if item.id == category.id)


def update_category(db: Session, actor, category_id: int, values: CategoryInput) -> CategoryOut:
    statement = select(Category).where(Category.id == category_id)
    if db.get_bind().dialect.name == "postgresql":
        # No song can be added to a binder that is being removed at the same moment.
        statement = statement.with_for_update()
    category = db.scalar(statement)
    if category is None:
        raise not_found()
    _check(db, values, category)
    before = _snapshot(category)
    category.name, category.code, category.binder_count = values.name, values.code, values.binder_count
    changed = audit.changes(before, _snapshot(category))
    if changed:
        audit.record(
            db,
            actor,
            "category.updated",
            "category",
            category.id,
            summary=_label(category),
            details={"changes": changed},
        )
    _commit(db, values, category)
    return next(item for item in list_categories(db) if item.id == category_id)


def delete_category(db: Session, actor, category_id: int) -> None:
    category = db.get(Category, category_id)
    if category is None:
        raise not_found()
    if db.scalar(select(Song.id).where(Song.category_id == category_id).limit(1)) is not None:
        raise AppError(409, "errors.categoryInUse")
    audit.record(
        db, actor, "category.deleted", "category", category.id, summary=_label(category), details=_snapshot(category)
    )
    db.delete(category)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise AppError(409, "errors.categoryInUse") from error


def move_category(db: Session, category_id: int, direction: int) -> None:
    """Moves a category one place up (-1) or down (+1). Reordering is not logged in the history."""
    ids = list(db.scalars(select(Category.id).order_by(Category.sort_order, Category.name, Category.id)))
    if category_id not in ids:
        raise not_found()
    index = ids.index(category_id)
    target = index + (-1 if direction < 0 else 1)
    if not 0 <= target < len(ids):
        return
    ids[index], ids[target] = ids[target], ids[index]
    for position, identifier in enumerate(ids, start=1):
        category = db.get(Category, identifier)
        if category is not None and category.sort_order != position:
            category.sort_order = position
    db.commit()
