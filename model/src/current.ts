/**
 * What to tell someone whose date is already current.
 *
 * The app was built around one question, when does my date become current, and
 * for anyone already past that it collapsed to a single sentence: this category
 * and country is Current, so every priority date is eligible. True, and almost
 * useless. Nine of the thirty category and country pairs are current right now,
 * including EB-1 and EB-2 for the rest of the world, which is the largest
 * employment population there is. A third of the combinations, weighted toward
 * the busiest, were landing on an empty answer.
 *
 * This does not model USCIS processing time. That needs a different source
 * whose quality has not been assessed, and it should not hold up the useful
 * thing that can be said from the archive already in hand: being current is not
 * permanent, and the record says how permanent it has been.
 *
 * Every number here is counted from published bulletins. Nothing is projected.
 */

import { absoluteToMonth, getSeries, lastKnownIndex, monthToAbsolute } from "./bundle.js";
import type { Bundle, Column } from "./types.js";

export interface CurrentSpell {
  start: string;
  /** Null while the spell is still running. */
  end: string | null;
  months: number;
}

export interface CurrentStanding {
  /** False when the category is not current in the latest bulletin. */
  currentNow: boolean;
  /** The month the present run of Current began. */
  since: string | null;
  monthsSoFar: number;
  /** Every run of Current in the archive, oldest first. */
  spells: CurrentSpell[];
  /** Runs that ended, which is the number of times the window has closed. */
  timesClosed: number;
  /** Median length of the runs that have ended, in months. */
  medianClosedMonths: number | null;
  /** The month a run last ended. */
  lastClosed: string | null;
}

export function currentStanding(
  bundle: Bundle,
  category: string,
  column: Column,
): CurrentStanding {
  const empty: CurrentStanding = {
    currentNow: false,
    since: null,
    monthsSoFar: 0,
    spells: [],
    timesClosed: 0,
    medianClosedMonths: null,
    lastClosed: null,
  };

  const cells = getSeries(bundle, "final_action", "employment", category, column);
  if (!cells) return empty;
  const last = lastKnownIndex(cells);
  if (last < 0) return empty;

  const start = monthToAbsolute(bundle.start_month);
  const spells: CurrentSpell[] = [];
  let runStart: number | null = null;

  for (let i = 0; i <= last; i += 1) {
    const isCurrent = cells[i]!.kind === "current";
    if (isCurrent && runStart === null) runStart = i;
    // A missing month does not end a run. The archive has gaps, and treating a
    // month nobody published as a month the category closed would invent a
    // closure that never happened.
    if (!isCurrent && cells[i]!.kind !== "missing" && runStart !== null) {
      spells.push({
        start: absoluteToMonth(start + runStart),
        end: absoluteToMonth(start + i - 1),
        months: i - runStart,
      });
      runStart = null;
    }
  }

  const currentNow = cells[last]!.kind === "current";
  if (runStart !== null) {
    spells.push({
      start: absoluteToMonth(start + runStart),
      end: null,
      months: last - runStart + 1,
    });
  }

  const closed = spells.filter((s) => s.end !== null);
  const lengths = closed.map((s) => s.months).sort((a, b) => a - b);
  const median = lengths.length
    ? lengths.length % 2 === 1
      ? lengths[(lengths.length - 1) / 2]!
      : Math.round((lengths[lengths.length / 2 - 1]! + lengths[lengths.length / 2]!) / 2)
    : null;

  const running = currentNow ? spells[spells.length - 1] : undefined;

  return {
    currentNow,
    since: running ? running.start : null,
    monthsSoFar: running ? running.months : 0,
    spells,
    timesClosed: closed.length,
    medianClosedMonths: median,
    lastClosed: closed.length ? closed[closed.length - 1]!.end : null,
  };
}
