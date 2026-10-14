/**
 * Priority-date density, and the coverage floor.
 *
 * The bug these pin was not a wrong number, it was a confident one. The
 * disclosure files are published per DECISION year and we hold 2015 onward,
 * so a PERM received in 2009 and decided in 2010 was never ingested. The
 * few 2009 receipts that do appear are stragglers decided five years late,
 * and they made India's 2009 priority dates read as ELEVEN people against
 * about 50,000 a year later in the queue.
 *
 * `densityAt` asked whether those months were PRESENT. They were -- present,
 * and nearly empty -- so it answered `covered: true` and every historical
 * step taken while the cutoff sat down there was multiplied by about 0.000.
 * The India EB-2 filing series starts in October 2015 with the cutoff at July
 * 2009, so most of its steps were deleted: the simulated cutoff stopped
 * moving and NOTHING crossed within twenty-five years, for a case that plain
 * arithmetic on the same archive puts around 2032.
 *
 * It also flattered the backtest, which is the part that took longest to
 * notice. Annihilated steps made the bands balloon to 3.50 years, and a band
 * that wide catches the truth by width alone: 78.9% coverage, apparently on
 * target, from a model that could not answer the question at all. Fixing it
 * dropped coverage to 74.7% and narrowed the bands to 2.92, which is the
 * honest number and six points short.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { isoToDay } from "../src/bundle.js";
import { densityAt, densityFloor, densityRatio } from "../src/density.js";
import type { Bundle, Column } from "../src/types.js";
import { bundle } from "./fixtures.js";

const IN = "IN" as Column;

test("the floor is the October before the earliest decision year we hold", () => {
  // A fiscal year starts in October, so holding decision year 2015 means
  // receipts from October 2014 are the earliest whose decisions fall inside
  // what was ingested.
  assert.equal(densityFloor(bundle), "2014-10");
});

test("no coverage metadata means no floor to apply", () => {
  const bare = { ...bundle, density_coverage: undefined } as Bundle;
  assert.equal(densityFloor(bare), null);
  // And with no floor the lookup still works, rather than refusing everything.
  assert.equal(densityAt(bare, IN, isoToDay("2016-06-01")).covered, true);
});

test("priority dates below the floor are not covered, however present they are", () => {
  // The exact bug. These months ARE in the table; that was never the question.
  for (const iso of ["2009-07-01", "2011-01-01", "2012-07-08", "2013-11-01"]) {
    const got = densityAt(bundle, IN, isoToDay(iso));
    assert.equal(got.covered, false, `${iso} should not be covered`);
    assert.equal(got.perDay, 0);
  }
});

test("an uncovered step is left alone rather than annihilated", () => {
  // Factor 1 and covered false: the correction never rests on a guess, and a
  // step we cannot measure keeps its full weight instead of being deleted.
  const target = isoToDay("2018-08-20");
  for (const iso of ["2009-07-01", "2012-07-08", "2013-11-01"]) {
    const r = densityRatio(bundle, IN, isoToDay(iso), target);
    assert.equal(r.covered, false, `${iso} should report not covered`);
    assert.equal(r.factor, 1, `${iso} should be left unscaled`);
  }
});

test("the India 2009 cohort is never treated as a real measurement", () => {
  // Concretely: eleven certified cases across a year, against roughly fifty
  // thousand for 2018. Believed, that is a ratio of about 0.0002 and it
  // deletes the step. The table still holds the number; the floor stops it
  // being read as the size of the queue.
  const table = bundle.density?.[IN] ?? {};
  const nine = Object.entries(table).filter(([m]) => m.startsWith("2009"));
  assert.ok(nine.length > 0, "2009 months are present in the table");
  const total = nine.reduce((sum, [, v]) => sum + v.total, 0);
  assert.ok(total < 100, `2009 total is implausibly small (${total}), as expected`);
  assert.equal(densityAt(bundle, IN, isoToDay("2009-07-01")).covered, false);
});

test("the fix does not switch density off where the data supports it", () => {
  // The other half of the regression: over-correcting would throw away a
  // real signal. 2016 and 2017 sit inside the ingested years and must still
  // scale, and a denser target than the step's origin must shrink the step.
  const mid = densityAt(bundle, IN, isoToDay("2016-06-01"));
  assert.equal(mid.covered, true);
  assert.ok(mid.perDay > 0);

  const r = densityRatio(bundle, IN, isoToDay("2015-01-15"), isoToDay("2018-08-20"));
  assert.equal(r.covered, true);
  assert.ok(r.factor > 0 && r.factor < 1, `expected a shrinking factor, got ${r.factor}`);
});

test("months still being decided are not covered either", () => {
  // The mirror image, and the same class of error: recent receipts are
  // undercounted because those cases have not been decided, so they read as
  // a thin cohort and would inflate the step instead of deleting it.
  // densityHorizon already knew this; densityAt was not asking it.
  const recent = densityAt(bundle, IN, isoToDay("2023-06-01"));
  assert.equal(recent.covered, false);
});
