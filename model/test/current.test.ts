import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { currentStanding } from "../src/current.js";
import type { Bundle, Column } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = JSON.parse(
  readFileSync(resolve(here, "../../../data/app-bundle.json"), "utf8"),
) as Bundle;

/** A bundle whose one series is exactly the cells given. */
function seriesOf(cells: Array<string | null>): Bundle {
  return {
    start_month: "2020-01",
    end_month: "2020-12",
    months: cells.length,
    series: { "final_action|employment|EB2|ROW": cells },
  } as unknown as Bundle;
}

test("a category that has never been current reports nothing", () => {
  const standing = currentStanding(bundle, "EB2", "IN" as Column);
  assert.equal(standing.currentNow, false);
  assert.equal(standing.spells.length, 0);
  assert.equal(standing.medianClosedMonths, null);
});

test("a running spell is measured from where it began", () => {
  const standing = currentStanding(bundle, "EB1", "ROW" as Column);
  assert.equal(standing.currentNow, true);
  assert.ok(standing.since, "it knows when this run started");
  assert.ok(standing.monthsSoFar > 12);
  // The run in progress has no end and is not counted among the closures.
  assert.equal(standing.spells[standing.spells.length - 1]!.end, null);
  assert.equal(standing.timesClosed, standing.spells.length - 1);
});

test("how precarious being current is varies enormously, which is the point", () => {
  // EB-1 has been current for years after two closures; EB-2 has closed six
  // times. A screen that said only "Current" would make these look identical.
  const eb1 = currentStanding(bundle, "EB1", "ROW" as Column);
  const eb2 = currentStanding(bundle, "EB2", "ROW" as Column);
  assert.ok(eb1.currentNow && eb2.currentNow);
  assert.ok(eb2.timesClosed > eb1.timesClosed);
  assert.ok(eb1.monthsSoFar > eb2.monthsSoFar);
});

test("spells are counted, not merged", () => {
  const b = seriesOf(["C", "C", "2019-01-01", "C", "C", "C", "2019-06-01"]);
  const standing = currentStanding(b, "EB2", "ROW" as Column);
  assert.equal(standing.spells.length, 2);
  assert.equal(standing.spells[0]!.months, 2);
  assert.equal(standing.spells[1]!.months, 3);
  assert.equal(standing.timesClosed, 2);
  assert.equal(standing.currentNow, false);
});

test("a month nobody published does not count as a month the category closed", () => {
  // October 2012 is genuinely missing from the government archive. Treating a
  // gap as a closure would invent one that never happened.
  const b = seriesOf(["C", "C", null, "C", "C"]);
  const standing = currentStanding(b, "EB2", "ROW" as Column);
  assert.equal(standing.spells.length, 1, "the gap does not split the run");
  assert.equal(standing.currentNow, true);
  assert.equal(standing.timesClosed, 0);
});

test("the median of closed spells ignores the one still running", () => {
  const b = seriesOf(["C", "2019-01-01", "C", "C", "C", "2019-06-01", "C", "C"]);
  const standing = currentStanding(b, "EB2", "ROW" as Column);
  assert.equal(standing.timesClosed, 2);
  // Closed runs are 1 and 3 months, so the median is 2. The running 2-month
  // spell is excluded because it has not finished and would bias it short.
  assert.equal(standing.medianClosedMonths, 2);
  assert.equal(standing.currentNow, true);
  assert.equal(standing.monthsSoFar, 2);
});

test("a category current throughout the record reports no closures", () => {
  const standing = currentStanding(bundle, "EB5_UNRESERVED", "PH" as Column);
  assert.equal(standing.currentNow, true);
  assert.equal(standing.timesClosed, 0);
  assert.equal(standing.medianClosedMonths, null);
});
