#!/usr/bin/env node
/** Run the backtests and print a report. */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { absoluteToMonth, monthToAbsolute } from "./bundle.js";
import { backtestCutoff, backtestFirstPassage } from "./backtest.js";
import type { Bundle, Column } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = JSON.parse(
  readFileSync(resolve(here, "../../../data/app-bundle.json"), "utf8"),
) as Bundle;

const PAIRS: Array<{ category: string; column: Column }> = [
  { category: "EB2", column: "IN" },
  { category: "EB3", column: "IN" },
  { category: "EB2", column: "CN" },
  { category: "EB3", column: "CN" },
  { category: "EB3", column: "PH" },
  { category: "EB3", column: "ROW" },
];

const days = (d: number) => (Number.isFinite(d) ? `${(d / 30.44).toFixed(1)} mo` : "n/a");
const pct = (p: number) => (Number.isFinite(p) ? `${(p * 100).toFixed(0)}%` : "n/a");

console.log(`\nBACKTEST  ·  archive ${bundle.start_month} to ${bundle.end_month}`);
console.log(`pairs: ${PAIRS.map((p) => `${p.category}/${p.column}`).join(", ")}\n`);

console.log("1. SHORT RANGE: where will the cutoff be?");
console.log("   Mean absolute error. Persistence assumes no movement.\n");
const cutoff = backtestCutoff(bundle, PAIRS, [6, 12], "2018-10", 300);
console.log(`   ${"horizon".padEnd(9)}${"n".padStart(6)}${"model".padStart(10)}${"persist".padStart(10)}${"seasonal".padStart(10)}${"coverage".padStart(10)}`);
for (const row of cutoff) {
  console.log(
    `   ${(row.horizon + " mo").padEnd(9)}${String(row.samples).padStart(6)}` +
    `${days(row.model).padStart(10)}${days(row.persistence).padStart(10)}` +
    `${days(row.seasonal).padStart(10)}${pct(row.coverage).padStart(10)}`,
  );
}

const origins: string[] = [];
for (let a = monthToAbsolute("2016-10"); a <= monthToAbsolute("2023-09"); a += 3) {
  origins.push(absoluteToMonth(a));
}

console.log("\n2. FIRST PASSAGE: when does a priority date become current?");
console.log("   What the app actually promises. Coverage is the headline:");
console.log("   a P10-P90 band should contain the truth about 80% of the time.\n");
const passage = backtestFirstPassage(bundle, PAIRS, origins, [1, 2, 3], 500);
console.log(`   origins tested      : ${origins.length} (quarterly, 2016-10 to 2023-09)`);
console.log(`   samples             : ${passage.samples}  (${passage.censored} still not current at the end of the record)`);
console.log(`   interval coverage   : ${pct(passage.coverage)}   target ~80%`);
console.log(`   median error of P50 : ${Number.isFinite(passage.medianErrorYears) ? passage.medianErrorYears.toFixed(2) + " years" : "n/a"}`);
console.log(`   Brier, current ≤24mo: ${Number.isFinite(passage.brier24) ? passage.brier24.toFixed(3) : "n/a"}   (0 perfect, 0.25 = always saying 50%)`);
console.log(`   "beyond horizon"    : ${passage.beyondHorizonTotal} calls, ${pct(passage.beyondHorizonCorrect)} still not current`);
console.log();
