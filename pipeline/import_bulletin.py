#!/usr/bin/env python3
"""Bring a Visa Bulletin page into data/bulletin-pages/ by hand.

Since Nov 2026 no source the pipeline can fetch from serves the bulletin:
adoption.state.gov redirects every bulletin URL to a 404 page, and
travel.state.gov answers automated clients with a Cloudflare block. So each
new bulletin comes in this way, about once a month:

    1. Open the bulletin on travel.state.gov in your browser.
    2. Save the page (File > Save Page As..., "Web Page, HTML Only").
    3. python pipeline/import_bulletin.py ~/Downloads/<saved file>.html
    4. Commit data/bulletin-pages/ and push. Refresh data builds from it.

The month is read from the page's own title, and the page has to parse into
both a family and an employment table before it is accepted, so a saved
Cloudflare challenge or the wrong page cannot slip in.

    python import_bulletin.py FILE [--month YYYY-MM] [--source URL] [--force]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gceta.bulletin import MONTH_NAMES, bulletin_url, parse_bulletin  # noqa: E402
from gceta.pages import page_path, save_page  # noqa: E402

TITLE_MONTH = re.compile(r"visa\s+bulletin\s+(?:for\s+)?([a-z]+)\s+(\d{4})", re.I)


def month_from_title(html: str) -> str | None:
    title = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    match = TITLE_MONTH.search(title.group(1) if title else html[:20000])
    if not match or match.group(1).lower() not in MONTH_NAMES:
        return None
    return f"{int(match.group(2)):04d}-{MONTH_NAMES.index(match.group(1).lower()) + 1:02d}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("file", type=Path)
    parser.add_argument("--month", help="YYYY-MM, if the page title does not say")
    parser.add_argument("--source", help="where the page came from (default: its travel.state.gov URL)")
    parser.add_argument("--note", default="")
    parser.add_argument("--force", action="store_true", help="replace an existing committed page")
    args = parser.parse_args()

    body = args.file.read_bytes()
    html = body.decode("utf-8", errors="replace")
    if "cloudflare" in html.lower() and "attention required" in html.lower():
        print("That is a Cloudflare block page, not the bulletin.", file=sys.stderr)
        return 1

    titled = month_from_title(html)
    ym = args.month or titled
    if ym is None:
        print("Could not read the month from the page title; pass --month YYYY-MM.", file=sys.stderr)
        return 1
    if args.month and titled and args.month != titled:
        print(f"--month {args.month} disagrees with the page title ({titled}).", file=sys.stderr)
        return 1

    year, month = (int(x) for x in ym.split("-"))
    parsed = parse_bulletin(html, month, year, source_url="")
    tracks = {r["track"] for r in parsed["rows"]}
    if not {"family", "employment"} <= tracks:
        print(
            f"Parsed {len(parsed['rows'])} rows, tracks {sorted(tracks)}: "
            "expected both family and employment tables. Not importing.",
            file=sys.stderr,
        )
        return 1

    if page_path(ym).exists() and not args.force:
        print(f"{page_path(ym)} already exists; pass --force to replace it.", file=sys.stderr)
        return 1

    source = args.source or bulletin_url(month, year).replace(
        "https://adoption.state.gov", "https://travel.state.gov"
    )
    path = save_page(ym, body, source=source, note=args.note)
    print(f"imported {ym}: {len(parsed['rows'])} rows -> {path}")
    for warning in parsed["warnings"]:
        print(f"  warning: {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
