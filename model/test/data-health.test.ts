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
import { expectedLatestMonth, freshness } from "../src/freshness.js";
import type { Bundle, EventsFile } from "../src/types.js";

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
