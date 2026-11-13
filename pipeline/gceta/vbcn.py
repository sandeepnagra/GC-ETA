"""The visa-bulletin-cn dataset: the automated source for new bulletins.

Since Nov 2026 no State Department channel serves the Visa Bulletin to a
program: adoption.state.gov redirects every bulletin to a 404 page,
travel.state.gov blocks scripts at Cloudflare, the bulletin's e-mail list ended
in Nov 2021, and the Consular Affairs data API (cadataapi.state.gov) carries
passports and travel advisories but not the bulletin.

https://github.com/xjokerabab/visa-bulletin-cn publishes each bulletin as JSON,
entered and checked by a person against the official page (README, "更新节奏"),
which is why a bot block on travel.state.gov does not stop it. CC BY 4.0, so the
app credits it. It agreed with our own parse of the official pages on every one
of 3,807 cells across the 47 months both cover (2023-01 to 2026-11).

What it does not carry: Mexico and Philippines columns, the Dates for Filing
EB-5 set-aside rows, and the bulletin's narrative sections. A month built from
it is marked partial, and the model reads those columns' latest value from the
month that last had them instead of pretending they are current.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

REPO = "xjokerabab/visa-bulletin-cn"
RAW = f"https://raw.githubusercontent.com/{REPO}/main"
INDEX_URL = f"{RAW}/index.json"
LICENSE = "CC BY 4.0"
ATTRIBUTION = (
    "visa-bulletin-cn (github.com/xjokerabab/visa-bulletin-cn, yiminshuju.com), CC BY 4.0"
)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "visa-bulletin-cn"

CHARTS = {"A": "final_action", "B": "dates_for_filing"}
COLUMNS = {"WW": "ROW", "CHN": "CN", "IND": "IN"}
# Our category codes, as gceta.bulletin produces them for the same rows.
CATEGORIES = {
    "F1": "F1", "F2A": "F2A", "F2B": "F2B", "F3": "F3", "F4": "F4",
    "EB-1": "EB1", "EB-2": "EB2", "EB-3": "EB3", "EW-3": "EB3_OTHER_WORKERS",
    "EB-4": "EB4", "SR": "EB4_CERTAIN_RELIGIOUS_WORKERS",
    "EB-5": "EB5_UNRESERVED",
    "EB-5-RU": "EB5_SET_ASIDE_RURAL",
    "EB-5-HU": "EB5_SET_ASIDE_HIGH_UNEMPLOYMENT",
    "EB-5-INF": "EB5_SET_ASIDE_INFRASTRUCTURE",
}
# The official Dates for Filing chart's set-aside rows do not parse to these
# codes, so emitting them here would create series that exist only for months
# built from this dataset. Left out to keep the bundle's shape unchanged.
SKIP = {("B", "EB-5-RU"), ("B", "EB-5-HU"), ("B", "EB-5-INF")}

COVERED_COLUMNS = sorted(COLUMNS.values())
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTH = re.compile(r"^\d{4}-\d{2}$")


def path_for(ym: str) -> Path:
    return DATA_DIR / f"{ym}.json"


def validate(doc: dict, ym: str) -> list[str]:
    """Problems that make a month unusable. Empty means accept."""
    problems = []
    if doc.get("month") != ym:
        problems.append(f"month is {doc.get('month')!r}, expected {ym}")
    rows = doc.get("rows")
    if not isinstance(rows, list) or not rows:
        return problems + ["no rows"]
    seen = set()
    for row in rows:
        chart, cat, col, value = (
            row.get("chart"), row.get("category"), row.get("chargeability"), row.get("cutoff_date"),
        )
        if chart not in CHARTS or cat not in CATEGORIES or col not in COLUMNS:
            problems.append(f"unknown row {chart}/{cat}/{col}")
            continue
        if not (value in ("C", "U") or (isinstance(value, str) and DATE.match(value))):
            problems.append(f"bad value {value!r} at {chart}/{cat}/{col}")
        seen.add((chart, cat, col))
    # Every family and employment preference, for every column, on the final
    # action chart: a month missing any of these is not a whole bulletin.
    for cat in CATEGORIES:
        for col in COLUMNS:
            if ("A", cat, col) not in seen:
                problems.append(f"final action chart has no {cat}/{col}")
    return problems


def to_rows(doc: dict) -> list[dict]:
    """Map dataset rows onto gceta.bulletin's row shape."""
    out = []
    for row in doc["rows"]:
        if (row["chart"], row["category"]) in SKIP:
            continue
        category = CATEGORIES[row["category"]]
        value = row["cutoff_date"]
        kind = "current" if value == "C" else "unavailable" if value == "U" else "date"
        out.append(
            {
                "chart": CHARTS[row["chart"]],
                "track": "family" if category.startswith("F") else "employment",
                "category": category,
                "category_label": row["category"],
                "chargeability": COLUMNS[row["chargeability"]],
                "chargeability_label": row["chargeability"],
                "kind": kind,
                "date": value if kind == "date" else None,
            }
        )
    return out


def read_month(ym: str) -> tuple[dict, str] | None:
    """(document, sha256) for a committed month, or None."""
    path = path_for(ym)
    if not path.exists():
        return None
    body = path.read_bytes()
    return json.loads(body), hashlib.sha256(body).hexdigest()


def fiscal_year(ym: str) -> int:
    year, month = (int(p) for p in ym.split("-"))
    return year + 1 if month >= 10 else year


def bulletin_from(ym: str) -> dict | None:
    """A bulletins.json record built from the committed dataset month."""
    found = read_month(ym)
    if found is None:
        return None
    doc, sha = found
    return {
        "month": ym,
        "fiscal_year": fiscal_year(ym),
        "source_url": f"{RAW}/data/{ym}.json",
        "rows": to_rows(doc),
        "warnings": [],
        "sections": [],
        "content_sha256": sha,
        "fetched_at": doc.get("collected_at"),
        "partial": {
            "source": ATTRIBUTION,
            "columns": COVERED_COLUMNS,
            "official_url": doc.get("source_url"),
        },
    }
