"""Signing in and out, sessions, and each person's own settings."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

from thanhca.models import User, UserSession, utcnow
from thanhca.security import SESSION_COOKIE

from helpers import PASSWORD, error_of, make_user, new_client


def login(client, email: str, password: str = PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_session_without_sign_in_returns_the_app_settings(anonymous):
    body = anonymous.get("/api/session").json()
    assert body == {
        "config": {"appName": "Thánh Ca Hub", "defaultLocale": "vi", "timeZone": "Asia/Ho_Chi_Minh"},
        "user": None,
    }


def test_sign_in_sets_an_http_only_cookie_and_returns_the_user(app, anonymous):
    make_user(app, "anna@choir.test", role="admin", name="Anna")
    response = login(anonymous, "  ANNA@choir.test ")
    assert response.status_code == 200
    assert response.json() == {
        "id": response.json()["id"],
        "email": "anna@choir.test",
        "displayName": "Anna",
        "role": "admin",
        "isAdmin": True,
    }
    cookie = response.headers["set-cookie"]
    assert f"{SESSION_COOKIE}=" in cookie
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Max-Age=2592000" in cookie

    session = anonymous.get("/api/session").json()
    assert session["user"]["email"] == "anna@choir.test"
    with app.state.db.session() as db:
        user = db.scalar(select(User).where(User.email == "anna@choir.test"))
        assert user.last_sign_in_at is not None
        # Only a hash of the token is stored.
        stored = db.scalar(select(UserSession.token_hash))
        assert stored != anonymous.cookies[SESSION_COOKIE] and len(stored) == 64


def test_wrong_password_and_unknown_email_get_the_same_answer(app, anonymous):
    make_user(app, "anna@choir.test")
    wrong = login(anonymous, "anna@choir.test", "wrong password")
    unknown = login(anonymous, "nobody@choir.test")
    empty = login(anonymous, "", "")
    for response in (wrong, unknown, empty):
        assert response.status_code == 401
        assert error_of(response) == {"message": "login.invalid"}
    assert SESSION_COOKIE not in anonymous.cookies


def test_inactive_accounts_cannot_sign_in(app, anonymous):
    make_user(app, "old@choir.test", active=False)
    response = login(anonymous, "old@choir.test")
    assert response.status_code == 403
    assert error_of(response) == {"message": "login.inactive"}


def test_too_many_failed_attempts_are_slowed_down(app, anonymous):
    make_user(app, "anna@choir.test")
    for _ in range(10):
        assert login(anonymous, "anna@choir.test", "guess").status_code == 401
    blocked = login(anonymous, "anna@choir.test")
    assert blocked.status_code == 429
    assert error_of(blocked) == {"message": "login.tooManyAttempts"}


def test_sign_out_ends_the_session_on_the_server(member):
    token = member.cookies[SESSION_COOKIE]
    assert member.post("/api/auth/logout").status_code == 204
    assert member.get("/api/session").json()["user"] is None
    # The old cookie no longer works, even if someone kept a copy.
    other = new_client(member.app)
    other.cookies.set(SESSION_COOKIE, token)
    assert other.get("/api/stats").status_code == 401


def test_expired_sessions_are_refused_and_recent_ones_slide(app, member):
    with app.state.db.session() as db:
        session = db.scalar(select(UserSession))
        session.last_seen_at = utcnow() - timedelta(days=2)
        db.commit()
    assert member.get("/api/stats").status_code == 200
    with app.state.db.session() as db:
        session = db.scalar(select(UserSession))
        assert session.expires_at > utcnow() + timedelta(days=29)
        session.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert member.get("/api/stats").status_code == 401


def test_change_display_name(member):
    response = member.patch("/api/me", json={"displayName": "  Minh   Trần "})
    assert response.json()["displayName"] == "Minh Trần"
    assert error_of(member.patch("/api/me", json={"displayName": " "}))["fieldErrors"] == {
        "displayName": "errors.required"
    }


def test_change_password_checks_the_current_one_and_signs_out_other_devices(app, member):
    phone = new_client(app)
    assert login(phone, "member@choir.test").status_code == 200

    wrong = member.post(
        "/api/me/password",
        json={"currentPassword": "nope", "newPassword": "a new password", "confirmPassword": "a new password"},
    )
    assert error_of(wrong)["fieldErrors"] == {"currentPassword": "errors.wrongPassword"}

    mismatch = member.post(
        "/api/me/password",
        json={"currentPassword": PASSWORD, "newPassword": "a new password", "confirmPassword": "another"},
    )
    assert error_of(mismatch)["fieldErrors"] == {"confirmPassword": "errors.passwordsDontMatch"}

    short = member.post(
        "/api/me/password", json={"currentPassword": PASSWORD, "newPassword": "short", "confirmPassword": "short"}
    )
    assert error_of(short)["fieldErrors"] == {"newPassword": "errors.passwordTooShort"}

    ok = member.post(
        "/api/me/password",
        json={"currentPassword": PASSWORD, "newPassword": "a new password", "confirmPassword": "a new password"},
    )
    assert ok.status_code == 204
    assert member.get("/api/stats").status_code == 200
    assert phone.get("/api/stats").status_code == 401
    assert login(new_client(app), "member@choir.test", "a new password").status_code == 200
