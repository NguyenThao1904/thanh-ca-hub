"""Text clean-up and the accent-free form used for searching and sorting."""

import re
import unicodedata

_WHITESPACE = re.compile(r"\s+")
# Letters that are not "a letter plus an accent", so Unicode decomposition does not remove them.
_SPECIAL_LETTERS = str.maketrans({"đ": "d", "Đ": "D", "ð": "d", "Ð": "D"})


def nfc(value: str) -> str:
    """Precomposed Vietnamese: phones and some keyboards send "e" + combining accent instead of "ế"."""
    return unicodedata.normalize("NFC", value)


def clean_line(value: str) -> str:
    """NFC, single spaces, trimmed."""
    return _WHITESPACE.sub(" ", nfc(value)).strip()


def clean_text(value: str) -> str:
    """NFC, unified line endings, trimmed; keeps line breaks."""
    return nfc(value).replace("\r\n", "\n").replace("\r", "\n").strip()


def fold(value: str | None) -> str:
    """Lower-case and accent-free: "Đức Mẹ" -> "duc me". Used for accent-insensitive search and sorting."""
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFD", value.translate(_SPECIAL_LETTERS))
    stripped = "".join(char for char in decomposed if not unicodedata.combining(char))
    return unicodedata.normalize("NFC", stripped).lower()


def lower_exact(value: str | None) -> str:
    """Lower-case but keeping accents, to prefer exact-accent matches ("Nguyễn" over "Nguyện")."""
    return nfc(value).lower() if value else ""


def escape_like(value: str) -> str:
    """Treat % and _ typed by the user literally in a LIKE pattern (used with ESCAPE '\\')."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
