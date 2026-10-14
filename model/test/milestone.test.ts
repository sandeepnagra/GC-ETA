/**
 * Which milestone the estimate should headline.
 *
 * The screen used to lead with final action always, which produced two
 * distinct failures. For a badly backlogged case it headlined a date twenty
 * years out, and for someone whose filing date had already arrived it never
 * mentioned the one thing they could do that week. Both are the same bug:
 * the headline was a fixed chart rather than the reader's next step.
 *
 * These pin the rule itself. The chart calibration that decides which date
 * may LEAD is measured in widening.test.ts and recorded in PLAN.md 10.1;
 * what matters here is that the state machine cannot drift.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { assessCase, nextMilestone } from "../src/assess.js";
import { chartInUse } from "../src/bundle.js";
import type { CaseInput, Column, Estimate } from "../src/types.js";
import { bundle, events, TODAY } from "./fixtures.js";

const caseFor = (category: string, column: string, priorityDate: string): CaseInput => ({
  column: column as Column,
  category,
  priorityDate,
  path: "adjustment",
  birthCountry: column,
  seed: 5,
});

const stub = (finalAction: string, filing: string) =>
  ({
    finalAction: { status: finalAction } as Estimate,
    filing: { status: filing } as Estimate,
  });

test("final action reached means the bulletin is no longer the constraint", () => {
  // Both charts current, filed or not: there is nothing left to predict, and
  // what remains is adjudication time the model does not cover.
  for (const filed of [true, false]) {
    assert.equal(nextMilestone(stub("current", "current"), filed), "current");
  }
});

test("an unfiled applicant whose filing date has arrived is told to file", () => {
  assert.equal(nextMilestone(stub("not_current", "current"), false), "file_now");
});

test("once filed, the filing date is behind them and final action leads", () => {
  // The whole point of asking whether they filed. Same inputs as the test
  // above, one flag different, and the headline must change -- predicting a
  // filing date for someone who has already filed is predicting the past.
  assert.equal(nextMilestone(stub("not_current", "current"), true), "final_action");
});

test("a reached filing date in a final-action month is not an invitation", () => {
  // The distinction the determination exists for. The date is reached and
  // the door is shut: USCIS names the chart monthly, and in a final-action
  // month the filing chart is not the one being accepted however current it
  // reads. Telling this person to file would send them to be rejected.
  assert.equal(
    nextMilestone(stub("not_current", "current"), false, "final_action"),
    "file_blocked",
  );
});

test("an unobserved month hedges rather than refusing", () => {
  // null is "not collected", not "final action applied". The record only
  // accumulates forward, so most months have no entry, and inventing a
  // refusal nobody issued is worse than the hedge it would replace.
  assert.equal(nextMilestone(stub("not_current", "current"), false, null), "file_now");
  assert.equal(
    nextMilestone(stub("not_current", "current"), false, "dates_for_filing"),
    "file_now",
  );
});

test("the determination cannot resurrect a filing date for someone who filed", () => {
  for (const chart of ["dates_for_filing", "final_action", null] as const) {
    assert.equal(nextMilestone(stub("not_current", "current"), true, chart), "final_action");
  }
});

test("chartInUse reads the live record, and absence is null not a guess", () => {
  // Present for the bundle's own month, because that is what was collected.
  assert.ok(["dates_for_filing", "final_action", null].includes(chartInUse(bundle)));
  // A month nobody observed must answer null rather than defaulting.
  assert.equal(chartInUse(bundle, "1999-01"), null);
});

test("with neither date arrived, the calibrated chart leads", () => {
  assert.equal(nextMilestone(stub("not_current", "not_current"), false), "final_action");
  assert.equal(nextMilestone(stub("not_current", "not_current"), true), "final_action");
});

test("insufficient data does not get mistaken for a filing opportunity", () => {
  // "file_now" must require the filing chart to be positively current, not
  // merely to be something other than not_current.
  assert.equal(nextMilestone(stub("not_current", "insufficient_data"), false), "final_action");
  assert.equal(nextMilestone(stub("insufficient_data", "current"), false), "file_now");
});

test("the rule holds on real cases from the archive, not just stubs", () => {
  // India EB-2 in the fixture month: the filing cutoff is well short of a
  // 2018 priority date, so both are ahead and final action leads.
  const far = assessCase(bundle, events, caseFor("EB2", "IN", "2018-08-20"), TODAY);
  assert.equal(far.filing.status, "not_current");
  assert.equal(nextMilestone(far, false), "final_action");

  // A 2014 date sits behind the filing cutoff but ahead of final action, so
  // an unfiled applicant can file today and a filed one waits for approval.
  const filable = assessCase(bundle, events, caseFor("EB2", "IN", "2014-06-01"), TODAY);
  assert.equal(filable.filing.status, "current");
  assert.equal(filable.finalAction.status, "not_current");
  assert.equal(nextMilestone(filable, false), "file_now");
  assert.equal(nextMilestone(filable, true), "final_action");
});
