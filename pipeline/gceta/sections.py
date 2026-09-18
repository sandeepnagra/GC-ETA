"""Per-category narrative sections from the Visa Bulletin.

This is the forward-guidance signal, and it is structural rather than lexical.

A keyword classifier does not work here. Section C is boilerplate present every
month, containing "retrogression may be necessary in the upcoming months" and
"visa categories may become unavailable", with no category attached. Matching on
those phrases flags every category every month. PLAN.md finding 30.

What carries information is that the Visa Office writes a **dedicated lettered
section naming a specific category and often a specific country** only when it
has something particular to say. July 2026 carried five of them; October 2025
carried none. The existence of a section is the feature; its verbs refine it.

Two states are distinguished, because they are different facts:

- what has already happened  ("RETROGRESSION IN...", "UNAVAILABILITY OF...")
- what is being warned about ("may make it necessary to retrogress")

and separately, forward guidance that a date will advance, which the Visa Office
gives when a category has hit its limit and will reopen in October.
"""

from __future__ import annotations

import re
import unicodedata

from bs4 import BeautifulSoup

# A real section heading is "X. " followed by an all-caps title. The bulletin
# also contains lines like "A. ( F2A ) Spouses and Children..." which are family
# preference definitions, not sections; requiring upper case excludes them.
_HEADING = re.compile(r"^([A-Z])\.\s+([A-Z][A-Z0-9 ,’'()‘’“”./-]{8,})$")

_CATEGORY_PATTERNS = [
    (r"FIFTH PREFERENCE[^.]*UNRESERVED|UNRESERVED[^.]*\(EB-5\)|\(EB-5\)[^.]*UNRESERVED", "EB5_UNRESERVED"),
    (r"FIRST PREFERENCE|\(EB-1\)", "EB1"),
    (r"SECOND PREFERENCE|\(EB-2\)", "EB2"),
    (r"THIRD PREFERENCE|\(EB-3\)", "EB3"),
    (r"FOURTH PREFERENCE|\(EB-4\)|RELIGIOUS WORKER", "EB4"),
    (r"FIFTH PREFERENCE|\(EB-5\)", "EB5"),
]

_COLUMN_PATTERNS = [
    (r"\bINDIA\b", "IN"),
    (r"\bCHINA\b", "CN"),
    (r"\bMEXICO\b", "MX"),
    (r"\bPHILIPPINES\b", "PH"),
]


def _clean(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKD", text).split())


def _classify(heading: str, body: str) -> dict:
    head = heading.upper()
    text = f"{heading} {body}".lower()

    # Already happened. The heading states it; the body confirms in past tense.
    retrogressed = bool(
        "RETROGRESSION" in head
        or re.search(r"made it necessary to retrogress|was retrogressed", text)
    )
    unavailable = bool(
        "UNAVAILABILITY" in head
        or re.search(r"is unavailable for the remainder|limit was reached and the category is unavailable", text)
    )

    # Warned about but not yet done. "may make it necessary to", "may necessitate".
    warns_retrogress = bool(
        re.search(r"may (?:make it )?necessar\w*[^.]{0,60}retrogress|may necessitate[^.]{0,60}retrogress", text)
        or re.search(r"further retrogression[^.]{0,40}may be necessary", text)
    )
    warns_unavailable = bool(
        re.search(r"may (?:make it )?necessar\w*[^.]{0,80}unavailable|may necessitate[^.]{0,80}unavailable", text)
    )

    # Forward guidance that the date will move up, which the Visa Office gives
    # when a category has hit its annual limit and will reopen in October.
    signals_advance = bool(
        re.search(r"will advance|likely that in october[^.]{0,80}advance", text)
    )

    return {
        "retrogressed": retrogressed,
        "unavailable": unavailable,
        "warns_retrogress": warns_retrogress,
        "warns_unavailable": warns_unavailable,
        "signals_advance": signals_advance,
    }


def parse_sections(html: str) -> list[dict]:
    """Employment-related lettered sections, with their category, column and verbs."""
    soup = BeautifulSoup(html, "lxml")
    paragraphs = soup.find_all("p")
    texts = [_clean(p.get_text(" ", strip=True)) for p in paragraphs]
    sections: list[dict] = []

    for index, text in enumerate(texts):
        match = _HEADING.match(text)
        if not match:
            continue
        letter, title = match.group(1), match.group(2)

        # Chart headings and the generic availability boilerplate are not
        # per-category guidance.
        if re.search(
            r"FINAL ACTION DATES FOR (FAMILY|EMPLOYMENT)|DATES FOR FILING|STATUTORY NUMBERS"
            r"|^AVAILABILITY OF FAMILY-SPONSORED AND EMPLOYMENT-BASED",
            title,
            re.I,
        ):
            continue
        if not re.search(r"EMPLOYMENT|EB-\d", title, re.I):
            continue

        body_parts: list[str] = []
        for following in texts[index + 1 : index + 6]:
            if _HEADING.match(following):
                break
            if following:
                body_parts.append(following)
        body = " ".join(body_parts)

        category = None
        for pattern, code in _CATEGORY_PATTERNS:
            if re.search(pattern, title, re.I):
                category = code
                break

        column = None
        for pattern, code in _COLUMN_PATTERNS:
            if re.search(pattern, title, re.I):
                column = code
                break

        sections.append(
            {
                "letter": letter,
                "title": title,
                "body": body[:1200],
                "category": category,
                # None means the section speaks to the category worldwide rather
                # than to one chargeability column.
                "column": column,
                "signals": _classify(title, body),
            }
        )
    return sections
