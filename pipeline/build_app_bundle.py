#!/usr/bin/env python3
"""Compact the parsed archive into the bundle the app downloads.

bulletins.json is 6 MB of flat rows, which is fine on a server and wrong to ship
to a phone. This collapses it into one dense array per series, indexed by month
offset from a shared start, which is both far smaller and the shape the model
actually reads.

Values are encoded as:
    "YYYY-MM-DD"  a cutoff date
    "C"           current
    "U"           unavailable
    null          the series did not exist that month
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# Series the app needs. Family is carried for the spillover forecaster only,
# and only for the columns that drive it.
WANTED_EMPLOYMENT = {
    "EB1", "EB2", "EB3", "EB3_OTHER_WORKERS", "EB4",
    "EB4_CERTAIN_RELIGIOUS_WORKERS", "EB5_UNRESERVED",
    "EB5_SET_ASIDE_RURAL", "EB5_SET_ASIDE_HIGH_UNEMPLOYMENT",
    "EB5_SET_ASIDE_INFRASTRUCTURE",
}
WANTED_FAMILY = {"F1", "F2A", "F2B", "F3", "F4"}
WANTED_COLUMNS = {"ROW", "CN", "IN", "MX", "PH"}


def month_index(month: str, start: str) -> int:
    sy, sm = (int(p) for p in start.split("-"))
    y, m = (int(p) for p in month.split("-"))
    return (y - sy) * 12 + (m - sm)


def main() -> int:
    archive = json.loads((DATA_DIR / "bulletins.json").read_text())
    bulletins = sorted(archive["bulletins"], key=lambda b: b["month"])
    start = bulletins[0]["month"]
    end = bulletins[-1]["month"]
    span = month_index(end, start) + 1

    series: dict[str, list] = {}
    for bulletin in bulletins:
        index = month_index(bulletin["month"], start)
        for row in bulletin["rows"]:
            category, column = row["category"], row["chargeability"]
            if column not in WANTED_COLUMNS or category is None:
                continue
            wanted = WANTED_EMPLOYMENT if row["track"] == "employment" else WANTED_FAMILY
            if category not in wanted:
                continue
            key = f"{row['chart']}|{row['track']}|{category}|{column}"
            if key not in series:
                series[key] = [None] * span
            kind = row["kind"]
            if kind == "date":
                series[key][index] = row["date"]
            elif kind == "current":
                series[key][index] = "C"
            elif kind == "unavailable":
                series[key][index] = "U"

    # Narrative sections, keyed by month. Small enough to ship whole, and the
    # model needs history to know whether a warning is unusual for this pair.
    sections = {
        b["month"]: b["sections"] for b in bulletins if b.get("sections")
    }

    # Priority-date density: how many people hold each priority-date month.
    # Without it the model reads speed without knowing what that speed was
    # moving through. See build_perm_density.py.
    density_path = DATA_DIR / "perm-density.json"
    density = json.loads(density_path.read_text()) if density_path.exists() else None

    limits = json.loads((DATA_DIR / "limits.json").read_text())
    historical = json.loads((DATA_DIR / "limits-historical.json").read_text())
    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "start_month": start,
        "end_month": end,
        "months": span,
        "missing_months": archive["months_missing"],
        "series": series,
        "sections": sections,
        "density": (density or {}).get("density", {}),
        "density_coverage": {
            "decision_years": sorted((density or {}).get("years", {}).keys()),
            "missing_years": (density or {}).get("years_missing", []),
        },
        # Employment limit per fiscal year, so the model can discount an advance
        # made in a year with far more visa numbers than today. Years absent
        # here fall back to the statutory base.
        "employment_limit_by_fy": {
            str(e["fiscal_year"]): e["employment_worldwide"] for e in historical["limits"]
        },
        "statutory_base": historical["statutory_base"],
        "limits": [
            {
                "fiscal_year": entry["fiscal_year"],
                "employment_worldwide": (entry.get("determined") or {}).get("employment_worldwide"),
                "family_worldwide": (entry.get("determined") or {}).get("family_worldwide"),
                "per_country": (entry.get("determined") or {}).get("per_country"),
                "determined": entry["has_determined_figure"],
            }
            for entry in limits["limits"]
        ],
    }

    out = DATA_DIR / "app-bundle.json"
    out.write_text(json.dumps(payload, separators=(",", ":")))
    raw = (DATA_DIR / "bulletins.json").stat().st_size
    size = out.stat().st_size
    print(f"series      : {len(series)}")
    print(f"months w/ sections: {len(sections)}")
    if density:
        cols = density.get("density", {})
        print(f"density columns   : {sorted(cols.keys())}")
    print(f"months      : {span}  ({start} .. {end})")
    print(f"bundle size : {size/1024:.0f} KB  (from {raw/1_048_576:.1f} MB raw, {raw/size:.0f}x smaller)")
    print(f"written     : {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
