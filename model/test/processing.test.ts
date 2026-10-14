/**
 * The wait after the bulletin stops mattering.
 *
 * These pin two things that are easy to get wrong in opposite directions:
 * that partial fiscal years are kept out of the figures, and that nothing
 * here is presented as a distribution over individual cases when it is a
 * series of annual medians.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { adjudicationOutlook } from "../src/processing.js";
import type { Bundle } from "../src/types.js";

const withTimes = (
  months: Record<string, number>,
  partial: string[] = [],
): Bundle =>
  ({
    processing_times: { i485_employment_median_months: months, partial_years: partial },
  }) as unknown as Bundle;

test("no data means no estimate, not a zero", () => {
  assert.equal(adjudicationOutlook({} as Bundle), null);
  assert.equal(adjudicationOutlook(withTimes({})), null);
});

test("the typical figure is the most recent COMPLETE year", () => {
  // FY2024 in the real factsheet covers October to January only. A
  // four-month window has a lower median for an arithmetic reason -- the
  // slow cases have not finished yet -- not because anything got faster,
  // and quoting it as the current typical wait would understate it.
  const out = adjudicationOutlook(withTimes(
    { "2022": 11.0, "2023": 8.6, "2024": 7.2 },
    ["2024"],
  ));
  assert.ok(out);
  assert.equal(out.fiscalYear, "2023");
  assert.equal(out.typicalMonths, 8.6);
});

test("the range excludes partial years too, not just the headline", () => {
  // A partial year is usually the lowest number on the table, so leaking it
  // into the range would quietly drag the bottom down.
  const out = adjudicationOutlook(withTimes(
    { "2021": 9.9, "2022": 11.0, "2023": 8.6, "2024": 7.2 },
    ["2024"],
  ));
  assert.ok(out);
  assert.equal(out.lowMonths, 8.6);
  assert.equal(out.highMonths, 11.0);
  assert.equal(out.years, 3);
});

test("the real nine-year series reduces to the right shape", () => {
  const out = adjudicationOutlook(withTimes(
    {
      "2016": 5.5, "2017": 7.0, "2018": 10.6, "2019": 10.0, "2020": 8.8,
      "2021": 9.9, "2022": 11.0, "2023": 8.6, "2024": 7.2,
    },
    ["2024"],
  ));
  assert.ok(out);
  assert.deepEqual(
    { typical: out.typicalMonths, low: out.lowMonths, high: out.highMonths, years: out.years },
    { typical: 8.6, low: 5.5, high: 11.0, years: 8 },
  );
});

test("pending time is compared against typical, and only when given", () => {
  const table = withTimes({ "2022": 11.0, "2023": 8.6 });
  assert.equal(adjudicationOutlook(table)!.pastTypical, undefined);
  assert.equal(adjudicationOutlook(table, 4)!.pastTypical, false);
  assert.equal(adjudicationOutlook(table, 12)!.pastTypical, true);
  // Filed this month is a real answer, not a missing one.
  assert.equal(adjudicationOutlook(table, 0)!.pendingMonths, 0);
  // Nonsense is ignored rather than propagated into the card.
  assert.equal(adjudicationOutlook(table, -3)!.pendingMonths, undefined);
  assert.equal(adjudicationOutlook(table, Number.NaN)!.pendingMonths, undefined);
});

test("the shape offers nothing that can be misread as a percentile", () => {
  // The guard against the mistake this data invites. Annual medians describe
  // how the median moved between years, not how cases differ from each
  // other, so a p10/p90 built from them would be wrong and look right.
  const out = adjudicationOutlook(withTimes({ "2022": 11.0, "2023": 8.6 }))!;
  for (const forbidden of ["p10", "p50", "p90", "percentile", "low", "high"]) {
    if (forbidden === "low" || forbidden === "high") continue;
    assert.ok(!(forbidden in out), `${forbidden} must not be offered`);
  }
  // lowMonths/highMonths exist but are named for what they are.
  assert.ok("lowMonths" in out && "highMonths" in out);
});
