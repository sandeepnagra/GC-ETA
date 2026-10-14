"""
Tests for the watch feed's duplicate collapsing.

Stdlib unittest, no pytest: the pipeline has no test dependency today and a
release-time detector is not worth adding one for. Run with

    .venv/bin/python pipeline/test_watch_feeds.py

The venv rather than bare python3: importing watch_feeds pulls in the fetch
helper, which needs requests. Discovery does not work here either, pipeline/
not being a package.

The thing under test is cheap to get wrong in a way nobody notices, because
the failure mode is a triage queue that is merely annoying rather than
broken. Issue #1 carried the same notice three times for weeks.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from watch_feeds import collapse_duplicates, normalise_title  # noqa: E402


def row(link, title, feed, score=2, matched=None):
    return {
        "link": link,
        "title": title,
        "feed": feed,
        "score": score,
        "matched": matched if matched is not None else ["immigration"],
    }


FR = "https://www.federalregister.gov/documents/2026/09/30/2026-20016/eb-5-fee"
WH = "https://www.whitehouse.gov/presidential-actions/2026/09/eo-14431/"
FR_EO = "https://www.federalregister.gov/documents/2026/09/23/2026-19555/enhancing"


class CollapseDuplicates(unittest.TestCase):
    def test_one_link_across_three_feeds_is_one_row(self):
        # The EB-5 fee rule, exactly as it arrived: three Federal Register
        # searches each scoped to catch something the others miss, all three
        # matching the same notice.
        out = collapse_duplicates([
            row(FR, "EB-5 Fee Rule", "federal-register-dhs", 4, ["eb-5"]),
            row(FR, "EB-5 Fee Rule", "federal-register-immigration-court", 4, ["immigration"]),
            row(FR, "EB-5 Fee Rule", "federal-register-immigration-eo", 4, ["employment-based"]),
        ])
        self.assertEqual(len(out), 1)
        self.assertEqual(len(out[0]["feeds"]), 3)
        # Union of terms, so nothing is lost by merging.
        self.assertEqual(
            sorted(out[0]["matched"]), ["eb-5", "employment-based", "immigration"]
        )

    def test_merging_keeps_the_strongest_score(self):
        # A document must not be buried because the feed read first scored it
        # lower than the feed read second.
        out = collapse_duplicates([
            row(FR, "A Notice", "federal-register-dhs", 2),
            row(FR, "A Notice", "federal-register-labor", 5),
        ])
        self.assertEqual(out[0]["score"], 5)

    def test_same_order_from_two_sources_collapses_to_the_federal_register(self):
        # EO 14431 as it actually arrived: the White House copy carried a
        # stray repeated phrase, so the titles are near-identical but not
        # equal, and the links differ entirely.
        out = collapse_duplicates([
            row(
                FR_EO,
                "Enhancing Program Integrity and Interagency Coordination in the "
                "Administration of the H-1B Nonimmigrant Visa Program",
                "federal-register-immigration-eo",
                3,
            ),
            row(
                WH,
                "Enhancing Program Integrity and Integrity and Interagency Coordination "
                "in the Administration of the H-1B Nonimmigrant Visa Program",
                "white-house-actions",
                3,
            ),
        ])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["link"], FR_EO, "the citable copy should win")
        self.assertEqual(out[0]["also_at"], [WH], "the other copy is kept, not dropped")

    def test_the_federal_register_copy_wins_whichever_arrives_first(self):
        # Feed order must not decide which citation a person is handed.
        out = collapse_duplicates([
            row(WH, "Some Executive Order On Visas", "white-house-actions"),
            row(FR_EO, "Some Executive Order On Visas", "federal-register-immigration-eo"),
        ])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["link"], FR_EO)
        self.assertEqual(out[0]["also_at"], [WH])

    def test_a_correction_is_not_merged_into_the_notice_it_corrects(self):
        # The guard that makes near-title matching safe. The Federal Register
        # publishes corrections whose titles barely differ from the original,
        # and collapsing those would hide the correction. Same feed, so they
        # are left alone however similar they read.
        out = collapse_duplicates([
            row(FR + "/a", "Visa Bulletin Procedures Notice", "federal-register-state"),
            row(FR + "/b", "Visa Bulletin Procedures Notice; Correction", "federal-register-state"),
        ])
        self.assertEqual(len(out), 2, "same feed means two documents, not one")

    def test_unrelated_notices_are_left_apart(self):
        out = collapse_duplicates([
            row(FR + "/a", "EB-5 Fee Rule", "federal-register-dhs"),
            row(
                FR + "/b",
                "Registration of Lawful Permanent Residence for Children Born to "
                "Foreign Government Employees",
                "federal-register-state",
            ),
        ])
        self.assertEqual(len(out), 2)

    def test_every_link_seen_is_recoverable_for_the_seen_state(self):
        # The run records candidate["link"] plus also_at. If a merged-away
        # link were not reachable from the output it would return tomorrow as
        # new, and the dedupe would have traded one duplicate for a daily one.
        out = collapse_duplicates([
            row(FR_EO, "An Order", "federal-register-immigration-eo"),
            row(WH, "An Order", "white-house-actions"),
        ])
        links = {out[0]["link"], *out[0]["also_at"]}
        self.assertEqual(links, {FR_EO, WH})

    def test_normalise_title_ignores_case_and_punctuation(self):
        self.assertEqual(
            normalise_title("H-1B: Program Integrity (2026)"),
            normalise_title("h 1b program integrity 2026"),
        )


if __name__ == "__main__":
    unittest.main()
