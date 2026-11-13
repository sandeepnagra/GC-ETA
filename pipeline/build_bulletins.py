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

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gceta.bulletin import bulletin_url, parse_bulletin  # noqa: E402
from gceta.fetch import Fetcher  # noqa: E402
from gceta.pages import read_page  # noqa: E402
from gceta import vbcn  # noqa: E402
from gceta.sections import parse_sections  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SCHEMA_VERSION = 1

# Months confirmed to have had no Visa Bulletin at all. These are never
# fetched, so a run does not spend a request every day re-learning that they
# do not exist. Empty, and meant to stay that way unless the State
# Department's own archive index shows a month was skipped: the three months
# that used to look like gaps (2009-10, 2009-11, 2012-10) were published and
# were only missing from the mirror. They are recovered from the Wayback
# Machine into data/bulletin-pages/.
NEVER_PUBLISHED: set[str] = set()


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


def next_month(ym: tuple[int, int]) -> tuple[int, int]:
    year, month = ym
    return (year + 1, 1) if month == 12 else (year, month + 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2009-10", help="YYYY-MM (default FY2010)")
    parser.add_argument("--end", default=None, help="YYYY-MM (default: this month)")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args()

    today = date.today()
    start = parse_month_arg(args.start)
    # One month PAST the current one by default. The Visa Bulletin is published
    # two to three weeks before the month it governs, so stopping at the
    # current month meant the new bulletin could not be picked up until the
    # first of the month it was already describing -- the daily job ran green
    # and fetched nothing new for weeks. The model already assumes this:
    # expectedLatestMonth() rolls forward on the 25th and marks the bundle
    # stale until the pipeline delivers the month the app is asking for.
    # A month that is not out yet 404s (or, since Nov 2026, redirects to a
    # bot-walled 404 page that answers 403), which is expected and handled below.
    current = (today.year, today.month)
    end = parse_month_arg(args.end) if args.end else next_month(current)

    fetcher = Fetcher(delay=args.delay, use_cache=not args.no_cache)
    bulletins: list[dict] = []
    missing: list[str] = []
    not_yet: list[str] = []
    not_yet_errors: dict[str, str] = {}
    from_pages: list[str] = []
    warning_counts: Counter[str] = Counter()
    fetched_live = 0
    dataset_months: list[str] = []

    def from_dataset(ym: str) -> bool:
        # Last resort, after a committed page, the fetch cache and the network:
        # the visa-bulletin-cn dataset (gceta/vbcn.py), which is how a new
        # bulletin arrives now that the State Department serves none to a
        # program. Partial by design: no Mexico or Philippines columns.
        record = vbcn.bulletin_from(ym)
        if record is None:
            return False
        bulletins.append(record)
        dataset_months.append(ym)
        return True

    for year, month in month_range(start, end):
        url = bulletin_url(month, year)
        ym = f"{year:04d}-{month:02d}"
        if ym in NEVER_PUBLISHED:
            missing.append(ym)
            continue
        committed = read_page(ym)
        if committed is not None:
            html, meta = committed
            parsed = parse_bulletin(html, month, year, source_url=meta.get("source", url))
            parsed["sections"] = parse_sections(html)
            parsed["content_sha256"] = meta["sha256"]
            # When it was retrieved from the publisher, if known; a page saved
            # by hand only knows when it was imported.
            parsed["fetched_at"] = meta.get("fetched_at") or meta.get("imported_at")
            from_pages.append(ym)
            for warning in parsed["warnings"]:
                warning_counts[warning] += 1
            if not parsed["rows"]:
                warning_counts[f"NO ROWS PARSED for {ym}"] += 1
            bulletins.append(parsed)
            continue
        try:
            doc = fetcher.get(url, allow_404=True)
        except requests.RequestException as exc:
            # Only the look-ahead month gets this leniency. Since Nov 2026 an
            # unpublished bulletin no longer 404s: adoption.state.gov 302s it to
            # travel.state.gov's 404 page, which sits behind a Cloudflare bot
            # check and answers 403. That broke every daily run on a month that
            # simply is not out yet. A current or past month failing is a real
            # problem with the source and must still stop the run.
            if (year, month) > current:
                if from_dataset(ym):
                    continue
                not_yet.append(ym)
                not_yet_errors[ym] = str(exc)
                continue
            raise
        if doc is None and from_dataset(ym):
            continue
        if doc is None:
            # A future month that is not published yet is not a gap in the
            # archive, it is just the future. Recording it as missing would
            # put a permanent, self-healing entry in months_missing every
            # single run and bury a real hole worth noticing.
            #
            # The current month is not counted as a hole either: its bulletin
            # can only be late, not lost, and saying so is check_freshness.py's
            # job. Failing here would also stop the Pages deploy, which carries
            # the event registry too.
            if (year, month) >= current:
                not_yet.append(ym)
            else:
                missing.append(ym)
            continue
        if not doc.from_cache:
            fetched_live += 1
        parsed = parse_bulletin(doc.text, month, year, source_url=url)
        # Content hash catches same-URL revisions, which have happened before:
        # the October 2015 bulletin was revised days after publication.
        # Per-category narrative sections: the Visa Office's own forward
        # guidance, which only appears when it has something specific to say.
        parsed["sections"] = parse_sections(doc.text)
        parsed["content_sha256"] = doc.sha256
        parsed["fetched_at"] = doc.fetched_at
        for warning in parsed["warnings"]:
            warning_counts[warning] += 1
        if not parsed["rows"]:
            warning_counts[f"NO ROWS PARSED for {parsed['month']}"] += 1
        bulletins.append(parsed)

    # A past month going missing means a bulletin we used to have is gone:
    # the source no longer serves it and it is not in the fetch cache or in
    # data/bulletin-pages/. Stop rather than ship a thinner archive.
    unexpected = [m for m in missing if m not in NEVER_PUBLISHED]
    if unexpected:
        print(
            f"ERROR: past bulletins missing: {', '.join(unexpected)}\n"
            "Not served by the source, not in the fetch cache, not committed in "
            "data/bulletin-pages/. Import them with pipeline/import_bulletin.py.",
            file=sys.stderr,
        )
        return 1

    payload = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": (
            "Department of State Visa Bulletin: pages committed in "
            "data/bulletin-pages/, the adoption.state.gov mirror (fetch cache), "
            f"and for months not otherwise available {vbcn.ATTRIBUTION}"
        ),
        "months_covered": len(bulletins),
        "months_missing": missing,
        "bulletins": bulletins,
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = DATA_DIR / "bulletins.json"
    out.write_text(json.dumps(payload, indent=1, sort_keys=False))

    total_rows = sum(len(b["rows"]) for b in bulletins)
    total_sections = sum(len(b.get("sections", [])) for b in bulletins)
    months_with_sections = sum(1 for b in bulletins if b.get("sections"))
    print(f"months parsed : {len(bulletins)}")
    print(f"months missing: {len(missing)}  {missing[:6]}{' ...' if len(missing) > 6 else ''}")
    for ym in not_yet:
        if ym in not_yet_errors:
            # Said plainly so a green run cannot hide a source that has stopped
            # answering: this is an error we chose to tolerate, not a 404.
            print(f"not out yet   : {ym} (looked ahead, fetch failed -- {not_yet_errors[ym]})")
        else:
            print(f"not out yet   : {ym} (looked ahead, 404 -- normal)")
    if bulletins:
        print(f"latest month  : {bulletins[-1]['month']}")
    print(f"rows total    : {total_rows:,}")
    print(f"sections      : {total_sections:,} across {months_with_sections} months")
    if dataset_months:
        print(
            f"from dataset  : {', '.join(dataset_months)} "
            f"(visa-bulletin-cn; columns {', '.join(vbcn.COVERED_COLUMNS)} only)"
        )
    if from_pages:
        shown = ", ".join(from_pages) if len(from_pages) <= 6 else f"{from_pages[0]} .. {from_pages[-1]}"
        print(f"committed     : {len(from_pages)} from data/bulletin-pages/  {shown}")
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
