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

  // 2. The per-country cap going away, if something in the registry proposes it.
  //
  //    Matching loosely on the word "cap" pulled in a wage-weighted H-1B
  //    selection rule, whose summary mentions the H-1B cap and which has
  //    nothing to do with per-country limits. Both conditions are required.
  const capReform = events.events.find(
    (event) =>
      event.type === "legislation" &&
      /per-country|EAGLE|IVES/i.test(`${event.title} ${event.summary}`),
  );
  if (capReform && capReform.status !== "enacted") {
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
  const pause = events.events.find(
    (event) =>
      ["entry_ban", "adjudication_pause", "consular_pause"].includes(event.type) &&
      event.affects.includes(input.path) &&
      touchesCountry(events, event, input.birthCountry),
  );
  if (pause) {
    const gone = pause.status === "vacated" || pause.status === "ended_by_court";
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
