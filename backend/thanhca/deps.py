"""Request dependencies: database session, file storage, the signed-in user and permission checks."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .errors import AppError
from .models import User, UserSession, utcnow
from .security import SESSION_COOKIE, token_hash
from .storage import Storage

# Seen-at and expiry are refreshed at most this often (not on every request).
_TOUCH_INTERVAL = timedelta(hours=1)


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Iterator[Session]:
    with request.app.state.db.session() as session:
        yield session


def get_storage(request: Request) -> Storage:
    return request.app.state.storage


SettingsDep = Annotated[Settings, Depends(get_settings)]
DbSession = Annotated[Session, Depends(get_db)]
StorageDep = Annotated[Storage, Depends(get_storage)]


def find_session(db: Session, token: str | None, settings: Settings) -> UserSession | None:
    """The valid session for a cookie value: not expired, and its user is still active."""
    if not token or len(token) > 200:
        return None
    now = utcnow()
    session = db.scalar(select(UserSession).join(UserSession.user).where(UserSession.token_hash == token_hash(token)))
    if session is None or session.expires_at <= now or not session.user.is_active:
        return None
    if now - session.last_seen_at > _TOUCH_INTERVAL:
        # Sliding expiry: people who use the app regularly stay signed in.
        session.last_seen_at = now
        session.expires_at = now + timedelta(days=settings.session_days)
        db.commit()
    return session


def optional_user(request: Request, db: DbSession, settings: SettingsDep) -> User | None:
    if not hasattr(request.state, "user"):
        session = find_session(db, request.cookies.get(SESSION_COOKIE), settings)
        request.state.session = session
        request.state.user = session.user if session else None
    return request.state.user


def require_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise AppError(401, "errors.sessionExpired")
    return user


def require_admin(user: Annotated[User, Depends(require_user)]) -> User:
    if not user.is_admin:
        raise AppError(403, "errors.forbidden")
    return user


OptionalUser = Annotated[User | None, Depends(optional_user)]
CurrentUser = Annotated[User, Depends(require_user)]
AdminUser = Annotated[User, Depends(require_admin)]
