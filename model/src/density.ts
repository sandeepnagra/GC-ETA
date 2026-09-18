/**
 * Priority-date density: how many people hold each month of the queue.
 *
 * This is the correction the backtest demanded. Reading only how fast the
 * cutoff moved treats a month that advanced through thin 2013 priority dates as
 * evidence about a month advancing through 2015 dates. For India those cohorts
 * differ by roughly six times: about 7,500 certified cases across 2013 against
 * 48,600 across 2016. A model blind to that will always lean optimistic, which
 * is exactly what the backtest measured.
 *
 * Coverage is incomplete and the gaps matter, so every lookup reports whether
 * it was answered. Two decision-year files are unpublished, and recent months
 * are undercounted because those cases have not been decided yet, so the
 * adjustment is applied only where both endpoints are covered.
 */

import { dayToIso } from "./bundle.js";
import type { Bundle, Column } from "./types.js";

/** Months nearer than this to the end of the data are still being decided. */
const PENDING_MONTHS = 24;

export interface DensityLookup {
  /** Certified cases per day of priority date, around the given day. */
  perDay: number;
  covered: boolean;
}

function monthOf(day: number): string {
  return dayToIso(day).slice(0, 7);
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * Average certified cases per day of priority date in a window around `day`.
 *
 * A window rather than a single month, because one month is noisy and the
 * cutoff often sits mid-month.
 */
export function densityAt(
  bundle: Bundle,
  column: Column,
  day: number,
  windowMonths = 6,
): DensityLookup {
  const table = bundle.density?.[column];
  if (!table) return { perDay: 0, covered: false };

  const centre = monthOf(day);
  const months: string[] = [];
  for (let i = -Math.floor(windowMonths / 2); i <= Math.floor(windowMonths / 2); i += 1) {
    months.push(addMonths(centre, i));
  }

  let total = 0;
  let found = 0;
  for (const month of months) {
    const entry = table[month];
    if (entry) {
      total += entry.total;
      found += 1;
    }
  }
  // Require most of the window to be present before trusting the number.
  const covered = found >= Math.ceil(months.length * 0.6);
  const days = Math.max(1, found * 30.44);
  return { perDay: covered ? total / days : 0, covered };
}

/** The latest month the density is trustworthy for, given pending decisions. */
export function densityHorizon(bundle: Bundle, column: Column): string | null {
  const table = bundle.density?.[column];
  if (!table) return null;
  const months = Object.keys(table).sort();
  if (months.length === 0) return null;
  return addMonths(months[months.length - 1]!, -PENDING_MONTHS);
}

/**
 * How much slower the queue moves at `targetDay` than it did at `historicalDay`.
 *
 * Returns 1 when either end is not covered, so an unmeasurable step is left
 * alone rather than adjusted on a guess.
 */
export function densityRatio(
  bundle: Bundle,
  column: Column,
  historicalDay: number,
  targetDay: number,
): { factor: number; covered: boolean } {
  const from = densityAt(bundle, column, historicalDay);
  const to = densityAt(bundle, column, targetDay);
  if (!from.covered || !to.covered || to.perDay <= 0 || from.perDay <= 0) {
    return { factor: 1, covered: false };
  }
  // Clearing the same number of people covers fewer days of priority date when
  // those days are denser.
  return { factor: from.perDay / to.perDay, covered: true };
}
