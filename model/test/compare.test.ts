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
