"""Who may do what: anonymous visitors see nothing, members read, admins change."""

from __future__ import annotations

import pytest

from helpers import category_id, error_of, song_id

READ_ENDPOINTS = ["/api/songs", "/api/songs/1", "/api/categories", "/api/stats", "/api/files/1", "/api/export/songs"]
ADMIN_READ_ENDPOINTS = [
    "/api/users",
    "/api/activity",
    "/api/songs/1/history",
    "/api/songs/location-check?categoryId=1&binderNumber=1",
]


@pytest.mark.parametrize("path", READ_ENDPOINTS + ADMIN_READ_ENDPOINTS)
def test_anonymous_visitors_must_sign_in(anonymous, path):
    response = anonymous.get(path)
    assert response.status_code == 401
    assert error_of(response) == {"message": "errors.sessionExpired"}


@pytest.mark.parametrize("path", ADMIN_READ_ENDPOINTS)
def test_members_cannot_open_admin_data(member, path):
    response = member.get(path)
    assert response.status_code == 403
    assert error_of(response) == {"message": "errors.forbidden"}


def test_members_cannot_change_anything(app, member, sample_songs):
    song = song_id(app, 125)
    category = category_id(app, "NL")
    attempts = [
        member.post("/api/songs", json={"categoryId": category, "binderNumber": 1, "pageNumber": 50, "title": "X"}),
        member.put(
            f"/api/songs/{song}", json={"categoryId": category, "binderNumber": 1, "pageNumber": 50, "title": "X"}
        ),
        member.delete(f"/api/songs/{song}"),
        member.put(f"/api/songs/{song}/files", json={"pdf": {"remove": True}}),
        member.post(
            "/api/uploads", data={"fileType": "pdf"}, files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")}
        ),
        member.post("/api/categories", json={"name": "Mới", "code": "MO", "binderCount": 1}),
        member.put(f"/api/categories/{category}", json={"name": "Nhập lễ", "code": "NL", "binderCount": 9}),
        member.delete(f"/api/categories/{category}"),
        member.post(f"/api/categories/{category}/move", json={"direction": 1}),
        member.post(
            "/api/users", json={"displayName": "X", "email": "x@x.test", "role": "admin", "password": "12345678"}
        ),
    ]
    assert [response.status_code for response in attempts] == [403] * len(attempts)
    assert member.get(f"/api/songs/{song}").json()["title"] == "Xin Dâng Lời Cảm Tạ"


def test_changes_without_the_app_header_are_refused(app, admin):
    """A form on another website cannot make an admin's browser change data (CSRF)."""
    response = admin.post(
        "/api/songs",
        json={"categoryId": category_id(app, "NL"), "binderNumber": 1, "pageNumber": 1, "title": "X"},
        headers={"X-Requested-With": ""},
    )
    assert response.status_code == 403
    response = admin.post("/api/auth/logout", headers={"X-Requested-With": "other"})
    assert response.status_code == 403
    assert admin.get("/api/stats").status_code == 200


def test_oversized_requests_are_refused(admin):
    response = admin.post(
        "/api/categories", content=b"x" * (1024 * 1024 + 1), headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413


def test_security_headers(admin):
    response = admin.get("/api/stats")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "SAMEORIGIN"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
