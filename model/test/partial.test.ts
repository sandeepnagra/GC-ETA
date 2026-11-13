/**
 * A month built from a source that carries only some columns.
 *
 * Since Nov 2026 a new bulletin arrives through the visa-bulletin-cn dataset,
 * which has Rest of World, China and India but not Mexico or the Philippines
 * (pipeline/gceta/vbcn.py). In that month the Mexico and Philippines series end
 * in null. The estimate for them has to say it is working from the previous
 * month, not label last month's cutoff with this month's bulletin.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { assessCase } from "../src/assess.js";
import { estimate } from "../src/levelA.js";
import { absoluteToMonth, monthToAbsolute } from "../src/bundle.js";
import type { Bundle, Column } from "../src/types.js";
import { bundle, events, TODAY } from "./fixtures.js";

/** The fixture plus one more month that has only ROW, CN and IN. */
function withPartialMonth(): Bundle {
  const next = absoluteToMonth(monthToAbsolute(bundle.end_month) + 1);
  const series: Bundle["series"] = {};
  for (const [key, cells] of Object.entries(bundle.series)) {
    const column = key.split("|")[3];
    const covered = column === "ROW" || column === "CN" || column === "IN";
    series[key] = [...cells, covered ? cells[cells.length - 1]! : null];
  }
  return {
    ...bundle,
    end_month: next,
    months: bundle.months + 1,
    series,
    partial_months: { [next]: { columns: ["CN", "IN", "ROW"], source: "test" } },
  };
}

const input = (column: Column) => ({
  category: "EB2",
  column,
  priorityDate: "2013-01-01",
  iterations: 400,
});

test("a column the newest month carries is as of the newest month", () => {
  const b = withPartialMonth();
  const result = estimate(b, input("IN" as Column));
  assert.equal(result.asOfMonth, b.end_month);
  assert.ok(!result.drivers.some((d) => d.includes("not in yet")));
});

test("a column the newest month lacks is as of the month it was last published", () => {
  const b = withPartialMonth();
  const result = estimate(b, input("MX" as Column));
  assert.equal(result.asOfMonth, bundle.end_month);
  assert.ok(
    result.drivers.some((d) => d.includes("not in yet")),
    `expected a note that the newest month lacks this column, got: ${result.drivers.join(" | ")}`,
  );
});

test("the lacking column's estimate is the one it had before the partial month", () => {
  const before = estimate(bundle, input("MX" as Column));
  const after = estimate(withPartialMonth(), input("MX" as Column));
  assert.equal(after.status, before.status);
  assert.deepEqual(after.currentCutoff, before.currentCutoff);
  assert.equal(after.p50, before.p50);
});

test("the assessment's bulletin month follows the user's own series", () => {
  const b = withPartialMonth();
  const mx = assessCase(b, events, { ...input("MX" as Column), path: "adjustment" }, TODAY);
  const india = assessCase(b, events, { ...input("IN" as Column), path: "adjustment" }, TODAY);
  assert.equal(mx.asOfMonth, bundle.end_month);
  assert.equal(india.asOfMonth, b.end_month);
});
