"""Categories: default data, codes, binder counts, order, and their rules."""

from __future__ import annotations

from helpers import category_id, error_of


def test_the_fourteen_default_categories(member):
    categories = member.get("/api/categories").json()
    assert [f"{c['code']}:{c['binderCount']}:{c['name']}" for c in categories] == [
        "NL:1:Nhập lễ",
        "ĐC:5:Đáp ca",
        "DL:2:Dâng lễ",
        "CT:3:Chư Thánh",
        "MA:2:Đức Mẹ",
        "AT:1:An Táng",
        "CN:5:Ca Nguyện",
        "DT:2:Dân Tộc",
        "GS:4:Giáng Sinh",
        "HP:1:Hôn Phối",
        "KC:2:Kính Chúa",
        "KL:1:Kết Lễ",
        "PS:5:Phục Sinh",
        "TH:1:Thánh Hiến",
    ]


def test_song_counts_and_highest_binder_in_use(member, sample_songs):
    by_code = {c["code"]: c for c in member.get("/api/categories").json()}
    assert (by_code["MA"]["songCount"], by_code["MA"]["maxBinderUsed"]) == (3, 2)
    assert (by_code["HP"]["songCount"], by_code["HP"]["maxBinderUsed"]) == (1, 1)


def test_add_a_category_with_a_vietnamese_code(admin):
    response = admin.post("/api/categories", json={"name": " Tạ  Ơn ", "code": " ơt ", "binderCount": "3"})
    assert response.status_code == 201
    created = response.json()
    assert (created["name"], created["code"], created["binderCount"], created["sortOrder"]) == ("Tạ Ơn", "ƠT", 3, 15)
    assert created["songCount"] == 0


def test_codes_and_names_are_unique_regardless_of_accents(admin):
    code = admin.post("/api/categories", json={"name": "Đối ca", "code": "DC", "binderCount": 1})
    assert code.status_code == 409
    assert error_of(code) == {
        "message": "errors.duplicateCategoryCode",
        "params": {"code": "DC"},
        "fieldErrors": {"code": "errors.duplicateCategoryCode"},
    }
    name = admin.post("/api/categories", json={"name": "nhap le", "code": "NX", "binderCount": 1})
    assert error_of(name)["fieldErrors"] == {"name": "errors.duplicateCategoryName"}


def test_validates_code_and_binder_count(admin):
    for code in ["N1", "N-L", "TOOLONG", "", "ÑA"]:
        response = admin.post("/api/categories", json={"name": f"Test {code}", "code": code, "binderCount": 1})
        assert error_of(response)["fieldErrors"] == {"code": "errors.codeFormat"}, code
    for count in [0, 51, "x"]:
        response = admin.post("/api/categories", json={"name": "Test", "code": "TE", "binderCount": count})
        assert error_of(response)["fieldErrors"] == {"binderCount": "errors.binderCount"}


def test_binders_cannot_drop_below_one_in_use_but_can_grow(app, admin, sample_songs):
    ps = category_id(app, "PS")
    response = admin.put(f"/api/categories/{ps}", json={"name": "Phục Sinh", "code": "PS", "binderCount": 4})
    assert response.status_code == 409
    assert error_of(response) == {
        "message": "errors.binderInUse",
        "params": {"binder": 5},
        "fieldErrors": {"binderCount": "errors.binderInUse"},
    }
    grown = admin.put(f"/api/categories/{ps}", json={"name": "Phục Sinh", "code": "PS", "binderCount": 6})
    assert grown.json()["binderCount"] == 6
    song = admin.post("/api/songs", json={"categoryId": ps, "binderNumber": 6, "pageNumber": 1, "title": "Mới"})
    assert song.json()["location"] == "PS-6.01"


def test_renaming_a_code_moves_every_location(app, admin, member, sample_songs):
    kl = category_id(app, "KL")
    admin.put(f"/api/categories/{kl}", json={"name": "Kết Lễ", "code": "KT", "binderCount": 1})
    items = member.get("/api/songs", params={"q": "KT"}).json()["items"]
    assert [item["location"] for item in items] == ["KT-1.01", "KT-1.02"]
    entry = admin.get("/api/activity").json()["items"][0]
    assert entry["action"] == "category.updated"
    assert entry["details"] == {"changes": {"code": ["KL", "KT"]}}


def test_only_empty_categories_can_be_deleted(app, admin, sample_songs):
    at = category_id(app, "AT")
    response = admin.delete(f"/api/categories/{at}")
    assert response.status_code == 409
    assert error_of(response) == {"message": "errors.categoryInUse"}

    created = admin.post("/api/categories", json={"name": "Tạm", "code": "TM", "binderCount": 1}).json()
    assert admin.delete(f"/api/categories/{created['id']}").status_code == 204
    assert admin.delete(f"/api/categories/{created['id']}").status_code == 404


def test_move_up_and_down_without_logging(app, admin):
    logged = admin.get("/api/activity").json()["total"]
    dc = category_id(app, "ĐC")
    admin.post(f"/api/categories/{dc}/move", json={"direction": -1})
    assert [c["code"] for c in admin.get("/api/categories").json()[:2]] == ["ĐC", "NL"]
    admin.post(f"/api/categories/{dc}/move", json={"direction": -1})  # already first
    admin.post(f"/api/categories/{dc}/move", json={"direction": 1})
    assert [c["code"] for c in admin.get("/api/categories").json()[:2]] == ["NL", "ĐC"]
    assert admin.get("/api/activity").json()["total"] == logged
    assert admin.post(f"/api/categories/{dc}/move", json={"direction": 2}).status_code == 422
