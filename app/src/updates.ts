/**
 * Keeping the data current without shipping a new build.
 *
 * PLAN.md 8.1 says shipping a new number is a data publish, not a release. That
 * was written down and then not built: `data.ts` read the bundled snapshot and
 * nothing else, while its own comment and `sync-data.mjs` both described a
 * runtime fetch that did not exist. This is that fetch.
 *
 * The sequence never blocks the screen. The app renders from whatever it
 * already has, then checks a small manifest in the background, and only pulls
 * the bundle when the manifest says there is a newer one. A failure at any step
 * leaves the previous data in place.
 *
 * ON NOT CHECKING A HASH. The manifest carries a sha256 of each file and this
 * code ignores it, which looks like a shortcut and is not. The hash would come
 * from the same origin as the file it describes, so anyone able to serve a bad
 * bundle can serve a matching manifest, and it protects against nothing that
 * HTTPS does not already cover. What it would catch is a truncated or corrupt
 * download, and so does parsing the JSON and checking its shape. That check is
 * below and it is stricter: it also rejects a well-formed bundle that is older
 * than the one already held, which no hash would notice.
 *
 * The privacy claim in 7.1 survives because the request is parameter-free and
 * everyone downloads the same file. Nothing about the case is sent.
 */

import * as FileSystem from "expo-file-system";
import type { Bundle, EventsFile } from "@gc-eta/model";

/**
 * Published by the scheduled workflow in .github/workflows/refresh-data.yml.
 * A fixed, parameter-free path: no identifiers, no query string.
 */
const BASE = "https://sandeepnagra.github.io/GC-ETA/data";

const CACHE_DIR = `${FileSystem.cacheDirectory}gc-eta/`;
const BUNDLE_FILE = `${CACHE_DIR}app-bundle.json`;
const EVENTS_FILE = `${CACHE_DIR}events.json`;
const STAMP_FILE = `${CACHE_DIR}stamp.json`;

/** Give up rather than hold the screen on a slow network. */
const TIMEOUT_MS = 12_000;

export type DataSource = "bundled" | "cached" | "fetched";

export interface DataSet {
  bundle: Bundle;
  events: EventsFile;
  source: DataSource;
}

interface Manifest {
  generated_at: string;
  bulletin_month: string;
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Is this a usable bundle, and is it actually newer than what we hold?
 *
 * The second half matters as much as the first. A publish that goes backwards,
 * because a pipeline ran on a partial archive or a rollback was botched, would
 * otherwise replace good data with worse and look like a successful update.
 */
function acceptableBundle(value: unknown, current: Bundle): value is Bundle {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Bundle>;
  if (typeof candidate.schema_version !== "number") return false;
  if (candidate.schema_version !== current.schema_version) return false;
  if (typeof candidate.end_month !== "string") return false;
  if (typeof candidate.start_month !== "string") return false;
  if (!candidate.series || typeof candidate.series !== "object") return false;
  // The archive only grows. Fewer series or an earlier last month means
  // something upstream lost data.
  if (Object.keys(candidate.series).length < Object.keys(current.series).length) return false;
  if (candidate.end_month < current.end_month) return false;
  return true;
}

function acceptableEvents(value: unknown): value is EventsFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EventsFile>;
  return Array.isArray(candidate.events) && typeof candidate.last_reviewed === "string";
}

/** Whatever was downloaded on a previous run, if it is still readable. */
export async function loadCached(bundled: DataSet): Promise<DataSet> {
  try {
    const stamp = await FileSystem.getInfoAsync(STAMP_FILE);
    if (!stamp.exists) return bundled;
    const bundleText = await FileSystem.readAsStringAsync(BUNDLE_FILE);
    const eventsText = await FileSystem.readAsStringAsync(EVENTS_FILE);
    const bundle = JSON.parse(bundleText) as unknown;
    const events = JSON.parse(eventsText) as unknown;
    if (!acceptableBundle(bundle, bundled.bundle) || !acceptableEvents(events)) return bundled;
    return { bundle, events, source: "cached" };
  } catch {
    // A cache that cannot be read is not an error worth surfacing. The app has
    // a perfectly good snapshot built into it.
    return bundled;
  }
}

/**
 * Check for a newer publish and take it if there is one.
 *
 * Returns null when there is nothing to do, which is the common case: the
 * manifest is a few hundred bytes and most launches stop there.
 */
export async function checkForUpdate(current: DataSet): Promise<DataSet | null> {
  try {
    const manifest = (await getJson(`${BASE}/manifest.json`)) as Manifest;
    if (!manifest?.generated_at) return null;
    if (manifest.generated_at <= current.bundle.generated_at) return null;

    const [bundle, events] = await Promise.all([
      getJson(`${BASE}/app-bundle.json`),
      getJson(`${BASE}/events.json`),
    ]);
    if (!acceptableBundle(bundle, current.bundle)) return null;
    if (!acceptableEvents(events)) return null;

    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => {});
    await FileSystem.writeAsStringAsync(BUNDLE_FILE, JSON.stringify(bundle));
    await FileSystem.writeAsStringAsync(EVENTS_FILE, JSON.stringify(events));
    // Written last, so a half-finished write leaves no stamp and the cache is
    // ignored rather than half-read on the next launch.
    await FileSystem.writeAsStringAsync(
      STAMP_FILE,
      JSON.stringify({ generated_at: manifest.generated_at, at: new Date().toISOString() }),
    );
    return { bundle, events, source: "fetched" };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- freshness */

/**
 * The newest bulletin month the app ought to be holding today.
 *
 * The Visa Office publishes the bulletin governing a month during the middle of
 * the month before. So for most of a month the newest available bulletin is the
 * current one, and from around the 25th the next month's should be out.
 * PLAN.md 8.1 requires the app to say so when it is behind rather than present
 * stale figures as current, because otherwise a broken pipeline and a working
 * one look identical to the reader.
 */
export function expectedLatestMonth(today: Date): string {
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-based
  const advance = today.getDate() >= 25 ? 1 : 0;
  const absolute = year * 12 + month + advance;
  return `${String(Math.floor(absolute / 12)).padStart(4, "0")}-${String((absolute % 12) + 1).padStart(2, "0")}`;
}

export interface Freshness {
  stale: boolean;
  /** Short enough to sit next to the bulletin month in a header. */
  note: string | null;
}

export function freshness(bundle: Bundle, today: Date = new Date()): Freshness {
  const expected = expectedLatestMonth(today);
  if (bundle.end_month >= expected) return { stale: false, note: null };
  return { stale: true, note: "a newer bulletin may be out" };
}
