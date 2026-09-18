import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { seasonalPattern } from "../src/season.js";
import { supplyPicture } from "../src/supply.js";
import type { Bundle, Column } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = JSON.parse(
  readFileSync(resolve(here, "../../../data/app-bundle.json"), "utf8"),
) as Bundle;

test("the fiscal year starts in October", () => {
  const season = seasonalPattern(bundle, "EB2", "IN" as Column);
  assert.equal(season.months.length, 12);
  assert.equal(season.months[0]!.label, "Oct");
  assert.equal(season.months[11]!.label, "Sep");
  season.months.forEach((m, i) => assert.equal(m.fiscalMonth, i));
});

test("September 2026 falls in the last fiscal month", () => {
  const season = seasonalPattern(bundle, "EB2", "IN" as Column);
  assert.equal(season.currentFiscalMonth, 11);
});

test("the seasonal shape differs by category, which is why it is measured", () => {
  // A fixed explainer would draw the same picture for both. India EB-2 barely
  // moves and closes in the summer; China EB-2 advances all year. Asserting one
  // story for every category would be wrong for most of them.
  const indiaEb2 = seasonalPattern(bundle, "EB2", "IN" as Column);
  const chinaEb2 = seasonalPattern(bundle, "EB2", "CN" as Column);
  const total = (s: typeof indiaEb2) =>
    s.months.reduce((sum, m) => sum + m.medianAdvanceDays, 0);
  assert.ok(total(chinaEb2) > total(indiaEb2) * 3, "China moves far more per year");
  const indiaSummerFreezes = indiaEb2.months.slice(9).reduce((n, m) => n + m.unavailable, 0);
  assert.ok(indiaSummerFreezes > 0, "India EB-2 has closed in the summer");
});

test("a freeze counts as a real zero, not a missing month", () => {
  // Skipping Unavailable months would make a category that shuts every August
  // look like one that simply advances less, which is a different claim.
  const season = seasonalPattern(bundle, "EB2", "IN" as Column);
  const august = season.months[10]!;
  assert.ok(august.unavailable > 0);
  assert.ok(august.observations >= august.unavailable);
});

test("a pair with no series returns an unusable pattern rather than zeroes", () => {
  const season = seasonalPattern(bundle, "EB9", "IN" as Column);
  assert.equal(season.usable, false);
  assert.equal(season.months.length, 12);
});

test("supply separates what the statute sets from what fell across", () => {
  const picture = supplyPicture(bundle, "IN" as Column, "EB2");
  assert.equal(picture.base, 140000);
  assert.equal(picture.fiscalYear, 2026);
  assert.equal(picture.limit, 186317);
  assert.equal(picture.spillover, 186317 - 140000);
  assert.equal(picture.categoryTotal, Math.round(0.286 * 186317));
  assert.equal(picture.perCountryFloor, Math.round(0.07 * 0.286 * 186317));
});

test("supply reports what the country actually received, not just its floor", () => {
  // The floor is about 3,730 for EB-2. India's recorded median is above it and
  // its good years are five times it, which is the whole point of the card.
  const picture = supplyPicture(bundle, "IN" as Column, "EB2");
  assert.ok(picture.yearsRecorded >= 10);
  assert.ok(picture.typicalReceived! > picture.perCountryFloor!);
  assert.ok(picture.receivedHigh! > picture.typicalReceived! * 2);
});

test("the worldwide limit is shown as a range, because it is not a constant", () => {
  // Every year on record has exceeded the 140,000 the statute sets, because
  // unused family numbers fall across, and the amount swings enormously: the
  // recorded low is 150,037 and the high 281,507. Showing only the statutory
  // base would describe a number nobody has actually worked with.
  const picture = supplyPicture(bundle, "IN" as Column, "EB2");
  assert.ok(picture.limitLow! > picture.base, "every recorded year cleared the base");
  assert.ok(picture.limitHigh! > 250000, "and one ran past 250,000");
  assert.ok(picture.limitHigh! / picture.limitLow! > 1.7, "the swing is nearly twofold");
});
