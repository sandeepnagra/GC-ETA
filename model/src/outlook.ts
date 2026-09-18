/**
 * What is actually scheduled to change in the next few months.
 *
 * THIS CARD IS NOT A FORECAST, and the previous version of it was, which is why
 * it had to be rewritten. It used to blend seasonality, a retrogression base
 * rate and recent direction into a score out of 100. The backtest then measured
 * that kind of reading: over six months it was no more accurate than assuming
 * the cutoff does not move at all, and its odds of a date becoming current
 * within two years scored no better than always saying fifty percent. Printing
 * a confident number on top of that is the single most misleading thing the app
 * could do.
 *
 * The question the card is meant to answer is narrower and answerable: is
 * anything known to be coming that could change how these dates move? A rule
 * taking effect, a category expiring, a court order, a ban starting or ending,
 * or the Visa Office saying in writing what it intends to do with this
 * category. All of those are published facts with dates attached.
 *
 * When there is nothing, the honest answer is to say so plainly rather than to
 * manufacture an outlook from history. "Nothing scheduled" is information.
 *
 * Statistical base rates are deliberately absent. That a category moved
 * backwards in nine percent of past months is true, and it is not a statement
 * about the next ninety days, so it does not belong on a card about the next
 * ninety days.
 */

import { getSeries, lastKnownIndex } from "./bundle.js";
import { applicableEvents } from "./events.js";
import type {
  Bundle,
  BulletinSection,
  CaseInput,
  Column,
  EventsFile,
} from "./types.js";

/** How far ahead "the next few months" looks. */
export const DEFAULT_WINDOW_DAYS = 90;

export type ChangeSource = "law_or_policy" | "visa_office" | "annual_reset";

/** Whether the change should move dates forward, hold them back, or neither. */
export type Direction = "helps" | "hurts" | "unclear";

export interface ScheduledChange {
  id: string;
  source: ChangeSource;
  title: string;
  detail: string;
  /** The day it takes effect, where one is published. Null when undated. */
  effective: string | null;
  direction: Direction;
}

export interface Outlook {
  windowDays: number;
  /** Empty means nothing is scheduled, which is a finding rather than a gap. */
  changes: ScheduledChange[];
  /** One sentence for the card, written for both the empty and non-empty case. */
  summary: string;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Sections in the most recent bulletin that speak to this pair. A section with
 * no column speaks to the category in every column.
 *
 * Structural, not lexical. Section C is boilerplate carrying "may retrogress"
 * and "may become unavailable" every single month with no category attached, so
 * matching those phrases flags everything always. What carries information is
 * that the Visa Office writes a dedicated lettered section naming a category
 * only when it has something particular to say. Finding 30.
 */
export function sectionsFor(
  bundle: Bundle,
  category: string,
  column: Column,
  /**
   * The month whose guidance is allowed to be read, as "YYYY-MM". Defaults to
   * the newest bulletin in the bundle, which is what the app wants. Passing a
   * month picks the newest bulletin published on or before it, so asking what
   * was known in January cannot read a warning printed in September.
   */
  asOfMonth?: string,
): BulletinSection[] {
  const all = bundle.sections;
  if (!all) return [];
  let month = bundle.end_month;
  if (asOfMonth && asOfMonth < month) {
    const earlier = Object.keys(all).filter((m) => m <= asOfMonth).sort();
    if (earlier.length === 0) return [];
    month = earlier[earlier.length - 1]!;
  }
  const latest = all[month];
  if (!latest) return [];
  return latest.filter(
    (section) =>
      section.category === category &&
      (section.column === null || section.column === column),
  );
}

/** The next 1 October, which is when a fresh year of visa numbers begins. */
function nextFiscalYearStart(onDate: string): string {
  const year = Number(onDate.slice(0, 4));
  const october = `${year}-10-01`;
  return onDate < october ? october : `${year + 1}-10-01`;
}

export function nearTermOutlook(
  bundle: Bundle,
  events: EventsFile,
  input: CaseInput,
  onDate: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Outlook {
  const horizon = addDays(onDate, windowDays);
  const changes: ScheduledChange[] = [];

  // 1. Laws, rules, court orders and category deadlines with a date on them.
  //
  //    Only things that START or END inside the window count as a change. An
  //    event already in force and continuing is the status quo, it is shown on
  //    its own card, and repeating it here as something "coming" would be
  //    wrong twice over.
  for (const item of applicableEvents(events, {
    birthCountry: input.birthCountry,
    category: input.category,
    path: input.path,
    onDate,
  })) {
    const { event } = item;
    if (item.upcoming && event.start && event.start <= horizon) {
      changes.push({
        id: event.id,
        source: "law_or_policy",
        title: event.title,
        detail: event.summary,
        effective: event.start,
        direction: item.relevance === "blocks" ? "hurts" : "unclear",
      });
    } else if (item.activeNow && event.end && event.end <= horizon) {
      changes.push({
        id: `${event.id}-ends`,
        source: "law_or_policy",
        title: `${event.title} ends`,
        detail: event.summary,
        effective: event.end,
        direction: item.relevance === "blocks" ? "helps" : "unclear",
      });
    }
  }

  const series = getSeries(bundle, "final_action", "employment", input.category, input.column);
  const latestIndex = series ? lastKnownIndex(series) : -1;
  const latest = latestIndex >= 0 ? series![latestIndex]! : null;
  const alreadyUnavailable = latest?.kind === "unavailable";

  // 2. What the Visa Office has said in writing about this category. Undated by
  //    nature, so `effective` stays null: it is an intention, not a rule with a
  //    commencement date.
  const asOfMonth = onDate.slice(0, 7);
  const month = asOfMonth < bundle.end_month ? asOfMonth : bundle.end_month;
  for (const section of sectionsFor(bundle, input.category, input.column, asOfMonth)) {
    const s = section.signals;
    if (s.signals_advance) {
      changes.push({
        id: `${section.letter}-advance`,
        source: "visa_office",
        title: "The Visa Office expects this category to advance",
        detail: `The ${month} bulletin says this category should move forward when the new fiscal year begins.`,
        effective: null,
        direction: "helps",
      });
    }
    // A warning that a category may close or move back is moot once it has
    // already closed. The September 2026 EB-2 section warns exactly that, and
    // EB-2 India is already Unavailable, so listing it would tell someone
    // something might happen to them that has already happened.
    if (!alreadyUnavailable && (s.warns_retrogress || s.warns_unavailable)) {
      changes.push({
        id: `${section.letter}-warning`,
        source: "visa_office",
        title:
          s.warns_retrogress && s.warns_unavailable
            ? "The Visa Office warns of retrogression or a shutdown"
            : s.warns_retrogress
              ? "The Visa Office warns this category may move backwards"
              : "The Visa Office warns this category may close",
        detail: `The ${month} bulletin carries a specific warning for this category before the fiscal year ends.`,
        effective: null,
        direction: "hurts",
      });
    }
    if (s.retrogressed) {
      changes.push({
        id: `${section.letter}-retrogressed`,
        source: "visa_office",
        title: "This category has already been moved backwards this year",
        detail: `Announced in the ${month} bulletin.`,
        effective: null,
        direction: "hurts",
      });
    }
  }

  // 3. The fiscal year reset, which is the one date that is certain. Included
  //    only when the category is not already Current, because a category that
  //    is Current has nothing to gain from a new year of numbers.
  const reset = nextFiscalYearStart(onDate);
  if (latest && latest.kind !== "current" && reset <= horizon) {
    changes.push({
      id: "fiscal-year-reset",
      source: "annual_reset",
      title: "A new year of visa numbers begins",
      detail:
        latest.kind === "unavailable"
          ? "This category is closed for the rest of this year, so the next time it can move is when the new fiscal year opens."
          : "Every October the annual supply resets, which is when categories have historically moved the furthest.",
      effective: reset,
      direction: "helps",
    });
  }

  changes.sort((a, b) => {
    if (a.effective && b.effective) return a.effective < b.effective ? -1 : 1;
    if (a.effective) return -1;
    if (b.effective) return 1;
    return 0;
  });

  const helps = changes.filter((c) => c.direction === "helps").length;
  const hurts = changes.filter((c) => c.direction === "hurts").length;
  const months = Math.round(windowDays / 30);

  let summary: string;
  if (changes.length === 0) {
    summary = `Nothing is scheduled in the next ${months} months that should change how your dates move. No rule change, court order or category deadline takes effect in that window, and the ${month} bulletin says nothing specific about this category.`;
  } else if (hurts && !helps) {
    summary = `${changes.length === 1 ? "One thing is" : `${changes.length} things are`} coming that could slow this category down.`;
  } else if (helps && !hurts) {
    summary = `${changes.length === 1 ? "One thing is" : `${changes.length} things are`} coming that should help this category move.`;
  } else {
    summary = `${changes.length} things are scheduled, pulling in different directions.`;
  }

  return { windowDays, changes, summary };
}
