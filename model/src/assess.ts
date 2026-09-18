/**
 * The single entry point the app calls.
 *
 * One function returning everything the results screen needs, so the UI never
 * has to know how the pieces fit together, and so the whole assessment can be
 * snapshot-tested as a unit.
 */

import { applicableEvents, staleEvents, type ApplicableEvent } from "./events.js";
import { estimate } from "./levelA.js";
import { assessRisk } from "./risk.js";
import type {
  Bundle,
  CaseInput,
  Estimate,
  EventsFile,
  RiskAssessment,
} from "./types.js";

export interface CaseAssessment {
  asOfMonth: string;
  /** Which chart USCIS designated is published separately; see PLAN.md 2.4. */
  finalAction: Estimate;
  filing: Estimate;
  risk: RiskAssessment;
  events: ApplicableEvent[];
  warnings: string[];
}

export function assessCase(
  bundle: Bundle,
  events: EventsFile,
  input: CaseInput,
  onDate: string,
): CaseAssessment {
  const finalAction = estimate(bundle, input, "final_action");
  const filing = estimate(bundle, input, "dates_for_filing");
  const risk = assessRisk(bundle, input.category, input.column);
  const applicable = applicableEvents(events, {
    birthCountry: input.birthCountry,
    category: input.category,
    path: input.path,
    onDate,
  });

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
      "Tested against past cases, a range like this contained the true answer about 73% of the time rather than the 80% intended, so treat it as slightly too narrow rather than exact.",
    );
  }

  // Level A reads how fast the cutoff moved, not how many people are queued
  // behind each priority-date month. Where past movement came from years with
  // thinner cohorts than today, it will read optimistic. The queue model is the
  // fix; until then this is stated rather than smoothed away.
  if (!finalAction.beyondHorizon && finalAction.status === "not_current") {
    warnings.push(
      "This estimate is based on how fast the cutoff has moved, not on how many people are waiting ahead of you. Where a category moved quickly in the past because fewer people held those dates, the estimate will lean optimistic.",
    );
  }
  const stale = staleEvents(events, onDate);
  if (stale.length > 0) {
    warnings.push(
      `${stale.length} tracked event${stale.length === 1 ? " has" : "s have"} not been re-checked recently, so the disruption list may be out of date.`,
    );
  }

  return { asOfMonth: bundle.end_month, finalAction, filing, risk, events: applicable, warnings };
}
