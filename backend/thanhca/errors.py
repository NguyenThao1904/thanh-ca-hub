"""Errors returned by the API.

Every error has the same JSON shape, and messages are translation keys that the
web app shows in the member's language:

    {"error": {"message": "errors.duplicateNumber", "params": {"number": 125},
               "fieldErrors": {"songNumber": "errors.duplicateNumber"}, "href": "/songs/12"}}
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic.alias_generators import to_camel
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("thanhca")


class AppError(Exception):
    def __init__(
        self,
        status: int,
        message: str,
        *,
        params: dict[str, Any] | None = None,
        field_errors: dict[str, str] | None = None,
        href: str | None = None,
    ):
        super().__init__(message)
        self.status = status
        self.message = message
        self.params = params
        self.field_errors = field_errors
        self.href = href

    def body(self) -> dict[str, Any]:
        error: dict[str, Any] = {"message": self.message}
        if self.params:
            error["params"] = self.params
        if self.field_errors:
            error["fieldErrors"] = self.field_errors
        if self.href:
            error["href"] = self.href
        return {"error": error}


def not_found() -> AppError:
    return AppError(404, "errors.notFound")


def error_response(status: int, message: str, **extra: Any) -> JSONResponse:
    return JSONResponse(AppError(status, message, **extra).body(), status_code=status)


def _field_errors(exc: RequestValidationError) -> dict[str, str]:
    """First message per field. Validators raise errors whose type is a translation key."""
    result: dict[str, str] = {}
    for error in exc.errors():
        location = [str(part) for part in error.get("loc", ()) if part not in ("body", "query")]
        # Field names as the web app knows them (camelCase), also for fields that were missing.
        field = to_camel(location[0]) if location else "form"
        message = error.get("type", "")
        if field not in result:
            result[field] = message if message.startswith("errors.") else "errors.invalidInput"
    return result


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(exc.body(), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        # A malformed id in the URL (/api/songs/abc) simply does not exist.
        if any(error.get("loc", ("",))[0] == "path" for error in exc.errors()):
            return error_response(404, "errors.notFound")
        return error_response(422, "errors.invalidInput", field_errors=_field_errors(exc))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        messages = {401: "errors.sessionExpired", 403: "errors.forbidden", 404: "errors.notFound"}
        return error_response(exc.status_code, messages.get(exc.status_code, "errors.unknown"))

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Details stay in the server log; people see a friendly message.
        logger.exception("Unexpected error on %s %s", request.method, request.url.path, exc_info=exc)
        return error_response(500, "errors.unknown")
