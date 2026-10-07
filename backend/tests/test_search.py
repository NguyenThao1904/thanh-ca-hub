"""Library search: browsing in shelf order, text and number queries, physical locations."""

from __future__ import annotations

import pytest

from helpers import category_id


@pytest.fixture(autouse=True)
def _songs(sample_songs: int) -> None:
    assert sample_songs == 36


def search(client, **params) -> tuple[list[dict], int]:
    response = client.get("/api/songs", params={"pageSize": 100, **params})
    assert response.status_code == 200, response.text
    body = response.json()
    return body["items"], body["total"]


def locations(items: list[dict]) -> list[str]:
    return [item["location"] for item in items]


def titles(items: list[dict]) -> list[str]:
    return [item["title"] for item in items]


# --- Browsing ---------------------------------------------------------------------


def test_lists_the_library_in_shelf_order_with_numeric_binder_and_page_sorting(member):
    items, total = search(member)
    assert total == 36
    assert len(items) == 36
    assert locations(items)[:10] == [
        "NL-1.01",
        "NL-1.02",
        "NL-1.03",
        "NL-1.10",
        "NL-1.11",
        "ĐC-1.01",
        "ĐC-1.02",
        "ĐC-1.10",
        "ĐC-2.01",
        "ĐC-3.12",
    ]


def test_list_items_carry_what_the_table_shows(member):
    items, _ = search(member, q="125")
    song = items[0]
    assert song["songNumber"] == 125
    assert song["categoryName"] == "Dâng lễ"
    assert song["categoryCode"] == "DL"
    assert song["location"] == "DL-1.03"
    assert song["hasPdf"] is False
    assert song["imageCount"] == 0
    assert song["createdAt"].endswith("Z")


def test_filters_by_category_and_binder(app, member):
    dc = category_id(app, "ĐC")
    items, _ = search(member, category=dc)
    assert locations(items) == ["ĐC-1.01", "ĐC-1.02", "ĐC-1.10", "ĐC-2.01", "ĐC-3.12", "ĐC-5.18"]
    items, _ = search(member, category=dc, binder=1)
    assert locations(items) == ["ĐC-1.01", "ĐC-1.02", "ĐC-1.10"]


def test_ignores_unknown_categories_and_binders_a_category_does_not_have(app, member):
    _, total = search(member, category=999_999)
    assert total == 36
    items, _ = search(member, category=category_id(app, "NL"), binder=7)
    assert len(items) == 5


def test_paginates_and_always_reports_the_total(member):
    items, total = search(member, pageSize=10, page=4)
    assert total == 36
    assert len(items) == 6
    assert items[0]["location"] == "PS-1.01"
    items, total = search(member, pageSize=10, page=9)
    assert items == [] and total == 36


def test_sorts_by_song_number_title_and_dates(member):
    items, _ = search(member, sort="number_asc", pageSize=3)
    assert [item["songNumber"] for item in items] == [12, 101, 102]
    items, _ = search(member, sort="number_desc", pageSize=2)
    assert [item["songNumber"] for item in items] == [1401, 1305]
    # Accent-insensitive: "Ánh Sáng..." sorts with "A", right after "Alleluia".
    items, _ = search(member, sort="title_asc", pageSize=3)
    assert titles(items) == ["Alleluia Mừng Chúa Phục Sinh", "Ánh Sáng Phục Sinh", "Bình An Của Chúa"]
    items, _ = search(member, sort="title_desc", pageSize=1)
    assert titles(items) == ["Xin Thương Xót Chúng Con"]
    items, _ = search(member, sort="created_desc", pageSize=1)
    assert titles(items) == ["Xin Thánh Hiến Đời Con"]
    items, _ = search(member, sort="updated_desc", pageSize=2)
    assert titles(items) == ["Xin Thánh Hiến Đời Con", "Sáng Ngày Thứ Nhất"]


def test_songs_without_a_number_sort_last(app, admin):
    admin.post(
        "/api/songs",
        json={"categoryId": category_id(app, "AT"), "binderNumber": 1, "pageNumber": 9, "title": "Không Số"},
    )
    items, _ = search(admin, sort="number_asc")
    assert items[-1]["title"] == "Không Số"
    items, _ = search(admin, sort="number_desc")
    assert items[-1]["title"] == "Không Số"


def test_rejects_an_unknown_sort(member):
    assert member.get("/api/songs", params={"sort": "random"}).status_code == 422


# --- Text and number queries ----------------------------------------------------------


def test_shows_the_exact_song_number_first(member):
    items, _ = search(member, q="125")
    assert len(items) == 1
    assert items[0]["songNumber"] == 125
    assert items[0]["title"] == "Xin Dâng Lời Cảm Tạ"


def test_matches_song_number_prefixes(member):
    items, _ = search(member, q="12")
    assert items[0]["songNumber"] == 12
    assert sorted(item["songNumber"] for item in items) == [12, 120, 125, 1201, 1202]


def test_matches_words_in_title_and_opening_lyrics_with_or_without_accents(member):
    accented, _ = search(member, q="dâng lời")
    plain, _ = search(member, q="dang loi")
    assert accented[0]["title"] == "Xin Dâng Lời Cảm Tạ"
    assert plain[0]["title"] == "Xin Dâng Lời Cảm Tạ"
    assert set(titles(plain)) == set(titles(accented))
    assert {"Lời Kinh Chiều", "Kính Nhớ Tổ Tiên", "Tạ Ơn Cuối Lễ"} <= set(titles(accented))


def test_finds_duc_me_songs_from_duc_me(member):
    items, _ = search(member, q="duc me")
    assert items[0]["title"] == "Đức Mẹ Hằng Cứu Giúp"
    assert {item["categoryCode"] for item in items} == {"MA"}
    assert len(items) == 3


def test_finds_composers_by_part_of_their_name_and_prefers_exact_accents(member):
    items, _ = search(member, q="Nguyễn")
    assert all("Nguyễn" in (item["composer"] or "") for item in items[:8])
    # "Ca Nguyện" songs also match accent-insensitively, but rank below.
    assert all(item["categoryCode"] == "CN" for item in items[8:])
    assert len(items) > 8


def test_is_case_insensitive_and_ignores_extra_spaces(member):
    items, _ = search(member, q="   CHÚA   LÀ  mục ")
    assert items[0]["title"] == "Chúa Là Mục Tử"


def test_treats_decomposed_unicode_like_precomposed(member):
    import unicodedata

    items, _ = search(member, q=unicodedata.normalize("NFD", "Mục Tử"))
    assert items[0]["title"] == "Chúa Là Mục Tử"


def test_treats_like_wildcards_literally(member):
    assert search(member, q="%") == ([], 0)
    assert search(member, q="_") == ([], 0)
    assert search(member, q="\\") == ([], 0)


def test_returns_nothing_for_unknown_words(member):
    assert search(member, q="xyzabc") == ([], 0)


def test_combines_a_query_with_the_category_filter(app, member):
    items, _ = search(member, q="alleluia", category=category_id(app, "PS"))
    assert titles(items) == ["Alleluia Mừng Chúa Phục Sinh", "Chúa Đã Sống Lại"]


def test_long_queries_are_shortened_not_rejected(member):
    response = member.get("/api/songs", params={"q": "chúa " * 60})
    assert response.status_code == 200


# --- Physical locations ---------------------------------------------------------------


@pytest.mark.parametrize("query", ["NL-1.01", "nl-1.01", "NL-1.1", "nl 1.01", "NL1.01", "NL - 1 . 01"])
def test_finds_the_exact_song_for_a_full_location_code(member, query):
    items, _ = search(member, q=query)
    assert locations(items) == ["NL-1.01"]


def test_lists_a_whole_binder(member):
    items, _ = search(member, q="NL-1")
    assert locations(items) == ["NL-1.01", "NL-1.02", "NL-1.03", "NL-1.10", "NL-1.11"]
    items, _ = search(member, q="PS-3")
    assert locations(items) == ["PS-3.04"]


@pytest.mark.parametrize("query", ["dc-3", "ĐC-3", "đc 3", "DC-3.12"])
def test_matches_d_stroke_codes_typed_without_the_accent(member, query):
    items, _ = search(member, q=query)
    assert locations(items) == ["ĐC-3.12"]


def test_lists_a_category_from_its_code(member):
    items, _ = search(member, q="KL")
    assert locations(items) == ["KL-1.01", "KL-1.02"]


def test_returns_nothing_for_a_location_that_does_not_exist(member):
    assert search(member, q="NL-2.01") == ([], 0)
    assert search(member, q="NL-1.99") == ([], 0)
