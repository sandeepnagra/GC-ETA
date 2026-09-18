"""Polite, cached HTTP.

Why a cache: a full bulletin backfill is ~190 requests against a government
host that owes us nothing. Cached bodies make re-runs free and keep the
backfill a one-time cost.

Why a delay: PLAN.md section 8 commits to not over-fetching. adoption.state.gov
serves no robots.txt, and absence of a directive is not permission.
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import requests

CACHE_DIR = Path(__file__).resolve().parents[1] / "cache"

USER_AGENT = (
    "GC-ETA/0.1 (open-source visa bulletin research; "
    "https://github.com/sandeepnagra/GC-ETA)"
)

DEFAULT_DELAY_SECONDS = 1.0


@dataclass(frozen=True)
class Fetched:
    """A retrieved document plus the provenance the backtest needs.

    `fetched_at` is when we retrieved it, which is *not* the same as when the
    publisher released it. PLAN.md section 10 requires publication date, not
    snapshot date, for leakage-free backtests; for bulletins the governing
    month is the closest proxy we have and is recorded separately.
    """

    url: str
    body: bytes
    fetched_at: str
    sha256: str
    from_cache: bool

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")


def _cache_path(url: str) -> Path:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]
    return CACHE_DIR / f"{digest}.bin"


class Fetcher:
    def __init__(self, delay: float = DEFAULT_DELAY_SECONDS, use_cache: bool = True):
        self.delay = delay
        self.use_cache = use_cache
        self._last_request = 0.0
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": USER_AGENT})
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def get(self, url: str, *, allow_404: bool = False) -> Fetched | None:
        """Return the document, or None on 404 when `allow_404` is set.

        A 404 is expected and meaningful: a bulletin for a future month simply
        does not exist yet, and the backfill uses that to find the archive edge.
        """
        path = _cache_path(url)
        if self.use_cache and path.exists():
            body = path.read_bytes()
            return Fetched(
                url=url,
                body=body,
                fetched_at=datetime.fromtimestamp(
                    path.stat().st_mtime, tz=timezone.utc
                ).isoformat(),
                sha256=hashlib.sha256(body).hexdigest(),
                from_cache=True,
            )

        elapsed = time.monotonic() - self._last_request
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last_request = time.monotonic()

        response = self._session.get(url, timeout=30)
        if response.status_code == 404 and allow_404:
            return None
        response.raise_for_status()

        body = response.content
        if self.use_cache:
            path.write_bytes(body)
        return Fetched(
            url=url,
            body=body,
            fetched_at=datetime.now(timezone.utc).isoformat(),
            sha256=hashlib.sha256(body).hexdigest(),
            from_cache=False,
        )
