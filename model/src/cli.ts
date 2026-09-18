#!/usr/bin/env node
/**
 * Run an estimate from the command line, for eyeballing model output without
 * the app.
 *
 *   npm run estimate -- --column IN --category EB2 --pd 2015-03-10
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { dayToIso } from "./bundle.js";
import { estimate } from "./levelA.js";
import { assessRisk } from "./risk.js";
import type { Bundle, Column } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, "../../../data/app-bundle.json");

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as Bundle;
const column = arg("column", "IN") as Column;
const category = arg("category", "EB2");
const priorityDate = arg("pd", "2015-03-10");

const result = estimate(bundle, { column, category, priorityDate });
const risk = assessRisk(bundle, category, column);

const cutoff =
  result.currentCutoff.kind === "date"
    ? dayToIso(result.currentCutoff.day!)
    : result.currentCutoff.kind.toUpperCase();

console.log(`\n  ${category} · ${column} · priority date ${priorityDate}`);
console.log(`  bulletin ${result.asOfMonth}   cutoff now: ${cutoff}\n`);
console.log(`  status      : ${result.status}`);
if (result.beyondHorizon) {
  console.log(`  estimate    : beyond the model's horizon`);
  console.log(
    `  crossed     : ${(result.crossedFraction! * 100).toFixed(0)}% of simulations within 25 years`,
  );
} else if (result.p50) {
  console.log(`  likely      : ${result.p10} to ${result.p90}`);
  console.log(`  most likely : ${result.p50}`);
}
console.log(`  confidence  : ${result.confidence}`);
console.log(`\n  outlook     : ${risk.outlook} (risk ${risk.score}/100)`);
for (const reason of risk.reasons) console.log(`     - ${reason}`);
console.log(`\n  drivers:`);
for (const driver of result.drivers) console.log(`     - ${driver}`);
console.log();
