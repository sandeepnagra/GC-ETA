#!/usr/bin/env python3
"""Copy every bulletin in the fetch cache into data/bulletin-pages/.

Since Nov 2026 the source redirects every bulletin URL to a 404 page, so the
fetch cache (pipeline/cache/, gitignored, and an actions/cache entry in CI)
became the only copy of the archive. A cache entry can be evicted; a commit
cannot. This makes the repository the archive of record. It only adds pages
that are not committed yet, so it is cheap to run on every refresh: that is how
a bulletin fetched in CI, which never touches a developer's cache, gets kept.
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gceta.bulletin import bulletin_url  # noqa: E402
from gceta.fetch import _cache_path  # noqa: E402
from gceta.pages import page_path, save_page  # noqa: E402


def main() -> int:
    today = date.today()
    year, month = 2009, 10
    end = (today.year + (today.month == 12), today.month % 12 + 1)
    added: list[str] = []
    while (year, month) <= end:
        ym = f"{year:04d}-{month:02d}"
        url = bulletin_url(month, year)
        cached = _cache_path(url)
        if cached.exists() and not page_path(ym).exists():
            fetched_at = datetime.fromtimestamp(cached.stat().st_mtime, tz=timezone.utc)
            save_page(
                ym,
                cached.read_bytes(),
                source=url,
                fetched_at=fetched_at.isoformat(timespec="seconds"),
                note="From the pipeline fetch cache.",
            )
            added.append(ym)
        month += 1
        if month == 13:
            year, month = year + 1, 1
    print(f"archived {len(added)} cached bulletin(s) into data/bulletin-pages/"
          + (f": {added[0]} .. {added[-1]}" if added else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
