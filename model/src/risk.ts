/**
 * Near-term outlook: advance, hold or retrogress over the next 3 to 6 months.
 *
 * A hand-tuned heuristic for the MVP, replaced by a classifier once the
 * backtest harness exists. PLAN.md 6.4.
 *
 * Deliberately NOT using narrative keyword matching. The bulletin's Section C
 * is boilerplate containing "may retrogress" and "may become unavailable" every
 * single month with no category attached, so a keyword classifier flags
 * everything always. The real signal is structural: a dedicated per-category
 * section exists only when the Visa Office has something specific to say. That
 * feature needs section headings in the bundle, which the MVP does not yet
 * carry, so it is left out rather than faked. Finding 30.
 */

import {
  fiscalMonthIndex,
  getSeries,
  lastKnownIndex,
  monthToAbsolute,
} from "./bundle.js";
import type { Bundle, BulletinSection, Cell, Column, RiskAssessment } from "./types.js";

/** Fiscal month 0 is October. July, August and September are 9, 10, 11. */
const SUMMER_START = 9;

/**
 * Sections in the most recent bulletin that speak to this pair. A section with
 * no column speaks to the category in every column.
 */
export function sectionsFor(
  bundle: Bundle,
  category: string,
  column: Column,
): BulletinSection[] {
  const latest = bundle.sections?.[bundle.end_month];
  if (!latest) return [];
  return latest.filter(
    (section) =>
      section.category === category &&
      (section.column === null || section.column === column),
  );
}

function datedRun(cells: Cell[]): Array<{ index: number; day: number }> {
  const out: Array<{ index: number; day: number }> = [];
  cells.forEach((cell, index) => {
    if (cell.kind === "date") out.push({ index, day: cell.day! });
  });
  return out;
}

export function assessRisk(
  bundle: Bundle,
  category: string,
  column: Column,
): RiskAssessment {
  const finalAction = getSeries(bundle, "final_action", "employment", category, column);
  const filing = getSeries(bundle, "dates_for_filing", "employment", category, column);
  const reasons: string[] = [];

  if (!finalAction) {
    return { score: 50, outlook: "hold", reasons: ["No published series for this pair."] };
  }

  const startAbsolute = monthToAbsolute(bundle.start_month);
  const latestIndex = lastKnownIndex(finalAction);
  const latest = latestIndex >= 0 ? finalAction[latestIndex]! : { kind: "missing" as const };
  const fiscalMonth = fiscalMonthIndex(startAbsolute + latestIndex);

  let score = 30;

  // 1. Seasonality and current state, which are mutually exclusive.
  //
  //    The summer penalty prices the risk that a category freezes or moves
  //    back as annual limits bite. If the category is ALREADY Unavailable that
  //    risk has been realised, not incurred again: there is nothing left to
  //    retrogress into, and the next scheduled event is the 1 October reset.
  //    Applying both produced a "hold" for EB-2 India in September 2026, when
  //    the honest reading is that it can only reopen.
  if (latest.kind === "unavailable") {
    score -= 15;
    reasons.push(
      "The category is already Unavailable, so it cannot move back further and the next event is the new fiscal year.",
    );
  } else if (fiscalMonth >= SUMMER_START) {
    score += 30;
    reasons.push("July to September is when annual limits bite and dates freeze or move back.");
  } else if (fiscalMonth === 0) {
    score -= 20;
    reasons.push("October brings a new year of visa numbers, historically the biggest advances.");
  } else if (fiscalMonth <= 5) {
    score -= 10;
    reasons.push("Dates usually advance steadily in the first half of the fiscal year.");
  }

  // 2. The Visa Office's own guidance for this pair, which outranks every
  //    inferred feature below when it exists.
  const sections = sectionsFor(bundle, category, column);
  const alreadyUnavailable = latest.kind === "unavailable";
  for (const section of sections) {
    const s = section.signals;
    if (s.signals_advance) {
      score -= 20;
      reasons.push(
        "The Visa Office has said this category is expected to advance when the new fiscal year begins.",
      );
    }
    // A warning about going unavailable is moot once it already has: there is
    // nothing left to lose, and the next scheduled event is the reset.
    if (!alreadyUnavailable && (s.warns_retrogress || s.warns_unavailable)) {
      score += 25;
      reasons.push(
        s.warns_retrogress && s.warns_unavailable
          ? "This month's bulletin warns this category may retrogress or become unavailable before the fiscal year ends."
          : s.warns_retrogress
            ? "This month's bulletin warns this category may retrogress before the fiscal year ends."
            : "This month's bulletin warns this category may become unavailable before the fiscal year ends.",
      );
    }
    if (s.retrogressed && !alreadyUnavailable) {
      score += 10;
      reasons.push("The Visa Office has already moved this category back this year.");
    }
  }

  // 3. Base rate of retrogression for this specific pair.
  const dated = datedRun(finalAction);
  let retrogressions = 0;
  for (let i = 1; i < dated.length; i += 1) {
    if (dated[i]!.day < dated[i - 1]!.day) retrogressions += 1;
  }
  const unavailableMonths = finalAction.filter((c) => c.kind === "unavailable").length;
  const observed = dated.length + unavailableMonths;
  const baseRate = observed > 0 ? (retrogressions + unavailableMonths) / observed : 0;
  score += Math.round(baseRate * 40);
  if (baseRate > 0.06) {
    reasons.push(
      `This category and country has moved backwards or gone Unavailable in ${Math.round(baseRate * 100)}% of published months.`,
    );
  }

  // 4. A wide gap between the filing chart and the final action chart means the
  //    Visa Office sees more demand than it can serve.
  if (filing) {
    const filingIndex = lastKnownIndex(filing);
    const filingCell = filingIndex >= 0 ? filing[filingIndex]! : null;
    if (filingCell?.kind === "date" && latest.kind === "date") {
      const gapYears = (filingCell.day! - latest.day!) / 365.25;
      if (gapYears > 1.5) {
        score += 10;
        reasons.push(
          `The filing chart sits ${gapYears.toFixed(1)} years ahead of the approval chart, which signals a queue larger than the numbers available.`,
        );
      }
    }
  }

  // 5. Recent direction.
  if (dated.length >= 4) {
    const recent = dated.slice(-4);
    const movedBack = recent.some((point, i) => i > 0 && point.day < recent[i - 1]!.day);
    if (movedBack) {
      score += 10;
      reasons.push("The cutoff has moved backwards within the last few published months.");
    }
  }

  score = Math.max(0, Math.min(100, score));
  const outlook: RiskAssessment["outlook"] =
    score >= 60 ? "retrogress" : score >= 35 ? "hold" : "advance";
  return { score, outlook, reasons };
}
