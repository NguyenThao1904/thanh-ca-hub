"""Adding, editing and deleting songs; validation messages; the location check."""

from __future__ import annotations

import unicodedata

import pytest

from helpers import category_id, error_of, song_id


def song(app, **overrides) -> dict:
    values = {
        "categoryId": category_id(app, "DL"),
        "binderNumber": 1,
        "pageNumber": 3,
        "songNumber": 125,
        "title": "Xin Dâng Lời Cảm Tạ",
        "composer": "Nguyễn Văn A",
        "firstSentence": "Xin dâng lời cảm tạ hồng ân Thiên Chúa",
        "notes": "",
    }
    return {**values, **overrides}


def test_admin_adds_a_song_and_everyone_can_read_it(app, admin, member):
    response = admin.post("/api/songs", json=song(app))
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["location"] == "DL-1.03"
    assert created["category"] == {"id": category_id(app, "DL"), "name": "Dâng lễ", "code": "DL", "binderCount": 2}
    assert created["notes"] is None
    assert created["createdByName"] == "Anna Admin"
    assert created["pdf"] is None and created["images"] == []

    detail = member.get(f"/api/songs/{created['id']}")
    assert detail.status_code == 200
    assert detail.json()["title"] == "Xin Dâng Lời Cảm Tạ"


def test_cleans_text_and_stores_precomposed_vietnamese(app, admin):
    response = admin.post(
        "/api/songs",
        json=song(
            app,
            title=unicodedata.normalize("NFD", "  Đức   Mẹ  "),
            composer="   ",
            notes="  Dòng 1\r\nDòng 2  ",
            songNumber=None,
        ),
    )
    created = response.json()
    assert created["title"] == unicodedata.normalize("NFC", "Đức Mẹ")
    assert created["composer"] is None
    assert created["notes"] == "Dòng 1\nDòng 2"
    assert created["songNumber"] is None


def test_requires_title_category_binder_and_page(admin):
    response = admin.post("/api/songs", json={"title": "   "})
    assert response.status_code == 422
    assert error_of(response) == {
        "message": "errors.invalidInput",
        "fieldErrors": {
            "categoryId": "errors.categoryRequired",
            "binderNumber": "errors.binderRequired",
            "pageNumber": "errors.pageRequired",
            "title": "errors.titleRequired",
        },
    }


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("pageNumber", 0, "errors.pageRange"),
        ("pageNumber", 1000, "errors.pageRange"),
        ("pageNumber", "12a", "errors.pageRange"),
        ("songNumber", 0, "errors.songNumberInvalid"),
        ("songNumber", 1_000_000, "errors.songNumberInvalid"),
        ("songNumber", "abc", "errors.songNumberInvalid"),
        ("binderNumber", 51, "errors.binderRequired"),
        ("title", "x" * 201, "errors.tooLong"),
        ("firstSentence", "x" * 501, "errors.tooLong"),
        ("notes", "x" * 2001, "errors.tooLong"),
    ],
)
def test_rejects_values_out_of_range(app, admin, field, value, message):
    response = admin.post("/api/songs", json=song(app, **{field: value}))
    assert response.status_code == 422
    assert error_of(response)["fieldErrors"] == {field: message}


def test_accepts_numbers_sent_as_text(app, admin):
    response = admin.post("/api/songs", json=song(app, pageNumber="7", songNumber="900"))
    assert response.status_code == 201
    assert response.json()["location"] == "DL-1.07"


def test_rejects_a_binder_the_category_does_not_have(app, admin):
    response = admin.post("/api/songs", json=song(app, categoryId=category_id(app, "NL"), binderNumber=2))
    assert response.status_code == 422
    assert error_of(response) == {
        "message": "errors.binderOutOfRange",
        "params": {"category": "Nhập lễ", "count": 1, "binder": 2},
        "fieldErrors": {"binderNumber": "errors.binderOutOfRange"},
    }


def test_rejects_an_unknown_category(app, admin):
    response = admin.post("/api/songs", json=song(app, categoryId=999_999))
    assert error_of(response)["fieldErrors"] == {"categoryId": "errors.categoryRequired"}


def test_duplicate_song_number(app, admin, sample_songs):
    response = admin.post("/api/songs", json=song(app, pageNumber=40))
    assert response.status_code == 409
    error = error_of(response)
    assert error["message"] == "errors.duplicateNumber"
    assert error["params"]["number"] == 125
    assert error["fieldErrors"] == {"songNumber": "errors.duplicateNumber"}
    assert error["href"] == f"/songs/{song_id(app, 125)}"


def test_duplicate_location(app, admin, sample_songs):
    response = admin.post("/api/songs", json=song(app, songNumber=None))
    assert response.status_code == 409
    error = error_of(response)
    assert error["message"] == "errors.duplicateLocation"
    assert error["params"]["location"] == "DL-1.03"
    assert error["fieldErrors"] == {"pageNumber": "errors.duplicateLocation"}
    assert error["href"] == f"/songs/{song_id(app, 125)}"


def test_reports_both_duplicates_at_once(app, admin, sample_songs):
    error = error_of(admin.post("/api/songs", json=song(app)))
    assert error["fieldErrors"] == {"pageNumber": "errors.duplicateLocation", "songNumber": "errors.duplicateNumber"}


def test_many_songs_may_have_no_number(app, admin):
    for page in (1, 2, 3):
        assert admin.post("/api/songs", json=song(app, pageNumber=page, songNumber=None)).status_code == 201


def test_edit_keeps_its_own_location_and_number(app, admin):
    created = admin.post("/api/songs", json=song(app)).json()
    response = admin.put(f"/api/songs/{created['id']}", json=song(app, title="Xin Dâng Lời Cảm Tạ (bản mới)"))
    assert response.status_code == 200
    assert response.json()["title"] == "Xin Dâng Lời Cảm Tạ (bản mới)"


def test_edit_can_move_a_song_and_records_what_changed(app, admin):
    created = admin.post("/api/songs", json=song(app)).json()
    moved = admin.put(
        f"/api/songs/{created['id']}",
        json=song(app, categoryId=category_id(app, "PS"), binderNumber=4, pageNumber=12, composer=None),
    ).json()
    assert moved["location"] == "PS-4.12"
    history = admin.get(f"/api/songs/{created['id']}/history").json()
    assert [entry["action"] for entry in history] == ["song.updated", "song.created"]
    assert history[0]["details"]["changes"] == {
        "location": ["DL-1.03", "PS-4.12"],
        "composer": ["Nguyễn Văn A", None],
    }
    assert history[0]["actorName"] == "Anna Admin"
    assert history[0]["summary"] == "PS-4.12 · Xin Dâng Lời Cảm Tạ"


def test_saving_without_changes_does_not_touch_the_song(app, admin):
    created = admin.post("/api/songs", json=song(app)).json()
    again = admin.put(f"/api/songs/{created['id']}", json=song(app)).json()
    assert again["updatedAt"] == created["updatedAt"]
    assert len(admin.get(f"/api/songs/{created['id']}/history").json()) == 1


def test_edit_rejects_another_songs_location(app, admin, sample_songs):
    created = admin.post("/api/songs", json=song(app, pageNumber=30, songNumber=None)).json()
    response = admin.put(f"/api/songs/{created['id']}", json=song(app, pageNumber=1, songNumber=None))
    assert error_of(response)["params"]["location"] == "DL-1.01"


def test_delete_removes_the_song_and_keeps_the_history(app, admin):
    created = admin.post("/api/songs", json=song(app)).json()
    assert admin.delete(f"/api/songs/{created['id']}").status_code == 204
    assert admin.get(f"/api/songs/{created['id']}").status_code == 404
    assert admin.delete(f"/api/songs/{created['id']}").status_code == 404
    entries = admin.get("/api/activity").json()["items"]
    assert entries[0]["action"] == "song.deleted"
    assert entries[0]["summary"] == "DL-1.03 · Xin Dâng Lời Cảm Tạ"
    assert entries[0]["details"] == {"location": "DL-1.03", "title": "Xin Dâng Lời Cảm Tạ", "song_number": 125}
    assert entries[0]["songExists"] is False


def test_ids_of_deleted_songs_are_never_reused(app, admin):
    """Old links and history entries must never point to a different song."""
    first = admin.post("/api/songs", json=song(app)).json()
    admin.delete(f"/api/songs/{first['id']}")
    second = admin.post("/api/songs", json=song(app)).json()
    assert second["id"] > first["id"]
    assert len(admin.get(f"/api/songs/{second['id']}/history").json()) == 1


def test_unknown_or_malformed_song_ids_are_not_found(member):
    assert error_of(member.get("/api/songs/999999")) == {"message": "errors.notFound"}
    assert member.get("/api/songs/abc").status_code == 404


def test_location_check_reports_the_owner_and_the_next_free_page(app, admin, sample_songs):
    nl = category_id(app, "NL")
    taken = admin.get("/api/songs/location-check", params={"categoryId": nl, "binderNumber": 1, "pageNumber": 2}).json()
    assert taken == {"takenBy": {"id": song_id(app, 102), "title": "Hãy Đến Đây Ca Mừng"}, "nextFreePage": 12}

    free = admin.get("/api/songs/location-check", params={"categoryId": nl, "binderNumber": 1, "pageNumber": 4}).json()
    assert free == {"takenBy": None, "nextFreePage": 12}

    own = admin.get(
        "/api/songs/location-check",
        params={"categoryId": nl, "binderNumber": 1, "pageNumber": 2, "excludeSongId": song_id(app, 102)},
    ).json()
    assert own["takenBy"] is None

    empty = admin.get(
        "/api/songs/location-check", params={"categoryId": category_id(app, "ĐC"), "binderNumber": 4}
    ).json()
    assert empty == {"takenBy": None, "nextFreePage": 1}


def test_dashboard_statistics(admin, sample_songs):
    assert admin.get("/api/stats").json() == {
        "totalSongs": 36,
        "totalCategories": 14,
        "songsWithPdf": 0,
        "songsWithoutPdf": 36,
        "songsWithImages": 0,
    }
