import assert from "node:assert/strict";
import { test } from "node:test";

import { expectedLatestMonth, freshness } from "../src/freshness.js";
import type { Bundle } from "../src/types.js";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const withMonth = (end_month: string) => ({ end_month }) as Bundle;

test("before the 25th, the current month's bulletin is the newest expected", () => {
  assert.equal(expectedLatestMonth(at("2026-09-01")), "2026-09");
  assert.equal(expectedLatestMonth(at("2026-09-18")), "2026-09");
  assert.equal(expectedLatestMonth(at("2026-09-24")), "2026-09");
});

test("from the 25th, next month's should be out", () => {
  assert.equal(expectedLatestMonth(at("2026-09-25")), "2026-10");
  assert.equal(expectedLatestMonth(at("2026-09-30")), "2026-10");
});

test("the year rolls over correctly at the end of December", () => {
  assert.equal(expectedLatestMonth(at("2026-12-01")), "2026-12");
  assert.equal(expectedLatestMonth(at("2026-12-26")), "2027-01");
  assert.equal(expectedLatestMonth(at("2027-01-02")), "2027-01");
});

test("data that is current says nothing", () => {
  const result = freshness(withMonth("2026-09"), at("2026-09-18"));
  assert.equal(result.stale, false);
  assert.equal(result.note, null);
});

test("a month behind on the 26th is flagged", () => {
  // This is the case that matters: the refresh broke, October is published,
  // and without this the app would show September as though it were current.
  const result = freshness(withMonth("2026-09"), at("2026-09-26"));
  assert.equal(result.stale, true);
  assert.ok(result.note);
});

test("being ahead of the expectation is not stale", () => {
  // The bulletin sometimes lands early. Holding October on the 20th of
  // September is a good thing, not a fault.
  assert.equal(freshness(withMonth("2026-10"), at("2026-09-20")).stale, false);
});

test("months behind is flagged whatever the day", () => {
  assert.equal(freshness(withMonth("2026-04"), at("2026-09-02")).stale, true);
});
