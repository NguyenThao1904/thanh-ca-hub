"""Helpers shared by the tests."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from thanhca.models import Category, Song, User
from thanhca.schemas import NewUserInput
from thanhca.services.users import create_user

PASSWORD = "correct horse 42"


def new_client(app) -> TestClient:
    return TestClient(app, headers={"X-Requested-With": "thanhca"})


def make_user(app, email: str, *, role: str = "member", name: str | None = None, active: bool = True) -> User:
    with app.state.db.session() as session:
        created = create_user(
            session,
            None,
            NewUserInput(display_name=name or email.split("@")[0].title(), email=email, role=role, password=PASSWORD),
        )
        user = session.get(User, created.id)
        if not active:
            user.is_active = False
            session.commit()
        return user


def signed_in(app, email: str, *, role: str = "member", name: str | None = None) -> TestClient:
    make_user(app, email, role=role, name=name)
    client = new_client(app)
    response = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return client


def category_id(app, code: str) -> int:
    with app.state.db.session() as session:
        return session.scalar(select(Category.id).where(Category.code == code))


def song_id(app, number: int) -> int:
    with app.state.db.session() as session:
        return session.scalar(select(Song.id).where(Song.song_number == number))


def error_of(response) -> dict:
    return response.json()["error"]
