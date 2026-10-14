#!/usr/bin/env python3
"""Certified PERM volume by DECISION year, from the pre-2015 disclosure files.

Why a second, separate aggregate rather than more of build_perm_density.py:
those files cannot feed density. From FY2008 to FY2014 the disclosure schema
is 25-27 columns whose only date is DECISION_DATE. The priority date IS the
PERM receipt date, so with no receipt column there is nothing to place a case
on the priority-date axis with.

Imputing receipt from decision was considered and measured, not waved away.
Both dates exist from FY2015, so the receipt-to-decision lag is observable:
FY2015 runs a median of 6.3 months with a p90 of 18.0, and FY2019 a median of
2.5 with a p90 of 6.7. The median moved by two and a half times in four years.
Extrapolating that back across the 2008-2014 backlog, when audit rates were
far higher again, would mean guessing the one parameter the whole imputation
rests on, over exactly the years the estimate is most sensitive to. So the
receipt date stays unavailable before FY2015, permanently, from this source.

What the files DO carry is the count of certifications decided per year, by
country and class of admission. That is worth having for two reasons:

- It measures how badly the density we do have undercounts old cohorts, which
  is what justifies the coverage floor in model/src/density.ts rather than
  leaving it an argument. India priority-date 2009 reads as ELEVEN cases in
  the density file against roughly forty thousand India certifications
  decided in FY2009-FY2010. The ratio falls to about 1 by 2014, which is
  where the floor sits.
- It is the only record of employment-based demand entering the pipeline
  before 2015. Nothing consumes it yet; it is recorded so that the next
  question about historical inflow has data rather than speculation.

Read it as DECISION-year volume. It is NOT a priority-date cohort and must
never be used as one -- that mistake, in the other direction, is what this
whole exercise was correcting.

Usage:
    python build_perm_decisions.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT = DATA_DIR / "perm-decisions.json"
BASE = "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/"

# Simple names, unlike the post-2015 files. Probed rather than guessed.
FILES = {
    2008: "PERM_FY2008.xlsx",
    2009: "PERM_FY2009.xlsx",
    2010: "PERM_FY2010.xlsx",
    2011: "PERM_FY2011.xlsx",
    2012: "PERM_FY2012.xlsx",
    2013: "PERM_FY2013.xlsx",
    2014: "PERM_FY14_Q4.xlsx",
}

# Matching build_perm_density.py, so the two aggregates are comparable. A
# certified-expired case was certified and then not filed as an I-140 within
# 180 days; it is counted here because the question is how much was certified,
# not how much survived.
COUNTED_STATUSES = {"certified", "certified-expired"}

# Header spelling drifts across years, including a typo that survived several:
# COUNTRY_OF_CITZENSHIP in FY2008-FY2013, Country_of_Citizenship in FY2014.
# Normalising to letters only absorbs case, underscores and the missing "I".
def _norm(header: object) -> str:
    return re.sub(r"[^A-Z]", "", str(header).upper())


def _column(headers: list, *fragments: str) -> int | None:
    for i, header in enumerate(headers):
        name = _norm(header)
        if any(fragment in name for fragment in fragments):
            return i
    return None


def aggregate(path: Path) -> dict:
    import openpyxl

    workbook = openpyxl.load_workbook(path, read_only=True)
    sheet = workbook[workbook.sheetnames[0]]
    rows = sheet.iter_rows(values_only=True)
    headers = list(next(rows))

    status_at = _column(headers, "CASESTATUS")
    country_at = _column(headers, "COUNTRYOFCIT")
    class_at = _column(headers, "CLASSOFADMISSION")
    if status_at is None or country_at is None:
        raise SystemExit(f"{path.name}: no status or country column")

    by_country: dict[str, int] = {}
    by_class: dict[str, int] = {}
    total = 0
    for row in rows:
        status = row[status_at]
        if not status or str(status).strip().lower() not in COUNTED_STATUSES:
            continue
        total += 1
        country = str(row[country_at] or "UNKNOWN").strip().upper() or "UNKNOWN"
        by_country[country] = by_country.get(country, 0) + 1
        if class_at is not None:
            admission = str(row[class_at] or "UNKNOWN").strip().upper() or "UNKNOWN"
            by_class[admission] = by_class.get(admission, 0) + 1

    # Long tails of one-off country spellings are noise; keep what is usable.
    top = dict(sorted(by_country.items(), key=lambda kv: -kv[1])[:40])
    return {"certified": total, "by_country": top, "by_class_of_admission": by_class}


def main() -> int:
    import urllib.request

    cache = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/perm-decisions")
    cache.mkdir(parents=True, exist_ok=True)

    years: dict[str, dict] = {}
    for year, name in FILES.items():
        path = cache / name
        if not path.exists():
            print(f"  FY{year}  downloading {name}")
            urllib.request.urlretrieve(BASE + name, path)
        years[str(year)] = aggregate(path)
        print(f"  FY{year}  certified {years[str(year)]['certified']:,}")

    OUT.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "source": BASE,
                "note": (
                    "Certified PERM volume by DECISION year, FY2008-FY2014. These "
                    "files carry no receipt date, so none of this can be placed on "
                    "the priority-date axis and it must not be read as cohort size. "
                    "See the module docstring and PLAN.md 10.2."
                ),
                "counted_statuses": sorted(COUNTED_STATUSES),
                "years": years,
            },
            indent=1,
        )
        + "\n"
    )
    print(f"\nwrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
