"""The web server: the JSON API under /api, and the built web app for every other path."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import Settings
from .db import Database, run_migrations
from .errors import error_response, install_error_handlers, not_found
from .files import MAX_UPLOAD_REQUEST_BYTES
from .routers import admin, auth, songs
from .security import LoginLimiter
from .services import songs as song_service
from .services import users as user_service
from .storage import create_storage

logger = logging.getLogger("thanhca")

# Requests that change data must carry this header. Browsers only let pages of this
# site add it (other sites would need CORS, which is not enabled): protection against CSRF.
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "thanhca"
MAX_JSON_BODY_BYTES = 1024 * 1024


class _BodyTooLarge(Exception):
    pass


class GuardMiddleware:
    """Security headers on every response; CSRF check and size limit for requests that change data."""

    def __init__(self, app: ASGIApp, content_security_policy: str):
        self.app = app
        self.csp = content_security_policy

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope["path"]
        unsafe = scope["method"] not in ("GET", "HEAD", "OPTIONS")
        if unsafe and path.startswith("/api/"):
            headers = Headers(scope=scope)
            if headers.get(CSRF_HEADER) != CSRF_VALUE:
                await error_response(403, "errors.forbidden")(scope, receive, send)
                return
            limit = MAX_UPLOAD_REQUEST_BYTES if path == "/api/uploads" else MAX_JSON_BODY_BYTES
            length = headers.get("content-length")
            if length and length.isdigit() and int(length) > limit:
                await error_response(413, "errors.fileTooLarge", params={"name": "", "size": "25 MB"})(
                    scope, receive, send
                )
                return
            receive = _limited(receive, limit)

        started = False

        async def send_with_headers(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
                headers.setdefault("X-Frame-Options", "SAMEORIGIN")
                headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()")
                if headers.get("content-type", "").startswith("text/html"):
                    headers.setdefault("Content-Security-Policy", self.csp)
                if path.startswith("/assets/"):
                    # Built files have a content hash in their name: cache them for a year.
                    headers["Cache-Control"] = "public, max-age=31536000, immutable"
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        except _BodyTooLarge:
            if not started:
                await error_response(413, "errors.fileTooLarge", params={"name": "", "size": "25 MB"})(
                    scope, receive, send
                )


def _limited(receive: Receive, limit: int) -> Receive:
    received = 0

    async def wrapped() -> Message:
        nonlocal received
        message = await receive()
        if message["type"] == "http.request":
            received += len(message.get("body", b""))
            if received > limit:
                raise _BodyTooLarge
        return message

    return wrapped


def _content_security_policy(external_origin: str | None) -> str:
    files = f" {external_origin}" if external_origin else ""
    return "; ".join(
        [
            "default-src 'self'",
            "script-src 'self'",
            # The image viewer and toasts set inline styles.
            "style-src 'self' 'unsafe-inline'",
            f"img-src 'self' blob: data:{files}",
            "font-src 'self' data:",
            "connect-src 'self'",
            # PDF preview.
            f"frame-src 'self'{files}",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
            "manifest-src 'self'",
        ]
    )


def _mount_web_app(app: FastAPI, dist: Path) -> None:
    index = dist / "index.html"
    root = dist.resolve()

    if not index.is_file():

        @app.get("/", include_in_schema=False)
        def web_app_missing() -> HTMLResponse:
            return HTMLResponse(
                "<!doctype html><meta charset=utf-8><title>Thánh Ca Hub API</title>"
                "<p>The API is running. The web app has not been built yet: run <code>npm run build</code> "
                "in the <code>frontend</code> folder, or open the development server at "
                "<a href='http://localhost:5173'>http://localhost:5173</a>.</p>"
                "<p>API documentation: <a href='/api/docs'>/api/docs</a></p>"
            )

        return

    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    # HEAD too: uptime monitors and some proxies check pages that way.
    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def web_app(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise not_found()
        if path:
            candidate = (root / path).resolve()
            if candidate.is_file() and root in candidate.parents:
                return FileResponse(candidate)
        # Every other path is a page of the web app (it has its own router).
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    logging.basicConfig(level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    database = Database(settings.sqlalchemy_url)
    storage = create_storage(settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        if settings.auto_migrate:
            run_migrations(database.engine)
        try:
            with database.session() as session:
                user_service.purge_expired_sessions(session)
                song_service.purge_stale_uploads(session, storage)
        except Exception:
            logger.exception("The database is not ready. Run `thanhca migrate` (or set AUTO_MIGRATE=true).")
        logger.info(
            "Thánh Ca Hub is ready (database: %s, files: %s)",
            database.engine.url.get_backend_name(),
            settings.storage_backend,
        )
        yield
        database.dispose()

    app = FastAPI(
        title="Thánh Ca Hub API",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.db = database
    app.state.storage = storage
    app.state.login_limiter = LoginLimiter()

    install_error_handlers(app)
    app.include_router(auth.router)
    app.include_router(songs.router)
    app.include_router(admin.router)
    _mount_web_app(app, settings.frontend_dist)

    app.add_middleware(GuardMiddleware, content_security_policy=_content_security_policy(storage.external_origin))
    return app
