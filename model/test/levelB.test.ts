import assert from "node:assert/strict";
import { test } from "node:test";

import { estimateQueue, peopleBetween, annualSupply, densityFloor } from "../src/levelB.js";
import { isoToDay } from "../src/bundle.js";
import type { Bundle, Column } from "../src/types.js";

/** A bundle with a flat, fully covered density: 1000 principals a month. */
function flatBundle(perMonth = 1000, from = "2012-01", to = "2022-12"): Bundle {
  const density: Record<string, Record<string, { total: number; advanced?: number; bachelors?: number }>> = { IN: {} };
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  for (let a = fy * 12 + fm - 1; a <= ty * 12 + tm - 1; a += 1) {
    const key = `${String(Math.floor(a / 12)).padStart(4, "0")}-${String((a % 12) + 1).padStart(2, "0")}`;
    density.IN![key] = { total: perMonth, advanced: perMonth / 2, bachelors: perMonth / 2 };
  }
  return {
    schema_version: 1,
    generated_at: "",
    start_month: "2009-12",
    end_month: "2026-09",
    months: 0,
    missing_months: [],
    series: {},
    employment_limit_by_fy: { "2025": 140000, "2026": 140000 },
    statutory_base: 140000,
    density,
    limits: [],
  } as unknown as Bundle;
}

test("counts every covered month between the cutoff and the target", () => {
  const b = flatBundle(1000);
  const r = peopleBetween(b, "IN" as Column, "EB1", isoToDay("2015-01-01"), isoToDay("2015-12-01"));
  assert.equal(r.monthsNeeded, 12);
  assert.equal(r.monthsCovered, 12);
  assert.equal(r.principals, 12000);
  assert.equal(r.covered, true);
});

test("EB2 reads the advanced-degree bucket, EB3 the bachelor's bucket", () => {
  const b = flatBundle(1000);
  const from = isoToDay("2015-01-01");
  const to = isoToDay("2015-12-01");
  assert.equal(peopleBetween(b, "IN" as Column, "EB2", from, to).principals, 6000);
  assert.equal(peopleBetween(b, "IN" as Column, "EB3", from, to).principals, 6000);
  assert.equal(peopleBetween(b, "IN" as Column, "EB1", from, to).principals, 12000);
});

test("supply uses the per-country, per-category share, not the combined limit", () => {
  // The bulletin's per-country figure spans family and employment across every
  // preference and is roughly eight times too large. PLAN.md finding 22.
  const s = annualSupply(flatBundle(), "EB2")!;
  const floor = 0.07 * 0.286 * 140000; // about 2,803
  assert.ok(Math.abs(s.mid / floor - 3.0) < 1e-6, `mid should be 3x the floor, got ${s.mid / floor}`);
  assert.ok(s.low < s.mid && s.mid < s.high);
  assert.ok(s.high < 28862, "supply must stay far below the combined per-country limit");
});

test("a longer queue takes longer, monotonically", () => {
  const b = flatBundle(1000);
  const cut = isoToDay("2014-01-01");
  const near = estimateQueue(b, "IN" as Column, "EB2", "2016-01-01", cut);
  const far = estimateQueue(b, "IN" as Column, "EB2", "2019-01-01", cut);
  assert.ok(near.ok && far.ok);
  assert.ok(far.waitYears!.mid > near.waitYears!.mid);
  assert.ok(far.peopleAhead!.mid > near.peopleAhead!.mid);
});

test("bounds are ordered and the optimistic one pairs least queue with most supply", () => {
  const b = flatBundle(1000);
  const r = estimateQueue(b, "IN" as Column, "EB2", "2018-01-01", isoToDay("2014-01-01"));
  assert.ok(r.ok);
  const w = r.waitYears!;
  assert.ok(w.low < w.mid && w.mid < w.high, `expected low<mid<high, got ${JSON.stringify(w)}`);
  assert.ok(Math.abs(w.low - r.peopleAhead!.low / r.annualSupply!.high) < 1e-9);
  assert.ok(Math.abs(w.high - r.peopleAhead!.high / r.annualSupply!.low) < 1e-9);
});

test("an already-current date is not a queue question", () => {
  const b = flatBundle(1000);
  const r = estimateQueue(b, "IN" as Column, "EB2", "2013-01-01", isoToDay("2014-01-01"));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "already_current");
});

test("refuses when the span has a hole in the middle rather than extrapolating", () => {
  const b = flatBundle(1000, "2012-01", "2022-12");
  // Punch out most of the span between the cutoff and the target.
  for (let y = 2016; y <= 2019; y += 1) {
    for (let m = 1; m <= 12; m += 1) delete b.density!.IN![`${y}-${String(m).padStart(2, "0")}`];
  }
  const r = estimateQueue(b, "IN" as Column, "EB2", "2020-01-01", isoToDay("2015-01-01"));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "density_not_covered");
  assert.ok(r.coverage!.monthsCovered < r.coverage!.monthsNeeded);
});

test("a date too recent to have been decided is a different answer than one too old", () => {
  // Both used to report "not covered", which would put the wrong explanation on
  // screen: a 2025 priority date is missing because those labour certifications
  // have not been decided, not because the record starts in 2013.
  const b = flatBundle(1000, "2012-01", "2016-12");
  const r = estimateQueue(b, "IN" as Column, "EB2", "2022-01-01", isoToDay("2015-01-01"));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "beyond_density_record");
});

test("the density floor sits where volume begins, not where months begin", () => {
  // A long thin tail before a real queue: the floor must skip the tail.
  const b = flatBundle(1000, "2013-01", "2022-12");
  for (let y = 2008; y < 2013; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      b.density!.IN![`${y}-${String(m).padStart(2, "0")}`] = { total: 2, advanced: 1, bachelors: 1 };
    }
  }
  const floor = densityFloor(b, "IN" as Column);
  assert.ok(floor !== null);
  assert.ok(floor! >= "2012-02", `floor ${floor} should skip the thin pre-2013 tail`);
});

test("refuses below the density floor instead of counting a near-empty queue", () => {
  // This is the case that scored 26% interval coverage inside a band a fifth of
  // a year wide before the floor existed: the count came back near zero because
  // the record cannot see that far back, not because nobody was waiting.
  const b = flatBundle(1000, "2013-01", "2022-12");
  for (let y = 2008; y < 2013; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      b.density!.IN![`${y}-${String(m).padStart(2, "0")}`] = { total: 2, advanced: 1, bachelors: 1 };
    }
  }
  const r = estimateQueue(b, "IN" as Column, "EB2", "2012-06-01", isoToDay("2009-01-01"));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "below_density_floor");
});
