"""Signing in and out, and the signed-in person's own settings."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Request, Response

from ..deps import CurrentUser, DbSession, OptionalUser, SettingsDep
from ..errors import AppError
from ..schemas import AppConfig, ChangePasswordInput, DisplayNameInput, LoginInput, SessionOut, UserOut
from ..security import SESSION_COOKIE
from ..services import users

router = APIRouter(prefix="/api", tags=["session"])


def _secure(request: Request, settings: SettingsDep) -> bool:
    if settings.cookie_secure == "auto":
        return request.url.scheme == "https"
    return settings.cookie_secure == "true"


def _set_cookie(response: Response, request: Request, settings: SettingsDep, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(timedelta(days=settings.session_days).total_seconds()),
        httponly=True,
        secure=_secure(request, settings),
        samesite="lax",
        path="/",
    )


def _user_out(user) -> UserOut:
    return UserOut(id=user.id, email=user.email, display_name=user.display_name, role=user.role, is_admin=user.is_admin)


@router.get("/session", response_model=SessionOut)
def session(request: Request, response: Response, settings: SettingsDep, user: OptionalUser) -> SessionOut:
    """App settings and the signed-in person (or null). Called when the web app starts."""
    if user is not None:
        # Renew the cookie, so people who use the app regularly stay signed in.
        _set_cookie(response, request, settings, request.cookies[SESSION_COOKIE])
    response.headers["Cache-Control"] = "no-store"
    return SessionOut(
        config=AppConfig(
            app_name=settings.app_name, default_locale=settings.default_locale, time_zone=settings.time_zone
        ),
        user=_user_out(user) if user else None,
    )


@router.post("/auth/login", response_model=UserOut)
def login(body: LoginInput, request: Request, response: Response, db: DbSession, settings: SettingsDep) -> UserOut:
    limiter = request.app.state.login_limiter
    address = request.client.host if request.client else "unknown"
    email = body.email.strip().lower()
    if not limiter.allowed(address, email):
        raise AppError(429, "login.tooManyAttempts")
    if not email or not body.password:
        raise AppError(401, "login.invalid")

    user = users.authenticate(db, email, body.password)
    if user is None:
        limiter.failed(address, email)
        raise AppError(401, "login.invalid")
    limiter.succeeded(address, email)
    if not user.is_active:
        raise AppError(403, "login.inactive")

    token, _session = users.start_session(
        db, user, days=settings.session_days, user_agent=request.headers.get("user-agent")
    )
    _set_cookie(response, request, settings, token)
    return _user_out(user)


@router.post("/auth/logout", status_code=204)
def logout(request: Request, db: DbSession) -> Response:
    users.end_session(db, request.cookies.get(SESSION_COOKIE))
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.patch("/me", response_model=UserOut)
def update_me(body: DisplayNameInput, user: CurrentUser, db: DbSession) -> UserOut:
    user.display_name = body.display_name
    db.commit()
    return _user_out(user)


@router.post("/me/password", status_code=204)
def change_password(body: ChangePasswordInput, request: Request, user: CurrentUser, db: DbSession) -> Response:
    users.change_own_password(db, user, body.current_password, body.new_password, request.state.session)
    return Response(status_code=204)
