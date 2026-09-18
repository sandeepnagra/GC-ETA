#!/usr/bin/env python3
"""Backfill the Visa Bulletin archive into data/bulletins.json.

Usage:
    python build_bulletins.py                  # FY2010 to now
    python build_bulletins.py --start 2015-10  # from a given month
    python build_bulletins.py --no-cache       # re-fetch everything

The output is one flat row per (chart, track, category, chargeability, month),
which is what lets a year with an extra country column parse without a schema
change. See PLAN.md L24.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gceta.bulletin import bulletin_url, parse_bulletin  # noqa: E402
from gceta.fetch import Fetcher  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SCHEMA_VERSION = 1


def month_range(start: tuple[int, int], end: tuple[int, int]):
    year, month = start
    while (year, month) <= end:
        yield year, month
        month += 1
        if month == 13:
            year, month = year + 1, 1


def parse_month_arg(value: str) -> tuple[int, int]:
    year, month = value.split("-")
    return int(year), int(month)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2009-10", help="YYYY-MM (default FY2010)")
    parser.add_argument("--end", default=None, help="YYYY-MM (default: this month)")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args()

    today = date.today()
    start = parse_month_arg(args.start)
    end = parse_month_arg(args.end) if args.end else (today.year, today.month)

    fetcher = Fetcher(delay=args.delay, use_cache=not args.no_cache)
    bulletins: list[dict] = []
    missing: list[str] = []
    warning_counts: Counter[str] = Counter()
    fetched_live = 0

    for year, month in month_range(start, end):
        url = bulletin_url(month, year)
        doc = fetcher.get(url, allow_404=True)
        if doc is None:
            missing.append(f"{year:04d}-{month:02d}")
            continue
        if not doc.from_cache:
            fetched_live += 1
        parsed = parse_bulletin(doc.text, month, year, source_url=url)
        # Content hash catches same-URL revisions, which have happened before:
        # the October 2015 bulletin was revised days after publication.
        parsed["content_sha256"] = doc.sha256
        parsed["fetched_at"] = doc.fetched_at
        for warning in parsed["warnings"]:
            warning_counts[warning] += 1
        if not parsed["rows"]:
            warning_counts[f"NO ROWS PARSED for {parsed['month']}"] += 1
        bulletins.append(parsed)

    payload = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "adoption.state.gov mirror of the Department of State Visa Bulletin",
        "months_covered": len(bulletins),
        "months_missing": missing,
        "bulletins": bulletins,
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = DATA_DIR / "bulletins.json"
    out.write_text(json.dumps(payload, indent=1, sort_keys=False))

    total_rows = sum(len(b["rows"]) for b in bulletins)
    print(f"months parsed : {len(bulletins)}")
    print(f"months missing: {len(missing)}  {missing[:6]}{' ...' if len(missing) > 6 else ''}")
    print(f"rows total    : {total_rows:,}")
    print(f"fetched live  : {fetched_live} (rest from cache)")
    print(f"written       : {out} ({out.stat().st_size/1_048_576:.1f} MB)")
    if warning_counts:
        print(f"\ndistinct warnings: {len(warning_counts)}")
        for text, count in warning_counts.most_common(25):
            print(f"  {count:>4}x  {text}")
    else:
        print("\nno warnings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
