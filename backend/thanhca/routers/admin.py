"""Categories (read by everyone, managed by admins), users and the activity log (admins only)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Response

from ..deps import AdminUser, CurrentUser, DbSession
from ..schemas import (
    ActiveInput,
    AuditPage,
    CategoryInput,
    CategoryOut,
    ManagedUser,
    MoveInput,
    NewUserInput,
    PasswordInput,
    UpdateUserInput,
)
from ..services import categories, library, users

router = APIRouter(prefix="/api")

ACTIVITY_PAGE_SIZE = 50


# --- Categories ------------------------------------------------------------------


@router.get("/categories", response_model=list[CategoryOut], tags=["categories"])
def list_categories(_user: CurrentUser, db: DbSession) -> list[CategoryOut]:
    return categories.list_categories(db)


@router.post("/categories", response_model=CategoryOut, status_code=201, tags=["categories"])
def create_category(body: CategoryInput, admin: AdminUser, db: DbSession) -> CategoryOut:
    return categories.create_category(db, admin, body)


@router.put("/categories/{category_id}", response_model=CategoryOut, tags=["categories"])
def update_category(category_id: int, body: CategoryInput, admin: AdminUser, db: DbSession) -> CategoryOut:
    return categories.update_category(db, admin, category_id, body)


@router.delete("/categories/{category_id}", status_code=204, tags=["categories"])
def delete_category(category_id: int, admin: AdminUser, db: DbSession) -> Response:
    categories.delete_category(db, admin, category_id)
    return Response(status_code=204)


@router.post("/categories/{category_id}/move", status_code=204, tags=["categories"])
def move_category(category_id: int, body: MoveInput, _admin: AdminUser, db: DbSession) -> Response:
    categories.move_category(db, category_id, body.direction)
    return Response(status_code=204)


# --- Users -----------------------------------------------------------------------


@router.get("/users", response_model=list[ManagedUser], tags=["users"])
def list_users(_admin: AdminUser, db: DbSession) -> list[ManagedUser]:
    return users.list_users(db)


@router.post("/users", response_model=ManagedUser, status_code=201, tags=["users"])
def create_user(body: NewUserInput, admin: AdminUser, db: DbSession) -> ManagedUser:
    return users.create_user(db, admin, body)


@router.patch("/users/{user_id}", response_model=ManagedUser, tags=["users"])
def update_user(user_id: int, body: UpdateUserInput, admin: AdminUser, db: DbSession) -> ManagedUser:
    return users.update_user(db, admin, user_id, body)


@router.post("/users/{user_id}/password", status_code=204, tags=["users"])
def reset_password(user_id: int, body: PasswordInput, admin: AdminUser, db: DbSession) -> Response:
    users.reset_password(db, admin, user_id, body.password)
    return Response(status_code=204)


@router.post("/users/{user_id}/active", response_model=ManagedUser, tags=["users"])
def set_active(user_id: int, body: ActiveInput, admin: AdminUser, db: DbSession) -> ManagedUser:
    return users.set_active(db, admin, user_id, body.active)


@router.delete("/users/{user_id}", status_code=204, tags=["users"])
def delete_user(user_id: int, admin: AdminUser, db: DbSession) -> Response:
    users.delete_user(db, admin, user_id)
    return Response(status_code=204)


# --- Activity ----------------------------------------------------------------------


@router.get("/activity", response_model=AuditPage, tags=["activity"])
def activity(_admin: AdminUser, db: DbSession, page: Annotated[int, Query(ge=1, le=100_000)] = 1) -> AuditPage:
    items, total = library.activity(db, page, ACTIVITY_PAGE_SIZE)
    return AuditPage(items=items, total=total, page=page, page_size=ACTIVITY_PAGE_SIZE)
