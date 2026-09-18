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
  if (finalAction.p10 && !finalAction.beyondHorizon) {
    warnings.push(
      "The earliest end of this range is optimistic: it can draw on years when far more visa numbers were available than today.",
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
