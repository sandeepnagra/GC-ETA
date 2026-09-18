#!/usr/bin/env node
/** Run the backtests and print a report. */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { absoluteToMonth, monthToAbsolute } from "./bundle.js";
import { backtestCutoff, backtestFirstPassage, backtestQueue, backtestHeadToHead } from "./backtest.js";
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

console.log("3. QUEUE COUNT (Level B): people ahead divided by numbers available.");
console.log("   Band width is printed next to coverage on purpose. Supply is");
console.log("   uncalibrated, so the band is wide, and a wide band covers the");
console.log("   truth without knowing anything. Coverage alone would mislead.\n");

const INDIA = PAIRS.filter((p) => p.column === "IN");
const REST = PAIRS.filter((p) => p.column !== "IN");
const yrs = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)} yr` : "n/a");

for (const [label, set] of [["India", INDIA], ["other columns", REST]] as const) {
  const q = backtestQueue(bundle, set, origins, [1, 2, 3]);
  console.log(`   ${label}`);
  console.log(`     countable / not covered : ${q.computable} / ${q.notCovered}`);
  if (q.samples === 0) {
    console.log("     no scorable cases: density never covered the span between");
    console.log("     the cutoff and the target in these origin months.\n");
    continue;
  }
  console.log(`     samples                 : ${q.samples}  (${q.censored} still not current)`);
  console.log(`     interval coverage       : ${pct(q.coverage)}`);
  console.log(`     median band width       : ${yrs(q.medianBandYears)}`);
  console.log(`     median error of mid     : ${yrs(q.medianErrorYears)}\n`);
}

console.log("4. HEAD TO HEAD: same cases, both models.");
console.log("   The separate scores above are not comparable, because Level B");
console.log("   only answers where it can see the queue, which is an easier");
console.log("   set. This restricts both to exactly the cases both answer.\n");
const h = backtestHeadToHead(bundle, PAIRS, origins, [1, 2, 3], 500);
console.log(`   samples: ${h.samples}  (${h.censored} still not current)\n`);
console.log(`   ${"model".padEnd(10)}${"coverage".padStart(10)}${"band".padStart(12)}${"median err".padStart(13)}`);
for (const [name, r] of [["Level A", h.levelA], ["Level B", h.levelB]] as const) {
  console.log(
    `   ${name.padEnd(10)}${pct(r.coverage).padStart(10)}` +
    `${yrs(r.medianBandYears).padStart(12)}${yrs(r.medianErrorYears).padStart(13)}`,
  );
}
console.log();
