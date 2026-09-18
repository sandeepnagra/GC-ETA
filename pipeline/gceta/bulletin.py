"""Visa Bulletin: URL construction and HTML parsing.

Two things here are load-bearing and were wrong in earlier drafts of the plan.

1. The archive lives on adoption.state.gov, which serves the same content tree
   as travel.state.gov without the bot filter. See PLAN.md section 8.
2. The path segment is the FISCAL year, while the filename carries the calendar
   month and year. October 2015 lives under /2016/. Getting this backwards
   silently yields 404s for every October through December.

The parser identifies tables by content rather than position, because the
columns churn across years: an El Salvador/Guatemala/Honduras column existed
roughly 2016-2022, a separate Vietnam EB-5 column appeared around 2018-2020,
and the EB-5 set-aside rows only exist from FY2022. PLAN.md L24.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, asdict
from datetime import date

from bs4 import BeautifulSoup

BASE = "https://adoption.state.gov/content/travel/en/legal/visa-law0/visa-bulletin"

MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]

# Two-digit years below this belong to the 2000s, at or above it the 1900s.
# Priority dates in play run from the early 1990s to the present.
_CENTURY_PIVOT = 50

_DATE_RE = re.compile(r"^(\d{1,2})([A-Z]{3})(\d{2})$")

_MONTH_ABBR = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}

# Normalised codes. The raw label is always preserved alongside these, so an
# unrecognised row is still captured rather than dropped.
_CATEGORY_CODES = [
    ("other workers", "EB3_OTHER_WORKERS"),
    ("certain religious workers", "EB4_CERTAIN_RELIGIOUS_WORKERS"),
    ("set aside: rural", "EB5_SET_ASIDE_RURAL"),
    ("set aside: high unemployment", "EB5_SET_ASIDE_HIGH_UNEMPLOYMENT"),
    ("set aside: infrastructure", "EB5_SET_ASIDE_INFRASTRUCTURE"),
    ("5th unreserved", "EB5_UNRESERVED"),
    ("5th non-regional center", "EB5_NON_REGIONAL_CENTER"),
    ("5th regional center", "EB5_REGIONAL_CENTER"),
    ("targeted employment areas", "EB5_TARGETED_EMPLOYMENT_AREAS"),
    ("1st", "EB1"),
    ("2nd", "EB2"),
    ("3rd", "EB3"),
    ("4th", "EB4"),
    ("5th", "EB5"),
]

# Family labels changed style mid-archive: older bulletins use bare ordinals
# ("1st", "2A"), newer ones use the F-prefixed codes. Order matters here, since
# the 2A/2B needles must be tried before the broader "2" ones.
_FAMILY_CODES = [
    ("f2a", "F2A"), ("f2b", "F2B"),
    ("2a", "F2A"), ("2b", "F2B"),
    ("f1", "F1"), ("f2", "F2"), ("f3", "F3"), ("f4", "F4"),
    ("1st", "F1"), ("2nd", "F2"), ("3rd", "F3"), ("4th", "F4"),
]

_CHARGEABILITY_CODES = [
    ("all chargeability", "ROW"),
    ("china", "CN"),
    ("india", "IN"),
    ("mexico", "MX"),
    ("philippines", "PH"),
    ("el salvador", "SV_GT_HN"),
    ("vietnam", "VN"),
    # A separate Dominican Republic column ran Jun 2010 to Mar 2011. It was not
    # in the plan's list of historical columns; the archive backfill found it.
    ("dominican republic", "DO"),
]


def fiscal_year(month: int, year: int) -> int:
    """US federal fiscal year: October starts the next one."""
    return year + 1 if month >= 10 else year


def bulletin_url(month: int, year: int) -> str:
    return (
        f"{BASE}/{fiscal_year(month, year)}"
        f"/visa-bulletin-for-{MONTH_NAMES[month - 1]}-{year}.html"
    )


def _clean(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    return " ".join(text.split())


def _code_for(label: str, table: list[tuple[str, str]]) -> str | None:
    """Match a label to a code, tolerating stray spaces inside words.

    The CMS occasionally splits a word across markup, which surfaces as
    "All Charge ability Areas" (seen in January 2010). Comparing a
    space-stripped form as well catches those without loosening the match.
    """
    low = _clean(label).lower()
    squashed = low.replace(" ", "")
    for needle, code in table:
        if needle in low or needle.replace(" ", "") in squashed:
            return code
    return None


_FILING_MARKER = "for filing applications"

_FINAL_MARKERS = (
    "final action date",
    "cut-off date listed below",
    "cutoff date listed below",
    "cut-off date shown below",
)

@dataclass(frozen=True)
class CellValue:
    """One cell of a bulletin chart.

    `kind` is one of: date, current, unavailable, empty. "C" and "U" are not
    points on a date line, and collapsing them to one would corrupt both the
    velocity model and the backtest metric. PLAN.md sections 6.1 and 10.
    """

    kind: str
    date: str | None = None
    raw: str = ""


def parse_cell(raw: str) -> CellValue:
    text = _clean(raw).upper().replace(" ", "")
    if not text:
        return CellValue(kind="empty", raw=raw)
    # Strip footnote markers and stray punctuation the CMS sometimes leaves.
    text = text.strip("*†‡. ")
    if text in {"C", "CURRENT"}:
        return CellValue(kind="current", raw=raw)
    if text in {"U", "UNAVAILABLE"}:
        return CellValue(kind="unavailable", raw=raw)
    match = _DATE_RE.match(text)
    if match:
        day, abbr, yy = match.groups()
        month = _MONTH_ABBR.get(abbr)
        if month:
            year = int(yy)
            year += 1900 if year >= _CENTURY_PIVOT else 2000
            try:
                return CellValue(
                    kind="date",
                    date=date(year, month, int(day)).isoformat(),
                    raw=raw,
                )
            except ValueError:
                pass
    return CellValue(kind="empty", raw=raw)


def _chart_kind(table) -> str | None:
    """Final action or dates for filing, decided by the surrounding prose.

    Heading markup is inconsistent across years, but the explanatory sentence
    above each table is stable. Three phrasings matter:

    - "final action date listed below"  -> final action (Oct 2015 onward)
    - "cut-off date listed below"       -> final action (before Oct 2015, when
                                           the Dates for Filing chart did not
                                           exist and cutoffs were the only chart)
    - "for filing applications"         -> dates for filing

    Walking backwards and returning on the first hit means the nearest
    preceding marker wins, which is what disambiguates the two employment
    tables in a modern bulletin.
    """
    inspected = 0
    for node in table.find_all_previous(string=True):
        text = _clean(node).lower()
        if len(text) < 8:
            continue
        inspected += 1
        if inspected > 60:
            break
        filing_at = text.find(_FILING_MARKER)
        final_at = min(
            (pos for pos in (text.find(m) for m in _FINAL_MARKERS) if pos != -1),
            default=-1,
        )
        if filing_at == -1 and final_at == -1:
            continue
        if filing_at == -1:
            return "final_action"
        if final_at == -1:
            return "dates_for_filing"
        # Both in one node: the later phrase is the nearer one to the table.
        return "dates_for_filing" if filing_at > final_at else "final_action"
    return None


def _track(header_label: str) -> str | None:
    low = header_label.lower()
    if "employment" in low:
        return "employment"
    if "family" in low:
        return "family"
    return None


def parse_bulletin(html: str, month: int, year: int, *, source_url: str) -> dict:
    """Parse one bulletin into flat (chart, track, category, chargeability) rows.

    Flat tuples rather than a fixed column layout, so a year with an extra
    country column parses without a schema change.
    """
    soup = BeautifulSoup(html, "lxml")
    rows: list[dict] = []
    warnings: list[str] = []

    for table in soup.find_all("table"):
        tr_list = table.find_all("tr")
        if len(tr_list) < 2:
            continue
        header_cells = [
            _clean(c.get_text(" ", strip=True))
            for c in tr_list[0].find_all(["td", "th"])
        ]
        if len(header_cells) < 2:
            continue
        track = _track(header_cells[0])
        if track is None:
            continue
        chart = _chart_kind(table)
        if chart is None:
            warnings.append(f"table with header {header_cells[0]!r} had no chart context")
            continue

        columns = header_cells[1:]
        code_table = _CATEGORY_CODES if track == "employment" else _FAMILY_CODES

        for tr in tr_list[1:]:
            cells = [
                _clean(c.get_text(" ", strip=True))
                for c in tr.find_all(["td", "th"])
            ]
            if len(cells) < 2:
                continue
            category_label = cells[0]
            if not category_label:
                continue
            category_code = _code_for(category_label, code_table)
            if category_code is None:
                warnings.append(f"unmapped {track} category {category_label!r}")
            for index, value in enumerate(cells[1:]):
                if index >= len(columns):
                    warnings.append(
                        f"row {category_label!r} has more cells than header columns"
                    )
                    break
                column_label = columns[index]
                parsed = parse_cell(value)
                if parsed.kind == "empty" and not parsed.raw.strip():
                    continue
                rows.append(
                    {
                        "chart": chart,
                        "track": track,
                        "category": category_code,
                        "category_label": category_label,
                        "chargeability": _code_for(column_label, _CHARGEABILITY_CODES),
                        "chargeability_label": column_label,
                        **{k: v for k, v in asdict(parsed).items() if k != "raw"},
                    }
                )

    return {
        "month": f"{year:04d}-{month:02d}",
        "fiscal_year": fiscal_year(month, year),
        "source_url": source_url,
        "rows": rows,
        "warnings": warnings,
    }
