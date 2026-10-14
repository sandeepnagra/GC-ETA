/**
 * The only tests here that read the live data/ directory.
 *
 * Everything else moved to frozen fixtures so the suite stops breaking every
 * time a bulletin lands. That trade has a cost, and this file is what pays
 * it: with the fixtures frozen, nothing else in the suite would notice if the
 * real data went stale, lost a month, or started shipping an event registry
 * nobody had checked in half a year.
 *
 * The rule for anything added here: assert a property that stays true as time
 * passes, never a value that happens to be true today. "The archive is not
 * behind what the app expects" survives every month. "The archive ends in
 * September 2026" survived four weeks and then wasted an afternoon. If a test
 * here needs editing when a bulletin comes out, it is written wrong and
 * belongs in the fixture suite instead.
 *
 * These are allowed to fail. A red build here means the published data needs
 * attention, which is the point -- it is the only automated thing left that
 * looks at reality.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { staleEvents } from "../src/events.js";
import { estimate } from "../src/levelA.js";
import { adjudicationOutlook } from "../src/processing.js";
import { expectedLatestMonth, freshness } from "../src/freshness.js";
import type { Bundle, Column, EventsFile } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const live = (name: string) =>
  JSON.parse(readFileSync(resolve(here, `../../../data/${name}`), "utf8"));

const bundle = live("app-bundle.json") as Bundle;
const events = live("events.json") as EventsFile;
const today = new Date();
const todayIso = today.toISOString().slice(0, 10);

test("the published archive is not behind the bulletin the app expects", () => {
  // freshness() is what the app itself uses to decide whether to tell the
  // user their estimate may be out of date, so this fails exactly when a
  // user would be seeing that warning. It is how the October bulletin went
  // unnoticed: the app knew, and nothing else was asking.
  const state = freshness(bundle, today);
  assert.equal(
    state.stale,
    false,
    `the app would show "${state.note}": bundle ends ${bundle.end_month}, ` +
      `expected ${expectedLatestMonth(today)} as of ${todayIso}. ` +
      `The pipeline has not picked up the current bulletin.`,
  );
});

test("no event in the registry has gone unchecked", () => {
  // staleEvents' own 45-day window, measured from now rather than from a
  // pinned date. The version of this test that lived in events.test.ts
  // passed a hardcoded TODAY, so it had quietly stopped being able to fail.
  const stale = staleEvents(events, todayIso);
  assert.deepEqual(
    stale.map((e) => `${e.id} (last checked ${e.last_checked})`),
    [],
    "events have not been reviewed inside the staleness window",
  );
});

test("the archive has not lost months it used to have", () => {
  // A parser regression or a bad upstream fetch shows up as the archive
  // silently shrinking. The count only ever goes up, so a floor is a
  // maintenance-free check: 202 months as of the 2026-09 bulletin.
  assert.ok(
    bundle.months >= 202,
    `archive shrank to ${bundle.months} months (${bundle.start_month}..${bundle.end_month})`,
  );
});

test("the only gaps in the archive are the three known ones", () => {
  // These three are genuinely absent upstream. Anything else appearing here
  // is a fetch or parse failure being carried silently into the bundle --
  // and a future month that is not published yet must not land in this list,
  // which is why build_bulletins.py reports those separately.
  assert.deepEqual([...bundle.missing_months].sort(), ["2009-10", "2009-11", "2012-10"]);
});

test("every event carries a last_checked date the staleness rule can read", () => {
  for (const event of events.events) {
    assert.match(
      event.last_checked ?? "",
      /^\d{4}-\d{2}-\d{2}$/,
      `${event.id} has an unusable last_checked: ${event.last_checked}`,
    );
  }
});

test("the model still answers for a realistic gap on every live pair", () => {
  // The check the backtest structurally cannot make, and the one whose
  // absence let the density coverage bug ship.
  //
  // backtestFirstPassage defines each target as the cutoff AT THE ORIGIN plus
  // an offset, so both ends of every density lookup sit in the same era and
  // the ratio between them stays near 1. The live configuration is the
  // opposite shape: India EB-2's cutoff is stranded in 2013 while the people
  // asking hold 2018 dates, so one end is in the region the DOL files cover
  // and the other is not. That is precisely where the bug bit, and no
  // combination of origins or offsets reproduces it -- adding 5- and 7-year
  // offsets was tried for exactly this and does not fire.
  //
  // So this asserts the weakest useful property, against today's data: asked
  // about a date a few years past the current cutoff, the model returns an
  // answer rather than a shrug. Under the bug this was 0% on every India
  // series -- no date, no range, nothing -- while every other test passed.
  //
  // The threshold is HORIZON_CONFIDENCE, the fraction below which the model
  // itself refuses to state a date -- so this asserts no more than "the app
  // would show something". Not an arbitrary line, and not a pin on today's
  // output, so it survives the archive moving. Measured either side: 97-98%
  // with the floor in place, 15-20% with it removed.
  const pairs: Array<[string, Column]> = [
    ["EB2", "IN" as Column],
    ["EB3", "IN" as Column],
    ["EB2", "CN" as Column],
    ["EB3", "CN" as Column],
  ];
  for (const [category, column] of pairs) {
    for (const chart of ["final_action", "dates_for_filing"] as const) {
      const cells = bundle.series[`${chart}|employment|${category}|${column}`];
      if (!cells) continue;
      const latest = [...cells].reverse().find(
        (c) => typeof c === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c),
      ) as string | undefined;
      if (!latest) continue;

      // Four years past the published cutoff: a gap real users have, and far
      // enough past it to cross the density coverage boundary.
      const target = new Date(`${latest}T00:00:00Z`);
      target.setUTCFullYear(target.getUTCFullYear() + 4);
      const priorityDate = target.toISOString().slice(0, 10);

      const result = estimate(
        bundle,
        { column, category, priorityDate, seed: 1, iterations: 800 },
        chart,
      );
      if (result.status !== "not_current") continue;
      assert.ok(
        (result.crossedFraction ?? 0) > 0.5,
        `${category}/${column} ${chart}: only ${Math.round((result.crossedFraction ?? 0) * 100)}% ` +
          `of simulations reach a date 4 years past the ${latest} cutoff. The model has stopped ` +
          `answering, which is what a broken step scaling looks like.`,
      );
    }
  }
});

test("the live bundle can still answer what happens after filing", () => {
  // The figures come from a USCIS factsheet PDF whose URL carries the fiscal
  // years in it, so a new edition appears at a new address and the old one
  // keeps answering 200 with stale content. This notices the series going
  // missing; it cannot notice it going stale, which is why the collector
  // records last_checked.
  const outlook = adjudicationOutlook(bundle);
  assert.ok(outlook, "no adjudication figures in the bundle");
  assert.ok(
    outlook.typicalMonths > 1 && outlook.typicalMonths < 60,
    `typical adjudication of ${outlook.typicalMonths} months is not credible`,
  );
  // The whole justification for using this data is that retrogressed cases
  // are excluded, so it measures deciding rather than queueing. A figure
  // that drifted into years would mean that stopped being true and the
  // number had quietly become the visa wait again, which the model already
  // predicts and must not count twice.
  assert.ok(
    outlook.highMonths < 36,
    `${outlook.highMonths} months looks like a queue wait, not an adjudication`,
  );
  assert.ok(outlook.lowMonths <= outlook.typicalMonths);
  assert.ok(outlook.typicalMonths <= outlook.highMonths);
});
