/**
 * "What changed" for a specific case.
 *
 * This is the news surface, and it is built from the curated event registry
 * rather than from a raw feed. Three reasons that choice is deliberate.
 *
 * Relevance. A river of official headlines is mostly irrelevant to any one
 * applicant: the State Department feed is largely country travel advisories,
 * and putting "Antarctica, Level 2" next to someone's EB-2 India estimate
 * trains them to ignore the surface entirely. Registry entries already carry
 * country, category and path, so each item can be filtered to the person
 * reading it.
 *
 * Accuracy. Much immigration commentary is prediction rather than reporting.
 * Republishing it inside an app where people decide whether to change jobs or
 * leave the country would lend it authority it has not earned. Every item here
 * carries a confidence flag and, where one exists, a primary-source link.
 *
 * Usefulness. A headline alone does not answer the only question the reader
 * has, which is what it does to their wait. Because registry entries carry a
 * modelling effect, each item can say so.
 *
 * Privacy is preserved by construction: the pipeline fetches and curates, the
 * app reads the same published file everyone else reads, and no request is
 * keyed to the user's case.
 */

import { applicableEvents } from "./events.js";
import type { Bundle, CaseInput, EventsFile, GcEvent } from "./types.js";

export interface NewsItem {
  id: string;
  /** ISO date this item is anchored to, for ordering. */
  date: string;
  title: string;
  summary: string;
  /** What it means for this reader, in plain words. */
  meaning: string;
  tone: "adverse" | "favourable" | "neutral";
  /** True when it acts on this case rather than on the numbers behind it. */
  direct: boolean;
  status: string;
  sourceUrl: string | null;
  confidence: "verified" | "secondary";
}

function toneOf(event: GcEvent): NewsItem["tone"] {
  if (event.status === "vacated" || event.status === "ended_by_court") return "favourable";
  if (["consular_pause", "adjudication_pause", "entry_ban", "category_sunset"].includes(event.type)) {
    return "adverse";
  }
  if (event.type === "adjudication_standard") return "adverse";
  return "neutral";
}

/**
 * The date a reader would consider this item's news date: when it most recently
 * changed state, not when it began.
 */
function anchorDate(event: GcEvent): string {
  return event.end ?? event.start ?? event.last_checked;
}

export function caseTimeline(
  bundle: Bundle,
  events: EventsFile,
  input: CaseInput,
  onDate: string,
  limit = 12,
): NewsItem[] {
  const applicable = applicableEvents(events, {
    birthCountry: input.birthCountry,
    category: input.category,
    path: input.path,
    onDate,
  });

  const items: NewsItem[] = applicable.map(({ event, relevance, activeNow, upcoming }) => {
    const tone = toneOf(event);
    let meaning: string;
    if (upcoming) {
      meaning = relevance === "blocks"
        ? "Takes effect soon and will apply to your case."
        : "Takes effect soon. It does not act on your case directly.";
    } else if (!activeNow) {
      meaning = "No longer in effect. It still shaped the numbers for the year it covered.";
    } else if (relevance === "blocks") {
      meaning = "In effect and applies to your route.";
    } else {
      meaning = "In effect. It moves the visa numbers behind you rather than your case directly.";
    }
    return {
      id: event.id,
      date: anchorDate(event),
      title: event.title,
      summary: event.summary,
      meaning,
      tone,
      direct: relevance === "blocks",
      status: event.status,
      sourceUrl: event.verified_against,
      confidence: event.confidence,
    };
  });

  // The bulletin itself is the most consequential recurring item, and it is the
  // one piece of news that always applies to everyone.
  items.push({
    id: `bulletin-${bundle.end_month}`,
    date: `${bundle.end_month}-01`,
    title: `Visa Bulletin for ${bundle.end_month} published`,
    summary:
      "The monthly chart of cutoff dates. Every estimate in this app is recomputed from it.",
    meaning: "This is the data your estimate is built on.",
    tone: "neutral",
    direct: true,
    status: "published",
    sourceUrl: null,
    confidence: "verified",
  });

  return items
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit);
}
