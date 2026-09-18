#!/usr/bin/env python3
"""Historical employment-based annual limits, into data/limits-historical.json.

Why this file exists at all. The model needs each year's employment limit so
that an advance from a 281,507-visa year is not treated as comparable to one
from a 186,317-visa year; without it the simulation leaks pandemic-era optimism
into today's estimates. PLAN.md section 6.1.

Two sources were ruled out first, and the reasons are worth keeping:

- The Visa Bulletin states only the statutory floor, "at least 140,000", for
  every year before FY2025. Phase 0 established this.
- The Annual Numerical Limits PDF exists only for the current fiscal year. The
  State Department replaces it each October rather than archiving it, so
  probing nine years of URL patterns returns one hit.

What does work is the USCIS employment-based adjustment FAQ, which restates
prior years' limits in prose and is not behind a bot filter.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bs4 import BeautifulSoup  # noqa: E402

from gceta.fetch import Fetcher  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

SOURCES = [
    "https://www.uscis.gov/green-card/green-card-processes-and-procedures/fiscal-year-2023-employment-based-adjustment-of-status-faqs",
    "https://www.uscis.gov/archive/fiscal-year-2022-employment-based-adjustment-of-status-faqs",
]

# "The FY 2024 employment-based annual limit was 160,791"
# and the trailing form "...added to the employment-based limit for FY 2024".
LEADING = re.compile(
    r"FY\s*(20\d{2})\s+employment-based annual limit was\s+([\d,]{5,9})", re.I
)
TRAILING = re.compile(
    r"annual limit was\s+([\d,]{5,9})[^.]{0,200}?limit for FY\s*(20\d{2})", re.I
)
# A third phrasing, used for the earliest year restated on each page:
# "The annual limit for employment-based visa use in FY 2021 was 262,288".
USE_IN_FY = re.compile(
    r"annual limit for employment-based visa use in FY\s*(20\d{2})\s+was\s+([\d,]{5,9})",
    re.I,
)


def text_of(html: str) -> str:
    raw = BeautifulSoup(html, "lxml").get_text(" ", strip=True)
    return " ".join(unicodedata.normalize("NFKD", raw).split())


def main() -> int:
    fetcher = Fetcher()
    found: dict[int, dict] = {}

    for url in SOURCES:
        doc = fetcher.get(url, allow_404=True)
        if doc is None:
            print(f"  404  {url}")
            continue
        body = text_of(doc.text)
        for match in LEADING.finditer(body):
            year, value = int(match.group(1)), int(match.group(2).replace(",", ""))
            found.setdefault(year, {"fiscal_year": year, "employment_worldwide": value, "source": url})
        for match in TRAILING.finditer(body):
            value, year = int(match.group(1).replace(",", "")), int(match.group(2))
            found.setdefault(year, {"fiscal_year": year, "employment_worldwide": value, "source": url})
        for match in USE_IN_FY.finditer(body):
            year, value = int(match.group(1)), int(match.group(2).replace(",", ""))
            found.setdefault(year, {"fiscal_year": year, "employment_worldwide": value, "source": url})
        print(f"  200  {url.rsplit('/', 1)[-1][:58]}")

    # Merge in the determined figures the bulletin itself states, which Phase 0
    # found for FY2025 onward only.
    bulletin_limits = json.loads((DATA_DIR / "limits.json").read_text())
    for entry in bulletin_limits["limits"]:
        determined = entry.get("determined")
        if not determined:
            continue
        year = entry["fiscal_year"]
        found.setdefault(
            year,
            {
                "fiscal_year": year,
                "employment_worldwide": determined["employment_worldwide"],
                "source": "Visa Bulletin, stated determination",
            },
        )

    limits = sorted(found.values(), key=lambda e: e["fiscal_year"])
    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": (
            "Employment-based worldwide limit by fiscal year. Used to normalise "
            "historical cutoff advances so that a year with far more visa numbers "
            "is not treated as comparable to today. Years not listed fall back to "
            "the statutory base of 140,000 for reference only; the model leaves "
            "unknown years unscaled rather than assuming the base, because "
            "assuming it would wrongly amplify a high-spillover year."
        ),
        "statutory_base": 140000,
        "limits": limits,
    }
    out = DATA_DIR / "limits-historical.json"
    out.write_text(json.dumps(payload, indent=1))

    print(f"\n{'FY':<8}{'employment limit':>18}   source")
    for entry in limits:
        source = entry["source"]
        label = "bulletin" if source.startswith("Visa") else "USCIS FAQ"
        print(f"{entry['fiscal_year']:<8}{entry['employment_worldwide']:>18,}   {label}")
    print(f"\nyears covered: {len(limits)}   written: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
