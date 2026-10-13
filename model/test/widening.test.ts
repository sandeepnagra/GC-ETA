/**
 * The regime-instability widening, and why it ships switched off.
 *
 * It exists to answer a real question -- can the things that move this queue
 * but cannot be counted (labour certification suspended at named employers,
 * approved petitions abandoned, adjudication tightening, spillover moving for
 * unrelated reasons) be folded into the estimate? -- with something
 * falsifiable instead of a hand-set multiplier. The measurement said no, and
 * these tests pin both the machinery and that answer, so neither is quietly
 * reversed later by argument rather than by evidence.
 *
 * Measured on the frozen fixture archive, quarterly origins 2016-10 to
 * 2023-09, 393 scored cases, 4000 iterations (converged: identical at 12000):
 *
 *   setting            coverage   median band   P50 err   paired flips
 *   baseline             78.9%       3.50 yr    0.83 yr        -
 *   divergence 0.25      78.4%       3.75 yr    0.92 yr    +9 / -11
 *   divergence 0.50      79.0%       3.92 yr    0.92 yr   +13 / -13
 *   divergence 1.00      80.9%       4.17 yr    0.92 yr   +23 / -15
 *   excess 0.50          77.0%       3.42 yr    0.92 yr    +5 / -13
 *
 * Three findings, in order of how much they matter:
 *
 * 1. There was nothing to fix. Baseline coverage is 78.9% against a target of
 *    80, which is half a standard error on 393 samples. The 77% that prompted
 *    this came from the report running 500 iterations instead of 4000.
 * 2. The one setting that reaches 80.9% does so on 38 paired flips split
 *    23/15, which is p of about 0.12 -- indistinguishable from chance. Every
 *    weaker setting flips evenly, which is what noise looks like, while the
 *    band grows monotonically regardless.
 * 3. The cost is certain where the gain is not: a fifth wider band, meaning
 *    eight more months of "don't know" for every reader, and P50 moving
 *    EARLIER rather than staying put. First passage to a receding target is
 *    absorbing, so raising dispersion at fixed drift shortens the median
 *    crossing. A feature sold as "less certain" that quietly reads "sooner"
 *    is worse than no feature.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { getSeries, monthToAbsolute } from "../src/bundle.js";
import {
  estimate,
  extractSteps,
  regimeInstability,
  widenStepDispersion,
  wideningFactor,
  type Step,
} from "../src/levelA.js";
import type { Column } from "../src/types.js";
import { bundle } from "./fixtures.js";

const step = (fiscalMonth: number, advanceDays: number, fiscalYear = 2020): Step => ({
  fiscalMonth,
  advanceDays,
  fiscalYear,
  fromDay: 0,
});

test("widening leaves each fiscal month's mean exactly where it was", () => {
  // The whole claim is about dispersion. If the mean moves, the feature is
  // silently forecasting a direction, which is the thing it exists to avoid.
  const steps = [
    step(0, 100), step(0, 20), step(0, 60),
    step(6, -30), step(6, 10), step(6, 2),
  ];
  const wide = widenStepDispersion(steps, 2);
  for (const fiscalMonth of [0, 6]) {
    const mean = (set: Step[]) => {
      const m = set.filter((s) => s.fiscalMonth === fiscalMonth);
      return m.reduce((a, s) => a + s.advanceDays, 0) / m.length;
    };
    assert.ok(
      Math.abs(mean(steps) - mean(wide)) < 1e-9,
      `fiscal month ${fiscalMonth} mean moved`,
    );
  }
});

test("widening is about the fiscal month, not the whole series", () => {
  // Centring on the overall mean would inflate October's large positive
  // deviation and drive the summer further negative: a claim that seasonality
  // is stronger than recorded, which is not the claim being made. October
  // here sits far above the overall mean, so a global centre would push its
  // smallest member UP, while its own centre pushes it DOWN.
  const steps = [
    step(0, 300), step(0, 200), step(0, 250),
    step(6, 0), step(6, 0), step(6, 0),
  ];
  const wide = widenStepDispersion(steps, 2);
  const october = wide.filter((s) => s.fiscalMonth === 0).map((s) => s.advanceDays);
  assert.deepEqual(october.map(Math.round), [350, 150, 250]);
  // Summer was already flat, so widening has nothing to spread.
  assert.deepEqual(wide.filter((s) => s.fiscalMonth === 6).map((s) => s.advanceDays), [0, 0, 0]);
});

test("a factor of 1 or less returns the steps untouched", () => {
  const steps = [step(0, 50), step(1, -10)];
  assert.equal(widenStepDispersion(steps, 1), steps);
  assert.equal(widenStepDispersion(steps, 0.5), steps);
});

test("the widening factor is clamped, so no measurement can double it twice", () => {
  assert.equal(wideningFactor(1, 1), 1);
  assert.equal(wideningFactor(5, 1), 2);
  assert.equal(wideningFactor(1.5, 1), 1.5);
  assert.equal(wideningFactor(1.5, 0.5), 1.25);
  // Off means off, whatever the signal says.
  assert.equal(wideningFactor(99, 0), 1);
});

test("too short a history reports no instability rather than guessing", () => {
  const short = Array.from({ length: 30 }, (_, i) => step(i % 12, i * 3));
  assert.equal(regimeInstability(short), 1);
});

test("instability never drops below 1, in either mode", () => {
  // Being MORE confident than the long record supports is not a direction
  // this is allowed to move, so both readings floor at 1.
  const calm = Array.from({ length: 120 }, (_, i) =>
    step(i % 12, i < 96 ? (i % 7) * 40 : 0),
  );
  assert.ok(regimeInstability(calm, 24, "excess") >= 1);
  assert.ok(regimeInstability(calm, 24, "divergence") >= 1);
});

test("the two readings genuinely disagree on a calm recent stretch", () => {
  // This is the finding, not a detail. A frozen cutoff has almost no
  // variance, so "recent is unusually volatile" cannot fire during a freeze
  // -- which is exactly the situation the feature was wanted for.
  const calm = Array.from({ length: 120 }, (_, i) =>
    step(i % 12, i < 96 ? ((i * 37) % 11) * 50 : 0),
  );
  assert.equal(regimeInstability(calm, 24, "excess"), 1, "a freeze cannot look volatile");
  assert.ok(
    regimeInstability(calm, 24, "divergence") > 1.2,
    "but a freeze is still unlike the decade behind it",
  );
});

test("the live archive reads calmer than its own history, not more volatile", () => {
  // The measurement that settled this, pinned so a future bundle changing it
  // is noticed. Volatility of the PUBLISHED cutoff is not a proxy for
  // turbulence in the world that sets it: in the fixture month every column
  // is quieter than its decade, because the dates are largely frozen.
  for (const [category, column] of [["EB2", "IN"], ["EB3", "IN"], ["EB2", "CN"]] as const) {
    const excess = estimate(bundle, {
      column: column as Column,
      category,
      priorityDate: "2023-01-01",
      iterations: 200,
      instabilityMode: "excess",
      regimeWidening: 1,
    });
    assert.ok(
      !excess.drivers.some((d) => d.includes("widened")),
      `${category}/${column} should not read as volatile right now`,
    );
  }
});

test("widening is off by default, so the shipped estimate is unchanged", () => {
  // The calibration did not justify switching it on. This test is what makes
  // turning it on a deliberate act with a number attached, rather than a
  // default that drifted.
  const input = {
    column: "IN" as Column,
    category: "EB2",
    priorityDate: "2023-01-01",
    seed: 7,
    iterations: 400,
  };
  const shipped = estimate(bundle, input);
  const explicitlyOff = estimate(bundle, { ...input, regimeWidening: 0 });
  assert.deepEqual(shipped, explicitlyOff);
  assert.ok(!shipped.drivers.some((d) => d.includes("widened")));
});

test("every fiscal month on the live archive has enough steps to centre on", () => {
  // The per-month centring is what keeps widening from exaggerating the
  // seasonal profile, and it silently falls back to the overall mean below
  // MIN_PER_MONTH_OBS. On this archive the thinnest column, EB3/ROW, has 56
  // steps and bottoms out at exactly 3 in one fiscal month -- one observation
  // from that fallback. Pinned so a shorter series or a new archive gap shows
  // up here rather than as a quiet distortion.
  for (const [category, column] of [["EB3", "ROW"], ["EB3", "PH"], ["EB2", "IN"]] as const) {
    const cells = getSeries(bundle, "final_action", "employment", category, column as Column);
    assert.ok(cells, `${category}/${column} should have a series`);
    const startAbsolute = monthToAbsolute(bundle.start_month);
    const cutoff = Math.max(0, cells.length - 120);
    const recent = extractSteps(cells.slice(cutoff), startAbsolute + cutoff);
    const steps = recent.length >= 36 ? recent : extractSteps(cells, startAbsolute);
    const counts = new Array(12).fill(0) as number[];
    for (const s of steps) counts[s.fiscalMonth]! += 1;
    assert.ok(
      Math.min(...counts) >= 3,
      `${category}/${column} fiscal-month counts ${counts.join(",")} fall below 3`,
    );
  }
});
