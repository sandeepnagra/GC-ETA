import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { whatWouldChange } from "../src/changes.js";
import type { Bundle, CaseInput, EventsFile, GcEvent } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name: string) =>
  JSON.parse(readFileSync(resolve(here, `../../../data/${name}`), "utf8"));
const bundle = load("app-bundle.json") as Bundle;
const events = load("events.json") as EventsFile;

const india: CaseInput = {
  birthCountry: "IN",
  column: "IN",
  category: "EB2",
  priorityDate: "2015-03-10",
  path: "adjustment",
};

test("every row carries a direction and a figure or a named source", () => {
  const rows = whatWouldChange(bundle, events, india);
  assert.ok(rows.length >= 3);
  for (const row of rows) {
    assert.ok(["sooner", "later"].includes(row.direction));
    assert.ok(row.title.length > 0 && row.detail.length > 0);
  }
});

test("cap reform is matched on what it is, not on the word cap", () => {
  // Matching loosely pulled in a wage-weighted H-1B selection rule, whose
  // summary mentions the H-1B cap and which has nothing to do with per-country
  // limits. The row must name the actual bills.
  //
  // Built from a synthetic registry rather than the live one: the real
  // EAGLE/IVES entry is correctly excluded once it is marked dead (see the
  // test below), and this one is about the matching logic, not today's
  // legislative status.
  // Only the synthetic event, not the real registry: the live EAGLE/IVES
  // entry matches the same regex and would win a `.find()` by sitting first,
  // masking exactly the bug this pair of tests exists to catch.
  const withPendingReform: EventsFile = {
    ...events,
    events: [
      {
        id: "test-cap-reform",
        type: "legislation",
        title: "Per-country cap reform: EAGLE Act and IVES Act",
        summary: "Bills that would phase out the seven percent per-country limit.",
        countries: "all",
        affects: [],
        categories: "all",
        start: null,
        end: null,
        status: "pending",
        modeling: {},
        confidence: "secondary",
        verified_against: null,
        last_checked: "2026-01-01",
      },
    ],
  };
  const rows = whatWouldChange(bundle, withPendingReform, india);
  const reform = rows.find((r) => r.id === "cap-reform");
  assert.ok(reform, "the row is present");
  assert.match(reform!.detail, /EAGLE|IVES/);
  assert.ok(!/H-1B/.test(reform!.detail));
});

test("a bill dead since its Congress ended is not shown as a live lever", () => {
  // The real registry's EAGLE/IVES entry died with the 118th Congress on 3
  // January 2025 and is marked status "died". A deny-list that only excluded
  // "enacted" let a dead bill keep showing as a live possibility for eight
  // months, because nothing had taught it the word for dead; the allow-list
  // this now uses treats anything it does not recognise as not live.
  const rows = whatWouldChange(bundle, events, india);
  assert.ok(!rows.find((r) => r.id === "cap-reform"), "a died bill must not show as a live lever");
});

test("a consular pause is not shown to someone adjusting status", () => {
  const adjusting = whatWouldChange(bundle, events, india);
  const consular = whatWouldChange(bundle, events, { ...india, path: "consular" });
  assert.ok(!adjusting.some((r) => r.id === "pause"), "not for an in-US case");
  assert.ok(consular.some((r) => r.id === "pause"), "but yes for a consular one");
});

const basePause: GcEvent = {
  id: "test-pause",
  type: "consular_pause",
  title: "Test pause",
  summary: "",
  countries: "all",
  affects: ["consular"],
  categories: "all",
  start: "2026-01-01",
  end: null,
  status: "active",
  modeling: {},
  confidence: "secondary",
  verified_against: null,
  last_checked: "2026-09-21",
};

test("an in-force pause outranks one that already ended, even if the ended one names this country specifically", () => {
  // `.find()` used to return whichever candidate sat first in the file, with
  // no regard for which one is actually still happening. A pause genuinely
  // in force today is the more urgent fact for the reader than one a court
  // already ended, however precisely the ended one names their country.
  const withBoth: EventsFile = {
    ...events,
    country_lists: { ...events.country_lists, test_india: { countries: ["IN"] } },
    events: [
      { ...basePause, id: "generic-active", countries: "all", status: "active" },
      {
        ...basePause,
        id: "india-ended",
        countries: { list: "test_india" },
        status: "ended_by_court",
        start: "2025-01-01",
        end: "2025-06-01",
      },
    ],
  };
  const rows = whatWouldChange(bundle, withBoth, { ...india, path: "consular" });
  const pause = rows.find((r) => r.id === "pause");
  assert.ok(pause);
  assert.equal(pause!.title, "A pause on your country");
});

test("among pauses at the same urgency, the one naming this country outranks 'every country'", () => {
  const withBoth: EventsFile = {
    ...events,
    country_lists: { ...events.country_lists, test_india: { countries: ["IN"] } },
    events: [
      { ...basePause, id: "generic-active", countries: "all", start: "2026-01-01" },
      {
        ...basePause,
        id: "india-active",
        countries: { list: "test_india" },
        start: "2026-03-01",
      },
    ],
  };
  const rows = whatWouldChange(bundle, withBoth, { ...india, path: "consular" });
  const pause = rows.find((r) => r.id === "pause");
  assert.ok(pause);
  assert.match(pause!.detail, /^Test pause\./);
});

test("a pause whose end date has passed, and which carries no risk of returning, is dropped rather than shown stale", () => {
  const withStale: EventsFile = {
    ...events,
    events: [
      {
        ...basePause,
        id: "long-over",
        status: "ended",
        start: "2020-01-01",
        end: "2020-06-01",
      },
    ],
  };
  const rows = whatWouldChange(bundle, withStale, { ...india, path: "consular" });
  assert.ok(!rows.some((r) => r.id === "pause"), "nothing this stale should still be a lever");
});

test("EB-1 fall-down is only mentioned to categories that receive it", () => {
  const eb2 = whatWouldChange(bundle, events, india);
  const eb1 = whatWouldChange(bundle, events, { ...india, category: "EB1" });
  assert.ok(eb2.some((r) => r.id === "eb1-demand"));
  assert.ok(!eb1.some((r) => r.id === "eb1-demand"), "EB-1 does not fall down to itself");
});

test("the spillover row quotes the real best year against the current one", () => {
  const rows = whatWouldChange(bundle, events, india);
  const spillover = rows.find((r) => r.id === "spillover");
  assert.ok(spillover);
  assert.match(spillover!.detail, /281,507/);
  assert.equal(spillover!.direction, "sooner");
});

test("rows with nothing to say are left out rather than shown empty", () => {
  const empty: EventsFile = { ...events, events: [] };
  const rows = whatWouldChange(bundle, empty, india);
  assert.ok(!rows.some((r) => r.id === "cap-reform"));
  assert.ok(!rows.some((r) => r.id === "pause"));
  assert.ok(rows.some((r) => r.id === "spillover"), "the bundle-derived row survives");
});
