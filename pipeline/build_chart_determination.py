#!/usr/bin/env python3
"""Which filing chart USCIS designated, month by month.

The Visa Bulletin publishes two charts. Final Action Dates decide when a
green card can be APPROVED; Dates for Filing decide when an I-485 may be
SUBMITTED, and only in months when USCIS says so. USCIS makes that call
monthly, on its own page, based on how many numbers remain and its own
inventory -- the bulletin itself does not say.

Without this the app could only ever hedge. It knew a reader's date had been
reached on the filing chart and still had to write "check which chart USCIS
has designated this month", which is the app handing its homework back. With
it, "you could file if..." becomes "you can file", which is the only headline
the app can state as a fact rather than a forecast.

THE PAGE ONLY EVER SHOWS THE CURRENT MONTH, so this is an accumulating
record, not a backfill. Each run appends the month it finds and never
rewrites one already stored: if a stored month comes back different, that
means either USCIS revised it or the parse broke, and both deserve a person
rather than a silent overwrite. The series therefore starts the day this
first runs and grows one month at a time. That is worth saying plainly,
because "USCIS has used Dates for Filing every October since 2018" is the
kind of claim this file will eventually support and cannot support yet.

Usage:
    python build_chart_determination.py
    python build_chart_determination.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gceta.fetch import Fetcher  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "chart-determination.json"
URL = (
    "https://www.uscis.gov/green-card/green-card-processes-and-procedures/"
    "visa-availability-priority-dates/"
    "adjustment-of-status-filing-charts-from-the-visa-bulletin"
)

MONTHS = {
    m: i
    for i, m in enumerate(
        [
            "january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december",
        ],
        start=1,
    )
}

# Anchored on the employment-based heading rather than matched loose. The page
# carries a sentence explaining what it will say when the other chart applies
# -- "Otherwise, we will indicate on this page that you must use the Final
# Action Dates chart" -- which a pattern not anchored to the heading matches
# happily and reads as a determination. It is the opposite of one.
EMPLOYMENT_ANCHOR = "Employment-Based Preference Filings"
FAMILY_ANCHOR = "Family-Sponsored Filings"
DETERMINATION = re.compile(
    r"must use the\s+(Dates for Filing|Final Action Dates)\s+chart"
    r".*?Visa Bulletin for\s+([A-Za-z]+)\s+(\d{4})",
    re.IGNORECASE | re.DOTALL,
)

CHART_KEY = {
    "dates for filing": "dates_for_filing",
    "final action dates": "final_action",
}


def determination_after(text: str, anchor: str) -> tuple[str, str] | None:
    """The first determination stated after `anchor`, as (chart, YYYY-MM)."""
    at = text.find(anchor)
    if at < 0:
        return None
    # A window, not the rest of the page: the family and employment sections
    # sit one after the other, so an unbounded search from the family anchor
    # would run into the employment sentence and report it as family's.
    match = DETERMINATION.search(text, at, at + 1200)
    if not match:
        return None
    chart = CHART_KEY.get(match.group(1).strip().lower())
    month_name = match.group(2).strip().lower()
    if chart is None or month_name not in MONTHS:
        return None
    return chart, f"{int(match.group(3))}-{MONTHS[month_name]:02d}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="print, do not write")
    args = parser.parse_args()

    from bs4 import BeautifulSoup

    document = Fetcher(use_cache=False).get(URL)
    text = BeautifulSoup(document.text, "lxml").get_text(" ", strip=True)

    employment = determination_after(text, EMPLOYMENT_ANCHOR)
    if employment is None:
        print("could not read the employment-based determination; page layout changed?")
        return 1
    chart, month = employment
    family = determination_after(text, FAMILY_ANCHOR)

    print(f"{month}: employment-based uses {chart}")
    if family:
        print(f"{month}: family-sponsored uses {family[0]}")
        if family[1] != month:
            print(f"  note: family section names {family[1]}, employment names {month}")

    stored = json.loads(OUT.read_text()) if OUT.exists() else {
        "schema_version": 1,
        "source": URL,
        "note": (
            "Which chart USCIS designated for adjustment of status filings, by "
            "the month of the Visa Bulletin it applies to. USCIS decides this "
            "monthly and publishes only the current month, so this record "
            "accumulates forward from when it was first collected and cannot be "
            "backfilled. An absent month means not observed, never 'final "
            "action applied'."
        ),
        "months": {},
    }

    months = stored.setdefault("months", {})
    existing = months.get(month)
    if existing and existing.get("employment") != chart:
        # Never silently rewrite. Either USCIS revised a month or the parse
        # drifted, and a person should decide which.
        print(
            f"  REFUSING to overwrite {month}: stored {existing.get('employment')}, "
            f"page now says {chart}. Resolve by hand."
        )
        return 1

    entry = {"employment": chart, "observed_on": date.today().isoformat()}
    if family:
        entry["family"] = family[0]
    changed = existing != entry and existing is None
    months[month] = entry if existing is None else existing
    stored["last_checked"] = date.today().isoformat()

    if args.dry_run:
        print("\n--dry-run, nothing written")
        return 0

    OUT.write_text(json.dumps(stored, indent=1, sort_keys=False) + "\n")
    print(f"\n{'added' if changed else 'already recorded'} {month}; "
          f"{len(months)} month(s) on record -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
