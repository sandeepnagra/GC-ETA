import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareCategories } from "../src/compare.js";
import type { Bundle, CaseInput } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = JSON.parse(
  readFileSync(resolve(here, "../../../data/app-bundle.json"), "utf8"),
) as Bundle;

const india: CaseInput = {
  birthCountry: "IN",
  column: "IN",
  category: "EB2",
  priorityDate: "2015-03-10",
  path: "adjustment",
};

test("both categories come back in full, neither reduced to a verdict", () => {
  const result = compareCategories(bundle, india);
  assert.equal(result.sides.length, 2);
  for (const side of result.sides) {
    assert.ok(side.cutoff.kind.length > 0);
    assert.ok(side.estimate.status.length > 0);
    assert.ok(side.supply, `${side.category} has a supply reading`);
  }
});

test("the comparison carries no recommendation, by construction", () => {
  // This is the design decision as a test rather than as a comment. Finding 44.
  // The record is why: India EB-3 led EB-2 by two years and four months in
  // October 2021, retrogressed two years by that December, and was nearly three
  // years behind by August 2022. A saved-years number describes one month.
  const result = compareCategories(bundle, india);
  const serialised = JSON.stringify(result).toLowerCase();
  for (const word of ["recommend", "should switch", "you should", "better choice", "advise"]) {
    assert.ok(!serialised.includes(word), `no "${word}" anywhere in the comparison`);
  }
  assert.ok(!("recommendation" in result), "and no field to hang one on");
});

test("Unavailable is not collapsed into a missing date when ranking", () => {
  // India EB-2 is Unavailable and EB-3 sits at January 2014, the widest gap in
  // the archive. Treating Unavailable as null would make it vanish.
  const result = compareCategories(bundle, india);
  const eb2 = result.sides.find((s) => s.category === "EB2")!;
  assert.equal(eb2.cutoff.kind, "unavailable");
  assert.equal(result.crossover.aheadNow, "EB3");
  // No day gap is reported, because there is no date to measure from.
  assert.equal(result.crossover.gapDays, null);
});

test("crossovers are counted, because the lead changes hands often", () => {
  const result = compareCategories(bundle, india);
  assert.ok(result.crossover.monthsCompared > 150, "most months are comparable");
  assert.ok(result.crossover.switches >= 5, `the lead really does swap: ${result.crossover.switches}`);
  assert.ok(result.crossover.lastSwitch !== null);
  // The switch count and its month are returned as data, not as a sentence.
  // A model that formats "2026-06" into prose forces the screen to print it
  // that way, and the screen is the only place that knows to say "June 2026".
  assert.match(result.crossover.lastSwitch!, /^\d{4}-\d{2}$/);
  assert.equal(result.startMonth, bundle.start_month);
  for (const note of result.notes) {
    assert.ok(!/\d{4}-\d{2}/.test(note), `no raw month in prose: ${note}`);
  }
});

test("a country where the two run close still reports both sides", () => {
  const china = compareCategories(bundle, { ...india, birthCountry: "CN", column: "CN" });
  assert.equal(china.sides.length, 2);
  assert.ok(china.crossover.switches > 0);
  // China EB-2 and EB-3 are both dated, so a day gap is measurable here.
  assert.ok(china.crossover.gapDays !== null);
});

test("the note about changing category names who actually files it", () => {
  const result = compareCategories(bundle, india);
  assert.ok(
    result.notes.some((n) => n.includes("employer files it")),
    "the decision is not the applicant's alone, and the app says so",
  );
});

/* ------------------------------------------------------------ suggestion */

import { suggestSwitch } from "../src/compare.js";

test("the suggestion is reasoned from the estimates, not today's chart", () => {
  // The reasoning must always cite the estimated midpoint. An earlier version
  // of this test asserted a particular verdict for India EB-2, which was only
  // "probably not" because of a percentile bug that made every range too early
  // and too narrow. Fixing that moved EB-2's midpoint out by nearly three years
  // and flipped the verdict. Pinning the verdict pinned the bug; pinning the
  // basis of the verdict does not.
  for (const category of ["EB2", "EB3"]) {
    const input: CaseInput = { ...india, category };
    const suggestion = suggestSwitch(compareCategories(bundle, input), bundle, "IN", category);
    assert.ok(
      suggestion.because.some((r) => /midpoint|slow end/.test(r)),
      `${category} reasons from the estimate: ${JSON.stringify(suggestion.because)}`,
    );
  }
});

test("when the chart and the estimate disagree, the card says so", () => {
  // Whenever the other category leads the published chart but not the estimate,
  // the reader is told why the two disagree rather than left to wonder.
  const comparison = compareCategories(bundle, india);
  const suggestion = suggestSwitch(comparison, bundle, "IN", "EB2");
  const leads = comparison.crossover.aheadNow === "EB3";
  const estimateFavoursMine = suggestion.verdict === "probably_not";
  if (leads && estimateFavoursMine) {
    assert.ok(suggestion.because.some((r) => r.includes("today's chart")));
  }
  assert.ok(suggestion.verdict.length > 0);
});

test("a category that never finishes inside the horizon loses on the slow end", () => {
  // India EB-2 reaches a March 2015 date in 63% of simulations within 25 years
  // and EB-3 in 99%, so EB-3 is better at the pessimistic end by more than any
  // number of months. Treating EB-2's absent p90 as a zero used to read that as
  // "too close to call".
  const comparison = compareCategories(bundle, india);
  const eb2 = comparison.sides.find((s) => s.category === "EB2")!;
  const eb3 = comparison.sides.find((s) => s.category === "EB3")!;
  if (!eb2.estimate.p90 && eb3.estimate.p90) {
    const suggestion = suggestSwitch(comparison, bundle, "IN", "EB2");
    assert.equal(suggestion.verdict, "worth_asking");
    assert.ok(suggestion.because.some((r) => r.includes("slow end")));
  }
});

test("every verdict carries the cost and the risk, including the negative ones", () => {
  const cases: Array<[string, CaseInput]> = [
    ["EB2", india],
    ["EB3", { ...india, category: "EB3" }],
    ["EB2", { ...india, birthCountry: "CN", column: "CN", priorityDate: "2022-09-01" }],
  ];
  for (const [category, input] of cases) {
    const suggestion = suggestSwitch(compareCategories(bundle, input), bundle, input.column, category);
    assert.ok(suggestion.caveats.length >= 4, `${input.column} ${category} states the downsides`);
    assert.ok(
      suggestion.caveats.some((c) => c.includes("employer")),
      "the employer files it, and that is named first",
    );
    assert.ok(
      suggestion.caveats.some((c) => c.includes("attorney")),
      "and it defers to an attorney rather than standing alone",
    );
  }
});

test("a gain inside the uncertainty is reported as too close, not as a gain", () => {
  const china: CaseInput = { ...india, birthCountry: "CN", column: "CN", priorityDate: "2022-09-01" };
  const suggestion = suggestSwitch(compareCategories(bundle, china), bundle, "CN", "EB2");
  assert.equal(suggestion.verdict, "too_close");
  assert.ok(suggestion.because.some((r) => r.includes("uncertainty")));
});

test("reversal history is counted and attached to the caveats", () => {
  const suggestion = suggestSwitch(compareCategories(bundle, india), bundle, "IN", "EB2");
  const reversal = suggestion.reversal!;
  assert.ok(reversal.crossovers >= 4, `India has crossed over repeatedly: ${reversal.crossovers}`);
  assert.ok(reversal.retakenWithin12Months > 0, "and the lead has been taken straight back");
  assert.ok(reversal.retakenWithin12Months <= reversal.crossovers);
  assert.ok(
    suggestion.caveats.some((c) => c.includes("took it back within a year")),
    "which the reader is told, in the caveats",
  );
});

test("an already-current case is told there is nothing to gain", () => {
  const current: CaseInput = { ...india, birthCountry: "CN", column: "CN", priorityDate: "2019-01-01" };
  const suggestion = suggestSwitch(compareCategories(bundle, current), bundle, "CN", "EB2");
  assert.equal(suggestion.verdict, "probably_not");
  assert.ok(suggestion.headline.includes("already current"));
});
