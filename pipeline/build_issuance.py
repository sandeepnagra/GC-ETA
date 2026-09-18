#!/usr/bin/env python3
"""Visa numbers actually issued, per country and employment category.

This is the measurement that replaces a guess. Level B divides the people ahead
of an applicant by the numbers their country can expect in a year, and until now
that divisor was the statutory per-country floor multiplied by an invented
"spillover" constant of 3. One year could be read from the bulletin by
inverting how far a cutoff moved, and it suggested something near 5.8, so the
constant was carried as a range from 1.5 to 6 and labelled a guess.

Table V of the Department of State's Report of the Visa Office settles it, and
shows that a single constant was never going to work:

    India, FY2024        EB-1  8,809      EB-2  3,916
    per-country floor          3,219            3,219

The same country, the same year, the same floor, and one category took 2.7 times
it while another took 1.2. Spillover is not a property of a country. It depends
on whether the rest of the world is Current in that specific category, which
decides whether there are unused numbers to fall across at all. So this records
the history per (country, category) and lets the model read a distribution from
it instead of scaling a floor.

WHAT TABLE V COUNTS. "Immigrant Visas Issued and Adjustments of Status Subject
to Numerical Limitations": both consular issuance and adjustment of status, and
principals together with their dependents. That matters twice over. Roughly 85%
of employment cases are adjustments, so a consular-only table such as Table VI
would miss most of them. And because dependents are already included, these
numbers are dimensionally the same as Level B's people-ahead count, which is
also in visa numbers rather than principals.

WHAT IT DOES NOT MEAN. Table V records what a country *received*, which equals
what it could have received only where the category was oversubscribed. For a
Current category, issuance is limited by how many people applied, not by the
supply. Level B only runs on backlogged cases, so reading these as supply is
sound there, but the number is demand wherever a column is Current.

File names are not guessable and differ every few years: FY2024 publishes
"Table%20V_PartII.pdf" and FY2022 publishes "FY22_TableV_Part2.pdf". Each year's
report page is scraped for the link instead, the same lesson the labour
certification files taught.

travel.state.gov returns 403 to any automated request. adoption.state.gov serves
the identical content from the same content management system, which is how the
bulletin archive is already fetched.

Usage:
    python build_issuance.py                  # FY2012 to FY2024
    python build_issuance.py --years 2023 2024
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pdfplumber  # noqa: E402
import requests  # noqa: E402

from gceta.fetch import USER_AGENT  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CACHE = Path(__file__).resolve().parent / "cache" / "issuance"
OUT = DATA_DIR / "issuance.json"

HOST = "https://adoption.state.gov"
REPORT = HOST + "/content/travel/en/legal/visa-law0/visa-statistics/annual-reports/report-of-the-visa-office-{year}.html"

# Part 2 of Table V is the employment preferences, first through fourth. Most
# years publish it as its own PDF; FY2019 publishes Table V as one combined file
# and splits only Table VI, so the link text below will not match there and the
# whole table is fetched instead.
PART2_TEXT = re.compile(r"Part\s*2\s*\(Employment\s*First\s*through\s*Fourth\)", re.I)
WHOLE_TABLE_V = re.compile(
    r"Immigrant\s+Visas\s+Issued\s+and\s+Adjustments\s+of\s+Status\s+Subject\s+to\s+Numerical", re.I
)

# WHICH PAGES HOLD EMPLOYMENT DATA IS DECIDED BY THE COLUMN HEADER, not by which
# file they came from. Table V's parts all list countries against integers, and
# the family part has eight numeric columns too, so a row shape alone cannot
# tell them apart: reading a family page as employment would silently record
# F2A numbers as EB-2. The employment header is unambiguous, it repeats on every
# page, and gating on it makes the combined FY2019 file and the split files of
# every other year parse through the same path.
EMPLOYMENT_HEADER = re.compile(r"Foreign\s+State\s+1st\s+2nd\s+3rd", re.I)

COLUMN_FOR_COUNTRY = {
    "INDIA": "IN",
    "CHINA - MAINLAND BORN": "CN",
    "MEXICO": "MX",
    "PHILIPPINES": "PH",
}

# Part 2's eight numeric columns, in published order.
FIELDS = [
    "EB1",
    "EB2",
    "EB3",
    "EB3_OTHER_WORKERS",
    "EB3_TOTAL",
    "EB4",
    "EB4_CERTAIN_RELIGIOUS_WORKERS",
    "EB4_TOTAL",
]

# A country row is a name followed by exactly eight integers. Requiring exactly
# eight is the cheapest guard against a wrapped line or a shifted column being
# read as data.
ROW = re.compile(r"^(.+?)\s+((?:[\d,]+\s+){7}[\d,]+)$")

# Sub-region rollups. The published table lists Morocco, then Western Sahara,
# then a TOTAL line combining them, and counting that line would double the
# region. "Grand Totals" is kept separately as a checksum.
SKIP = re.compile(r"^(TOTALS?|Grand\s+Totals?|Foreign\s+State|Region\s+Total)\b", re.I)
GRAND = re.compile(r"^Grand\s+Totals?\b", re.I)


def fetch(url: str, binary: bool = False):
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=180)
    response.raise_for_status()
    return response.content if binary else response.text


def part2_url(year: int) -> tuple[str, str] | None:
    """The year's employment issuance PDF, and whether it is split or combined."""
    html = fetch(REPORT.format(year=year))
    links = [
        (" ".join(re.sub(r"<[^>]+>", "", m.group(2)).split()), m.group(1))
        for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, re.I | re.S)
    ]

    def absolute(href: str) -> str:
        return href if href.startswith("http") else HOST + href

    for text, href in links:
        if PART2_TEXT.search(text) and href.lower().endswith(".pdf"):
            return absolute(href), "part2"
    # FY2019 and any other year that does not split Table V. Table VI is NOT an
    # acceptable substitute: it is consular issuance only, and roughly 85% of
    # employment cases are adjustments of status, so it would undercount by
    # several times.
    for text, href in links:
        if (
            WHOLE_TABLE_V.search(text)
            and href.lower().endswith(".pdf")
            and not re.search(r"table\s*_?vi", href, re.I)
        ):
            return absolute(href), "whole"
    return None


def parse_pdf(path: Path) -> tuple[dict[str, dict[str, int]], dict[str, int] | None]:
    rows: dict[str, dict[str, int]] = {}
    grand: dict[str, int] | None = None

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if not EMPLOYMENT_HEADER.search(" ".join(text.split())):
                continue
            for raw in text.split("\n"):
                line = " ".join(raw.split())
                match = ROW.match(line)
                if not match:
                    continue
                name = match.group(1).strip()
                values = [int(v.replace(",", "")) for v in match.group(2).split()]
                if len(values) != 8:
                    continue
                record = dict(zip(FIELDS, values))
                if GRAND.match(name):
                    grand = record
                    continue
                if SKIP.match(name):
                    continue
                rows[name.upper()] = record
    return rows, grand


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", type=int, nargs="*", default=list(range(2012, 2025)))
    args = parser.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    limits_path = DATA_DIR / "limits-historical.json"
    limits = {}
    if limits_path.exists():
        raw = json.loads(limits_path.read_text())
        for entry in raw if isinstance(raw, list) else raw.get("limits", []):
            if entry.get("employment_worldwide"):
                limits[int(entry["fiscal_year"])] = entry["employment_worldwide"]

    issuance: dict[str, dict[str, dict[str, int]]] = {}
    report: dict[str, dict] = {}
    problems: list[str] = []

    for year in args.years:
        try:
            found = part2_url(year)
        except Exception as error:  # noqa: BLE001
            problems.append(f"FY{year}: report page unreachable ({type(error).__name__})")
            continue
        if not found:
            problems.append(f"FY{year}: no Table V employment link on the report page")
            continue
        url, layout = found

        path = CACHE / f"tableV_part2_{year}.pdf"
        if not path.exists() or path.stat().st_size < 5_000:
            try:
                path.write_bytes(fetch(url, binary=True))
            except Exception as error:  # noqa: BLE001
                problems.append(f"FY{year}: download failed ({type(error).__name__})")
                continue

        rows, grand = parse_pdf(path)
        if not rows:
            problems.append(f"FY{year}: parsed no country rows")
            continue

        columns: dict[str, dict[str, int]] = {}
        for name, record in rows.items():
            column = COLUMN_FOR_COUNTRY.get(name)
            if column:
                columns[column] = {k: record[k] for k in FIELDS}

        # Checksum one: the named columns must not exceed the published totals.
        # Checksum two: rest of world is whatever the grand total has left, which
        # is only meaningful if the grand total parsed.
        if grand:
            row_of_world = {}
            for field in FIELDS:
                named = sum(columns.get(c, {}).get(field, 0) for c in ("IN", "CN", "MX", "PH"))
                row_of_world[field] = grand[field] - named
            if any(v < 0 for v in row_of_world.values()):
                problems.append(f"FY{year}: named columns exceed the grand total")
            else:
                columns["ROW"] = row_of_world

        # Checksum three: the EB-2 grand total should land near its statutory
        # share of that year's employment limit. A parser that lost a page, or
        # read the wrong table, will miss this badly.
        share_check = None
        if grand and year in limits:
            expected = 0.286 * limits[year]
            share_check = round(grand["EB2"] / expected, 3)
            # A WIDE BAND ON PURPOSE. The 28.6% share is EB-2's floor, not its
            # ceiling: unused EB-1 numbers fall down to EB-2 in the same year,
            # so EB-2 legitimately exceeds its share. FY2022 issued 109,309
            # against an expected 80,511, a ratio of 1.36, and that is a real
            # feature of that year rather than a parse error. The check is here
            # to catch a lost page or the wrong table, which miss by far more.
            if not 0.5 <= share_check <= 1.8:
                problems.append(
                    f"FY{year}: EB-2 grand total {grand['EB2']:,} is {share_check}x "
                    f"its expected share of the {limits[year]:,} limit"
                )

        issuance[str(year)] = columns
        report[str(year)] = {
            "countries_parsed": len(rows),
            "grand_total_eb2": grand["EB2"] if grand else None,
            "eb2_share_of_expected": share_check,
            "source": url,
            "layout": layout,
        }
        note = f" · EB-2 grand {grand['EB2']:,}" if grand else " · no grand total"
        tag = "" if layout == "part2" else "  [combined Table V]"
        print(f"  FY{year}  {len(rows):>3} countries{note}{tag}")

    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Department of State, Report of the Visa Office, Table V Part 2",
        "note": (
            "Immigrant visas issued AND adjustments of status subject to numerical "
            "limitations, by foreign state of chargeability. Includes dependents, so "
            "these are visa numbers rather than principals. ROW is the grand total "
            "less India, mainland-born China, Mexico and the Philippines. A figure "
            "is supply only where the category was oversubscribed; where a column "
            "was Current it reflects demand."
        ),
        "years": report,
        "issuance": issuance,
    }
    OUT.write_text(json.dumps(payload, indent=1))

    print(f"\nyears parsed : {len(issuance)}  {sorted(issuance)}")
    print(f"written      : {OUT} ({OUT.stat().st_size/1024:.0f} KB)")
    if problems:
        print(f"\nPROBLEMS ({len(problems)}):")
        for line in problems:
            print("  ", line)
    else:
        print("\nno problems")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
