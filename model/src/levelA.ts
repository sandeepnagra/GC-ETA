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
  getSeries,
  isoToDay,
  lastKnownIndex,
  monthToAbsolute,
} from "./bundle.js";
import type { Bundle, Cell, Chart, Estimate, EstimateInput } from "./types.js";

/** 25 years. Past this we stop pretending to know. */
const HORIZON_MONTHS = 300;
const DEFAULT_ITERATIONS = 4000;
const LOOKBACK_MONTHS = 120;
const MIN_BLOCK = 24;
const MAX_BLOCK = 36;
/** Below this crossing fraction we refuse to state a date. */
const HORIZON_CONFIDENCE = 0.5;

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

export interface Step {
  /** 0 = October .. 11 = September. */
  fiscalMonth: number;
  advanceDays: number;
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
        steps.push({ fiscalMonth: fiscalMonthIndex(startAbsolute + i), advanceDays: 0 });
        previousIndex = i;
      }
      continue;
    }

    if (previousDay !== null && i === previousIndex + 1) {
      steps.push({
        fiscalMonth: fiscalMonthIndex(startAbsolute + i),
        advanceDays: cell.day! - previousDay,
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
  const { crossings, crossedFraction } = simulateFirstPassage(
    steps,
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

  if (crossedFraction < HORIZON_CONFIDENCE) {
    drivers.push(
      `At the pace of the last ten years, fewer than half of simulations reach your date within ${HORIZON_MONTHS / 12} years.`,
    );
    return {
      status: "not_current",
      currentCutoff: latest,
      asOfMonth,
      beyondHorizon: true,
      crossedFraction,
      confidence: "low",
      drivers,
    };
  }

  crossings.sort((a, b) => a - b);
  const base = monthToAbsolute(asOfMonth);
  const toMonth = (q: number) =>
    absoluteToMonth(base + Math.round(percentile(crossings, q)));

  const p10 = toMonth(0.1);
  const p90 = toMonth(0.9);
  const spreadYears =
    (monthToAbsolute(p90) - monthToAbsolute(p10)) / 12;
  const confidence: Estimate["confidence"] =
    spreadYears <= 2 ? "high" : spreadYears <= 5 ? "medium" : "low";

  drivers.push(
    `Based on ${steps.length} months of published movement for this category and country.`,
  );

  return {
    status: "not_current",
    currentCutoff: latest,
    asOfMonth,
    p10,
    p50: toMonth(0.5),
    p90,
    crossedFraction,
    confidence,
    drivers,
  };
}
