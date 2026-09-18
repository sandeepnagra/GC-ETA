#!/usr/bin/env python3
"""Poll official feeds and propose candidate events for human triage.

This is a DETECTION tool, not a model input. It never touches a projection.

The distinction matters. Deciding that something happened can be automated;
deciding what it means for the numbers cannot. A court order arrives as a PDF,
and turning it into {"demand_multiplier": 0.0} is a judgement about which
population is affected, through which processing path, in which direction. Get
that wrong in an automated rule and the app confidently publishes one wrong
number to everyone at once. So this writes candidates with an EMPTY modelling
effect for a maintainer to fill in or reject. PLAN.md 8.1.

Only official sources are polled. Law-firm commentary and aggregator blogs are
deliberately excluded: much of that content is bulletin *prediction*, and
ingesting it would mean learning other people's guesses as though they were
data.

Usage:
    python watch_feeds.py                  # show new candidates
    python watch_feeds.py --write          # also update data/feed-state.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gceta.fetch import Fetcher  # noqa: E402

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
STATE_FILE = DATA_DIR / "feed-state.json"

FEEDS = [
    {
        "id": "uscis-newsroom",
        "title": "USCIS newsroom",
        "url": "https://www.uscis.gov/news/rss-feed/49034",
    },
    {
        "id": "federal-register-dhs",
        "title": "Federal Register, DHS",
        "url": "https://www.federalregister.gov/api/v1/documents.rss"
               "?conditions%5Bagencies%5D%5B%5D=homeland-security-department",
    },
    {
        "id": "federal-register-state",
        "title": "Federal Register, State Department",
        "url": "https://www.federalregister.gov/api/v1/documents.rss"
               "?conditions%5Bagencies%5D%5B%5D=state-department",
    },
    {
        # Worth noting: travel.state.gov's HTML is behind the bot filter that
        # forced the bulletin ingest onto a mirror, but its RSS is not.
        "id": "travel-state",
        "title": "State Department travel alerts",
        "url": "https://travel.state.gov/_res/rss/TAsTWs.xml",
    },
]

# Terms that make an item worth a human look. Matched on WORD BOUNDARIES, which
# matters more than it sounds: a first version matched "perm" as a substring and
# surfaced a drawbridge regulation, several information-collection notices and
# anything containing "permanent". Short tokens need anchoring or the queue
# fills with noise and a real item gets buried.
WATCH_TERMS = [
    "visa bulletin", "priority date", "final action date", "dates for filing",
    "adjustment of status", "i-485", "i-140", "i-693", "employment-based",
    "per-country", "public charge", "proclamation", "travel ban",
    "immigrant visa", "consular", "retrogress", "retrogression", "green card",
    "labor certification", "eb-1", "eb-2", "eb-3", "eb-4", "eb-5",
    "national interest waiver", "chargeability", "visa availability",
]

# Terms that raise an item from "worth reading" to "likely event".
STRONG_TERMS = [
    "visa bulletin", "priority date", "final action date", "dates for filing",
    "public charge", "retrogress", "retrogression", "per-country",
    "visa availability", "chargeability",
]

# Generic administrative notices that mention our terms in passing. These are
# the bulk of any agency feed and almost never change a projection.
# One weak term is not enough. "consular" alone surfaced every country travel
# advisory in the State feed, including Antarctica. Two weak terms, or one
# strong term, is the bar.
MIN_SCORE = 2

NOISE_PATTERNS = [
    r"agency information collection",
    r"\d+-day notice of proposed information collection",
    r"drawbridge",
    r"information collection activities",
]


def parse_feed(xml_text: str) -> list[dict]:
    items: list[dict] = []
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError:
        return items

    def text(node, *names):
        for name in names:
            found = node.find(name)
            if found is not None and found.text:
                return " ".join(found.text.split())
        return ""

    # RSS 2.0 and Atom both appear across these sources.
    for node in root.iter():
        tag = node.tag.rsplit("}", 1)[-1]
        if tag not in {"item", "entry"}:
            continue
        link = text(node, "link", "{http://www.w3.org/2005/Atom}link")
        if not link:
            anchor = node.find("{http://www.w3.org/2005/Atom}link")
            if anchor is not None:
                link = anchor.attrib.get("href", "")
        items.append(
            {
                "title": text(node, "title", "{http://www.w3.org/2005/Atom}title"),
                "link": link,
                "published": text(
                    node, "pubDate", "updated",
                    "{http://www.w3.org/2005/Atom}updated",
                ),
                "summary": text(
                    node, "description", "summary",
                    "{http://www.w3.org/2005/Atom}summary",
                )[:400],
            }
        )
    return items


def _contains(haystack: str, term: str) -> bool:
    """Word-boundary match, so "perm" does not fire on "permanent"."""
    return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", haystack) is not None


def score(item: dict) -> tuple[int, list[str]]:
    haystack = f"{item['title']} {item['summary']}".lower()
    if any(re.search(pattern, haystack) for pattern in NOISE_PATTERNS):
        return 0, []
    hits = [term for term in WATCH_TERMS if _contains(haystack, term)]
    strong = [term for term in STRONG_TERMS if _contains(haystack, term)]
    return len(hits) + 2 * len(strong), hits


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"schema_version": 1, "seen": {}}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="persist seen links")
    parser.add_argument("--all", action="store_true", help="include already-seen items")
    args = parser.parse_args()

    fetcher = Fetcher(use_cache=False)
    state = load_state()
    seen: dict[str, str] = state.get("seen", {})
    candidates: list[dict] = []
    checked = 0

    for feed in FEEDS:
        try:
            doc = fetcher.get(feed["url"], allow_404=True)
        except Exception as error:  # a feed being down must not break the run
            print(f"  !!  {feed['id']}: {error.__class__.__name__}")
            continue
        if doc is None:
            print(f"  404 {feed['id']}")
            continue
        items = parse_feed(doc.text)
        checked += len(items)
        for item in items:
            if not item["link"]:
                continue
            if item["link"] in seen and not args.all:
                continue
            weight, hits = score(item)
            if weight < MIN_SCORE:
                continue
            candidates.append({**item, "feed": feed["id"], "score": weight, "matched": hits})
        print(f"  ok  {feed['id']:24} {len(items):>3} items")

    candidates.sort(key=lambda c: -c["score"])

    print(f"\nscanned {checked} items across {len(FEEDS)} feeds")
    print(f"candidates for triage: {len(candidates)}\n")
    for candidate in candidates[:20]:
        print(f"  [{candidate['score']:>2}] {candidate['title'][:96]}")
        print(f"       {candidate['feed']}  ·  {', '.join(candidate['matched'][:5])}")
        print(f"       {candidate['link'][:110]}")

    if candidates:
        print(
            "\nNext step is a person, not a script: confirm against the primary "
            "source, then add an entry to data/events.json with a modelling "
            "effect, a verified_against URL and today's last_checked date."
        )

    if args.write:
        now = datetime.now(timezone.utc).isoformat()
        for candidate in candidates:
            seen[candidate["link"]] = now
        state["seen"] = seen
        state["last_run"] = now
        STATE_FILE.write_text(json.dumps(state, indent=1))
        print(f"\nstate written: {STATE_FILE} ({len(seen)} links seen)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
