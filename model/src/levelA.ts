/**
 * Level A: first-passage estimate from bulletin history.
 *
 * The question a user asks is "when will the cutoff reach my date", which is a
 * first-passage time, not distance divided by average speed. Averaging net
 * annual advance understates it, because a retrogression postpones the crossing
 * rather than undoing progress toward it, and dividing a distance by a noisy
 * rate is biased upward by Jensen's inequality precisely when the rate is small
 * and the wait is long. PLAN.md findings 6 and C8.
 *
 * So: resample monthly steps and walk forward until the cutoff crosses the
 * user's date, then read percentiles off the distribution of crossing months.
 *
 * Blocks rather than independent draws, because monthly advances are strongly
 * autocorrelated and strongly seasonal: October jumps, spring holds, summer
 * retrogressions. Blocks are drawn fiscal-month aligned so an October in the
 * simulation is filled by an historical October.
 */

import {
  absoluteToMonth,
  dayToIso,
  fiscalMonthIndex,
  fiscalYearOf,
  getSeries,
  isoToDay,
  lastKnownIndex,
  monthToAbsolute,
} from "./bundle.js";
import { densityRatio } from "./density.js";
import type { Bundle, Cell, Chart, Column, Estimate, EstimateInput } from "./types.js";

/** 25 years. Past this we stop pretending to know. */
const HORIZON_MONTHS = 300;
const DEFAULT_ITERATIONS = 4000;
const LOOKBACK_MONTHS = 120;
const MIN_BLOCK = 24;
const MAX_BLOCK = 36;
/** Below this crossing fraction we refuse to state a date. */
const HORIZON_CONFIDENCE = 0.5;
/** Months counted as "recent" when asking whether the regime has shifted. */
const INSTABILITY_WINDOW = 24;
/** Baseline months required BEYOND the window, or the ratio is self-referential. */
const MIN_INSTABILITY_BASELINE = 24;
/** Observations a fiscal month needs before it is widened about its own mean. */
const MIN_PER_MONTH_OBS = 3;
/** Nothing measured here justifies more than doubling the scatter. */
const MAX_WIDENING = 2;
/**
 * Calibrated, not argued. 0.5 of the measured divergence.
 *
 * This shipped at 0 for one day, on a measurement that said widening bought
 * nothing. That measurement was taken against a baseline the density
 * coverage bug produced: annihilated steps made the simulated cutoff crawl,
 * which inflated the bands to 3.50 years and bought coverage of 78.9% --
 * already on target, so nothing could improve it. With the floor in
 * densityFloor() the bands fall to 2.92 and real coverage is 74.7%, six
 * points under, and widening closes almost all of it:
 *
 *   baseline          74.7%   2.92 yr band   0.92 yr P50 error
 *   divergence 0.35   78.4%   3.17 yr        0.92 yr     +19 / -4
 *   divergence 0.50   79.4%   3.25 yr        0.92 yr     +22 / -3
 *   divergence 1.00   79.2%   3.33 yr        1.00 yr     +25 / -7
 *
 * 0.50 reaches the target on 25 paired flips split 22/3, p about 1e-4,
 * for an eleventh more band width and no change in P50 error at all. The
 * decision rule was never wrong; the number fed into it was. Which is the
 * argument for having had a rule.
 */
const DEFAULT_REGIME_WIDENING = 0.5;
/**
 * "divergence", now that it has earned it.
 *
 * This was set to "excess" when the strength was 0, so that turning the knob
 * on could not silently select a reading the calibration had rejected. On the
 * corrected baseline it is no longer rejected: "excess" moves coverage from
 * 74.7% only to 76.2%, while "divergence" reaches 79.4%. The reason is the
 * one the type's own doc gives -- a frozen cutoff has almost no variance, so
 * "recent months are unusually volatile" cannot fire during a freeze, which
 * is most of this archive. Asking instead whether the recent record resembles
 * its own history catches both the wild stretches and the frozen ones, and
 * both are regimes the resampler's library is a poor guide to.
 */
const DEFAULT_INSTABILITY_MODE: InstabilityMode = "divergence";

/** Deterministic PRNG, so the same case always produces the same range. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export interface Step {
  /** 0 = October .. 11 = September. */
  fiscalMonth: number;
  advanceDays: number;
  /** Fiscal year the step happened in, for regime scaling. */
  fiscalYear: number;
  /** Where the cutoff stood before this step, for density scaling. */
  fromDay: number;
}

/** Each fiscal month's mean advance, with how many observations backed it. */
function fiscalMonthMeans(steps: Step[]): {
  mean: number[];
  count: number[];
  global: number;
} {
  const sum = new Array(12).fill(0) as number[];
  const count = new Array(12).fill(0) as number[];
  for (const step of steps) {
    sum[step.fiscalMonth]! += step.advanceDays;
    count[step.fiscalMonth]! += 1;
  }
  const mean = sum.map((total, i) => (count[i]! > 0 ? total / count[i]! : 0));
  const global =
    steps.length > 0 ? steps.reduce((a, s) => a + s.advanceDays, 0) / steps.length : 0;
  return { mean, count, global };
}

/** Steps with the fiscal calendar taken out, in original order. */
function deseasonalisedResiduals(steps: Step[]): number[] {
  const { mean, count, global } = fiscalMonthMeans(steps);
  return steps.map((step) => {
    const centre =
      count[step.fiscalMonth]! >= MIN_PER_MONTH_OBS ? mean[step.fiscalMonth]! : global;
    return step.advanceDays - centre;
  });
}

/**
 * Discount historical advances for how crowded the priority dates were.
 *
 * A month that advanced through thin 2013 dates is not evidence about a month
 * advancing through 2015 dates: for India those cohorts differ by roughly six
 * times. Clearing the same number of people covers fewer days of priority date
 * when those days are denser, so a step recorded in a thin stretch is shrunk
 * before being applied to a dense one.
 *
 * Steps whose density cannot be measured at both ends are left untouched, so
 * the correction never rests on a guess. The backtest is what decides whether
 * this helps; see PLAN.md.
 */
export function scaleStepsToDensity(
  steps: Step[],
  bundle: Bundle,
  column: Column,
  targetDay: number,
): { steps: Step[]; adjusted: number } {
  let adjusted = 0;
  const out = steps.map((step) => {
    const { factor, covered } = densityRatio(bundle, column, step.fromDay, targetDay);
    if (!covered || factor === 1) return step;
    adjusted += 1;
    return { ...step, advanceDays: step.advanceDays * factor };
  });
  return { steps: out, adjusted };
}

/**
 * Discount historical advances to today's supply of visa numbers.
 *
 * A cutoff jump made in FY2022, when 281,507 employment visas were available,
 * is not evidence that the same jump can happen now against 186,317. Without
 * this the simulation samples pandemic-era Octobers at face value and reports
 * crossings that the current regime cannot produce. PLAN.md 6.1 and the Phase 1
 * limitation note.
 *
 * Years absent from the map are left UNSCALED rather than assumed to be at the
 * statutory base. Assuming the base would have wrongly amplified FY2021, whose
 * real limit was 262,288, by a third instead of discounting it by a third: a
 * factor of nearly two in the wrong direction, on exactly the year with the
 * largest October jumps. Not transforming data we cannot justify is the safer
 * failure, and it errs toward longer waits rather than shorter.
 */
export function scaleStepsToRegime(
  steps: Step[],
  limitByFiscalYear: Record<string, number>,
  base: number,
  targetFiscalYear: number,
): Step[] {
  const target = limitByFiscalYear[String(targetFiscalYear)] ?? base;
  return steps.map((step) => {
    const historical = limitByFiscalYear[String(step.fiscalYear)];
    if (!historical || historical <= 0) return step;
    return { ...step, advanceDays: step.advanceDays * (target / historical) };
  });
}

/**
 * Which way "unlike its own history" counts.
 *
 * "excess" is the obvious reading: only unusually VOLATILE recent months
 * count. Measured on this archive it turned out to be inert exactly when it
 * was wanted -- in October 2026 every column reads 0.44 to 0.73 of its own
 * decade baseline, because a frozen cutoff has almost no variance, so the
 * bulletin looks calmer than it has in ten years while the policy
 * environment is the most disturbed it has been. Volatility of the published
 * cutoff is not a proxy for turbulence in the world that sets it.
 *
 * "divergence" counts either direction, which is the claim actually being
 * made: the resampler's library is drawn from a regime, and what matters is
 * whether the months we now stand in resemble it. A stretch of frozen months
 * is as much a different regime as a stretch of wild ones, and in both cases
 * the library is a worse guide than its sample size suggests. The backtest
 * decides between them; neither is assumed.
 */
export type InstabilityMode = "excess" | "divergence";

/**
 * How much more erratic the recent record is than the decade behind it.
 *
 * This is the honest half of a problem with no honest whole. Things happen
 * that move this queue and cannot be measured: labour certification suspended
 * at named employers, people abandoning approved petitions or changing jobs
 * and needing a fresh one, adjudication quietly tightening, spillover moving
 * because some unrelated family category stalled. Each is real and each has a
 * direction. None has a number -- there is one instance of each, no
 * measurable affected population, and nothing to fit a coefficient against.
 * Inventing one would move every reader's headline date on a guess, and the
 * historical steps already contain every past shock, so a hand-set multiplier
 * would count that twice.
 *
 * What a shock does leave behind is turbulence, and turbulence is measurable
 * without knowing its cause. So this asks only "is the recent record less
 * like its own history than usual", and the answer widens the interval rather
 * than moving the middle: the app says it is less sure, never that the date
 * has changed. Measuring it from the bundle is also what makes it testable --
 * it exists at every month of the backtest, where an event-registry flag
 * would not, the registry having started in 2025.
 *
 * Seasonality is removed first. Raw monthly dispersion is dominated by the
 * fiscal calendar (October jumps, summer retrogresses), so comparing raw
 * standard deviations would report a window as unstable for containing an
 * ordinary October. The comparison is of residuals about each fiscal month's
 * own mean, which is the part that genuinely means "unpredictable".
 *
 * Returns 1 when the recent record is no more erratic than its history, and
 * never less: being more confident than the long record supports is not a
 * direction this is allowed to move.
 */
export function regimeInstability(
  steps: Step[],
  window = INSTABILITY_WINDOW,
  mode: InstabilityMode = "excess",
): number {
  if (steps.length < window + MIN_INSTABILITY_BASELINE) return 1;
  const residuals = deseasonalisedResiduals(steps);
  const baseline = standardDeviation(residuals);
  if (baseline <= 0) return 1;
  const recent = standardDeviation(residuals.slice(-window));
  if (recent <= 0) return 1;
  const ratio = recent / baseline;
  return mode === "excess" ? Math.max(1, ratio) : Math.max(ratio, 1 / ratio);
}

/** Widening factor for a strength setting, clamped. 1 means leave it alone. */
export function wideningFactor(instability: number, strength: number): number {
  if (strength <= 0 || !Number.isFinite(instability)) return 1;
  return Math.min(MAX_WIDENING, 1 + strength * (instability - 1));
}

/**
 * Spread the steps out about their own means, leaving those means alone.
 *
 * Mean preserved is the whole point: drift is what decides where the estimate
 * lands and dispersion is what decides how wide it is, and the claim being
 * made here is only about the second. A version that moved the mean would be
 * the invented coefficient this exists to avoid.
 *
 * About the FISCAL MONTH's mean, not the overall mean. The resampler draws
 * blocks fiscal-month aligned precisely because October and June are
 * different months, and widening about a single overall mean would inflate
 * October's already-large positive deviation and drive the summer further
 * negative. That is a claim that seasonality is stronger than recorded, which
 * is not the claim. Centring per fiscal month leaves the seasonal profile
 * untouched and inflates only the within-month scatter. A fiscal month with
 * too few observations to have a mean of its own falls back to the overall
 * one rather than being widened about a single point, which would be a
 * no-op for it.
 */
export function widenStepDispersion(steps: Step[], factor: number): Step[] {
  if (factor <= 1 || steps.length === 0) return steps;
  const { mean, count, global } = fiscalMonthMeans(steps);
  return steps.map((step) => {
    const centre =
      count[step.fiscalMonth]! >= MIN_PER_MONTH_OBS ? mean[step.fiscalMonth]! : global;
    return { ...step, advanceDays: centre + (step.advanceDays - centre) * factor };
  });
}

/**
 * Monthly advances in cutoff-days.
 *
 * "Unavailable" contributes a genuine zero: the cutoff did not move. Dropping
 * those months would flatter the model by hiding the freezes. Gaps in the
 * archive (October 2012 is missing) break the chain rather than inventing a
 * jump across them.
 */
export function extractSteps(cells: Cell[], startAbsolute: number): Step[] {
  const steps: Step[] = [];
  let previousDay: number | null = null;
  let previousIndex = -1;

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i]!;
    if (cell.kind === "current") {
      previousDay = null; // A "current" run tells us nothing about velocity.
      continue;
    }
    if (cell.kind === "missing") continue;

    if (cell.kind === "unavailable") {
      if (previousDay !== null && i === previousIndex + 1) {
        steps.push({
          fiscalMonth: fiscalMonthIndex(startAbsolute + i),
          advanceDays: 0,
          fiscalYear: fiscalYearOf(startAbsolute + i),
          fromDay: previousDay,
        });
        previousIndex = i;
      }
      continue;
    }

    if (previousDay !== null && i === previousIndex + 1) {
      steps.push({
        fiscalMonth: fiscalMonthIndex(startAbsolute + i),
        advanceDays: cell.day! - previousDay,
        fiscalYear: fiscalYearOf(startAbsolute + i),
        fromDay: previousDay,
      });
    }
    previousDay = cell.day!;
    previousIndex = i;
  }
  return steps;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function simulateFirstPassage(
  steps: Step[],
  startDay: number,
  targetDay: number,
  startFiscalMonth: number,
  iterations: number,
  seed: number,
): { crossings: number[]; crossedFraction: number } {
  const random = mulberry32(seed);
  const crossings: number[] = [];
  let crossed = 0;

  // Index of history positions by fiscal month, for aligned block starts.
  const byFiscalMonth: number[][] = Array.from({ length: 12 }, () => []);
  steps.forEach((step, index) => byFiscalMonth[step.fiscalMonth]!.push(index));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let day = startDay;
    let cursor = -1;
    let remainingInBlock = 0;

    for (let month = 1; month <= HORIZON_MONTHS; month += 1) {
      if (remainingInBlock === 0) {
        const fiscalMonth = (startFiscalMonth + month) % 12;
        const candidates = byFiscalMonth[fiscalMonth]!;
        if (candidates.length === 0) break;
        cursor = candidates[Math.floor(random() * candidates.length)]!;
        remainingInBlock =
          MIN_BLOCK + Math.floor(random() * (MAX_BLOCK - MIN_BLOCK + 1));
      }
      const step = steps[cursor];
      if (!step) {
        remainingInBlock = 0;
        continue;
      }
      day += step.advanceDays;
      cursor += 1;
      remainingInBlock -= 1;

      if (day >= targetDay) {
        crossings.push(month);
        crossed += 1;
        break;
      }
    }
  }
  return { crossings, crossedFraction: crossed / iterations };
}

export function estimate(
  bundle: Bundle,
  input: EstimateInput,
  chart: Chart = "final_action",
): Estimate {
  const iterations = input.iterations ?? DEFAULT_ITERATIONS;
  const seed = input.seed ?? 0x5eed;
  const cells = getSeries(bundle, chart, "employment", input.category, input.column);
  const asOfMonth = bundle.end_month;

  if (!cells) {
    return {
      status: "insufficient_data",
      currentCutoff: { kind: "missing" },
      asOfMonth,
      confidence: "low",
      drivers: [`No published series for ${input.category} in this column.`],
    };
  }

  const startAbsolute = monthToAbsolute(bundle.start_month);
  const latestIndex = lastKnownIndex(cells);
  const latest = latestIndex >= 0 ? cells[latestIndex]! : { kind: "missing" as const };
  const targetDay = isoToDay(input.priorityDate);
  const drivers: string[] = [];

  if (latest.kind === "current") {
    return {
      status: "current",
      currentCutoff: latest,
      asOfMonth,
      confidence: "high",
      drivers: ["This category and country is Current, so every priority date is eligible."],
    };
  }
  if (latest.kind === "date" && latest.day! >= targetDay) {
    return {
      status: "current",
      currentCutoff: latest,
      asOfMonth,
      confidence: "high",
      drivers: [`The cutoff is ${dayToIso(latest.day!)}, which is at or past your date.`],
    };
  }

  // The last published cutoff is the launch point. When the category is
  // Unavailable we fall back to the most recent date, which is where the
  // queue was frozen.
  let launchDay: number | null = latest.kind === "date" ? latest.day! : null;
  if (launchDay === null) {
    for (let i = latestIndex - 1; i >= 0; i -= 1) {
      const cell = cells[i]!;
      if (cell.kind === "date") {
        launchDay = cell.day!;
        break;
      }
    }
  }
  if (launchDay === null) {
    return {
      status: "insufficient_data",
      currentCutoff: latest,
      asOfMonth,
      confidence: "low",
      drivers: ["This series has never published a dated cutoff."],
    };
  }

  if (latest.kind === "unavailable") {
    drivers.push(
      "This category is Unavailable right now, so no numbers are being issued until the new fiscal year.",
    );
  }

  const allSteps = extractSteps(cells, startAbsolute);
  const cutoffIndex = Math.max(0, cells.length - LOOKBACK_MONTHS);
  const recentSteps = extractSteps(cells.slice(cutoffIndex), startAbsolute + cutoffIndex);
  const steps = recentSteps.length >= 36 ? recentSteps : allSteps;

  if (steps.length < 12) {
    return {
      status: "insufficient_data",
      currentCutoff: latest,
      asOfMonth,
      confidence: "low",
      drivers: ["Too few months of published movement to model this series."],
    };
  }

  const startFiscalMonth = fiscalMonthIndex(startAbsolute + latestIndex);
  const regimeScaled = scaleStepsToRegime(
    steps,
    bundle.employment_limit_by_fy ?? {},
    bundle.statutory_base ?? 140000,
    fiscalYearOf(startAbsolute + latestIndex),
  );
  const densityScaled = scaleStepsToDensity(
    regimeScaled,
    bundle,
    input.column,
    launchDay,
  );
  if (densityScaled.adjusted > 0) {
    drivers.push(
      "Adjusted for how many people hold the priority dates ahead of you, which differs sharply across years.",
    );
  }
  // Widening goes LAST, after both scalings. Density scaling multiplies
  // individual steps by step-specific factors, which moves their mean; widen
  // before it and the mean this is careful to preserve is destroyed anyway.
  const widenStrength = input.regimeWidening ?? DEFAULT_REGIME_WIDENING;
  const instability = regimeInstability(
    densityScaled.steps,
    INSTABILITY_WINDOW,
    input.instabilityMode ?? DEFAULT_INSTABILITY_MODE,
  );
  const widening = wideningFactor(instability, widenStrength);
  const simulationSteps = widenStepDispersion(densityScaled.steps, widening);
  if (widening > 1.01) {
    drivers.push(
      "The last two years have not moved like the ten before them, so this range is widened to say the record is a weaker guide than usual right now.",
    );
  }

  const { crossings, crossedFraction } = simulateFirstPassage(
    simulationSteps,
    launchDay,
    targetDay,
    startFiscalMonth,
    iterations,
    seed,
  );

  const gapYears = (targetDay - launchDay) / 365.25;
  drivers.push(
    `The cutoff is about ${gapYears.toFixed(1)} years behind your priority date.`,
  );

  crossings.sort((a, b) => a - b);
  const probabilityWithin = [12, 24, 60].map((months) => ({
    months,
    probability: crossings.filter((m) => m <= months).length / iterations,
  }));
  const base = monthToAbsolute(asOfMonth);

  /**
   * A quantile of the WHOLE distribution, not of the runs that happened to
   * finish.
   *
   * `crossings` holds only the simulations that reached the date inside the
   * horizon. Asking `percentile(crossings, 0.9)` treats that subset as if it
   * were everything, so when 80% of runs crossed it returns the 72nd percentile
   * of the real distribution and calls it the 90th. Every range came out too
   * early and too narrow, and the more backlogged the case the worse it got,
   * because fewer runs finished.
   *
   * Rescaling by `crossedFraction` puts it back: the q-th quantile overall is
   * the (q / crossedFraction)-th of the subset. Above that fraction the
   * quantile genuinely lies past the horizon and there is no month to give, so
   * it returns undefined rather than a number that is wrong.
   */
  const quantileMonth = (q: number): string | undefined => {
    if (crossedFraction <= 0 || q >= crossedFraction) return undefined;
    const within = q / crossedFraction;
    return absoluteToMonth(base + Math.round(percentile(crossings, within)));
  };

  const p10 = quantileMonth(0.1);
  const p50 = quantileMonth(0.5);
  const p90 = quantileMonth(0.9);
  const horizonMonth = absoluteToMonth(base + HORIZON_MONTHS);

  // "Beyond the horizon" now means only that the MIDPOINT is past it. The
  // earlier version threw away p10 and the probabilities too, so a case where
  // three runs in ten finished inside twenty-five years was shown as though
  // nothing at all were known about it. That is what made the app look like it
  // had no model behind it.
  if (!p50) {
    drivers.push(
      `At the pace of the last ten years, ${Math.round(crossedFraction * 100)}% of simulations reach your date within ${HORIZON_MONTHS / 12} years.`,
    );
    return {
      status: "not_current",
      currentCutoff: latest,
      asOfMonth,
      beyondHorizon: true,
      crossedFraction,
      horizonMonth,
      p10,
      probabilityWithin,
      confidence: "low",
      drivers,
    };
  }

  const spreadYears = p90
    ? (monthToAbsolute(p90) - monthToAbsolute(p10!)) / 12
    : Number.POSITIVE_INFINITY;
  const confidence: Estimate["confidence"] =
    spreadYears <= 2 ? "high" : spreadYears <= 5 ? "medium" : "low";

  drivers.push(
    `Based on ${steps.length} months of published movement, adjusted so years with far more visa numbers than today do not inflate the estimate.`,
  );

  return {
    status: "not_current",
    currentCutoff: latest,
    asOfMonth,
    p10,
    p50,
    p90,
    crossedFraction,
    horizonMonth,
    probabilityWithin,
    confidence,
    drivers,
  };
}
