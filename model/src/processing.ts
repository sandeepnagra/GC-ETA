/**
 * What is left after the bulletin: USCIS deciding the I-485.
 *
 * For most of this app the bulletin IS the wait, and adjudication is a
 * rounding error against a decade in the queue. For one group it is the
 * entire remaining question: someone who has filed and whose final action
 * date has arrived is no longer waiting for a visa number at all. The app
 * used to tell that person it does not model what remains, which is honest
 * and useless in the same sentence.
 *
 * WHY THIS IS NOT DOUBLE COUNTING THE QUEUE. A receipt-to-decision figure
 * for an employment-based I-485 would normally include years of sitting
 * behind a priority date, which the rest of the model already predicts.
 * USCIS excludes those: "Visa regressed I-485s and revoked petitions or
 * applications are excluded." What is left is time to decide a case that
 * could be decided. The figures confirm it, running 5.5 to 11 months across
 * nine years, which cannot contain an India EB-2 wait.
 *
 * WHAT THESE NUMBERS ARE NOT. One median per fiscal year. The spread between
 * years is how much the median has MOVED, not how much individual cases
 * differ from one another, and the spread between cases is certainly wider.
 * So this reports "the typical wait has run between X and Y months", never a
 * tenth-to-ninetieth percentile for one person. Nothing here is a
 * distribution and the type deliberately gives no percentile fields to
 * misread as one.
 */

import type { Bundle } from "./types.js";

export interface AdjudicationOutlook {
  /** Median months, from the most recent fiscal year that ran its full length. */
  typicalMonths: number;
  /** The fiscal year that figure is from. */
  fiscalYear: string;
  /** Lowest and highest annual median across the complete years on record. */
  lowMonths: number;
  highMonths: number;
  /** How many complete fiscal years the range is drawn from. */
  years: number;
  /** Months since the applicant filed, when they told us the date. */
  pendingMonths?: number;
  /** Pending longer than the typical year's median. Not "late" -- half of all cases are. */
  pastTypical?: boolean;
}

/**
 * `pendingMonths` is optional: the estimate stands without it, and with it
 * the caller can say where this applicant sits against the typical case.
 *
 * Partial fiscal years are excluded from both the typical figure and the
 * range. The factsheet's most recent year is often a few months of data
 * reported as if it were a year, and a four-month window has a lower median
 * for the arithmetic reason that slow cases have not finished yet, not
 * because anything got faster.
 */
export function adjudicationOutlook(
  bundle: Bundle,
  pendingMonths?: number,
): AdjudicationOutlook | null {
  const table = bundle.processing_times?.i485_employment_median_months ?? {};
  const partial = new Set(bundle.processing_times?.partial_years ?? []);
  const complete = Object.entries(table)
    .filter(([fy, months]) => !partial.has(fy) && Number.isFinite(months) && months > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  if (complete.length === 0) return null;

  const [fiscalYear, typicalMonths] = complete[complete.length - 1]!;
  const values = complete.map(([, months]) => months);

  const outlook: AdjudicationOutlook = {
    typicalMonths,
    fiscalYear,
    lowMonths: Math.min(...values),
    highMonths: Math.max(...values),
    years: complete.length,
  };
  if (pendingMonths !== undefined && Number.isFinite(pendingMonths) && pendingMonths >= 0) {
    outlook.pendingMonths = pendingMonths;
    outlook.pastTypical = pendingMonths > typicalMonths;
  }
  return outlook;
}
