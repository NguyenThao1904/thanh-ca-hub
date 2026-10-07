"""Request and response bodies (JSON uses camelCase).

Input validators raise errors whose type is a translation key (errors.titleRequired,
errors.pageRange, ...), so the web app can show the message next to the right field.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, ValidationInfo, field_validator
from pydantic.alias_generators import to_camel
from pydantic_core import PydanticCustomError

from .models import MAX_BINDERS, MAX_PAGE, MAX_SONG_NUMBER
from .security import PASSWORD_MAX, PASSWORD_MIN
from .text import clean_line, clean_text, nfc

MAX_IMAGES_PER_SONG = 40
SORT_OPTIONS = (
    "relevance",
    "location",
    "number_asc",
    "number_desc",
    "title_asc",
    "title_desc",
    "created_desc",
    "updated_desc",
)
SortOption = Literal[
    "relevance", "location", "number_asc", "number_desc", "title_asc", "title_desc", "created_desc", "updated_desc"
]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class InputModel(ApiModel):
    # Missing fields still go through their validator, which reports "required".
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, validate_default=True, extra="ignore")


def _error(key: str) -> PydanticCustomError:
    return PydanticCustomError(key, key)


def _whole_number(low: int, high: int, required: str, invalid: str | None = None, optional: bool = False):
    def validate(value: Any) -> int | None:
        if value is None or (isinstance(value, str) and not value.strip()):
            if optional:
                return None
            raise _error(required)
        if isinstance(value, str) and value.strip().isascii() and value.strip().isdigit():
            value = int(value.strip())
        elif isinstance(value, float) and value.is_integer():
            value = int(value)
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise _error(invalid or required)
        return value

    return BeforeValidator(validate)


def _line(max_length: int, required: str | None = None):
    """A single line of text: NFC, single spaces, trimmed. Empty optional text becomes null."""

    def validate(value: Any) -> str | None:
        if value is None:
            value = ""
        if not isinstance(value, str):
            raise _error("errors.invalidInput")
        value = clean_line(value)
        if not value:
            if required:
                raise _error(required)
            return None
        if len(value) > max_length:
            raise _error("errors.tooLong")
        return value

    return BeforeValidator(validate)


def _multiline(max_length: int):
    def validate(value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise _error("errors.invalidInput")
        value = clean_text(value)
        if len(value) > max_length:
            raise _error("errors.tooLong")
        return value or None

    return BeforeValidator(validate)


def _password(value: Any) -> str:
    if not isinstance(value, str) or len(value) < PASSWORD_MIN:
        raise _error("errors.passwordTooShort")
    if len(value) > PASSWORD_MAX:
        raise _error("errors.passwordTooLong")
    return value


_EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


def clean_email(value: Any) -> str:
    """Lower-case, trimmed email address; raises errors.emailInvalid for anything else."""
    if not isinstance(value, str):
        raise _error("errors.emailInvalid")
    value = nfc(value).strip().lower()
    if len(value) > 254 or not _EMAIL.fullmatch(value):
        raise _error("errors.emailInvalid")
    return value


def _role(value: Any) -> str:
    if value not in ("admin", "member"):
        raise _error("errors.invalidInput")
    return value


_CATEGORY_CODE = re.compile(r"[A-ZĐĂÂÊÔƠƯ]{1,6}")


def _category_code(value: Any) -> str:
    """Capital letters only, Vietnamese included: "đc" -> "ĐC"."""
    if not isinstance(value, str):
        raise _error("errors.codeFormat")
    value = re.sub(r"\s+", "", nfc(value)).upper()
    if not _CATEGORY_CODE.fullmatch(value):
        raise _error("errors.codeFormat")
    return value


Password = Annotated[str, BeforeValidator(_password)]
DisplayName = Annotated[str, _line(100, "errors.required")]


# --- Sessions ------------------------------------------------------------------


class LoginInput(ApiModel):
    email: str = ""
    password: str = ""


class UserOut(ApiModel):
    id: int
    email: str
    display_name: str
    role: str
    is_admin: bool


class AppConfig(ApiModel):
    app_name: str
    default_locale: str
    time_zone: str


class SessionOut(ApiModel):
    config: AppConfig
    user: UserOut | None


class DisplayNameInput(InputModel):
    display_name: DisplayName = None


def _present(value: Any) -> str:
    # Passwords are not cleaned like text; only checked for presence.
    if isinstance(value, str) and value:
        return value
    raise _error("errors.required")


class ChangePasswordInput(InputModel):
    current_password: Annotated[str, BeforeValidator(_present)] = None
    new_password: Password = None
    confirm_password: str | None = None

    @field_validator("confirm_password")
    @classmethod
    def _matches(cls, value: str | None, info: ValidationInfo) -> str | None:
        new_password = info.data.get("new_password")
        if new_password is not None and value != new_password:
            raise _error("errors.passwordsDontMatch")
        return value


# --- Categories ------------------------------------------------------------------


class CategoryInput(InputModel):
    name: Annotated[str, _line(60, "errors.required")] = None
    code: Annotated[str, BeforeValidator(_category_code)] = None
    binder_count: Annotated[int, _whole_number(1, MAX_BINDERS, "errors.binderCount")] = None


class CategoryOut(ApiModel):
    id: int
    name: str
    code: str
    binder_count: int
    sort_order: int
    song_count: int
    max_binder_used: int | None


class MoveInput(ApiModel):
    direction: Literal[-1, 1]


# --- Songs -------------------------------------------------------------------------


class SongInput(InputModel):
    category_id: Annotated[int, _whole_number(1, 2**62, "errors.categoryRequired")] = None
    binder_number: Annotated[int, _whole_number(1, MAX_BINDERS, "errors.binderRequired")] = None
    page_number: Annotated[int, _whole_number(1, MAX_PAGE, "errors.pageRequired", "errors.pageRange")] = None
    song_number: Annotated[int | None, _whole_number(1, MAX_SONG_NUMBER, "errors.songNumberInvalid", optional=True)] = (
        None
    )
    title: Annotated[str, _line(200, "errors.titleRequired")] = None
    composer: Annotated[str | None, _line(200)] = None
    first_sentence: Annotated[str | None, _line(500)] = None
    notes: Annotated[str | None, _multiline(2000)] = None


class SongListItem(ApiModel):
    id: int
    song_number: int | None
    title: str
    composer: str | None
    first_sentence: str | None
    category_id: int
    category_name: str
    category_code: str
    binder_number: int
    page_number: int
    location: str
    created_at: datetime
    updated_at: datetime
    has_pdf: bool
    image_count: int


class SongPage(ApiModel):
    items: list[SongListItem]
    total: int
    page: int
    page_size: int


class AttachmentOut(ApiModel):
    id: int
    file_type: Literal["pdf", "image"]
    file_name: str
    mime_type: str
    size_bytes: int
    display_order: int = Field(validation_alias="sort_order")
    created_at: datetime


class CategoryRef(ApiModel):
    id: int
    name: str
    code: str
    binder_count: int


class SongDetail(ApiModel):
    id: int
    song_number: int | None
    title: str
    composer: str | None
    first_sentence: str | None
    notes: str | None
    binder_number: int
    page_number: int
    location: str
    created_at: datetime
    updated_at: datetime
    created_by_name: str | None
    updated_by_name: str | None
    category: CategoryRef
    pdf: AttachmentOut | None
    images: list[AttachmentOut]


class LocationCheck(ApiModel):
    taken_by: dict[str, Any] | None
    next_free_page: int


class UploadOut(ApiModel):
    id: int
    file_type: str
    file_name: str
    mime_type: str
    size_bytes: int


class ImageRef(ApiModel):
    """An image to keep (id of an existing image) or to add (id of a finished upload)."""

    id: int | None = None
    upload_id: int | None = None


class PdfChange(ApiModel):
    remove: bool = False
    upload_id: int | None = None


class FileChanges(ApiModel):
    # The complete, ordered list of images; null leaves the images as they are.
    images: list[ImageRef] | None = Field(default=None, max_length=MAX_IMAGES_PER_SONG)
    remove_image_ids: list[int] = Field(default_factory=list, max_length=500)
    # null: unchanged; {"remove": true}; or {"uploadId": 12} to add or replace the PDF.
    pdf: PdfChange | None = None


# --- History, statistics, users -------------------------------------------------------


class AuditEntry(ApiModel):
    id: int
    created_at: datetime
    actor_name: str | None
    action: str
    entity_type: str
    song_id: int | None
    summary: str | None
    details: dict[str, Any]
    # The song still exists, so its name can link to it.
    song_exists: bool = False


class AuditPage(ApiModel):
    items: list[AuditEntry]
    total: int
    page: int
    page_size: int


class LibraryStats(ApiModel):
    total_songs: int
    total_categories: int
    songs_with_pdf: int
    songs_without_pdf: int
    songs_with_images: int


class ManagedUser(ApiModel):
    id: int
    email: str
    display_name: str
    role: str
    is_active: bool
    last_sign_in_at: datetime | None
    created_at: datetime


class NewUserInput(InputModel):
    display_name: DisplayName = None
    email: Annotated[str, BeforeValidator(clean_email)] = None
    role: Annotated[str, BeforeValidator(_role)] = "member"
    password: Password = None


class UpdateUserInput(InputModel):
    display_name: DisplayName = None
    role: Annotated[str, BeforeValidator(_role)] = None


class PasswordInput(InputModel):
    password: Password = None


class ActiveInput(ApiModel):
    active: bool
