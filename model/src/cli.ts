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

import { assessCase } from "./assess.js";
import { dayToIso } from "./bundle.js";
import type { Bundle, Column, EventsFile, ProcessingPath } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, "../../../data/app-bundle.json");

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as Bundle;
const events = JSON.parse(
  readFileSync(resolve(here, "../../../data/events.json"), "utf8"),
) as EventsFile;
const column = arg("column", "IN") as Column;
const category = arg("category", "EB2");
const priorityDate = arg("pd", "2015-03-10");
const path = arg("path", "adjustment") as ProcessingPath;
const birthCountry = arg("country", column === "ROW" ? "" : column) || undefined;
const today = arg("today", new Date().toISOString().slice(0, 10));

const assessment = assessCase(
  bundle, events,
  { birthCountry, column, category, priorityDate, path },
  today,
);
const result = assessment.finalAction;
const risk = assessment.risk;

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

const filing = assessment.filing;
console.log(`\n  filing chart : ${filing.status}${filing.p50 ? `, likely ${filing.p10} to ${filing.p90}` : ""}`);

const blockers = assessment.events.filter((e) => e.relevance === "blocks");
const context = assessment.events.filter((e) => e.relevance === "context");
console.log(`\n  affects you directly (${blockers.length}):`);
for (const item of blockers) {
  console.log(`     ! ${item.event.title}${item.upcoming ? "  [upcoming]" : ""}`);
}
if (blockers.length === 0) console.log("     none");
console.log(`\n  context (${context.length}):`);
for (const item of context.slice(0, 4)) console.log(`     · ${item.event.title}`);

if (assessment.warnings.length) {
  console.log(`\n  caveats:`);
  for (const warning of assessment.warnings) console.log(`     - ${warning}`);
}
console.log();
