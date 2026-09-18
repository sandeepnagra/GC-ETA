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

/* ------------------------------------------------------------ suggestion */

export type SwitchVerdict = "worth_asking" | "too_close" | "probably_not" | "cannot_tell";

export interface Reversal {
  /** Times the other category took the lead in the archive. */
  crossovers: number;
  /** Of those, how often the original category took it back within a year. */
  retakenWithin12Months: number;
  /** Of those, how often the new leader itself moved backwards within a year. */
  retrogressedWithin12Months: number;
}

export interface SwitchSuggestion {
  verdict: SwitchVerdict;
  /** The category being pointed at, when there is one. */
  target: string | null;
  headline: string;
  /** The reasoning, strongest first. */
  because: string[];
  /** What it costs and what can go wrong. Never empty, whatever the verdict. */
  caveats: string[];
  reversal: Reversal | null;
}

/**
 * How often a crossover stuck.
 *
 * This is the number that decides whether a lead means anything. India EB-3 has
 * taken the lead six times; in three of the five cases with a full year of
 * follow-up, EB-2 took it straight back. China is five of eight. A lead that
 * reverses more often than not is not a reason to move, and a lead that has
 * held for two years is a different proposition from one a month old.
 */
function reversalHistory(bundle: Bundle, column: Column, base: string, other: string): Reversal {
  const a = bundle.series[`final_action|employment|${base}|${column}`];
  const b = bundle.series[`final_action|employment|${other}|${column}`];
  if (!a || !b) return { crossovers: 0, retakenWithin12Months: 0, retrogressedWithin12Months: 0 };

  let crossovers = 0;
  let retaken = 0;
  let retrogressed = 0;
  let previousLeader: string | null = null;

  const leaderAt = (i: number): string | null => {
    const ra = rank(decodeCell(a[i] ?? null));
    const rb = rank(decodeCell(b[i] ?? null));
    if (ra === null || rb === null) return null;
    return rb > ra ? other : ra > rb ? base : null;
  };

  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const leader = leaderAt(i);
    if (leader === other && previousLeader === base) {
      const end = Math.min(i + 12, Math.min(a.length, b.length) - 1);
      // Only count a crossover we can actually follow for a year.
      if (end > i) {
        crossovers += 1;
        for (let k = i + 1; k <= end; k += 1) {
          if (leaderAt(k) === base) { retaken += 1; break; }
        }
        const atCrossing = rank(decodeCell(b[i] ?? null));
        const later = rank(decodeCell(b[end] ?? null));
        if (atCrossing !== null && later !== null && later < atCrossing) retrogressed += 1;
      }
    }
    if (leader) previousLeader = leader;
  }
  return { crossovers, retakenWithin12Months: retaken, retrogressedWithin12Months: retrogressed };
}

function monthsBetween(a: string, b: string): number {
  return monthToAbsolute(b) - monthToAbsolute(a);
}

/** The cost and the risk, always stated, whatever the verdict says. */
function standardCaveats(target: string, reversal: Reversal | null): string[] {
  const out = [
    "Your employer has to file a new I-140 in the other category and pay for it. You cannot file it yourself, and they can decline.",
    "It usually reuses the labour certification you already have rather than starting one over, but whether it can depends on how that certification was written.",
    "Your priority date carries over. Keeping the existing petition alive as well as the new one is common, so this is not necessarily a one-way door.",
  ];
  if (reversal && reversal.crossovers > 0) {
    out.push(
      `${target.replace("EB", "EB-")} has taken the lead ${reversal.crossovers} times before. The other category took it back within a year in ${reversal.retakenWithin12Months} of those, and ${target.replace("EB", "EB-")} itself moved backwards within a year in ${reversal.retrogressedWithin12Months}.`,
    );
  }
  out.push(
    "When a category pulls ahead, people move into it, and that is part of what slows it down again. This estimate cannot see that happening.",
  );
  out.push(
    "This compares dates only. It cannot see your legal costs, your timing, or anything specific to your case, so treat it as one input to a conversation with your attorney.",
  );
  return out;
}

/**
 * Whether moving to the other category looks like it would help.
 *
 * COMPARES THE ESTIMATES, NOT TODAY'S CHART, and the difference is the whole
 * point. In September 2026 India EB-3's approval date is January 2014 while
 * EB-2 is Unavailable, which reads as an enormous EB-3 advantage. The estimated
 * dates for a March 2015 priority date run the other way: July 2028 for EB-2
 * against October 2029 for EB-3. A suggestion built on the chart would send
 * that person the wrong way.
 */
export function suggestSwitch(
  comparison: Comparison,
  bundle: Bundle,
  column: Column,
  yourCategory: string,
): SwitchSuggestion {
  const mine = comparison.sides.find((s) => s.category === yourCategory);
  const other = comparison.sides.find((s) => s.category !== yourCategory);
  if (!mine || !other) {
    return {
      verdict: "cannot_tell",
      target: null,
      headline: "There is no comparable category to weigh this against.",
      because: [],
      caveats: standardCaveats(yourCategory, null),
      reversal: null,
    };
  }

  const reversal = reversalHistory(bundle, column, yourCategory, other.category);
  const label = other.category.replace("EB", "EB-");
  const caveats = standardCaveats(other.category, reversal);

  if (mine.estimate.status === "current") {
    return {
      verdict: "probably_not",
      target: null,
      headline: "Your date is already current, so there is nothing to gain by moving.",
      because: ["A different category cannot make an available number arrive sooner."],
      caveats,
      reversal,
    };
  }
  if (!mine.estimate.p50 || !other.estimate.p50 || mine.estimate.beyondHorizon || other.estimate.beyondHorizon) {
    return {
      verdict: "cannot_tell",
      target: null,
      headline: `There is not enough to compare ${yourCategory.replace("EB", "EB-")} and ${label} on.`,
      because: [
        "At least one of the two has no dated estimate, usually because the wait runs past where the record can say anything useful.",
      ],
      caveats,
      reversal,
    };
  }

  const gainMonths = monthsBetween(other.estimate.p50, mine.estimate.p50);
  const because: string[] = [];

  // Today's chart is what people look at, so say explicitly when it disagrees.
  if (comparison.crossover.aheadNow === other.category && gainMonths <= 0) {
    because.push(
      `${label} is further along on today's chart, but that is the queue it has already cleared, not the one you are in. On your priority date the estimate runs the other way.`,
    );
  }

  if (gainMonths <= 0) {
    because.push(
      `Estimated ${Math.abs(gainMonths)} months later in ${label} than where you are, at the midpoint.`,
    );
    return {
      verdict: "probably_not",
      target: null,
      headline: `Moving to ${label} does not look like it would help you.`,
      because,
      caveats,
      reversal,
    };
  }

  // A gain inside the noise of two wide ranges is not a gain. Requiring the
  // pessimistic end to improve too is what separates a real difference from
  // two overlapping guesses.
  //
  // A MISSING p90 IS NOT A ZERO. It means the slow end of that category runs
  // past the twenty-five year horizon, which is worse than any date, not
  // neutral. Treating it as zero made India EB-2 against EB-3 read "too close
  // to call" when EB-3 finishes in 99% of simulations and EB-2 in 63%.
  const minePessimistic = mine.estimate.p90;
  const otherPessimistic = other.estimate.p90;
  let pessimisticGain: number;
  if (minePessimistic && otherPessimistic) {
    pessimisticGain = monthsBetween(otherPessimistic, minePessimistic);
  } else if (otherPessimistic && !minePessimistic) {
    pessimisticGain = Number.POSITIVE_INFINITY; // yours never finishes; theirs does
  } else if (minePessimistic && !otherPessimistic) {
    pessimisticGain = Number.NEGATIVE_INFINITY; // theirs never finishes; yours does
  } else {
    pessimisticGain = 0; // neither finishes, so the slow end cannot separate them
  }

  if (gainMonths < 12 || pessimisticGain <= 0) {
    because.push(
      `About ${gainMonths} months earlier at the midpoint, which is inside the uncertainty of both estimates.`,
    );
    if (pessimisticGain <= 0) {
      because.push("On the slower end of each range, moving does not come out ahead at all.");
    }
    return {
      verdict: "too_close",
      target: other.category,
      headline: `${label} and ${yourCategory.replace("EB", "EB-")} are too close to separate for your date.`,
      because,
      caveats,
      reversal,
    };
  }

  because.push(
    Number.isFinite(pessimisticGain)
      ? `Estimated about ${gainMonths} months earlier in ${label}, and still earlier on the slower end of both ranges.`
      : `Estimated about ${gainMonths} months earlier in ${label}. On the slow end the difference is larger still: ${label} finishes inside the model's twenty-five year horizon in most simulations and ${yourCategory.replace("EB", "EB-")} does not.`,
  );
  if (mine.queue.ok && other.queue.ok && other.queue.peopleAhead && mine.queue.peopleAhead) {
    const fewer = Math.round(mine.queue.peopleAhead.mid - other.queue.peopleAhead.mid);
    if (fewer > 0) {
      because.push(`About ${fewer.toLocaleString("en-US")} fewer people ahead of you in ${label}.`);
    }
  }
  if (mine.supply && other.supply && other.supply.mid > mine.supply.mid) {
    because.push(
      `${label} has received more visa numbers a year for your country, ${Math.round(other.supply.mid).toLocaleString("en-US")} against ${Math.round(mine.supply.mid).toLocaleString("en-US")} in a median year.`,
    );
  }

  return {
    verdict: "worth_asking",
    target: other.category,
    headline: `On the numbers, ${label} looks better for your date. It is worth asking your employer and attorney about.`,
    because,
    caveats,
    reversal,
  };
}
