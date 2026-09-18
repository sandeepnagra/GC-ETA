/**
 * Whether the data in hand is as new as it ought to be.
 *
 * PLAN.md 8.1 requires the app to say when it is behind rather than present
 * stale figures as current, because otherwise a broken refresh and a working one
 * look identical to a reader. The whole point is to be visible when the pipeline
 * fails, so the rule lives here where it is tested rather than in the app where
 * nothing runs against it.
 */

import type { Bundle } from "./types.js";

/**
 * The newest bulletin month that ought to be in hand on a given day.
 *
 * The Visa Office publishes the bulletin governing a month during the middle of
 * the month before. So for most of a month the newest available bulletin is the
 * current month's, and from roughly the 25th the next month's should be out.
 * The exact day drifts by a week or more, which is why this is a threshold for
 * telling the reader something might be missing rather than an alarm.
 */
export function expectedLatestMonth(today: Date): string {
  const absolute =
    today.getFullYear() * 12 + today.getMonth() + (today.getDate() >= 25 ? 1 : 0);
  return `${String(Math.floor(absolute / 12)).padStart(4, "0")}-${String((absolute % 12) + 1).padStart(2, "0")}`;
}

export interface Freshness {
  stale: boolean;
  /** Short enough to sit under the bulletin month in a header. */
  note: string | null;
}

export function freshness(bundle: Bundle, today: Date = new Date()): Freshness {
  return bundle.end_month >= expectedLatestMonth(today)
    ? { stale: false, note: null }
    : { stale: true, note: "a newer bulletin may be out" };
}
