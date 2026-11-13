#!/usr/bin/env python3
"""Say loudly when the published bulletin month has fallen behind.

Since Nov 2026 no new bulletin reaches the pipeline on its own (see
gceta/pages.py), so the daily refresh can run green for weeks while the app
shows an old month. This is what turns that into a signal.

Two thresholds, both on the bundle's end_month (the newest bulletin month):

- WARN from the 25th of month M if the bulletin for M+1 is not in. That is the
  app's own rule, model/src/freshness.ts expectedLatestMonth(): from the 25th it
  tells people "a newer bulletin may be out". The bulletin usually lands mid
  month, but it has come as late as the 22nd, so the 25th is the first day its
  absence is worth a look. Annotation only; the run stays green.

- FAIL from the 1st of month M if the bulletin for M itself is not in. A
  bulletin is always published before the month it governs, so by then it is
  certainly out and the app is showing last month's dates as current.

Runs as its own job in refresh-data.yml, after the build, so a stale bulletin
fails the run without holding back the Pages deploy (which also carries the
event registry).
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import date
from pathlib import Path

BUNDLE = Path(__file__).resolve().parents[1] / "data" / "app-bundle.json"


def ym(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def expected_latest_month(today: date) -> str:
    """Mirror of model/src/freshness.ts expectedLatestMonth()."""
    absolute = today.year * 12 + (today.month - 1) + (1 if today.day >= 25 else 0)
    return ym(absolute // 12, absolute % 12 + 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, default=BUNDLE)
    parser.add_argument("--today", help="YYYY-MM-DD, for testing")
    args = parser.parse_args()

    today = date.fromisoformat(args.today) if args.today else date.today()
    end_month = json.loads(args.bundle.read_text())["end_month"]
    expected = expected_latest_month(today)
    current = ym(today.year, today.month)
    annotate = bool(os.environ.get("GITHUB_ACTIONS"))
    how = (
        "No automated source serves new bulletins any more: save it from "
        "travel.state.gov and run pipeline/import_bulletin.py."
    )

    print(f"latest bulletin : {end_month}")
    print(f"app expects     : {expected} (as of {today})")
    if end_month < current:
        msg = f"Bulletin is stale: latest is {end_month}, but the {current} bulletin is certainly out by now. {how}"
        print(f"::error title=Stale visa bulletin::{msg}" if annotate else f"ERROR: {msg}")
        return 1
    if end_month < expected:
        msg = f"The {expected} bulletin is not in yet (latest {end_month}); the app now shows 'a newer bulletin may be out'. {how}"
        print(f"::warning title=Visa bulletin due::{msg}" if annotate else f"WARNING: {msg}")
        return 0
    print("fresh")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
