/**
 * The handful of things that would actually move this estimate.
 *
 * The design sketches four fixed rows. Fixed rows would be wrong for most
 * cases: whether a country ban matters depends on the country, whether EB-1
 * fall-down matters depends on the category, and the size of a good spillover
 * year is a number in the bundle rather than a phrase. Each row here is derived
 * and carries its own figures, and a row with nothing to say is left out.
 *
 * These are levers, not forecasts. Nothing here says how likely any of it is,
 * because nothing in the data supports a probability, and the card's job is to
 * tell someone what to watch rather than what to expect.
 */

import type { Bundle, CaseInput, EventsFile, GcEvent } from "./types.js";

export type Direction = "sooner" | "later";

export interface Change {
  id: string;
  direction: Direction;
  /** Bolded lead, a few words. */
  title: string;
  /** One clause, carrying the number where there is one. */
  detail: string;
}

const ISSUANCE_FIELD: Record<string, string> = {
  EB1: "EB1",
  EB2: "EB2",
  EB3: "EB3",
  EB3_OTHER_WORKERS: "EB3_OTHER_WORKERS",
};

function n(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Does this event speak to the applicant's country at all? */
function touchesCountry(file: EventsFile, event: GcEvent, birthCountry?: string): boolean {
  if (event.countries === "all") return true;
  if (!birthCountry) return false;
  const spec = event.countries;
  for (const key of [spec.list, spec.also]) {
    if (!key) continue;
    const list = file.country_lists[key]?.countries ?? [];
    if (list.includes(birthCountry)) return true;
  }
  return false;
}

export function whatWouldChange(
  bundle: Bundle,
  events: EventsFile,
  input: CaseInput,
): Change[] {
  const out: Change[] = [];

  // 1. A big spillover year. The size of the pool is the single largest lever
  //    on how far any category moves, and the range is in the bundle.
  const limits = Object.entries(bundle.employment_limit_by_fy ?? {})
    .map(([fy, value]) => ({ fy: Number(fy), value }))
    .filter((x) => Number.isFinite(x.fy) && x.value > 0)
    .sort((a, b) => a.fy - b.fy);
  if (limits.length >= 2) {
    const current = limits[limits.length - 1]!;
    const best = limits.reduce((a, b) => (b.value > a.value ? b : a));
    if (best.value > current.value * 1.15) {
      out.push({
        id: "spillover",
        direction: "sooner",
        title: "A big spillover year",
        detail: `FY${best.fy} put ${n(best.value)} numbers in the pool against ${n(current.value)} this year. Unused family visas decide it, and October is when it is set.`,
      });
    }
  }

  // 2. The per-country cap going away, if something in the registry proposes it
  //    AND is still actually alive.
  //
  //    Matching loosely on the word "cap" pulled in a wage-weighted H-1B
  //    selection rule, whose summary mentions the H-1B cap and which has
  //    nothing to do with per-country limits. Both conditions are required.
  //
  //    This used to exclude only "enacted", which let a bill dead since
  //    January 2025 keep showing as a live possibility for eight months,
  //    because nothing had taught the check the word for dead. A bill that
  //    did not pass before its Congress ended is not "still pending"
  //    forever; reintroduction is a new bill and a new registry entry, not a
  //    reason to keep this one alive. An allow-list of the statuses that
  //    actually mean "still moving" fixes this for every future entry too,
  //    not just this one: anything the list does not recognise counts as not
  //    live, rather than needing to name every future way to be dead.
  const LIVE_LEGISLATION_STATUSES = new Set(["pending"]);
  const capReform = events.events.find(
    (event) =>
      event.type === "legislation" &&
      /per-country|EAGLE|IVES/i.test(`${event.title} ${event.summary}`),
  );
  if (capReform && LIVE_LEGISLATION_STATUSES.has(capReform.status)) {
    out.push({
      id: "cap-reform",
      direction: "sooner",
      title: "The per-country limit changing",
      detail: `${capReform.title}. Not law, and every version phases in over years rather than at once.`,
    });
  }

  // 3. EB-1 taking more of the pool. Only worth saying for the categories that
  //    receive fall-down, and only when the record shows EB-1 actually moving.
  if (input.category === "EB2" || input.category === "EB3") {
    const years = Object.keys(bundle.issuance ?? {}).sort();
    const eb1 = years
      .map((y) => bundle.issuance?.[y]?.[input.column]?.EB1)
      .filter((v): v is number => typeof v === "number" && v > 0);
    if (eb1.length >= 5) {
      const recent = eb1[eb1.length - 1]!;
      const sorted = [...eb1].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      out.push({
        id: "eb1-demand",
        direction: "later",
        title: "EB-1 taking more",
        detail: `Numbers EB-1 does not use fall down to EB-2. Your country used ${n(recent)} of them last year against a typical ${n(median)}, and the more it uses the less falls.`,
      });
    }
  }

  // 4. Something drawing directly on this category's numbers.
  const draw = events.events.find(
    (event) =>
      event.type === "supply_draw" &&
      (event.categories === "all" || event.categories.includes(input.category)),
  );
  if (draw) {
    out.push({
      id: "supply-draw",
      direction: "later",
      title: "Numbers drawn off the top",
      detail: `${draw.title}. Anything taking numbers before the queue reaches them slows every date behind it.`,
    });
  }

  // 5. A pause or ban reaching the applicant's country AND their processing
  //    path. A consular pause does not touch someone adjusting status inside
  //    the United States, and listing it for them would be noise.
  //
  //    This used to be `.find()`, which returns whichever candidate happens
  //    to sit first in the registry file -- not the most current, not the
  //    most specific to this applicant. A generic worldwide pause and a
  //    country-specific ban can both match the same case, and the file's own
  //    insertion order has no reason to track which one actually matters
  //    more today. Sorted instead: a pause genuinely in force now outranks
  //    one that has already ended, a country-specific listing outranks
  //    "every country" (more informative for this applicant specifically),
  //    and the most recently started breaks any remaining tie.
  //
  //    An event whose `end` has passed is dropped entirely UNLESS its status
  //    is one of the ones that exists specifically to flag a real risk of
  //    returning (a court can undo its own order, and often has). That is
  //    the deliberate "A pause returning" branch below, not a bug to filter
  //    away along with genuinely stale ones.
  const now = Date.now();
  const isCurrentlyActive = (event: GcEvent) =>
    event.status === "active" || event.status === "in_force";
  const couldReturn = (event: GcEvent) =>
    event.status === "vacated" || event.status === "ended_by_court";
  const pauseCandidates = events.events
    .filter(
      (event) =>
        ["entry_ban", "adjudication_pause", "consular_pause"].includes(event.type) &&
        event.affects.includes(input.path) &&
        touchesCountry(events, event, input.birthCountry) &&
        (event.end === null || new Date(event.end).getTime() >= now || couldReturn(event)),
    )
    .sort((a, b) => {
      const activeDiff = Number(isCurrentlyActive(b)) - Number(isCurrentlyActive(a));
      if (activeDiff !== 0) return activeDiff;
      const specificDiff = Number(b.countries !== "all") - Number(a.countries !== "all");
      if (specificDiff !== 0) return specificDiff;
      return (b.start ?? "").localeCompare(a.start ?? "");
    });
  const pause = pauseCandidates[0];
  if (pause) {
    const gone = couldReturn(pause);
    out.push({
      id: "pause",
      direction: "later",
      title: gone ? "A pause returning" : "A pause on your country",
      detail: gone
        ? `${pause.title} was stopped, and nothing prevents a similar order. A pause moves numbers to other countries.`
        : `${pause.title}. While one is in force the numbers go to other countries.`,
    });
  }

  return out;
}
