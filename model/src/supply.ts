/**
 * Where a year's visa numbers come from, and what this country actually gets.
 *
 * The design sketches this with illustrative figures for a year that has not
 * been published. Every number here is one already in the bundle: the statutory
 * base, the worldwide limit the Visa Office set for each year, and the issuance
 * recorded in Table V. Where next year is genuinely unknown it says so rather
 * than estimating it, because the point of the card is to show that the size of
 * the pool is decided annually and is not a constant.
 */

import type { Bundle, Column } from "./types.js";

const STATUTORY_BASE = 140000;
const CATEGORY_SHARE: Record<string, number> = {
  EB1: 0.286,
  EB2: 0.286,
  EB3: 0.286,
  EB3_OTHER_WORKERS: 0.286,
  EB4: 0.071,
  EB5_UNRESERVED: 0.071,
};
const PER_COUNTRY_SHARE = 0.07;

const ISSUANCE_FIELD: Record<string, string> = {
  EB1: "EB1",
  EB2: "EB2",
  EB3: "EB3",
  EB3_OTHER_WORKERS: "EB3_OTHER_WORKERS",
  EB4: "EB4_TOTAL",
  EB4_CERTAIN_RELIGIOUS_WORKERS: "EB4_CERTAIN_RELIGIOUS_WORKERS",
};

export interface SupplyPicture {
  /** The newest fiscal year whose worldwide limit is published. */
  fiscalYear: number | null;
  /** 140,000, set by statute and unchanged since 1990. */
  base: number;
  /** The limit actually set for that year. */
  limit: number | null;
  /** Family numbers that fell across, which is limit minus base. */
  spillover: number | null;
  /** That year's share for this category, worldwide. */
  categoryTotal: number | null;
  /** The per-country floor for this category: 7% of the category's share. */
  perCountryFloor: number | null;
  /** What this column actually received, median across recorded years. */
  typicalReceived: number | null;
  receivedLow: number | null;
  receivedHigh: number | null;
  yearsRecorded: number;
  /** How far the worldwide limit has swung across the years on record. */
  limitLow: number | null;
  limitHigh: number | null;
}

export function supplyPicture(
  bundle: Bundle,
  column: Column,
  category: string,
): SupplyPicture {
  const limits = bundle.employment_limit_by_fy ?? {};
  const years = Object.keys(limits)
    .map(Number)
    .filter((y) => Number.isFinite(y) && limits[String(y)]! > 0)
    .sort((a, b) => a - b);
  const fiscalYear = years.length ? years[years.length - 1]! : null;
  const limit = fiscalYear ? limits[String(fiscalYear)]! : null;
  const share = CATEGORY_SHARE[category] ?? null;

  const limitValues = years.map((y) => limits[String(y)]!);

  const field = ISSUANCE_FIELD[category];
  const received: number[] = [];
  if (field && bundle.issuance) {
    for (const year of Object.keys(bundle.issuance)) {
      const value = bundle.issuance[year]?.[column]?.[field];
      if (typeof value === "number" && value > 0) received.push(value);
    }
  }
  received.sort((a, b) => a - b);
  const quantile = (q: number) => {
    if (received.length === 0) return null;
    if (received.length === 1) return received[0]!;
    const position = (received.length - 1) * q;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return received[lower]!;
    return Math.round(
      received[lower]! + (received[upper]! - received[lower]!) * (position - lower),
    );
  };

  return {
    fiscalYear,
    base: STATUTORY_BASE,
    limit,
    spillover: limit !== null ? limit - STATUTORY_BASE : null,
    categoryTotal: limit !== null && share !== null ? Math.round(share * limit) : null,
    perCountryFloor:
      limit !== null && share !== null
        ? Math.round(PER_COUNTRY_SHARE * share * limit)
        : null,
    typicalReceived: quantile(0.5),
    receivedLow: quantile(0.25),
    receivedHigh: quantile(0.75),
    yearsRecorded: received.length,
    limitLow: limitValues.length ? Math.min(...limitValues) : null,
    limitHigh: limitValues.length ? Math.max(...limitValues) : null,
  };
}
