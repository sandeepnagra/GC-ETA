/**
 * Level B: count the people ahead and divide by the numbers available.
 *
 * Level A asks how fast the cutoff has moved. That is a speed, and the backtest
 * showed it carries the wrong information for a deeply backlogged category: it
 * learned its pace from thin priority-date cohorts and applied it to dense ones.
 * This asks the question directly. How many people sit between today's cutoff
 * and your date, and how many visa numbers will your country actually get?
 *
 * THE SUPPLY FIGURE IS THE EASIEST THING TO GET EIGHT TIMES WRONG. The
 * per-country limit printed in the bulletin, 28,862 for FY2026, spans family
 * and employment across every preference. A queue needs the pro-rated
 * per-country, per-category number, which is what the Visa Office means by
 * "India's pro-rated limit in the EB-1 category". For EB-2 in FY2026 that is
 * 0.07 x 0.286 x 186,317, about 3,730. Feeding the combined figure in would
 * overstate supply roughly eightfold. PLAN.md finding 22.
 *
 * That per-category number is a FLOOR, not a ceiling. INA 202(a)(5) lifts the
 * per-country cap in any quarter where a category's supply exceeds qualified
 * demand, which is how India takes far more than seven percent of EB-2 in a
 * good year. How much more is the single largest unknown here, and it is not
 * resolvable from the bulletin. It needs Department of State Table V issuance
 * by country and category, which is not yet ingested.
 *
 * SO THE OUTPUT IS A BOUND, NOT A DISTRIBUTION. The fields are named low, mid
 * and high rather than p10, p50 and p90 on purpose. Pairing the smallest queue
 * with the largest supply produces an optimistic bound; it does not produce a
 * tenth percentile, and nothing here justifies calling it one. The backtest
 * already showed the model has no probability skill, and dressing bounds as
 * percentiles would hide that rather than fix it.
 */

import { densityHorizon } from "./density.js";
import { dayToIso, isoToDay } from "./bundle.js";
import type { Bundle, Column } from "./types.js";

/** Statutory category shares of the employment-based worldwide limit. */
const CATEGORY_SHARE: Record<string, number> = {
  EB1: 0.286,
  EB2: 0.286,
  EB3: 0.286,
  EB3_OTHER_WORKERS: 0.286,
  EB4: 0.071,
  EB5_UNRESERVED: 0.071,
};

const PER_COUNTRY_SHARE = 0.07;

/**
 * Each principal brings dependents who consume visa numbers of their own.
 * Roughly half of employment numbers have historically gone to family members,
 * which puts the multiplier near two. It varies by category and country and is
 * not published per cohort, so it is a range.
 */
const DERIVATIVES = { low: 1.7, mid: 2.0, high: 2.4 };

/**
 * Not every certified labour certification becomes a visa. People change
 * employers without a new petition, leave, or stop pursuing it, and the
 * published counts never shrink. PLAN.md finding 47.
 *
 * UNCALIBRATED. An earlier draft applied a decay curve, 0.92 falling 0.035 a
 * year to a floor of 0.45, which quietly halved the queue for a 2015 priority
 * date on no evidence at all. The decay is probably real but nothing public
 * measures it, so it is a flat range and labelled as a guess rather than a
 * curve that looks like a finding.
 */
const MATERIALISATION = { low: 0.6, mid: 0.8, high: 1.0 };

/**
 * How many times the per-country floor a heavily oversubscribed country
 * actually receives, once other countries' unused numbers fall across.
 *
 * UNCALIBRATED, and the widest source of error in the whole estimate.
 *
 * Exactly one year can be read from the data. Inverting how far India EB-2
 * moved in FY2022, from September 2011 to December 2014, gives 20,591
 * principals, about 33,000 visa numbers after dependents and materialisation,
 * against a per-country floor near 5,600. That is 5.8 times the floor. Every
 * other year is unreadable: the cutoff moved through priority dates the labour
 * certification record cannot see, so the inversion returns ratios of 0.1 that
 * are artifacts of missing data rather than measurements. And FY2022 carried
 * the highest employment limit ever recorded, 281,507, so it belongs at the top
 * of the range rather than at its centre. Calibrating the centre needs
 * Department of State Table V issuance by country and category.
 */
const SPILL = { low: 1.5, mid: 3.0, high: 6.0 };

export interface QueueBounds {
  low: number;
  mid: number;
  high: number;
}

export interface QueueEstimate {
  ok: boolean;
  reason?:
    | "already_current"
    | "density_not_covered"
    | "below_density_floor"
    | "beyond_density_record"
    | "no_supply_model"
    | "no_density";
  /** Principals holding a priority date in the span, before any multiplier. */
  principalsAhead?: number;
  /** Visa numbers consumed by those principals and their families. */
  peopleAhead?: QueueBounds;
  /** Visa numbers the column can expect in this category each year. */
  annualSupply?: QueueBounds;
  waitYears?: QueueBounds;
  coverage?: { monthsCovered: number; monthsNeeded: number };
  notes: string[];
}

/**
 * Which education bucket stands in for this category's demand.
 *
 * A KNOWN BIAS, documented rather than fixed. The PERM records the job's
 * minimum requirement, not the category the I-140 was eventually filed under.
 * For India at old priority dates this undercounts EB-2 specifically, because
 * a large part of that queue holds bachelor's-requirement labour certifications
 * that were later ported to EB-2 on a second I-140 while keeping the original
 * priority date. The education field cannot see that move.
 */
function bucketFor(category: string): "advanced" | "bachelors" | "total" {
  if (category === "EB2") return "advanced";
  if (category === "EB3" || category === "EB3_OTHER_WORKERS") return "bachelors";
  return "total";
}

function monthIndex(month: string): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return y * 12 + (m - 1);
}

function indexToMonth(index: number): string {
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * The earliest priority-date month the record can actually see.
 *
 * Month-level coverage is not enough on its own, and the backtest proved it.
 * The labour certification record begins with FY2015 decisions, so priority
 * dates before about 2013 appear as a thin tail of unusually slow cases rather
 * than as the queue that really sat there. Those months are present, so a
 * coverage test passes, and the count comes back near zero. Scored against
 * India origins in 2016 to 2023 that produced 26% interval coverage inside a
 * band a fifth of a year wide: confidently wrong, which is the worst thing a
 * model can be.
 *
 * So the floor is defined by volume, not presence. It is the first month whose
 * trailing twelve-month total reaches a tenth of the column's busiest year.
 * Below that, the queue is not undercounted, it is invisible, and the honest
 * answer is to refuse.
 */
export function densityFloor(bundle: Bundle, column: Column): string | null {
  const table = bundle.density?.[column];
  if (!table) return null;
  const months = Object.keys(table).sort();
  if (months.length < 12) return null;

  const first = monthIndex(months[0]!);
  const last = monthIndex(months[months.length - 1]!);
  const rolling: Array<{ month: number; sum: number }> = [];
  for (let i = first + 11; i <= last; i += 1) {
    let sum = 0;
    for (let k = i - 11; k <= i; k += 1) sum += table[indexToMonth(k)]?.total ?? 0;
    rolling.push({ month: i, sum });
  }
  if (rolling.length === 0) return null;
  const peak = Math.max(...rolling.map((r) => r.sum));
  if (peak <= 0) return null;
  const threshold = peak * 0.1;
  for (const r of rolling) {
    if (r.sum >= threshold) return indexToMonth(r.month - 11);
  }
  return null;
}

/**
 * Principals holding a priority date between `fromDay` and `toDay`.
 *
 * Reports its own coverage rather than extrapolating over gaps. A queue count
 * built on a guess is worse than no queue count, because it looks authoritative.
 */
export function peopleBetween(
  bundle: Bundle,
  column: Column,
  category: string,
  fromDay: number,
  toDay: number,
): { principals: number; covered: boolean; monthsCovered: number; monthsNeeded: number } {
  const table = bundle.density?.[column];
  if (!table || toDay <= fromDay) {
    return { principals: 0, covered: false, monthsCovered: 0, monthsNeeded: 0 };
  }
  const bucket = bucketFor(category);
  let principals = 0;
  let monthsCovered = 0;
  let monthsNeeded = 0;

  const first = monthIndex(dayToIso(fromDay).slice(0, 7));
  const last = monthIndex(dayToIso(toDay).slice(0, 7));

  for (let i = first; i <= last; i += 1) {
    monthsNeeded += 1;
    const entry = table[indexToMonth(i)];
    if (!entry) continue;
    monthsCovered += 1;
    principals += bucket === "total" ? entry.total : (entry[bucket] ?? 0);
  }

  return {
    principals,
    covered: monthsNeeded > 0 && monthsCovered / monthsNeeded >= 0.7,
    monthsCovered,
    monthsNeeded,
  };
}

/**
 * Visa numbers this column can expect in this category, per year.
 *
 * The employment limit varies by year and a multi-year wait spans several, so
 * this uses the mean of the known years rather than whichever year the estimate
 * happens to start in. Anchoring on FY2026's 186,317 would overstate supply by
 * a third if the limit reverts toward the 140,000 statutory base.
 */
export function annualSupply(bundle: Bundle, category: string): QueueBounds | null {
  const share = CATEGORY_SHARE[category];
  if (!share) return null;

  const known = Object.values(bundle.employment_limit_by_fy ?? {}).filter(
    (v) => typeof v === "number" && v > 0,
  );
  const meanLimit = known.length
    ? known.reduce((a, b) => a + b, 0) / known.length
    : (bundle.statutory_base ?? 140000);

  const floor = PER_COUNTRY_SHARE * share * meanLimit;
  return { low: floor * SPILL.low, mid: floor * SPILL.mid, high: floor * SPILL.high };
}

export function estimateQueue(
  bundle: Bundle,
  column: Column,
  category: string,
  priorityDate: string,
  cutoffDay: number,
): QueueEstimate {
  const notes: string[] = [];
  const targetDay = isoToDay(priorityDate);
  if (targetDay <= cutoffDay) return { ok: false, reason: "already_current", notes };
  if (!bundle.density?.[column]) return { ok: false, reason: "no_density", notes };

  const floor = densityFloor(bundle, column);
  const cutoffMonth = dayToIso(cutoffDay).slice(0, 7);
  if (floor && cutoffMonth < floor) {
    return {
      ok: false,
      reason: "below_density_floor",
      notes: [
        `The cutoff sits at ${cutoffMonth}, before the labour certification record can see the queue, which begins around ${floor}. Counting from there would return almost nobody and give a confidently wrong answer.`,
      ],
    };
  }

  // The opposite failure to the floor, and a different thing to tell the user.
  // A 2025 priority date is not missing from the record because the record is
  // old; it is missing because those labour certifications have not been
  // decided yet. Reporting both as "not covered" would put the wrong
  // explanation on screen.
  const covered = Object.keys(bundle.density?.[column] ?? {}).sort();
  const lastCovered = covered[covered.length - 1];
  if (lastCovered && dayToIso(targetDay).slice(0, 7) > lastCovered) {
    return {
      ok: false,
      reason: "beyond_density_record",
      notes: [
        `Labour certifications with priority dates after ${lastCovered} are still being decided, so the queue behind a date this recent cannot be counted yet.`,
      ],
    };
  }

  const counted = peopleBetween(bundle, column, category, cutoffDay, targetDay);
  const coverage = { monthsCovered: counted.monthsCovered, monthsNeeded: counted.monthsNeeded };
  if (!counted.covered) {
    return {
      ok: false,
      reason: "density_not_covered",
      coverage,
      notes: [
        `Counted ${counted.monthsCovered} of ${counted.monthsNeeded} priority-date months between the cutoff and this date. Too much is missing to count the queue.`,
      ],
    };
  }

  const supply = annualSupply(bundle, category);
  if (!supply) return { ok: false, reason: "no_supply_model", coverage, notes };

  const horizon = densityHorizon(bundle, column);
  if (horizon && dayToIso(targetDay).slice(0, 7) > horizon) {
    notes.push(
      "Your priority date is recent enough that many labour certifications around it are still being decided, so the count is understated.",
    );
  }

  const people: QueueBounds = {
    low: counted.principals * DERIVATIVES.low * MATERIALISATION.low,
    mid: counted.principals * DERIVATIVES.mid * MATERIALISATION.mid,
    high: counted.principals * DERIVATIVES.high * MATERIALISATION.high,
  };

  // The optimistic bound pairs the smallest queue with the largest supply.
  const waitYears: QueueBounds = {
    low: people.low / supply.high,
    mid: people.mid / supply.mid,
    high: people.high / supply.low,
  };

  notes.push(
    `About ${Math.round(people.mid).toLocaleString("en-US")} people are ahead of you, counting spouses and children.`,
  );
  notes.push(
    `That country and category can expect very roughly ${Math.round(supply.mid).toLocaleString("en-US")} visa numbers a year, but how much falls across from other countries is not measurable from public data, so treat the range as wide.`,
  );

  return {
    ok: true,
    principalsAhead: counted.principals,
    peopleAhead: people,
    annualSupply: supply,
    waitYears,
    coverage,
    notes,
  };
}
