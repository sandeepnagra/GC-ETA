/**
 * EB-2 against EB-3, side by side, for one person's country and priority date.
 *
 * WHY THIS SHOWS EVERYTHING AND RECOMMENDS NOTHING. The constraint is on the
 * verdict, not on the data. Every number either category has is shown here,
 * including each one's estimated date, its queue and what it actually receives.
 * What is not produced is a single "changing category would save you X years",
 * and the reason is in the record rather than in caution.
 *
 * India, from the bulletin archive:
 *
 *     Oct 2021    EB-2  2011-09     EB-3  2014-01      EB-3 ahead by 2y 4m
 *     Dec 2021    EB-2  2012-05     EB-3  2012-01      EB-3 retrogressed 2y
 *     Aug 2022    EB-2  2014-12     EB-3  2012-02      EB-2 ahead by 2y 10m
 *
 * Someone who moved in October 2021 chasing a two-year advantage found it
 * reversed inside two months and inverted within a year. The gap is not a
 * stable property of the two categories: EB-3 has been ahead in 68 of 201
 * published months for India and 98 of 201 for China, switching six and ten
 * times respectively. A number computed from today's gap describes today only.
 *
 * It is also self-defeating in a way an ordinary forecast is not. The 2021
 * crossover drew a wave of downgrades, and the wave is part of why EB-3
 * retrogressed. An app that tells many people the same category is faster helps
 * make it slower. Nothing in the model can see its own effect.
 *
 * And the decision is not the applicant's alone. Moving category needs a new
 * I-140 in the other category, which the employer files, pays for and can
 * decline. The app cannot see the employer, the legal cost, or the risk taken
 * while the new petition is pending. A saving stated in years implies those are
 * all zero. Finding 44.
 *
 * So: both columns, in full, and the reader decides.
 */

import { decodeCell, getSeries, lastKnownIndex, monthToAbsolute, absoluteToMonth } from "./bundle.js";
import { estimate } from "./levelA.js";
import { estimateQueue, annualSupply } from "./levelB.js";
import type { Bundle, Cell, CaseInput, Column, Estimate } from "./types.js";
import type { QueueEstimate, SupplyBounds } from "./levelB.js";

export interface CategorySide {
  category: string;
  /** Today's final action cell, which may be Current or Unavailable. */
  cutoff: Cell;
  filing: Cell;
  estimate: Estimate;
  queue: QueueEstimate;
  supply: SupplyBounds | null;
}

export interface Crossover {
  /** Months in the archive where the compared category was ahead. */
  monthsAhead: number;
  monthsCompared: number;
  /** How many times the lead has changed hands. */
  switches: number;
  /** The month the lead last changed hands, if it ever did. */
  lastSwitch: string | null;
  /** Which is ahead today, or null when they are level or not comparable. */
  aheadNow: string | null;
  /** Today's gap in days, when both are dates. */
  gapDays: number | null;
}

export interface Comparison {
  sides: CategorySide[];
  crossover: Crossover;
  /** The first month the comparison could be made, for the UI to render. */
  startMonth: string;
  /**
   * Undated statements only. Anything carrying a month is returned as data on
   * `crossover` instead, so the screen can print "June 2026" rather than the
   * "2026-06" a model has no business formatting.
   */
  notes: string[];
}

/**
 * Rank two cells. Current beats every date, Unavailable loses to every date,
 * and a missing month is not comparable at all.
 *
 * Collapsing Current or Unavailable into a date would corrupt exactly the
 * comparison this screen exists for: right now India EB-2 is Unavailable while
 * EB-3 sits at January 2014, which is the largest gap in the archive and would
 * vanish if Unavailable were read as a null.
 */
function rank(cell: Cell): number | null {
  if (cell.kind === "current") return Number.POSITIVE_INFINITY;
  if (cell.kind === "unavailable") return Number.NEGATIVE_INFINITY;
  if (cell.kind === "date") return cell.day!;
  return null;
}

function currentCell(bundle: Bundle, chart: "final_action" | "dates_for_filing", category: string, column: Column): Cell {
  const series = getSeries(bundle, chart, "employment", category, column);
  if (!series) return { kind: "missing" };
  const index = lastKnownIndex(series);
  return index >= 0 ? series[index]! : { kind: "missing" };
}

function crossoverHistory(
  bundle: Bundle,
  column: Column,
  base: string,
  other: string,
): Crossover {
  const a = bundle.series[`final_action|employment|${base}|${column}`];
  const b = bundle.series[`final_action|employment|${other}|${column}`];
  const start = monthToAbsolute(bundle.start_month);
  if (!a || !b) {
    return { monthsAhead: 0, monthsCompared: 0, switches: 0, lastSwitch: null, aheadNow: null, gapDays: null };
  }

  let monthsAhead = 0;
  let monthsCompared = 0;
  let switches = 0;
  let lastSwitch: string | null = null;
  let previousLeader: string | null = null;

  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const ra = rank(decodeCell(a[i] ?? null));
    const rb = rank(decodeCell(b[i] ?? null));
    if (ra === null || rb === null) continue;
    monthsCompared += 1;
    if (rb > ra) monthsAhead += 1;
    const leader = rb > ra ? other : ra > rb ? base : null;
    if (leader && previousLeader && leader !== previousLeader) {
      switches += 1;
      lastSwitch = absoluteToMonth(start + i);
    }
    if (leader) previousLeader = leader;
  }

  const nowA = rank(currentCell(bundle, "final_action", base, column));
  const nowB = rank(currentCell(bundle, "final_action", other, column));
  let aheadNow: string | null = null;
  let gapDays: number | null = null;
  if (nowA !== null && nowB !== null && nowA !== nowB) {
    aheadNow = nowB > nowA ? other : base;
    if (Number.isFinite(nowA) && Number.isFinite(nowB)) gapDays = Math.abs(nowB - nowA);
  }

  return { monthsAhead, monthsCompared, switches, lastSwitch, aheadNow, gapDays };
}

export function compareCategories(
  bundle: Bundle,
  input: CaseInput,
  categories: string[] = ["EB2", "EB3"],
): Comparison {
  const sides: CategorySide[] = categories.map((category) => {
    const cutoff = currentCell(bundle, "final_action", category, input.column);
    const anchorSeries = getSeries(bundle, "final_action", "employment", category, input.column);
    let anchorDay: number | null = null;
    if (anchorSeries) {
      for (let i = lastKnownIndex(anchorSeries); i >= 0; i -= 1) {
        const cell = anchorSeries[i]!;
        if (cell.kind === "date") { anchorDay = cell.day!; break; }
      }
    }
    return {
      category,
      cutoff,
      filing: currentCell(bundle, "dates_for_filing", category, input.column),
      estimate: estimate(bundle, { ...input, category }, "final_action"),
      queue:
        anchorDay === null
          ? { ok: false, reason: "no_density", notes: [] }
          : estimateQueue(bundle, input.column, category, input.priorityDate, anchorDay),
      supply: annualSupply(bundle, input.column, category),
    };
  });

  const [base, other] = categories as [string, string];
  const crossover = crossoverHistory(bundle, input.column, base, other);

  const notes: string[] = [
    "Moving between these categories needs a new I-140 in the other category. Your employer files it, and the priority date carries over.",
  ];
  return { sides, crossover, startMonth: bundle.start_month, notes };
}
