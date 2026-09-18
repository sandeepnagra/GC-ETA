#!/usr/bin/env python3
"""Phase 0 data spike: what the bulletin archive actually supports.

This answers questions PLAN.md section 9 says to settle before Level B is
designed, using the parsed archive rather than assumption. Run after
build_bulletins.py.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data" / "bulletins.json"

MAIN_COLUMNS = ["ROW", "CN", "IN", "MX", "PH"]
MAIN_CATEGORIES = ["EB1", "EB2", "EB3", "EB3_OTHER_WORKERS", "EB4", "EB5_UNRESERVED"]


def load() -> dict:
    return json.loads(DATA.read_text())


def series(bulletins, chart, track, category, chargeability):
    """Ordered (month, CellValue-ish dict) for one cell across the archive."""
    out = []
    for b in bulletins:
        for r in b["rows"]:
            if (
                r["chart"] == chart
                and r["track"] == track
                and r["category"] == category
                and r["chargeability"] == chargeability
            ):
                out.append((b["month"], r))
                break
    return sorted(out)


def rule(title: str) -> None:
    print(f"\n{'=' * 72}\n{title}\n{'=' * 72}")


def main() -> int:
    doc = load()
    bulletins = sorted(doc["bulletins"], key=lambda b: b["month"])
    months = [b["month"] for b in bulletins]

    rule("1. COVERAGE")
    print(f"months parsed      : {len(months)}  ({months[0]} .. {months[-1]})")
    print(f"months missing     : {doc['months_missing']}")
    print(f"rows               : {sum(len(b['rows']) for b in bulletins):,}")
    revisions = defaultdict(set)
    for b in bulletins:
        revisions[b["month"]].add(b["content_sha256"])
    dupes = {m: v for m, v in revisions.items() if len(v) > 1}
    print(f"months with >1 hash: {len(dupes)}")

    rule("2. DATES FOR FILING: WHEN DOES THE CHART ACTUALLY START?")
    print("PLAN.md C6 asserts October 2015. Checking against the archive.")
    dff_months = sorted(
        {b["month"] for b in bulletins if any(r["chart"] == "dates_for_filing" for r in b["rows"])}
    )
    fa_months = sorted(
        {b["month"] for b in bulletins if any(r["chart"] == "final_action" for r in b["rows"])}
    )
    print(f"  final action  : {fa_months[0]} .. {fa_months[-1]}  ({len(fa_months)} months)")
    print(f"  dates for filing: {dff_months[0]} .. {dff_months[-1]}  ({len(dff_months)} months)")
    gaps = [m for m in months if m >= dff_months[0] and m not in dff_months]
    print(f"  months after start with no filing chart: {len(gaps)} {gaps[:8]}")

    rule("3. COLUMN CHURN (PLAN.md L24)")
    by_label: dict[str, list[str]] = defaultdict(list)
    for b in bulletins:
        labels = {r["chargeability"] or f"?{r['chargeability_label'][:28]}" for r in b["rows"]}
        for lab in labels:
            by_label[lab].append(b["month"])
    for lab, ms in sorted(by_label.items(), key=lambda kv: -len(kv[1])):
        print(f"  {lab:34} {len(ms):>4} months   {min(ms)} .. {max(ms)}")

    rule("4. CATEGORY CHURN (employment)")
    cat_months: dict[str, list[str]] = defaultdict(list)
    for b in bulletins:
        cats = {
            r["category"] or f"?{r['category_label'][:30]}"
            for r in b["rows"]
            if r["track"] == "employment"
        }
        for c in cats:
            cat_months[c].append(b["month"])
    for c, ms in sorted(cat_months.items(), key=lambda kv: -len(kv[1])):
        print(f"  {c:34} {len(ms):>4} months   {min(ms)} .. {max(ms)}")

    rule("5. FILING-CHART OPENING EVENTS  (Phase 0 item 5)")
    print("Feasibility of the materialisation-rate estimator in PLAN.md 6.2:")
    print("how many times did the filing chart advance for each pair?\n")
    print(f"  {'category':<20}{'col':<5}{'advances':>9}{'retrogress':>11}{'  span'}")
    for cat in MAIN_CATEGORIES:
        for col in MAIN_COLUMNS:
            s = series(bulletins, "dates_for_filing", "employment", cat, col)
            dated = [(m, r["date"]) for m, r in s if r["kind"] == "date"]
            if len(dated) < 2:
                continue
            adv = ret = 0
            for (_, a), (_, b_) in zip(dated, dated[1:]):
                if b_ > a:
                    adv += 1
                elif b_ < a:
                    ret += 1
            print(f"  {cat:<20}{col:<5}{adv:>9}{ret:>11}  {dated[0][0]}..{dated[-1][0]}")

    rule("6. SANITY: EB-2 INDIA FINAL ACTION, ONE ROW PER FISCAL YEAR OCTOBER")
    s = series(bulletins, "final_action", "employment", "EB2", "IN")
    for month, r in s:
        if month.endswith("-10"):
            val = r["date"] if r["kind"] == "date" else r["kind"].upper()
            print(f"  {month}   {val}")
    last = s[-1]
    print(f"  {last[0]}   {last[1]['date'] or last[1]['kind'].upper()}   <- latest")

    rule("7. RETROGRESSION AND UNAVAILABLE FREQUENCY (employment, main columns)")
    print(f"  {'category':<20}{'col':<5}{'U months':>9}{'retro':>8}{'  of':>6}")
    for cat in MAIN_CATEGORIES:
        for col in MAIN_COLUMNS:
            s = series(bulletins, "final_action", "employment", cat, col)
            if len(s) < 12:
                continue
            u = sum(1 for _, r in s if r["kind"] == "unavailable")
            dated = [r["date"] for _, r in s if r["kind"] == "date"]
            ret = sum(1 for a, b_ in zip(dated, dated[1:]) if b_ < a)
            print(f"  {cat:<20}{col:<5}{u:>9}{ret:>8}{len(s):>6}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
