"""Physical location of a song: {category code}-{binder}.{page}, e.g. NL-1.01.

Stored as three fields (category, binder number, page number); the code is only
ever generated for display.
"""

import re
from dataclasses import dataclass


def format_page(page: int) -> str:
    """Pages have at least two digits: 1 -> "01", 12 -> "12", 105 -> "105"."""
    return f"{page:02d}"


def format_location(code: str, binder: int, page: int) -> str:
    return f"{code}-{binder}.{format_page(page)}"


def song_label(code: str, binder: int, page: int, title: str) -> str:
    """How a song is named in the change history: "DL-1.03 · Xin Dâng Lời Cảm Tạ"."""
    return f"{format_location(code, binder, page)} · {title}"


# A location typed in the search box, already lower-case and accent-free:
# "nl-1.01", "nl 1.01", "nl1.1" (one song), "ps-3" / "ps 3" (a binder), "kl" (a category).
_LOCATION_QUERY = re.compile(r"([a-z]{1,6}) ?-? ?(?:([0-9]{1,2})(?: ?\. ?([0-9]{0,3}))?)?")


@dataclass(frozen=True)
class LocationQuery:
    code_key: str
    binder: int | None
    page: int | None


def parse_location_query(folded_query: str) -> LocationQuery | None:
    match = _LOCATION_QUERY.fullmatch(folded_query)
    if not match:
        return None
    code, binder, page = match.groups()
    return LocationQuery(
        code_key=code,
        binder=int(binder) if binder else None,
        page=int(page) if page else None,
    )
