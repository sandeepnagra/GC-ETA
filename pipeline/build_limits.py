#!/usr/bin/env python3
"""Extract annual numerical limits from the bulletin archive into data/limits.json.

The limits are stated in prose in each bulletin rather than only in the October
PDF, so they can be read from the pages already fetched. Reading them from every
month rather than just October matters: PLAN.md section 4 records that the limit
is provisional under INA 203(g) until USCIS supplies immediate-relative counts
mid-year, so a fiscal year can carry more than one stated figure. Where that
happens we keep all of them with the month each was stated in, and mark the last
as final.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bs4 import BeautifulSoup  # noqa: E402

from gceta.bulletin import bulletin_url  # noqa: E402
from gceta.fetch import Fetcher  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

_NUM = r"([\d,]{3,12})"
PATTERNS = {
    "family_worldwide": re.compile(
        r"family-sponsored preference immigrants.{0,120}?is\s+" + _NUM, re.I | re.S
    ),
    # "at least 140,000" is the statutory FLOOR, which the bulletin repeats every
    # month until the Visa Office publishes the determined figure. Capturing the
    # qualifier is essential: treating the floor as the operative limit
    # understated FY2026 supply by a third (140,000 against an actual 186,317).
    "employment_worldwide": re.compile(
        r"employment-based preference immigrants is\s+(at least\s+)?" + _NUM, re.I
    ),
    "per_country": re.compile(
        r"per-country limit.{0,200}?(?:i\.e\.,|is)\s*" + _NUM, re.I | re.S
    ),
    "dependent_area": re.compile(
        r"dependent area limit is set at 2%,?\s*or\s*" + _NUM, re.I
    ),
    "nacara_reduction": re.compile(
        r"reduction will be limited to\s+" + _NUM, re.I
    ),
}


def text_of(html: str) -> str:
    raw = BeautifulSoup(html, "lxml").get_text(" ", strip=True)
    return " ".join(unicodedata.normalize("NFKD", raw).split())


def to_int(value: str) -> int:
    return int(value.replace(",", ""))


def main() -> int:
    fetcher = Fetcher()
    archive = json.loads((DATA_DIR / "bulletins.json").read_text())
    by_fy: dict[int, list[dict]] = defaultdict(list)

    for bulletin in sorted(archive["bulletins"], key=lambda b: b["month"]):
        year, month = (int(p) for p in bulletin["month"].split("-"))
        doc = fetcher.get(bulletin_url(month, year), allow_404=True)
        if doc is None:
            continue
        body = text_of(doc.text)
        found = {}
        for field, pattern in PATTERNS.items():
            match = pattern.search(body)
            if not match:
                continue
            if field == "employment_worldwide":
                qualifier, number = match.group(1), match.group(2)
                found[field] = to_int(number)
                found["employment_is_floor_only"] = bool(qualifier)
            else:
                found[field] = to_int(match.group(1))
        if "employment_worldwide" not in found:
            continue
        found["stated_in"] = bulletin["month"]
        by_fy[bulletin["fiscal_year"]].append(found)

    limits = []
    for fy in sorted(by_fy):
        statements = by_fy[fy]
        # Distinct sets of numbers seen for this fiscal year, in order.
        seen: list[dict] = []
        for statement in statements:
            core = {k: v for k, v in statement.items() if k != "stated_in"}
            if not seen or {k: v for k, v in seen[-1].items() if k != "stated_in"} != core:
                seen.append(statement)
        determined = [x for x in seen if not x.get("employment_is_floor_only")]
        limits.append(
            {
                "fiscal_year": fy,
                "revisions": seen,
                "final": seen[-1],
                "determined": determined[-1] if determined else None,
                "has_determined_figure": bool(determined),
                "revised_mid_year": len(seen) > 1,
                "months_stating_limits": len(statements),
            }
        )

    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Stated in the Department of State Visa Bulletin, read from the archive",
        "note": (
            "Figures are provisional under INA 203(g) until USCIS supplies "
            "immediate-relative and parolee counts mid-year. revised_mid_year "
            "flags a fiscal year where the stated numbers changed."
        ),
        "limits": limits,
    }
    out = DATA_DIR / "limits.json"
    out.write_text(json.dumps(payload, indent=1))

    print(f"fiscal years: {len(limits)}  ({limits[0]['fiscal_year']}..{limits[-1]['fiscal_year']})")
    print(f"{'FY':<6}{'family':>10}{'employment':>12}{'per-country':>13}{'dep area':>10}{'NACARA':>8}  revised")
    for entry in limits:
        f = entry["final"]
        if f.get("employment_is_floor_only"):
            print(f"{entry['fiscal_year']:<6}{'floor only (bulletin says at least 140,000)':>53}")
            continue
        print(
            f"{entry['fiscal_year']:<6}"
            f"{f.get('family_worldwide', 0):>10,}"
            f"{f.get('employment_worldwide', 0):>12,}"
            f"{f.get('per_country', 0):>13,}"
            f"{f.get('dependent_area', 0):>10,}"
            f"{f.get('nacara_reduction', 0):>8}"
            f"  {'yes' if entry['revised_mid_year'] else ''}"
        )
    print(f"\nwritten: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
