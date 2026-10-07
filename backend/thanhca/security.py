"""Passwords, session tokens and sign-in rate limiting."""

from __future__ import annotations

import contextlib
import hashlib
import secrets
import threading
import time
from collections import defaultdict, deque

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

# Argon2id with the library's recommended settings. Tests replace it with a cheaper one.
hasher = PasswordHasher()
_dummy_hash: str | None = None

SESSION_COOKIE = "thanhca_session"
PASSWORD_MIN = 8
PASSWORD_MAX = 72


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """Constant work whether or not the account exists, so response times do not reveal emails."""
    global _dummy_hash
    if password_hash is None:
        if _dummy_hash is None:
            _dummy_hash = hasher.hash("not-a-real-password")
        with contextlib.suppress(VerifyMismatchError, VerificationError, InvalidHashError):
            hasher.verify(_dummy_hash, password)
        return False
    try:
        return hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class LoginLimiter:
    """Slows down password guessing: too many failed sign-ins from one address, or for one
    account from one address, are refused for a while. Kept in memory, per server process."""

    def __init__(self, window_seconds: int = 15 * 60, per_account: int = 10, per_address: int = 40):
        self.window = window_seconds
        self.per_account = per_account
        self.per_address = per_address
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> int:
        failures = self._failures.get(key)
        if not failures:
            return 0
        while failures and failures[0] <= now - self.window:
            failures.popleft()
        if not failures:
            del self._failures[key]
            return 0
        return len(failures)

    def allowed(self, address: str, email: str) -> bool:
        now = time.monotonic()
        with self._lock:
            return (
                self._recent(f"address:{address}", now) < self.per_address
                and self._recent(f"account:{email}|{address}", now) < self.per_account
            )

    def failed(self, address: str, email: str) -> None:
        now = time.monotonic()
        with self._lock:
            self._failures[f"address:{address}"].append(now)
            self._failures[f"account:{email}|{address}"].append(now)

    def succeeded(self, address: str, email: str) -> None:
        with self._lock:
            self._failures.pop(f"account:{email}|{address}", None)
