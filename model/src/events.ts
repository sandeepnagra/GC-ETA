/**
 * Event layer: which disruptions actually apply to a given case.
 *
 * Two distinctions the UI depends on.
 *
 * Country of birth is not the same as the bulletin column. The charts collapse
 * everything outside China, India, Mexico and the Philippines into one "Rest of
 * World" column, but a travel ban applies to a specific nationality inside that
 * column. Matching events on the column would tell a Nigerian applicant that no
 * ban applies. So events match on birth country and the column is used only for
 * the charts.
 *
 * Relevance is not the same as impact. A consular pause does not block someone
 * adjusting status inside the United States, but it still moves next year's
 * supply, so it belongs on screen as context rather than as a blocker.
 */

import type { EventsFile, GcEvent, ProcessingPath } from "./types.js";

export type Relevance = "blocks" | "context";

/**
 * Only these event types can stop or gate an individual case. Everything else
 * moves the numbers behind the queue and is context, however important.
 *
 * Without this, the Gold Card, which draws on EB-1 and EB-2 and has produced a
 * single approval, was being shown to every EB-2 applicant as something that
 * "affects you directly". A negligible supply draw is not a blocker.
 */
const BLOCKING_TYPES = new Set([
  "consular_pause",
  "adjudication_pause",
  "adjudication_standard",
  "entry_ban",
  "category_sunset",
]);

export interface ApplicableEvent {
  event: GcEvent;
  relevance: Relevance;
  /** True while the event is in effect on the reference date. */
  activeNow: boolean;
  /** Set when the event has not started yet, e.g. a scheduled sunset. */
  upcoming: boolean;
  why: string;
}

function resolveCountries(file: EventsFile, event: GcEvent): string[] | "all" {
  const spec = event.countries;
  if (spec === "all") return "all";
  const out: string[] = [];
  const push = (name?: string) => {
    if (!name) return;
    const entry = file.country_lists[name];
    if (entry) out.push(...entry.countries);
  };
  push(spec.list);
  push(spec.also);
  return out;
}

function inWindow(event: GcEvent, onDate: string): { active: boolean; upcoming: boolean } {
  const started = !event.start || event.start <= onDate;
  const ended = !!event.end && event.end < onDate;
  return { active: started && !ended, upcoming: !started };
}

export function applicableEvents(
  file: EventsFile,
  options: {
    birthCountry?: string;
    category: string;
    path: ProcessingPath;
    onDate: string;
  },
): ApplicableEvent[] {
  const { birthCountry, category, path, onDate } = options;
  const out: ApplicableEvent[] = [];

  for (const event of file.events) {
    // Category filter.
    if (event.categories !== "all" && !event.categories.includes(category)) continue;

    // Country filter. An incomplete list must never be read as "you are safe":
    // if the list is flagged incomplete we keep the event as context rather
    // than silently excluding the user from it.
    const countries = resolveCountries(file, event);
    let countryMatch = true;
    let listIncomplete = false;
    if (countries !== "all") {
      const spec = event.countries as { list?: string };
      const listMeta = spec.list ? file.country_lists[spec.list] : undefined;
      listIncomplete = listMeta?.complete === false;
      countryMatch = birthCountry ? countries.includes(birthCountry) : false;
      if (!countryMatch && !listIncomplete) continue;
    }

    const { active, upcoming } = inWindow(event, onDate);
    if (!active && !upcoming && event.status !== "vacated" && event.status !== "ended_by_court") {
      continue;
    }

    // Does it touch this applicant's path, or only the supply behind them?
    const touchesPath = event.affects.includes(path);
    const canBlock = BLOCKING_TYPES.has(event.type);
    let relevance: Relevance =
      canBlock && touchesPath && (active || upcoming) && countryMatch ? "blocks" : "context";
    let why: string;

    if (listIncomplete && !countryMatch) {
      relevance = "context";
      why =
        "The published country list for this event is not fully recorded here, so it is shown for awareness rather than as a determination about your case.";
    } else if (relevance === "blocks") {
      why = `Affects ${path === "adjustment" ? "adjustment of status inside the United States" : "consular processing abroad"}, which is your route.`;
    } else if (!active && upcoming) {
      why = "Scheduled, not yet in effect.";
    } else if (!active) {
      why = "No longer in effect. Kept because it still shapes the numbers for the year it covered.";
    } else if (!canBlock) {
      why =
        "Changes the supply of visa numbers or the future queue rather than your case directly, so it can shift how fast dates move.";
    } else if (!touchesPath) {
      why =
        "Does not touch your route directly, but it moves the visa numbers available, so it can change how fast dates advance.";
    } else {
      why = "Relevant background.";
    }

    out.push({ event, relevance, activeNow: active, upcoming, why });
  }

  // Blockers first, then active context, then everything else.
  const rank = (a: ApplicableEvent) =>
    a.relevance === "blocks" ? 0 : a.activeNow ? 1 : a.upcoming ? 2 : 3;
  return out.sort((a, b) => rank(a) - rank(b));
}

/** Entries whose status has not been re-checked recently enough to display. */
export function staleEvents(file: EventsFile, onDate: string, maxAgeDays = 45): GcEvent[] {
  const cutoff = new Date(Date.parse(`${onDate}T00:00:00Z`) - maxAgeDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return file.events.filter((e) => e.last_checked < cutoff);
}
