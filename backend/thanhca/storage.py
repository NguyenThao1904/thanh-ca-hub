"""Where scanned pages and PDFs are kept.

- LocalStorage: a folder on the server's disk (data/files). Simple, good for a
  single server or a VM with a persistent disk. Files are streamed by the API
  after the permission check.
- S3Storage: any S3-compatible bucket (Amazon S3, Cloudflare R2, Google Cloud
  Storage with HMAC keys, MinIO, Supabase Storage). The bucket stays private;
  after the permission check the API redirects to a link that expires in an hour.
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
from collections.abc import Iterable
from pathlib import Path
from typing import BinaryIO, Protocol
from urllib.parse import quote, urlsplit

from fastapi.responses import FileResponse, RedirectResponse
from starlette.responses import Response

from .config import Settings
from .files import STORAGE_KEY

logger = logging.getLogger(__name__)

LINK_SECONDS = 60 * 60


class Storage(Protocol):
    def save(self, key: str, data: BinaryIO, content_type: str) -> None: ...

    def delete(self, keys: Iterable[str]) -> None: ...

    def exists(self, key: str) -> bool: ...

    def response(self, key: str, *, content_type: str, file_name: str, download: bool) -> Response: ...

    @property
    def external_origin(self) -> str | None:
        """Origin the browser loads files from, if not this server (for the Content Security Policy)."""
        ...


def _check_key(key: str) -> str:
    if not STORAGE_KEY.fullmatch(key):
        raise ValueError(f"Invalid storage key: {key!r}")
    return key


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self.root / _check_key(key)

    def save(self, key: str, data: BinaryIO, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Write to a temporary file first, so a failed upload never leaves half a file.
        handle, temporary = tempfile.mkstemp(dir=path.parent, prefix=".upload-")
        try:
            with os.fdopen(handle, "wb") as target:
                shutil.copyfileobj(data, target, length=1024 * 1024)
            os.replace(temporary, path)
        except BaseException:
            Path(temporary).unlink(missing_ok=True)
            raise

    def delete(self, keys: Iterable[str]) -> None:
        for key in keys:
            try:
                self._path(key).unlink(missing_ok=True)
            except (OSError, ValueError):
                # A leftover file is harmless; never fail the request because of it.
                logger.warning("Could not delete file %s", key, exc_info=True)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def response(self, key: str, *, content_type: str, file_name: str, download: bool) -> Response:
        path = self._path(key)
        if not path.is_file():
            return Response(status_code=404)
        return FileResponse(
            path,
            media_type=content_type,
            filename=file_name,
            content_disposition_type="attachment" if download else "inline",
            headers={"Cache-Control": "private, max-age=3600"},
        )

    @property
    def external_origin(self) -> str | None:
        return None


class S3Storage:
    def __init__(self, settings: Settings):
        import boto3
        from botocore.config import Config

        if not settings.s3_bucket:
            raise RuntimeError("STORAGE_BACKEND=s3 needs S3_BUCKET (and usually S3_ENDPOINT_URL and keys).")
        self.bucket = settings.s3_bucket
        self.prefix = settings.s3_prefix.strip("/") + "/" if settings.s3_prefix.strip("/") else ""
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            region_name=settings.s3_region or None,
            aws_access_key_id=settings.s3_access_key_id or None,
            aws_secret_access_key=settings.s3_secret_access_key or None,
            config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
        )
        self._origin: str | None = None

    def _object(self, key: str) -> str:
        return self.prefix + _check_key(key)

    def save(self, key: str, data: BinaryIO, content_type: str) -> None:
        self.client.upload_fileobj(data, self.bucket, self._object(key), ExtraArgs={"ContentType": content_type})

    def delete(self, keys: Iterable[str]) -> None:
        objects = [{"Key": self._object(key)} for key in keys]
        for start in range(0, len(objects), 1000):
            try:
                self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": objects[start : start + 1000]})
            except Exception:
                logger.warning("Could not delete files from the bucket", exc_info=True)

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=self._object(key))
            return True
        except Exception:
            return False

    def _link(self, key: str, *, content_type: str, file_name: str, download: bool) -> str:
        disposition = "attachment" if download else "inline"
        ascii_name = file_name.encode("ascii", "ignore").decode().replace('"', "") or "file"
        return self.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": self._object(key),
                "ResponseContentType": content_type,
                "ResponseContentDisposition": (
                    f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(file_name)}"
                ),
            },
            ExpiresIn=LINK_SECONDS,
        )

    def response(self, key: str, *, content_type: str, file_name: str, download: bool) -> Response:
        url = self._link(key, content_type=content_type, file_name=file_name, download=download)
        # The browser may reuse the redirect (and its cached copy of the file) until shortly before the link expires.
        return RedirectResponse(url, status_code=302, headers={"Cache-Control": "private, max-age=3000"})

    @property
    def external_origin(self) -> str | None:
        if self._origin is None:
            sample = self.client.generate_presigned_url(
                "get_object", Params={"Bucket": self.bucket, "Key": self.prefix + "songs/x"}, ExpiresIn=60
            )
            parts = urlsplit(sample)
            self._origin = f"{parts.scheme}://{parts.netloc}"
        return self._origin


def create_storage(settings: Settings) -> Storage:
    if settings.storage_backend == "s3":
        return S3Storage(settings)
    return LocalStorage(settings.uploads_dir)
