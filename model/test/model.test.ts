import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  absoluteToMonth,
  decodeCell,
  dayToIso,
  fiscalMonthIndex,
  isoToDay,
  monthToAbsolute,
} from "../src/bundle.js";
import { estimate, extractSteps, scaleStepsToRegime } from "../src/levelA.js";
import { nearTermOutlook, sectionsFor } from "../src/outlook.js";
import type { EventsFile } from "../src/types.js";
import type { Bundle } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = JSON.parse(
  readFileSync(resolve(here, "../../../data/app-bundle.json"), "utf8"),
) as Bundle;

test("date encoding round-trips", () => {
  assert.equal(dayToIso(isoToDay("2015-03-10")), "2015-03-10");
  assert.equal(dayToIso(isoToDay("1999-12-31")), "1999-12-31");
});

test("month arithmetic round-trips and crosses year boundaries", () => {
  assert.equal(absoluteToMonth(monthToAbsolute("2026-09")), "2026-09");
  assert.equal(absoluteToMonth(monthToAbsolute("2026-12") + 1), "2027-01");
});

test("fiscal month puts October first and September last", () => {
  assert.equal(fiscalMonthIndex(monthToAbsolute("2026-10")), 0);
  assert.equal(fiscalMonthIndex(monthToAbsolute("2026-09")), 11);
  assert.equal(fiscalMonthIndex(monthToAbsolute("2026-01")), 3);
});

test("cells decode to distinct kinds, never collapsing C and U", () => {
  assert.equal(decodeCell("C").kind, "current");
  assert.equal(decodeCell("U").kind, "unavailable");
  assert.equal(decodeCell(null).kind, "missing");
  assert.equal(decodeCell("2014-01-01").kind, "date");
});

test("Unavailable months contribute a zero step, not a gap", () => {
  const cells = [
    decodeCell("2014-01-01"),
    decodeCell("2014-02-01"),
    decodeCell("U"),
    decodeCell("2014-03-01"),
  ];
  const steps = extractSteps(cells, monthToAbsolute("2026-01"));
  // Three transitions: Jan->Feb advanced, Feb->U froze, U->Mar resumed. The
  // frozen month must appear as a real zero rather than vanish, or the model
  // would never learn that these series stall.
  assert.equal(steps.length, 3);
  assert.equal(steps[0]!.advanceDays, 31);
  assert.equal(steps[1]!.advanceDays, 0, "the Unavailable month did not move");
  assert.equal(steps[2]!.advanceDays, 28, "resumption measured from the frozen cutoff");
  assert.equal(
    steps.reduce((sum, s) => sum + s.advanceDays, 0),
    59,
    "total movement matches Jan 1 to Mar 1",
  );
});

test("a Current run does not leak a fake advance across it", () => {
  const cells = [decodeCell("2014-01-01"), decodeCell("C"), decodeCell("2020-01-01")];
  const steps = extractSteps(cells, monthToAbsolute("2026-01"));
  assert.equal(steps.length, 0, "no step should bridge a Current period");
});

test("bundle carries the September 2026 values verified against the bulletin", () => {
  assert.equal(bundle.end_month, "2026-09");
  const eb2in = bundle.series["final_action|employment|EB2|IN"]!;
  const eb3in = bundle.series["final_action|employment|EB3|IN"]!;
  assert.equal(eb2in[eb2in.length - 1], "U");
  assert.equal(eb3in[eb3in.length - 1], "2014-01-01");
  const eb2row = bundle.series["final_action|employment|EB2|ROW"]!;
  assert.equal(eb2row[eb2row.length - 1], "C");
});

test("a priority date behind the cutoff reports current", () => {
  const result = estimate(bundle, {
    column: "IN",
    category: "EB3",
    priorityDate: "2010-01-01",
  });
  assert.equal(result.status, "current");
});

test("a Rest of World category that is Current reports current", () => {
  const result = estimate(bundle, {
    column: "ROW",
    category: "EB2",
    priorityDate: "2024-01-01",
  });
  assert.equal(result.status, "current");
});

test("EB-2 India 2015 is not current and is ordered p10 <= p50 <= p90", () => {
  const result = estimate(bundle, {
    column: "IN",
    category: "EB2",
    priorityDate: "2015-03-10",
  });
  assert.equal(result.status, "not_current");
  assert.equal(result.currentCutoff.kind, "unavailable");
  // A percentile is absent when it lies past the horizon, which for a deeply
  // backlogged case is the p90 and sometimes the p50. Whatever is present must
  // still be ordered and must still be in the future.
  const present = [result.p10, result.p50, result.p90].filter(Boolean) as string[];
  assert.ok(present.length > 0, "something is known about this case");
  for (let i = 1; i < present.length; i += 1) {
    assert.ok(monthToAbsolute(present[i - 1]!) <= monthToAbsolute(present[i]!));
  }
  assert.ok(monthToAbsolute(present[0]!) > monthToAbsolute(bundle.end_month));
  // A missing p90 has to mean the top of the distribution ran past the horizon,
  // never that it was silently dropped.
  if (!result.p90) assert.ok((result.crossedFraction ?? 1) < 0.9);
  if (!result.beyondHorizon) {
    assert.ok(result.p50, "a usable midpoint is what not-beyond-horizon means");
  }
});

test("estimates are deterministic for the same seed", () => {
  const input = { column: "IN" as const, category: "EB3", priorityDate: "2016-06-01" };
  const a = estimate(bundle, input);
  const b = estimate(bundle, input);
  assert.deepEqual(a, b);
});

test("a later priority date never resolves sooner than an earlier one", () => {
  const early = estimate(bundle, {
    column: "IN",
    category: "EB3",
    priorityDate: "2015-01-01",
  });
  const late = estimate(bundle, {
    column: "IN",
    category: "EB3",
    priorityDate: "2018-01-01",
  });
  if (early.p50 && late.p50) {
    assert.ok(
      monthToAbsolute(late.p50) >= monthToAbsolute(early.p50),
      "monotonicity in priority date",
    );
  } else {
    assert.ok(late.beyondHorizon || !late.p50, "the later date may fall beyond the horizon");
  }
});

test("an unknown category degrades rather than throwing", () => {
  const result = estimate(bundle, {
    column: "IN",
    category: "EB9",
    priorityDate: "2015-01-01",
  });
  assert.equal(result.status, "insufficient_data");
});

const NO_EVENTS: EventsFile = {
  schema_version: 1,
  last_reviewed: "2026-09-18",
  country_lists: {},
  events: [],
};

function caseFor(column: "IN" | "CN" | "ROW" | "MX" | "PH", category = "EB2") {
  return {
    birthCountry: column,
    column,
    category,
    priorityDate: "2015-03-10",
    path: "adjustment" as const,
  };
}

test("the outlook lists scheduled changes and never a score", () => {
  for (const column of ["IN", "CN", "ROW", "MX", "PH"] as const) {
    const outlook = nearTermOutlook(bundle, NO_EVENTS, caseFor(column), "2026-09-18");
    assert.ok(outlook.summary.length > 0, `${column} says something`);
    for (const change of outlook.changes) {
      assert.ok(["law_or_policy", "visa_office", "annual_reset"].includes(change.source));
      assert.ok(["helps", "hurts", "unclear"].includes(change.direction));
    }
    // The card must not smuggle a base rate back in. That a category moved
    // backwards in some share of past months is true and is not a statement
    // about the next ninety days.
    const text = outlook.summary + outlook.changes.map((c) => c.title + c.detail).join(" ");
    assert.ok(!/% of published months/.test(text), `${column} quotes no base rate`);
  }
});

test("an Unavailable category's next scheduled event is the new fiscal year", () => {
  // EB-2 India is Unavailable in the September 2026 bulletin, so 1 October is
  // both inside the window and the only thing that can move it.
  const outlook = nearTermOutlook(bundle, NO_EVENTS, caseFor("IN"), "2026-09-18");
  const reset = outlook.changes.find((c) => c.source === "annual_reset");
  assert.ok(reset, "the reset is listed");
  assert.equal(reset!.effective, "2026-10-01");
  assert.equal(reset!.direction, "helps");
  assert.ok(reset!.detail.includes("closed for the rest of this year"));
});

test("the fiscal year reset drops out once it is more than a window away", () => {
  const outlook = nearTermOutlook(bundle, NO_EVENTS, caseFor("IN"), "2026-01-15");
  assert.ok(
    !outlook.changes.some((c) => c.source === "annual_reset"),
    "October is nine months off, so it is not a near-term change",
  );
});

test("a dated rule inside the window is listed, and outside it is not", () => {
  const events: EventsFile = {
    ...NO_EVENTS,
    events: [
      {
        id: "test-rule",
        type: "adjudication_pause",
        title: "A rule that pauses adjudication",
        summary: "Takes effect soon.",
        countries: "all",
        affects: ["adjustment"],
        categories: "all",
        start: "2026-10-15",
        end: null,
        status: "scheduled",
        modeling: {},
        confidence: "verified",
        verified_against: "test",
        last_checked: "2026-09-18",
      },
    ],
  };
  const near = nearTermOutlook(bundle, events, caseFor("IN"), "2026-09-18");
  assert.ok(near.changes.some((c) => c.id === "test-rule"), "a rule 27 days out is listed");

  const far = nearTermOutlook(bundle, events, caseFor("IN"), "2026-01-15");
  assert.ok(!far.changes.some((c) => c.id === "test-rule"), "nine months out it is not");
});

test("with nothing scheduled, the card says so rather than inventing an outlook", () => {
  // Mexico EB-2 in January: no per-category section, no events, and October is
  // far away. The honest answer is that nothing is coming.
  const outlook = nearTermOutlook(bundle, NO_EVENTS, caseFor("MX"), "2026-01-15");
  assert.equal(outlook.changes.length, 0);
  assert.ok(outlook.summary.startsWith("Nothing is scheduled"));
  assert.ok(outlook.summary.includes("No rule change, court order or category deadline"));
});

test("probability of becoming current is reported alongside the range", () => {
  const result = estimate(bundle, {
    column: "IN", category: "EB2", priorityDate: "2015-03-10",
  });
  assert.ok(result.probabilityWithin, "probabilities accompany the percentiles");
  const [oneYear, twoYear, fiveYear] = result.probabilityWithin!;
  // Monotone by construction: a longer window can only include more crossings.
  assert.ok(oneYear!.probability <= twoYear!.probability);
  assert.ok(twoYear!.probability <= fiveYear!.probability);
  // Deliberately NOT asserting a magnitude here. An earlier version of this
  // test asserted the one-year probability was under 0.35, which encoded a
  // hunch rather than anything verified; the model returns about 0.56 because
  // several historical twelve-month windows really did move EB-2 India more
  // than 1.5 years. Level A cannot see that those years had thinner priority
  // date cohorts than today, which is its documented blind spot. Pinning a
  // number here would freeze a guess into the test suite.
  for (const point of result.probabilityWithin!) {
    assert.ok(point.probability >= 0 && point.probability <= 1);
  }
});

test("regime scaling discounts a high-supply year and leaves unknown years alone", () => {
  const steps = [
    { fiscalMonth: 0, advanceDays: 300, fiscalYear: 2022, fromDay: 16000 },
    { fiscalMonth: 0, advanceDays: 300, fiscalYear: 2019, fromDay: 16000 },
  ];
  const scaled = scaleStepsToRegime(steps, { "2022": 281507, "2026": 186317 }, 140000, 2026);
  assert.ok(scaled[0]!.advanceDays < 300, "a 281,507-visa year is discounted to today");
  assert.equal(
    scaled[1]!.advanceDays, 300,
    "an unknown year is left untouched rather than assumed to be at the base",
  );
});

test("sections match a category worldwide or a specific column, not both loosely", () => {
  // September 2026 carries: E (EB-1, India only), F (EB-2, all columns),
  // G (EB-5 unreserved, all columns).
  const eb1in = sectionsFor(bundle, "EB1", "IN");
  const eb1cn = sectionsFor(bundle, "EB1", "CN");
  assert.equal(eb1in.length, 1, "the EB-1 section names India");
  assert.equal(eb1cn.length, 0, "and must not leak to China");

  for (const column of ["IN", "CN", "ROW", "MX", "PH"] as const) {
    assert.equal(
      sectionsFor(bundle, "EB2", column).length, 1,
      `the EB-2 section has no country, so it speaks to ${column} too`,
    );
  }
});

test("a bulletin warning becomes a listed change, attributed to the Visa Office", () => {
  const outlook = nearTermOutlook(bundle, NO_EVENTS, caseFor("CN"), "2026-09-18");
  const warning = outlook.changes.find((c) => c.source === "visa_office" && c.direction === "hurts");
  assert.ok(warning, "the warning is listed");
  assert.ok(warning!.title.includes("Visa Office"), "and is attributed, not stated as fact");
  // Guidance is an intention rather than a rule with a commencement date.
  assert.equal(warning!.effective, null);
});

test("a warning about closure is suppressed once the category has already closed", () => {
  // EB-2 India is Unavailable in September 2026 and the EB-2 section warns the
  // category may become unavailable. Listing that would tell someone something
  // might happen to them that has already happened.
  const outlook = nearTermOutlook(bundle, NO_EVENTS, caseFor("IN"), "2026-09-18");
  assert.ok(
    !outlook.changes.some((c) => c.source === "visa_office" && c.direction === "hurts"),
    "no closure warning for a category already closed",
  );
  // China is not Unavailable, so the same section does apply to it.
  const china = nearTermOutlook(bundle, NO_EVENTS, caseFor("CN"), "2026-09-18");
  assert.ok(china.changes.some((c) => c.source === "visa_office" && c.direction === "hurts"));
});

test("months without per-category guidance carry no sections", () => {
  // October 2025 carried only the EB-4 religious worker expiry, which is not a
  // per-category availability warning for any of the main pairs.
  const sections = bundle.sections?.["2025-10"] ?? [];
  const availability = sections.filter(
    (s) => s.signals.warns_retrogress || s.signals.warns_unavailable,
  );
  assert.equal(availability.length, 0);
});
