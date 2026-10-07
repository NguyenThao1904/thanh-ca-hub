"""User management by admins, and the activity log."""

from __future__ import annotations

import pytest

from thanhca.errors import AppError
from thanhca.models import User
from thanhca.schemas import UpdateUserInput
from thanhca.services import users

from helpers import PASSWORD, error_of, make_user, new_client


def user_id(admin, email: str) -> int:
    return next(user["id"] for user in admin.get("/api/users").json() if user["email"] == email)


def me(admin) -> int:
    return admin.get("/api/session").json()["user"]["id"]


def test_create_a_member_who_can_then_sign_in(app, admin):
    response = admin.post(
        "/api/users",
        json={
            "displayName": " Bình  Trần ",
            "email": " Binh@Choir.test ",
            "role": "member",
            "password": "temporary-pass",
        },
    )
    assert response.status_code == 201
    created = response.json()
    assert (created["displayName"], created["email"], created["role"], created["isActive"]) == (
        "Bình Trần",
        "binh@choir.test",
        "member",
        True,
    )
    assert created["lastSignInAt"] is None

    login = new_client(app).post("/api/auth/login", json={"email": "binh@choir.test", "password": "temporary-pass"})
    assert login.status_code == 200
    assert login.json()["isAdmin"] is False


def test_new_user_validation(admin):
    response = admin.post("/api/users", json={"displayName": "", "email": "not-an-email", "password": "short"})
    assert error_of(response)["fieldErrors"] == {
        "displayName": "errors.required",
        "email": "errors.emailInvalid",
        "password": "errors.passwordTooShort",
    }
    long = admin.post("/api/users", json={"displayName": "A", "email": "a@b.test", "password": "x" * 73})
    assert error_of(long)["fieldErrors"] == {"password": "errors.passwordTooLong"}
    duplicate = admin.post(
        "/api/users", json={"displayName": "A", "email": "ADMIN@choir.test", "role": "member", "password": PASSWORD}
    )
    assert duplicate.status_code == 409
    assert error_of(duplicate)["fieldErrors"] == {"email": "errors.emailExists"}


def test_list_users_for_admins_with_last_sign_in(app, admin):
    make_user(app, "zoe@choir.test", name="Zoe")
    users = admin.get("/api/users").json()
    assert [user["displayName"] for user in users] == ["Anna Admin", "Zoe"]
    assert users[0]["lastSignInAt"] is not None


def test_change_name_and_role_with_history(app, admin):
    make_user(app, "binh@choir.test", name="Bình")
    target = user_id(admin, "binh@choir.test")
    response = admin.patch(f"/api/users/{target}", json={"displayName": "Bình Trần", "role": "admin"})
    assert response.json()["role"] == "admin"
    entry = admin.get("/api/activity").json()["items"][0]
    assert entry["action"] == "user.updated"
    assert entry["actorName"] == "Anna Admin"
    assert entry["details"] == {"changes": {"display_name": ["Bình", "Bình Trần"], "role": ["member", "admin"]}}


def test_admins_cannot_demote_deactivate_or_delete_themselves(admin):
    own = me(admin)
    assert error_of(admin.patch(f"/api/users/{own}", json={"displayName": "Anna", "role": "member"})) == {
        "message": "errors.notYourself"
    }
    assert admin.post(f"/api/users/{own}/active", json={"active": False}).status_code == 409
    assert admin.delete(f"/api/users/{own}").status_code == 409
    # Renaming yourself is fine.
    assert admin.patch(f"/api/users/{own}", json={"displayName": "Anna A.", "role": "admin"}).status_code == 200


def test_admins_can_deactivate_each_other(app, admin):
    make_user(app, "second@choir.test", role="admin")
    second = new_client(app)
    second.post("/api/auth/login", json={"email": "second@choir.test", "password": PASSWORD})
    assert second.post(f"/api/users/{me(admin)}/active", json={"active": False}).status_code == 200
    assert admin.get("/api/stats").status_code == 401  # signed out at once
    assert second.post(f"/api/users/{me(second)}/active", json={"active": False}).status_code == 409


def test_the_last_active_admin_cannot_be_removed(app, admin):
    """The API never allows it (admins cannot act on themselves); the rule also protects other callers."""
    target = me(admin)
    member = make_user(app, "m@choir.test")
    with app.state.db.session() as db:
        actor = db.get(User, member.id)
        attempts = [
            lambda: users.delete_user(db, actor, target),
            lambda: users.set_active(db, actor, target, False),
            lambda: users.update_user(db, actor, target, UpdateUserInput(display_name="Anna", role="member")),
        ]
        for attempt in attempts:
            with pytest.raises(AppError) as error:
                attempt()
            assert error.value.message == "errors.lastAdmin"


def test_deactivating_signs_the_person_out_and_blocks_sign_in(app, admin, member):
    target = user_id(admin, "member@choir.test")
    response = admin.post(f"/api/users/{target}/active", json={"active": False})
    assert response.json()["isActive"] is False
    assert member.get("/api/stats").status_code == 401
    login = new_client(app).post("/api/auth/login", json={"email": "member@choir.test", "password": PASSWORD})
    assert error_of(login) == {"message": "login.inactive"}

    admin.post(f"/api/users/{target}/active", json={"active": True})
    assert member.post("/api/auth/login", json={"email": "member@choir.test", "password": PASSWORD}).status_code == 200
    actions = [entry["action"] for entry in admin.get("/api/activity").json()["items"]]
    assert actions[:2] == ["user.activated", "user.deactivated"]


def test_reset_password_signs_the_person_out(app, admin, member):
    target = user_id(admin, "member@choir.test")
    assert admin.post(f"/api/users/{target}/password", json={"password": "brand new pass"}).status_code == 204
    assert member.get("/api/stats").status_code == 401
    assert (
        new_client(app)
        .post("/api/auth/login", json={"email": "member@choir.test", "password": "brand new pass"})
        .status_code
        == 200
    )
    short = admin.post(f"/api/users/{target}/password", json={"password": "1234"})
    assert error_of(short)["fieldErrors"] == {"password": "errors.passwordTooShort"}


def test_deleted_users_keep_their_name_in_the_history(app, admin):
    make_user(app, "second@choir.test", role="admin", name="Second Admin")
    second = new_client(app)
    second.post("/api/auth/login", json={"email": "second@choir.test", "password": PASSWORD})
    category = second.post("/api/categories", json={"name": "Tạm", "code": "TM", "binderCount": 1}).json()
    song = second.post(
        "/api/songs", json={"categoryId": category["id"], "binderNumber": 1, "pageNumber": 1, "title": "Bài Mới"}
    ).json()
    assert admin.delete(f"/api/users/{user_id(admin, 'second@choir.test')}").status_code == 204

    detail = admin.get(f"/api/songs/{song['id']}").json()
    assert detail["createdByName"] is None
    names = {entry["actorName"] for entry in admin.get("/api/activity").json()["items"]}
    assert "Second Admin" in names


def test_activity_is_paginated_and_links_only_existing_songs(app, admin):
    category = admin.post("/api/categories", json={"name": "Tạm", "code": "TM", "binderCount": 1}).json()
    for page in range(1, 56):
        admin.post(
            "/api/songs",
            json={"categoryId": category["id"], "binderNumber": 1, "pageNumber": page, "title": f"Bài {page}"},
        )
    first = admin.get("/api/activity").json()
    # 55 songs, the category, and the admin account created for the test.
    assert (first["total"], first["pageSize"], len(first["items"])) == (57, 50, 50)
    assert first["items"][0]["summary"] == "TM-1.55 · Bài 55"
    assert first["items"][0]["songExists"] is True
    second = admin.get("/api/activity", params={"page": 2}).json()
    assert len(second["items"]) == 7
    assert [entry["action"] for entry in second["items"][-2:]] == ["category.created", "user.created"]
