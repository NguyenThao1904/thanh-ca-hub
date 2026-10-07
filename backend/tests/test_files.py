"""Scanned pages and PDFs: upload, attach, order, replace, remove, and secure access."""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from thanhca.models import Attachment, utcnow

from helpers import error_of, signed_in, song_id

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 200
PDF = b"%PDF-1.7\n" + b"0" * 500


def upload(client, content: bytes, name: str, file_type: str, mime: str = "application/octet-stream"):
    return client.post("/api/uploads", data={"fileType": file_type}, files={"file": (name, content, mime)})


def uploaded(client, content: bytes, name: str, file_type: str) -> int:
    response = upload(client, content, name, file_type)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def files_dir(app) -> Path:
    return Path(app.state.settings.uploads_dir)


@pytest.fixture
def song(app, admin, sample_songs) -> int:
    return song_id(app, 125)


def test_upload_detects_the_real_type_and_keeps_a_clean_name(app, admin):
    response = upload(admin, PNG, "C:\\Users\\Anna\\Trang 1.PNG", "image", "image/jpeg")
    assert response.status_code == 201
    body = response.json()
    assert body["fileType"] == "image"
    assert body["mimeType"] == "image/png"
    assert body["fileName"] == "Trang 1.PNG"
    assert body["sizeBytes"] == len(PNG)
    assert len(list(files_dir(app).rglob("*.png"))) == 1


@pytest.mark.parametrize(
    ("content", "file_type", "message"),
    [
        (b"GIF89a" + b"\x00" * 50, "image", "errors.imageType"),
        (b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image", "errors.imageType"),
        (PDF, "image", "errors.imageType"),
        (JPEG, "pdf", "errors.pdfType"),
    ],
)
def test_upload_rejects_files_that_are_not_what_they_claim(admin, content, file_type, message):
    response = upload(admin, content, "x.jpg", file_type)
    assert response.status_code == 415
    assert error_of(response) == {"message": message, "params": {"name": "x.jpg"}}


def test_upload_rejects_large_files(admin):
    big = JPEG + b"\x00" * (20 * 1024 * 1024)
    response = upload(admin, big, "huge.jpg", "image")
    assert response.status_code == 413
    assert error_of(response)["message"] == "errors.fileTooLarge"


def test_attach_images_in_order_and_a_pdf(app, admin, member, song):
    first = uploaded(admin, JPEG, "page-1.jpg", "image")
    second = uploaded(admin, WEBP, "page-2.webp", "image")
    pdf = uploaded(admin, PDF, "Xin Dâng Lời Cảm Tạ.pdf", "pdf")

    response = admin.put(
        f"/api/songs/{song}/files",
        json={"images": [{"uploadId": second}, {"uploadId": first}], "pdf": {"uploadId": pdf}},
    )
    assert response.status_code == 200, response.text
    detail = response.json()
    assert [image["fileName"] for image in detail["images"]] == ["page-2.webp", "page-1.jpg"]
    assert detail["pdf"]["fileName"] == "Xin Dâng Lời Cảm Tạ.pdf"

    listed = member.get("/api/songs", params={"q": "125"}).json()["items"][0]
    assert listed["hasPdf"] is True and listed["imageCount"] == 2
    assert member.get("/api/stats").json()["songsWithPdf"] == 1

    history = [entry["action"] for entry in admin.get(f"/api/songs/{song}/history").json()]
    assert history.count("attachment.added") == 3


def test_members_open_files_inline_or_as_a_download(admin, member, song):
    pdf = uploaded(admin, PDF, "Xin Dâng Lời Cảm Tạ.pdf", "pdf")
    admin.put(f"/api/songs/{song}/files", json={"pdf": {"uploadId": pdf}})

    view = member.get(f"/api/files/{pdf}")
    assert view.status_code == 200
    assert view.content == PDF
    assert view.headers["content-type"] == "application/pdf"
    assert view.headers["content-disposition"].startswith("inline;")
    assert "private" in view.headers["cache-control"]
    assert view.headers["x-content-type-options"] == "nosniff"

    download = member.get(f"/api/files/{pdf}", params={"download": "1"})
    disposition = download.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert "filename*=utf-8''Xin%20D%C3%A2ng" in disposition


def test_unattached_uploads_are_private_to_their_admin(app, admin, member):
    pending = uploaded(admin, JPEG, "draft.jpg", "image")
    assert admin.get(f"/api/files/{pending}").status_code == 200
    assert member.get(f"/api/files/{pending}").status_code == 404


def test_reorder_and_remove_images(app, admin, song):
    ids = [uploaded(admin, JPEG, f"p{n}.jpg", "image") for n in (1, 2, 3)]
    admin.put(f"/api/songs/{song}/files", json={"images": [{"uploadId": i} for i in ids]})

    response = admin.put(
        f"/api/songs/{song}/files",
        json={"images": [{"id": ids[2]}, {"id": ids[0]}], "removeImageIds": [ids[1]]},
    )
    assert [image["id"] for image in response.json()["images"]] == [ids[2], ids[0]]
    assert len(list(files_dir(app).rglob("*.jpg"))) == 2
    assert admin.get(f"/api/files/{ids[1]}").status_code == 404


def test_replace_and_remove_the_pdf(app, admin, song):
    first = uploaded(admin, PDF, "old.pdf", "pdf")
    admin.put(f"/api/songs/{song}/files", json={"pdf": {"uploadId": first}})
    second = uploaded(admin, PDF + b"2", "new.pdf", "pdf")

    replaced = admin.put(f"/api/songs/{song}/files", json={"pdf": {"uploadId": second}}).json()
    assert replaced["pdf"]["fileName"] == "new.pdf"
    assert admin.get(f"/api/files/{first}").status_code == 404
    entry = admin.get(f"/api/songs/{song}/history").json()[0]
    assert entry["action"] == "attachment.replaced"
    assert entry["details"] == {"file_type": "pdf", "file_name": "new.pdf", "previous_file_name": "old.pdf"}

    removed = admin.put(f"/api/songs/{song}/files", json={"pdf": {"remove": True}}).json()
    assert removed["pdf"] is None
    assert list(files_dir(app).rglob("*.pdf")) == []


def test_an_upload_can_be_attached_only_once_and_only_by_its_admin(app, admin, song):
    second_admin = signed_in(app, "second@choir.test", role="admin")
    other_admin_upload = uploaded(second_admin, JPEG, "x.jpg", "image")
    response = admin.put(f"/api/songs/{song}/files", json={"images": [{"uploadId": other_admin_upload}]})
    assert response.status_code == 422

    mine = uploaded(admin, JPEG, "y.jpg", "image")
    assert admin.put(f"/api/songs/{song}/files", json={"images": [{"uploadId": mine}]}).status_code == 200
    other = song_id(app, 101)
    assert admin.put(f"/api/songs/{other}/files", json={"images": [{"uploadId": mine}]}).status_code == 422


def test_a_pdf_upload_cannot_be_used_as_an_image(admin, song):
    pdf = uploaded(admin, PDF, "a.pdf", "pdf")
    assert admin.put(f"/api/songs/{song}/files", json={"images": [{"uploadId": pdf}]}).status_code == 422


def test_deleting_a_song_deletes_its_files(app, admin, song):
    image = uploaded(admin, JPEG, "p.jpg", "image")
    pdf = uploaded(admin, PDF, "a.pdf", "pdf")
    admin.put(f"/api/songs/{song}/files", json={"images": [{"uploadId": image}], "pdf": {"uploadId": pdf}})
    assert admin.delete(f"/api/songs/{song}").status_code == 204
    assert [path for path in files_dir(app).rglob("*") if path.is_file()] == []
    with app.state.db.session() as db:
        assert db.scalars(select(Attachment)).all() == []


def test_unused_uploads_are_removed_after_a_day(app, admin):
    stale = uploaded(admin, JPEG, "forgotten.jpg", "image")
    with app.state.db.session() as db:
        db.get(Attachment, stale).created_at = utcnow() - timedelta(days=2)
        db.commit()
    uploaded(admin, JPEG, "fresh.jpg", "image")
    with app.state.db.session() as db:
        assert db.get(Attachment, stale) is None
    assert len(list(files_dir(app).rglob("*.jpg"))) == 1
