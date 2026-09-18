/**
 * How this category actually moves through a fiscal year.
 *
 * The design sketches this as a fixed explainer: October jumps, winter advances
 * steadily, spring holds, summer retrogresses. That story is broadly true and
 * it is not equally true of every category, so this measures it from the
 * archive for the pair being looked at instead of asserting it.
 *
 * The shape it finds is the real argument for the card. Reading a cutoff month
 * by month tells you almost nothing; twelve buckets averaged over a decade show
 * immediately that a category which looks frozen in August is not broken, and
 * that a category which surges every October will probably surge again.
 */

import {
  decodeCell,
  fiscalMonthIndex,
  getSeries,
  lastKnownIndex,
  monthToAbsolute,
} from "./bundle.js";
import type { Bundle, Column } from "./types.js";

/** October first, because that is when the fiscal year turns. */
const LABELS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];

export interface SeasonMonth {
  /** 0 is October. */
  fiscalMonth: number;
  label: string;
  /** Median days the cutoff advanced in this month of the year. */
  medianAdvanceDays: number;
  /** Months of this name in the archive that could be measured. */
  observations: number;
  /** How many of them moved backwards. */
  retrogressions: number;
  /** How many of them were Unavailable. */
  unavailable: number;
}

export interface Season {
  months: SeasonMonth[];
  /** The fiscal month the latest bulletin falls in, so it can be marked. */
  currentFiscalMonth: number;
  /** True when there is enough history to be worth drawing. */
  usable: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

export function seasonalPattern(
  bundle: Bundle,
  category: string,
  column: Column,
): Season {
  const cells = getSeries(bundle, "final_action", "employment", category, column);
  const start = monthToAbsolute(bundle.start_month);
  const empty: Season = {
    months: LABELS.map((label, i) => ({
      fiscalMonth: i,
      label,
      medianAdvanceDays: 0,
      observations: 0,
      retrogressions: 0,
      unavailable: 0,
    })),
    currentFiscalMonth: 0,
    usable: false,
  };
  if (!cells) return empty;

  const advances: number[][] = Array.from({ length: 12 }, () => []);
  const retro = new Array(12).fill(0);
  const unavailable = new Array(12).fill(0);

  for (let i = 1; i < cells.length; i += 1) {
    const fiscalMonth = fiscalMonthIndex(start + i);
    const now = cells[i]!;
    const before = cells[i - 1]!;

    if (now.kind === "unavailable") {
      unavailable[fiscalMonth] += 1;
      // A freeze is a real zero for this month, not a gap to skip over.
      advances[fiscalMonth]!.push(0);
      continue;
    }
    // Only a date following a date says how far the cutoff moved. A month
    // either side of Current or Unavailable has no measurable step.
    if (now.kind !== "date" || before.kind !== "date") continue;
    const delta = now.day! - before.day!;
    advances[fiscalMonth]!.push(delta);
    if (delta < 0) retro[fiscalMonth] += 1;
  }

  const latest = lastKnownIndex(cells);
  const months = LABELS.map((label, i) => ({
    fiscalMonth: i,
    label,
    medianAdvanceDays: median(advances[i]!),
    observations: advances[i]!.length,
    retrogressions: retro[i]!,
    unavailable: unavailable[i]!,
  }));

  return {
    months,
    currentFiscalMonth: latest >= 0 ? fiscalMonthIndex(start + latest) : 0,
    // Fewer than three observations a month is a pattern drawn from noise.
    usable: months.every((m) => m.observations >= 3),
  };
}
