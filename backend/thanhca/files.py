"""Rules for uploaded sheet-music files (the web app checks the same limits before uploading)."""

from __future__ import annotations

import re
import secrets
import unicodedata

PDF_MIME_TYPE = "application/pdf"
IMAGE_MIME_TYPES = ("image/jpeg", "image/png", "image/webp")
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", PDF_MIME_TYPE: "pdf"}

# Phones downsize large photos before uploading; these limits leave plenty of room.
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_PDF_BYTES = 25 * 1024 * 1024
# Upper bound for a whole upload request (file plus form fields).
MAX_UPLOAD_REQUEST_BYTES = MAX_PDF_BYTES + 1024 * 1024

STORAGE_KEY = re.compile(r"songs/[0-9a-f]{32}\.(?:jpg|png|webp|pdf)")


def max_bytes(file_type: str) -> int:
    return MAX_PDF_BYTES if file_type == "pdf" else MAX_IMAGE_BYTES


def sniff_mime_type(head: bytes) -> str | None:
    """The real type of a file from its first bytes; the name and the browser's claim are not trusted."""
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    # PDF readers accept the header anywhere in the first kilobyte.
    if b"%PDF-" in head[:1024]:
        return PDF_MIME_TYPE
    return None


def new_storage_key(mime_type: str) -> str:
    return f"songs/{secrets.token_hex(16)}.{EXTENSIONS[mime_type]}"


def clean_file_name(name: str | None, fallback: str) -> str:
    """The name shown to people (and used for downloads): no folders, no control characters."""
    name = unicodedata.normalize("NFC", name or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(char for char in name if unicodedata.category(char)[0] != "C").strip(" .")
    return name[:255] or fallback


def format_megabytes(size: int) -> str:
    return f"{size // (1024 * 1024)} MB"
