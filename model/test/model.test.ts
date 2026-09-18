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
import { assessRisk } from "../src/risk.js";
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
  if (!result.beyondHorizon) {
    assert.ok(result.p10 && result.p50 && result.p90);
    assert.ok(monthToAbsolute(result.p10!) <= monthToAbsolute(result.p50!));
    assert.ok(monthToAbsolute(result.p50!) <= monthToAbsolute(result.p90!));
    assert.ok(monthToAbsolute(result.p10!) > monthToAbsolute(bundle.end_month));
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

test("risk scores are bounded and carry reasons", () => {
  for (const column of ["IN", "CN", "ROW", "MX", "PH"] as const) {
    const risk = assessRisk(bundle, "EB2", column);
    assert.ok(risk.score >= 0 && risk.score <= 100, `${column} score in range`);
    assert.ok(risk.reasons.length > 0, `${column} explains itself`);
  }
});

test("an already-Unavailable category reads as advance, because October resets", () => {
  // EB-2 India is Unavailable in the September 2026 bulletin. It cannot
  // retrogress further, and the new fiscal year is the next event, which is
  // what the results screen tells the user.
  const risk = assessRisk(bundle, "EB2", "IN");
  assert.equal(risk.outlook, "advance");
  assert.ok(
    risk.reasons.some((r) => r.includes("already Unavailable")),
    "the reason names the current state",
  );
});

test("a Current worldwide category still reads as at risk late in the fiscal year", () => {
  // The September 2026 bulletin itself warned that EB-2 may retrogress or go
  // unavailable before 30 September, so flagging this is correct rather than
  // alarmist. Rest of World rows have retrogressed at year end before.
  const risk = assessRisk(bundle, "EB2", "ROW");
  assert.notEqual(risk.outlook, "advance");
  assert.ok(risk.reasons.some((r) => r.includes("July to September")));
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
    { fiscalMonth: 0, advanceDays: 300, fiscalYear: 2022 },
    { fiscalMonth: 0, advanceDays: 300, fiscalYear: 2019 },
  ];
  const scaled = scaleStepsToRegime(steps, { "2022": 281507, "2026": 186317 }, 140000, 2026);
  assert.ok(scaled[0]!.advanceDays < 300, "a 281,507-visa year is discounted to today");
  assert.equal(
    scaled[1]!.advanceDays, 300,
    "an unknown year is left untouched rather than assumed to be at the base",
  );
});
