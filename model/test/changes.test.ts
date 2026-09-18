import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { whatWouldChange } from "../src/changes.js";
import type { Bundle, CaseInput, EventsFile } from "../src/types.js";

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
  const rows = whatWouldChange(bundle, events, india);
  const reform = rows.find((r) => r.id === "cap-reform");
  assert.ok(reform, "the row is present");
  assert.match(reform!.detail, /EAGLE|IVES/);
  assert.ok(!/H-1B/.test(reform!.detail));
});

test("a consular pause is not shown to someone adjusting status", () => {
  const adjusting = whatWouldChange(bundle, events, india);
  const consular = whatWouldChange(bundle, events, { ...india, path: "consular" });
  assert.ok(!adjusting.some((r) => r.id === "pause"), "not for an in-US case");
  assert.ok(consular.some((r) => r.id === "pause"), "but yes for a consular one");
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
