/**
 * The frozen data every logic test reads.
 *
 * These tests used to load ../../../data/app-bundle.json -- the live file the
 * pipeline rewrites daily. That made the suite a clock: eleven tests broke the
 * morning the October 2026 bulletin landed, not because anything regressed but
 * because the fiscal year rolled over. September is the last month of a fiscal
 * year, with categories Unavailable and the year's numbers spent; October is
 * the first month of the next one, with everything reopened. Tests named
 * "September 2026 falls in the last fiscal month" cannot survive that, and a
 * suite that has to be re-pinned every month gets re-pinned without being
 * read.
 *
 * WHY SEPTEMBER AND NOT THE CURRENT MONTH. The obvious fix was to re-pin the
 * assertions to October's values. That would have been the wrong fix: those
 * numbers were hand-checked against the published bulletin when they were
 * written, and re-pinning means reading the expected value off whatever the
 * code currently prints. The test then asserts that the code does what the
 * code does. Freezing the September snapshot keeps every one of those
 * verifications intact -- it is the exact data (commit 8948e5b) the suite was
 * green against, so the golden values stay golden.
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER. Nothing here can tell you the live
 * data is healthy, because by construction it never looks at it. That job
 * belongs to data-health.test.ts, which reads data/ and is written to stay
 * true as time passes rather than pinned to a moment in it.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Bundle, EventsFile } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));

// ../fixtures rather than ./fixtures: this compiles to dist/test/fixtures.js,
// and the JSON is not copied into dist, so the path has to climb back out to
// the source tree.
const read = (name: string) =>
  JSON.parse(readFileSync(resolve(here, `../../test/fixtures/${name}`), "utf8"));

/** September 2026: 202 months, 2009-12 to 2026-09. */
export const bundle = read("app-bundle.json") as Bundle;

/** The event registry as reviewed on 2026-09-21. */
export const events = read("events.json") as EventsFile;

/**
 * The date the fixtures are read "as of". Inside the 45-day window the event
 * registry's last_checked dates are judged against, so the events above are
 * current with respect to it and stay that way.
 */
export const TODAY = "2026-09-17";
