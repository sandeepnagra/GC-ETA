/**
 * The single entry point the app calls.
 *
 * One function returning everything the results screen needs, so the UI never
 * has to know how the pieces fit together, and so the whole assessment can be
 * snapshot-tested as a unit.
 */

import { getSeries, lastKnownIndex } from "./bundle.js";
import { applicableEvents, staleEvents, type ApplicableEvent } from "./events.js";
import { estimate } from "./levelA.js";
import { estimateQueue, type QueueEstimate } from "./levelB.js";
import { nearTermOutlook, type Outlook } from "./outlook.js";
import type {
  Bundle,
  CaseInput,
  Estimate,
  EventsFile,
} from "./types.js";

export interface CaseAssessment {
  asOfMonth: string;
  /** Which chart USCIS designated is published separately; see PLAN.md 2.4. */
  finalAction: Estimate;
  filing: Estimate;
  /**
   * What is actually scheduled to change in the next few months.
   *
   * Replaces a score out of 100 that blended seasonality, a retrogression base
   * rate and recent direction. The backtest measured that kind of reading as no
   * better than assuming no movement at six months, so it is gone. This reports
   * rules, deadlines and the Visa Office's own written guidance, and says so
   * plainly when there is nothing.
   */
  outlook: Outlook;
  /**
   * How many people hold an earlier priority date, from the labour
   * certification record. Present only when the record actually covers the
   * span; `ok: false` carries the reason it does not.
   *
   * This is deliberately separate from `finalAction`. The count is grounded in
   * a million certified cases. The wait it implies divides that count by a
   * supply figure that cannot yet be calibrated, and the head-to-head backtest
   * showed the division is worse than Level A at picking a date. So the UI
   * shows the count and treats the wait range as a cross-check, never as the
   * headline. PLAN.md, Phase 2 results.
   */
  queue: QueueEstimate;
  events: ApplicableEvent[];
  warnings: string[];
}

/** The cutoff to count back from: today's, or the last real date before a U. */
function countFrom(bundle: Bundle, input: CaseInput): number | null {
  const cells = getSeries(bundle, "final_action", "employment", input.category, input.column);
  if (!cells) return null;
  for (let i = lastKnownIndex(cells); i >= 0; i -= 1) {
    const cell = cells[i]!;
    if (cell.kind === "date") return cell.day!;
  }
  return null;
}

export function assessCase(
  bundle: Bundle,
  events: EventsFile,
  input: CaseInput,
  onDate: string,
): CaseAssessment {
  const finalAction = estimate(bundle, input, "final_action");
  const filing = estimate(bundle, input, "dates_for_filing");
  const outlook = nearTermOutlook(bundle, events, input, onDate);
  const applicable = applicableEvents(events, {
    birthCountry: input.birthCountry,
    category: input.category,
    path: input.path,
    onDate,
  });

  const anchor = countFrom(bundle, input);
  const queue: QueueEstimate =
    anchor === null
      ? { ok: false, reason: "no_density", notes: [] }
      : estimateQueue(bundle, input.column, input.category, input.priorityDate, anchor);

  const warnings: string[] = [];

  // The low end of the range is known to be too optimistic until historical
  // annual limits are ingested and advances are normalised by them, because
  // the bootstrap can sample pandemic-era jumps drawn from a far larger pool.
  // PLAN.md Phase 1 progress. Surfacing it rather than hiding it.
  // Explain the early end rather than just disclaiming it. For a deeply
  // backlogged category the P10 often reflects one unusual historical October
  // recovering from a retrogression, not a likely outcome, so state the actual
  // probability instead of leaving the range to imply one.
  // The backtest measured this model's probability output as no better than a
  // coin flip at two years (Brier 0.257 against 0.25 for always saying 50%).
  // Presenting "56 in 100" as though it were informative would claim skill the
  // evidence does not support, so the caveat cites the measurement instead.
  if (finalAction.p10 && !finalAction.beyondHorizon) {
    warnings.push(
      "Tested against past cases, a range like this contained the true answer about 78% of the time rather than the 80% intended, so treat it as close to right but not exact.",
    );
  }

  // Level A reads how fast the cutoff moved, not how many people are queued
  // behind each priority-date month. The queue count now exists, and where it
  // can answer it is shown alongside. It did not beat Level A at picking a date
  // in the backtest, so it corrects the user's picture rather than the number.
  if (!finalAction.beyondHorizon && finalAction.status === "not_current") {
    warnings.push(
      queue.ok
        ? "This date comes from how fast the cutoff has moved, not from how many people are waiting ahead of you. The count of people ahead is shown separately because the two can disagree."
        : "This estimate is based on how fast the cutoff has moved, not on how many people are waiting ahead of you. Where a category moved quickly in the past because fewer people held those dates, the estimate will lean optimistic.",
    );
  }
  const stale = staleEvents(events, onDate);
  if (stale.length > 0) {
    warnings.push(
      `${stale.length} tracked event${stale.length === 1 ? " has" : "s have"} not been re-checked recently, so the disruption list may be out of date.`,
    );
  }

  return { asOfMonth: bundle.end_month, finalAction, filing, outlook, queue, events: applicable, warnings };
}
