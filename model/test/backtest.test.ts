import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { bundleAsOf, forecastCutoff } from "../src/backtest.js";
import { getSeries, monthToAbsolute } from "../src/bundle.js";
import type { Bundle } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = JSON.parse(
  readFileSync(resolve(here, "../../../data/app-bundle.json"), "utf8"),
) as Bundle;

test("a truncated bundle ends where it was cut", () => {
  const past = bundleAsOf(bundle, "2019-06");
  assert.equal(past.end_month, "2019-06");
  assert.equal(
    past.months,
    monthToAbsolute("2019-06") - monthToAbsolute(bundle.start_month) + 1,
  );
});

test("no series in a truncated bundle contains a future observation", () => {
  // The whole harness is worthless if this leaks: a model that can see the
  // future scores well and ships broken.
  const cut = "2019-06";
  const past = bundleAsOf(bundle, cut);
  const expected = monthToAbsolute(cut) - monthToAbsolute(bundle.start_month) + 1;
  for (const [key, values] of Object.entries(past.series)) {
    assert.equal(values.length, expected, `${key} was not truncated`);
  }
  const fullEb2 = getSeries(bundle, "final_action", "employment", "EB2", "IN")!;
  const pastEb2 = getSeries(past, "final_action", "employment", "EB2", "IN")!;
  assert.ok(pastEb2.length < fullEb2.length);
  for (let i = 0; i < pastEb2.length; i += 1) {
    assert.deepEqual(pastEb2[i], fullEb2[i], "visible history must be unchanged");
  }
});

test("annual limits are hidden until the year they were determined", () => {
  // A fiscal year's employment limit is not published until roughly July of
  // that year. Scaling a 2022 step by the 2022 limit while standing in 2021
  // would use a number nobody had.
  const before = bundleAsOf(bundle, "2022-06");
  const after = bundleAsOf(bundle, "2022-07");
  assert.ok(!("2022" in before.employment_limit_by_fy), "FY2022 limit not yet known in June");
  assert.ok("2022" in after.employment_limit_by_fy, "known from July");
  assert.ok(!("2026" in before.employment_limit_by_fy), "no future year leaks");
});

test("narrative sections are hidden after the cut", () => {
  const past = bundleAsOf(bundle, "2024-01");
  for (const month of Object.keys(past.sections ?? {})) {
    assert.ok(month <= "2024-01", `${month} leaked past the cut`);
  }
});

test("a cutoff forecast is ordered and anchored to the visible present", () => {
  const past = bundleAsOf(bundle, "2021-10");
  const forecast = forecastCutoff(past, "EB3", "IN", 12, 200, 1);
  assert.ok(forecast);
  assert.ok(forecast!.p10 <= forecast!.p50);
  assert.ok(forecast!.p50 <= forecast!.p90);
});

test("truncating before the archive starts is refused rather than silently empty", () => {
  assert.throws(() => bundleAsOf(bundle, "2001-01"));
});
