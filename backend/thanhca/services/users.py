"""Accounts: sign-in sessions and user management by admins.

There is no self-registration: admins create accounts and reset passwords.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import audit
from ..errors import AppError, not_found
from ..models import User, UserSession, utcnow
from ..schemas import ManagedUser, NewUserInput, UpdateUserInput
from ..security import hash_password, needs_rehash, new_session_token, token_hash, verify_password


def start_session(db: Session, user: User, *, days: int, user_agent: str | None) -> tuple[str, UserSession]:
    token = new_session_token()
    now = utcnow()
    session = UserSession(
        token_hash=token_hash(token),
        user_id=user.id,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(days=days),
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(session)
    user.last_sign_in_at = now
    db.commit()
    return token, session


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if not verify_password(user.password_hash if user else None, password):
        return None
    assert user is not None
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        db.commit()
    return user


def end_session(db: Session, token: str | None) -> None:
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == token_hash(token)))
        db.commit()


def purge_expired_sessions(db: Session) -> int:
    result = db.execute(delete(UserSession).where(UserSession.expires_at < utcnow()))
    db.commit()
    return result.rowcount or 0


def change_own_password(db: Session, user: User, current: str, new: str, keep_session: UserSession | None) -> None:
    if not verify_password(user.password_hash, current):
        raise AppError(400, "errors.wrongPassword", field_errors={"currentPassword": "errors.wrongPassword"})
    user.password_hash = hash_password(new)
    # Sign out every other device (a lost phone stays signed in otherwise).
    other_sessions = delete(UserSession).where(UserSession.user_id == user.id)
    if keep_session is not None:
        other_sessions = other_sessions.where(UserSession.id != keep_session.id)
    db.execute(other_sessions)
    db.commit()


# --- Administration -----------------------------------------------------------------


def _managed(user: User) -> ManagedUser:
    return ManagedUser.model_validate(user)


def list_users(db: Session) -> list[ManagedUser]:
    users = db.scalars(select(User)).all()
    return [_managed(user) for user in sorted(users, key=lambda user: (user.display_name.casefold(), user.id))]


def _label(user: User) -> str:
    return f"{user.display_name} ({user.email})"


def _target(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise not_found()
    return user


def _other_active_admins(db: Session, user_id: int) -> int:
    return (
        db.scalar(select(func.count(User.id)).where(User.role == "admin", User.is_active.is_(True), User.id != user_id))
        or 0
    )


def _guard_last_admin(db: Session, target: User) -> None:
    if target.role == "admin" and target.is_active and _other_active_admins(db, target.id) == 0:
        raise AppError(409, "errors.lastAdmin")


def create_user(db: Session, actor: User | None, values: NewUserInput) -> ManagedUser:
    if db.scalar(select(User.id).where(User.email == values.email)) is not None:
        raise AppError(409, "errors.emailExists", field_errors={"email": "errors.emailExists"})
    user = User(
        email=values.email,
        password_hash=hash_password(values.password),
        display_name=values.display_name,
        role=values.role,
        is_active=True,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise AppError(409, "errors.emailExists", field_errors={"email": "errors.emailExists"}) from error
    audit.record(db, actor, "user.created", "user", user.id, summary=_label(user), details={"role": user.role})
    db.commit()
    return _managed(user)


def update_user(db: Session, actor: User, user_id: int, values: UpdateUserInput) -> ManagedUser:
    user = _target(db, user_id)
    if values.role != user.role:
        if user.id == actor.id:
            raise AppError(409, "errors.notYourself")
        _guard_last_admin(db, user)
    before = {"display_name": user.display_name, "role": user.role}
    user.display_name, user.role = values.display_name, values.role
    changed = audit.changes(before, {"display_name": user.display_name, "role": user.role})
    if changed:
        audit.record(db, actor, "user.updated", "user", user.id, summary=_label(user), details={"changes": changed})
    db.commit()
    return _managed(user)


def reset_password(db: Session, actor: User, user_id: int, password: str) -> None:
    user = _target(db, user_id)
    user.password_hash = hash_password(password)
    # Existing sessions end: whoever knew the old password is signed out.
    if user.id != actor.id:
        db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    audit.record(db, actor, "user.password_reset", "user", user.id, summary=_label(user))
    db.commit()


def set_active(db: Session, actor: User, user_id: int, active: bool) -> ManagedUser:
    if user_id == actor.id:
        raise AppError(409, "errors.notYourself")
    user = _target(db, user_id)
    if user.is_active == active:
        return _managed(user)
    if not active:
        _guard_last_admin(db, user)
        # Signed out everywhere at once.
        db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    user.is_active = active
    audit.record(db, actor, "user.activated" if active else "user.deactivated", "user", user.id, summary=_label(user))
    db.commit()
    return _managed(user)


def delete_user(db: Session, actor: User, user_id: int) -> None:
    if user_id == actor.id:
        raise AppError(409, "errors.notYourself")
    user = _target(db, user_id)
    _guard_last_admin(db, user)
    # Their past changes stay in the history (with their name), and songs keep their dates.
    audit.record(db, actor, "user.deleted", "user", user.id, summary=_label(user))
    db.delete(user)
    db.commit()


def ensure_admin(db: Session, email: str, password: str | None, display_name: str | None) -> tuple[User, bool]:
    """Creates an active admin, or promotes and re-activates an existing account. Used by the CLI."""
    email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    created = user is None
    if user is None:
        if not password:
            raise ValueError("A password is needed to create a new account.")
        user = User(
            email=email,
            password_hash=hash_password(password),
            display_name=display_name or email.split("@")[0],
            role="admin",
            is_active=True,
        )
        db.add(user)
        db.flush()
        audit.record(db, None, "user.created", "user", user.id, summary=_label(user), details={"role": "admin"})
    else:
        before = {"display_name": user.display_name, "role": user.role}
        user.role, user.is_active = "admin", True
        if display_name:
            user.display_name = display_name
        changed = audit.changes(before, {"display_name": user.display_name, "role": user.role})
        if changed:
            audit.record(db, None, "user.updated", "user", user.id, summary=_label(user), details={"changes": changed})
        if password:
            user.password_hash = hash_password(password)
            audit.record(db, None, "user.password_reset", "user", user.id, summary=_label(user))
    db.commit()
    return user, created
