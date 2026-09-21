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
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
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
        # EOIR (immigration courts) sits under Justice, and DOJ is also where
        # the government's own compliance notices for an enjoined policy
        # sometimes land.
        "id": "federal-register-justice",
        "title": "Federal Register, Justice Department",
        "url": "https://www.federalregister.gov/api/v1/documents.rss"
               "?conditions%5Bagencies%5D%5B%5D=justice-department",
    },
    {
        # PERM and prevailing-wage rulemaking lives here, not at DHS.
        "id": "federal-register-labor",
        "title": "Federal Register, Labor Department",
        "url": "https://www.federalregister.gov/api/v1/documents.rss"
               "?conditions%5Bagencies%5D%5B%5D=labor-department",
    },
    {
        # A rule withdrawn before it ever reached formal proposal (Unified
        # Agenda stage) will never show up here -- only reginfo.gov's biannual
        # agenda tracks that. But a rule withdrawn AFTER an NPRM, or an agency
        # announcing it is complying with a court order, is a Federal Register
        # document, and not always from DHS or State (e.g. an EO implemented
        # by Labor or Justice). These three term searches are deliberately not
        # agency-scoped, so score() carries the whole burden of keeping them on
        # topic -- confirmed live: "visa withdrawal" surfaced the H-1B fee rule
        # and the 60-day grace period rule, "immigration injunction" surfaced
        # real DHS litigation, without agency-list noise.
        "id": "federal-register-immigration-court",
        "title": "Federal Register, full text: immigration + injunction",
        "url": "https://www.federalregister.gov/api/v1/documents.rss"
               "?conditions%5Bterm%5D=immigration+injunction",
    },
    {
        "id": "federal-register-immigration-eo",
        "title": "Federal Register, full text: immigration + executive order",
        "url": "https://www.federalregister.gov/api/v1/documents.rss"
               "?conditions%5Bterm%5D=immigration+executive+order",
    },
    {
        "id": "federal-register-visa-withdrawal",
        "title": "Federal Register, full text: visa + withdrawal",
        "url": "https://www.federalregister.gov/api/v1/documents.rss"
               "?conditions%5Bterm%5D=visa+withdrawal",
    },
    {
        # Worth noting: travel.state.gov's HTML is behind the bot filter that
        # forced the bulletin ingest onto a mirror, but its RSS is not.
        "id": "travel-state",
        "title": "State Department travel alerts",
        "url": "https://travel.state.gov/_res/rss/TAsTWs.xml",
    },
]

# CourtListener (Free Law Project) indexes federal opinions and dockets, and
# its search API answers unauthenticated at a low rate limit -- confirmed live
# with no token. A court blocking or reinstating an executive order is often
# visible here days before any agency gets around to a Federal Register notice
# about it, which is the gap this closes: the entries in events.json for the
# Rhode Island and 75-country cases were both, in the end, court orders first.
# A free token (COURTLISTENER_TOKEN) raises the rate limit and is worth adding
# as a repo secret if this starts getting throttled, but is not required to
# run at all.
#
# Confirmed live: an unquoted query ANDs bare words, not a phrase, so
# "green card injunction" also matched "Blue Lake Rancheria v. Kalshi" on
# "green" and "card" appearing nowhere near each other. Quoting the phrase and
# checking only the case caption (not the snippet, which CourtListener fills
# with the PDF's cover page rather than the matched passage) fixed that: each
# of these returns real immigration litigation -- v. Trump, v. Mullin (DHS),
# v. USCIS -- top-ranked by recency.
COURTLISTENER_QUERIES = [
    '"green card" injunction',
    '"employment-based" injunction',
    '"adjustment of status" vacated',
    '"per-country" injunction',
    '"green card" "executive order"',
]
# The search is a phrase match, not a topic filter -- a court's own text search
# ranking, not our score(), is what is trusted here. So candidates skip the
# WATCH_TERMS gate entirely and take only the newest few per query instead.
COURTLISTENER_PER_QUERY = 5

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
    "immigration",
    # A rule or order changing status is news the moment it moves either
    # direction. These are deliberately kept as WEAK terms, not strong: e.g.
    # "withdrawal" alone fires on any agency's unrelated rule withdrawal, and
    # the two-weak-terms bar is what keeps that out while still catching it
    # paired with "immigration", "green card", or similar.
    "executive order", "injunction", "vacated", "enjoined",
    "temporary restraining order", "preliminary injunction", "withdrawal",
    "withdrawn", "rescind", "rescinded", "struck down", "unconstitutional",
    "stayed",
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


def parse_courtlistener(json_text: str) -> list[dict]:
    """CourtListener's v4 search response, reshaped to the RSS item shape."""
    try:
        payload = json.loads(json_text)
    except json.JSONDecodeError:
        return []
    items: list[dict] = []
    for result in payload.get("results", []):
        link = result.get("absolute_url", "")
        opinions = result.get("opinions") or [{}]
        snippet = result.get("snippet") or opinions[0].get("snippet") or ""
        items.append(
            {
                "title": result.get("caseName", ""),
                "link": f"https://www.courtlistener.com{link}" if link else "",
                "published": result.get("dateFiled", ""),
                "summary": " ".join(snippet.split())[:400],
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
    token = os.environ.get("COURTLISTENER_TOKEN")
    if token:
        fetcher._session.headers.update({"Authorization": f"Token {token}"})
    state = load_state()
    seen: dict[str, str] = state.get("seen", {})
    candidates: list[dict] = []
    checked = 0

    sources = [(feed["id"], feed["url"], parse_feed, True) for feed in FEEDS] + [
        (
            f"courtlistener:{query}",
            "https://www.courtlistener.com/api/rest/v4/search/"
            f"?q={quote(query)}&type=o&order_by=dateFiled+desc",
            parse_courtlistener,
            False,
        )
        for query in COURTLISTENER_QUERIES
    ]

    for feed_id, url, parse, gate_on_terms in sources:
        try:
            doc = fetcher.get(url, allow_404=True)
        except Exception as error:  # a feed being down must not break the run
            print(f"  !!  {feed_id}: {error.__class__.__name__}")
            continue
        if doc is None:
            print(f"  404 {feed_id}")
            continue
        items = parse(doc.text)
        if not gate_on_terms:
            items = items[:COURTLISTENER_PER_QUERY]
        checked += len(items)
        for item in items:
            if not item["link"]:
                continue
            if item["link"] in seen and not args.all:
                continue
            if gate_on_terms:
                weight, hits = score(item)
                if weight < MIN_SCORE:
                    continue
            else:
                weight, hits = MIN_SCORE, ["court search: " + feed_id.split(":", 1)[1]]
            candidates.append({**item, "feed": feed_id, "score": weight, "matched": hits})
        print(f"  ok  {feed_id:24} {len(items):>3} items")

    candidates.sort(key=lambda c: -c["score"])

    print(f"\nscanned {checked} items across {len(sources)} feeds")
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
