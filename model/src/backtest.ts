/**
 * Backtest harness.
 *
 * Two tests, because they answer different questions and the easy one flatters
 * the model. PLAN.md section 10.
 *
 * 1. Short range: where will the cutoff be in 6 and 12 months? Scored against a
 *    persistence baseline and a seasonal baseline. Persistence is strong here,
 *    because the cutoff is unchanged most months.
 * 2. First passage: when does a given priority date become current? This is
 *    what the app actually promises, and it is scored in YEARS with interval
 *    coverage as the headline metric. A model can win on twelve-month error and
 *    still be badly wrong at the horizon it sells.
 *
 * LEAKAGE. Every run truncates the bundle to what was knowable at the origin
 * month. That includes the annual limits: a fiscal year's employment limit is
 * not determined until roughly July of that year, so scaling a 2022 step by the
 * 2022 limit while standing in 2021 would use a number nobody had. Getting this
 * wrong makes a model look good and ship broken.
 */

import {
  absoluteToMonth,
  getSeries,
  isoToDay,
  monthToAbsolute,
} from "./bundle.js";
import { estimate, extractSteps, scaleStepsToRegime, simulateFirstPassage } from "./levelA.js";
import type { Bundle, Cell, Column } from "./types.js";

/**
 * A fiscal year's employment limit is published mid-year. The September 2026
 * bulletin records "On July 24th, USCIS provided the required data to the VO",
 * so July of the fiscal year is the earliest a run may know it.
 */
function limitKnownFrom(fiscalYear: number): string {
  return `${fiscalYear}-07`;
}

/** The bundle as it would have looked at the end of `month`. */
export function bundleAsOf(bundle: Bundle, month: string): Bundle {
  const start = monthToAbsolute(bundle.start_month);
  const cut = monthToAbsolute(month) - start + 1;
  if (cut <= 0) throw new Error(`month ${month} precedes the archive`);

  const series: Bundle["series"] = {};
  for (const [key, values] of Object.entries(bundle.series)) {
    series[key] = values.slice(0, cut);
  }

  const limits: Record<string, number> = {};
  for (const [fy, value] of Object.entries(bundle.employment_limit_by_fy ?? {})) {
    if (limitKnownFrom(Number(fy)) <= month) limits[fy] = value;
  }

  const sections: NonNullable<Bundle["sections"]> = {};
  for (const [key, value] of Object.entries(bundle.sections ?? {})) {
    if (key <= month) sections[key] = value;
  }

  return {
    ...bundle,
    end_month: month,
    months: cut,
    series,
    employment_limit_by_fy: limits,
    sections,
  };
}

function latestDated(cells: Cell[]): { index: number; day: number } | null {
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    const cell = cells[i]!;
    if (cell.kind === "date") return { index: i, day: cell.day! };
  }
  return null;
}

/* ------------------------------------------------------- short range test */

export interface CutoffForecast {
  p10: number;
  p50: number;
  p90: number;
}

/** Percentiles of where the cutoff sits `horizon` months out, in epoch days. */
export function forecastCutoff(
  bundle: Bundle,
  category: string,
  column: Column,
  horizon: number,
  iterations = 600,
  seed = 0x5eed,
): CutoffForecast | null {
  const cells = getSeries(bundle, "final_action", "employment", category, column);
  if (!cells) return null;
  const anchor = latestDated(cells);
  if (!anchor) return null;

  const startAbsolute = monthToAbsolute(bundle.start_month);
  const lookback = Math.max(0, cells.length - 120);
  const steps = scaleStepsToRegime(
    extractSteps(cells.slice(lookback), startAbsolute + lookback),
    bundle.employment_limit_by_fy ?? {},
    bundle.statutory_base ?? 140000,
    Math.floor((startAbsolute + cells.length - 1) / 12) + 1,
  );
  if (steps.length < 12) return null;

  // Reuse the first-passage machinery by setting an unreachable target, then
  // reading where the walk got to. Simpler: walk directly.
  const byFiscalMonth: number[][] = Array.from({ length: 12 }, () => []);
  steps.forEach((step, index) => byFiscalMonth[step.fiscalMonth]!.push(index));

  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const startFiscalMonth = (((startAbsolute + anchor.index) % 12) + 3) % 12;
  const ends: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    let day = anchor.day;
    let cursor = -1;
    let left = 0;
    for (let m = 1; m <= horizon; m += 1) {
      if (left === 0) {
        const candidates = byFiscalMonth[(startFiscalMonth + m) % 12]!;
        if (candidates.length === 0) break;
        cursor = candidates[Math.floor(random() * candidates.length)]!;
        left = 24 + Math.floor(random() * 13);
      }
      const step = steps[cursor];
      if (!step) { left = 0; continue; }
      day += step.advanceDays;
      cursor += 1;
      left -= 1;
    }
    ends.push(day);
  }
  ends.sort((a, b) => a - b);
  const at = (q: number) => ends[Math.min(ends.length - 1, Math.floor(q * ends.length))]!;
  return { p10: at(0.1), p50: at(0.5), p90: at(0.9) };
}

export interface CutoffScore {
  horizon: number;
  samples: number;
  /** Mean absolute error in days. */
  model: number;
  persistence: number;
  seasonal: number;
  /** Fraction of outcomes inside the model's P10 to P90 band. */
  coverage: number;
}

/** Mean advance per fiscal month over the whole visible history. */
function seasonalProfile(cells: Cell[], startAbsolute: number): number[] {
  const steps = extractSteps(cells, startAbsolute);
  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);
  for (const step of steps) {
    sums[step.fiscalMonth] += step.advanceDays;
    counts[step.fiscalMonth] += 1;
  }
  return sums.map((sum, i) => (counts[i] ? sum / counts[i] : 0));
}

export function backtestCutoff(
  bundle: Bundle,
  pairs: Array<{ category: string; column: Column }>,
  horizons: number[],
  fromMonth: string,
  iterations = 400,
): CutoffScore[] {
  const start = monthToAbsolute(bundle.start_month);
  const first = monthToAbsolute(fromMonth);
  const last = monthToAbsolute(bundle.end_month);
  const out: CutoffScore[] = [];

  for (const horizon of horizons) {
    let modelError = 0;
    let persistenceError = 0;
    let seasonalError = 0;
    let inBand = 0;
    let samples = 0;

    for (let origin = first; origin + horizon <= last; origin += 1) {
      const originMonth = absoluteToMonth(origin);
      const truncated = bundleAsOf(bundle, originMonth);

      for (const { category, column } of pairs) {
        const full = getSeries(bundle, "final_action", "employment", category, column);
        if (!full) continue;
        const truthCell = full[origin - start + horizon];
        if (!truthCell || truthCell.kind !== "date") continue;

        const visible = getSeries(truncated, "final_action", "employment", category, column);
        if (!visible) continue;
        const anchor = latestDated(visible);
        if (!anchor) continue;

        const forecast = forecastCutoff(truncated, category, column, horizon, iterations, origin);
        if (!forecast) continue;

        const truth = truthCell.day!;
        modelError += Math.abs(forecast.p50 - truth);
        persistenceError += Math.abs(anchor.day - truth);

        const profile = seasonalProfile(visible, start);
        let seasonalDay = anchor.day;
        for (let m = 1; m <= horizon; m += 1) {
          seasonalDay += profile[(((start + anchor.index + m) % 12) + 3) % 12]!;
        }
        seasonalError += Math.abs(seasonalDay - truth);

        if (truth >= forecast.p10 && truth <= forecast.p90) inBand += 1;
        samples += 1;
      }
    }

    out.push({
      horizon,
      samples,
      model: samples ? modelError / samples : NaN,
      persistence: samples ? persistenceError / samples : NaN,
      seasonal: samples ? seasonalError / samples : NaN,
      coverage: samples ? inBand / samples : NaN,
    });
  }
  return out;
}

/* ------------------------------------------------------ first passage test */

export interface PassageScore {
  samples: number;
  censored: number;
  /** Fraction of realised outcomes inside P10 to P90. Target is about 0.8. */
  coverage: number;
  /** Median absolute error of P50, in years. */
  medianErrorYears: number;
  /** Fraction where the model said "beyond horizon" and it had not happened. */
  beyondHorizonCorrect: number;
  beyondHorizonTotal: number;
  /** Brier score for "current within 24 months". Lower is better. */
  brier24: number;
}

export function backtestFirstPassage(
  bundle: Bundle,
  pairs: Array<{ category: string; column: Column }>,
  origins: string[],
  targetOffsetsYears: number[],
  iterations = 800,
): PassageScore {
  const start = monthToAbsolute(bundle.start_month);
  const last = monthToAbsolute(bundle.end_month);
  const errors: number[] = [];
  let samples = 0;
  let censored = 0;
  let inBand = 0;
  let brierSum = 0;
  let brierCount = 0;
  let beyondCorrect = 0;
  let beyondTotal = 0;

  for (const originMonth of origins) {
    const origin = monthToAbsolute(originMonth);
    if (origin < start || origin > last) continue;
    const truncated = bundleAsOf(bundle, originMonth);

    for (const { category, column } of pairs) {
      const full = getSeries(bundle, "final_action", "employment", category, column);
      const visible = getSeries(truncated, "final_action", "employment", category, column);
      if (!full || !visible) continue;
      const anchor = latestDated(visible);
      if (!anchor) continue;

      for (const offset of targetOffsetsYears) {
        // A target date sitting `offset` years ahead of the cutoff at origin.
        const targetDay = anchor.day + Math.round(offset * 365.25);
        const targetIso = new Date(targetDay * 86_400_000).toISOString().slice(0, 10);

        const result = estimate(
          truncated,
          { column, category, priorityDate: targetIso, seed: origin, iterations },
          "final_action",
        );
        if (result.status !== "not_current") continue;

        // Truth: first month after origin where the cutoff reaches the target.
        let truthMonths: number | null = null;
        for (let i = origin - start + 1; i < full.length; i += 1) {
          const cell = full[i]!;
          if (cell.kind === "date" && cell.day! >= targetDay) {
            truthMonths = i - (origin - start);
            break;
          }
          if (cell.kind === "current") {
            truthMonths = i - (origin - start);
            break;
          }
        }

        if (result.beyondHorizon) {
          beyondTotal += 1;
          if (truthMonths === null) beyondCorrect += 1;
          continue;
        }
        if (!result.p10 || !result.p50 || !result.p90) continue;

        const p10 = monthToAbsolute(result.p10) - origin;
        const p50 = monthToAbsolute(result.p50) - origin;
        const p90 = monthToAbsolute(result.p90) - origin;

        if (truthMonths === null) {
          // Right-censored: it had not happened by the end of the record. The
          // band is consistent only if it extends past the end of the data.
          censored += 1;
          if (p90 >= last - origin) inBand += 1;
          samples += 1;
          continue;
        }

        samples += 1;
        if (truthMonths >= p10 && truthMonths <= p90) inBand += 1;
        errors.push(Math.abs(p50 - truthMonths) / 12);

        const predicted24 = result.probabilityWithin?.find((p) => p.months === 24)?.probability;
        if (predicted24 !== undefined) {
          const actual = truthMonths <= 24 ? 1 : 0;
          brierSum += (predicted24 - actual) ** 2;
          brierCount += 1;
        }
      }
    }
  }

  errors.sort((a, b) => a - b);
  return {
    samples,
    censored,
    coverage: samples ? inBand / samples : NaN,
    medianErrorYears: errors.length ? errors[Math.floor(errors.length / 2)]! : NaN,
    beyondHorizonCorrect: beyondTotal ? beyondCorrect / beyondTotal : NaN,
    beyondHorizonTotal: beyondTotal,
    brier24: brierCount ? brierSum / brierCount : NaN,
  };
}
