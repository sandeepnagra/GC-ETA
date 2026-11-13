#!/usr/bin/env python3
"""Pull new months from the visa-bulletin-cn dataset into data/visa-bulletin-cn/.

Run by Refresh data before build_bulletins.py, which uses a month from here
only when no official page for it is committed, cached or fetchable. See
gceta/vbcn.py for why this is the source for new bulletins.

- A month not yet committed is fetched, validated and written.
- The three newest months are re-fetched every run, because the maintainer
  corrects errors with a new commit rather than in place.
- A month that fails validation is not written, and the run warns.
- Where an official page for the month is committed, every overlapping cell is
  compared and any disagreement is reported, so a drift in the dataset shows up
  in the log the first time it happens.

Never fails the run: if GitHub is unreachable, the previous months stand and
check_freshness.py says so once the bulletin is due.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gceta import vbcn  # noqa: E402
from gceta.bulletin import parse_bulletin  # noqa: E402
from gceta.fetch import Fetcher  # noqa: E402
from gceta.pages import read_page  # noqa: E402

REFETCH_NEWEST = 3


def warn(message: str) -> None:
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::warning title=visa-bulletin-cn::{message}")
    else:
        print(f"WARNING: {message}")


def cell(row: dict) -> str | None:
    return {"current": "C", "unavailable": "U"}.get(row["kind"], row.get("date"))


def compare_with_official(ym: str, doc: dict) -> int:
    official = read_page(ym)
    if official is None:
        return 0
    year, month = (int(p) for p in ym.split("-"))
    ours = {
        (r["chart"], r["category"], r["chargeability"]): cell(r)
        for r in parse_bulletin(official[0], month, year, source_url="")["rows"]
    }
    mismatches = 0
    for row in vbcn.to_rows(doc):
        key = (row["chart"], row["category"], row["chargeability"])
        if key in ours and ours[key] != cell(row):
            mismatches += 1
            warn(f"{ym} {'/'.join(key)}: dataset {cell(row)} vs official {ours[key]}")
    return mismatches


def main() -> int:
    fetcher = Fetcher(use_cache=False)
    try:
        index = json.loads(fetcher.get(vbcn.INDEX_URL).text)
    except Exception as exc:  # network, HTTP, or JSON: all mean "not this run"
        warn(f"could not read the dataset index: {exc}")
        return 0

    months = sorted(m["month"] for m in index.get("months", []) if vbcn.MONTH.match(m.get("month", "")))
    newest = set(months[-REFETCH_NEWEST:])
    added, updated, rejected, mismatched = [], [], [], 0
    vbcn.DATA_DIR.mkdir(parents=True, exist_ok=True)

    for ym in months:
        path = vbcn.path_for(ym)
        if path.exists() and ym not in newest:
            continue
        try:
            body = fetcher.get(f"{vbcn.RAW}/data/{ym}.json").body
            doc = json.loads(body)
        except Exception as exc:
            warn(f"{ym}: could not fetch: {exc}")
            continue
        problems = vbcn.validate(doc, ym)
        if problems:
            rejected.append(ym)
            warn(f"{ym} rejected: {'; '.join(problems[:5])}")
            continue
        if path.exists() and path.read_bytes() == body:
            continue
        (updated if path.exists() else added).append(ym)
        path.write_bytes(body)
        mismatched += compare_with_official(ym, doc)

    print(f"dataset latest : {index.get('latest')} (updated {index.get('updated_at')})")
    print(f"added          : {', '.join(added) or 'none'}")
    print(f"updated        : {', '.join(updated) or 'none'}")
    if rejected:
        print(f"rejected       : {', '.join(rejected)}")
    if mismatched:
        print(f"disagreements  : {mismatched} cell(s) differ from the official page, see warnings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
