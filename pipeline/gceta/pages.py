"""Bulletin pages committed to the repository.

Why these exist: since Nov 2026 adoption.state.gov redirects every bulletin
URL, past ones included, to travel.state.gov's 404 page, and travel.state.gov
sits behind a Cloudflare bot check that refuses the pipeline. There is no
longer a source the daily job can fetch a bulletin from, so a bulletin that is
not already in the fetch cache has to be brought in by a person (see
import_bulletin.py) and committed here, where CI and every checkout can read it.

A committed page wins over the fetch cache and the network: it is the copy a
person looked at and chose. `sources.json` records where each page came from,
because a page recovered from the Wayback Machine or saved from a browser does
not carry its own provenance the way a fetched URL does.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

PAGES_DIR = Path(__file__).resolve().parents[2] / "data" / "bulletin-pages"
SOURCES = PAGES_DIR / "sources.json"


def page_path(ym: str) -> Path:
    return PAGES_DIR / f"{ym}.html"


def load_sources() -> dict[str, dict]:
    if not SOURCES.exists():
        return {}
    return json.loads(SOURCES.read_text())


def read_page(ym: str) -> tuple[str, dict] | None:
    """Return (html, provenance) for a committed month, or None."""
    path = page_path(ym)
    if not path.exists():
        return None
    body = path.read_bytes()
    meta = dict(load_sources().get(ym, {}))
    meta["sha256"] = hashlib.sha256(body).hexdigest()
    return body.decode("utf-8", errors="replace"), meta


def save_page(ym: str, body: bytes, *, source: str, note: str = "") -> Path:
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    path = page_path(ym)
    path.write_bytes(body)
    sources = load_sources()
    sources[ym] = {
        "source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sha256": hashlib.sha256(body).hexdigest(),
        **({"note": note} if note else {}),
    }
    SOURCES.write_text(json.dumps(dict(sorted(sources.items())), indent=1) + "\n")
    return path
