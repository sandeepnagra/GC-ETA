#!/usr/bin/env python3
"""How long USCIS takes to decide an employment-based I-485.

The one question the app abandoned. Once final action reaches a filed
applicant the bulletin has nothing left to say, and what remains is
adjudication time, which this project did not model and said so. For someone
who has filed and gone current, that is their whole remaining wait.

WHY THIS SOURCE AND NOT THE PROCESSING TIMES PAGE. The obvious objection to
using any USCIS processing time for an employment-based I-485 is that a
backlogged case sits for years waiting for a visa number, so receipt-to-
decision would measure the queue rather than the adjudication, and the queue
is already what the rest of the model predicts. Counting it here would be
double counting.

That objection does not apply to this dataset, and the factsheet says so
itself: "Processing times are defined as the number of months it took for an
application, petition, or request to be processed from receipt to completion
in a given time period. Visa regressed I-485s and revoked petitions or
applications are excluded." Retrogressed cases are taken out. What is left
is time to decide a case that could be decided, which is the number a filed
and current applicant actually needs. The figures bear that out: 5.5 to 11
months across nine years, far too short to contain an India EB-2 wait.

WHAT THIS IS NOT. These are ANNUAL MEDIANS, one per fiscal year. The spread
across years is how much the median has moved, not how much individual cases
differ from each other, and an individual spread is certainly wider. So the
range here may be reported as "the typical wait has run between X and Y",
and must never be dressed up as a tenth-to-ninetieth percentile for one
person. The model file keeps that distinction; see processing.ts.

The egov processing-times API and its historic-pt page both sit behind
Cloudflare and answer 403 to anything scripted, so this reads the published
factsheet PDF instead. That ends at FY2024 and is refreshed by USCIS
irregularly, which the output records rather than hides.

Usage:
    python build_processing_times.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gceta.fetch import Fetcher  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "processing-times.json"
URL = (
    "https://www.uscis.gov/sites/default/files/document/fact-sheets/"
    "historical_pt_factsheet_fy16_to_fy24.pdf"
)
FIRST_FISCAL_YEAR = 2016
ROW = "I-485 Employment-based adjustment applications"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    import io as _io

    import pdfplumber

    document = Fetcher(use_cache=False).get(URL)
    with pdfplumber.open(_io.BytesIO(document.body)) as pdf:
        text = "\n".join((page.extract_text() or "") for page in pdf.pages)

    line = next((l for l in text.splitlines() if ROW in l), None)
    if line is None:
        print(f"could not find the row {ROW!r}; the factsheet layout changed")
        return 1

    numbers = re.findall(r"\d+(?:\.\d+)?", line.split(ROW, 1)[1])
    if len(numbers) < 5:
        print(f"only {len(numbers)} figures on the row; refusing to guess")
        return 1

    medians = {
        str(FIRST_FISCAL_YEAR + i): float(n) for i, n in enumerate(numbers)
    }

    # The factsheet footnotes a partial year rather than marking the table.
    partial = {}
    for match in re.finditer(r"FY\s*(\d{4}) uses data from ([^.\n]+)", text):
        partial[match.group(1)] = match.group(2).strip()

    exclusion = ""
    flat = " ".join(text.split())
    note = re.search(r"Processing times are defined[^.]*\.[^.]*excluded\.", flat)
    if note:
        exclusion = note.group(0)

    print(f"{ROW}:")
    for fy, value in medians.items():
        mark = "  (partial year)" if fy in partial else ""
        print(f"  FY{fy}: {value} months{mark}")
    print(f"\nexclusion note found: {'yes' if exclusion else 'NO -- check the PDF'}")

    if args.dry_run:
        print("\n--dry-run, nothing written")
        return 0

    OUT.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "source": URL,
                "note": (
                    "Median months from receipt to completion for employment-based "
                    "I-485s, one figure per fiscal year. These are ANNUAL MEDIANS: "
                    "the spread between years is movement in the median, not the "
                    "spread between individual cases, which is wider. Must not be "
                    "presented as percentiles for one applicant."
                ),
                "why_this_is_not_the_visa_wait": (
                    "Retrogressed cases are excluded from the figures, so what is "
                    "measured is time to decide a case that could be decided rather "
                    "than time spent waiting for a visa number. The queue wait is "
                    "modelled separately, from the bulletin."
                ),
                "exclusion_note": exclusion,
                "partial_years": partial,
                "i485_employment_median_months": medians,
                "last_checked": date.today().isoformat(),
            },
            indent=1,
        )
        + "\n"
    )
    print(f"\nwrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
