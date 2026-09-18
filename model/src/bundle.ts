/** Bundle access and calendar helpers. */

import type { Bundle, Cell, CellKind, Chart, Column, RawCell, Track } from "./types.js";

const MS_PER_DAY = 86_400_000;

export function isoToDay(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY);
}

export function dayToIso(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function decodeCell(raw: RawCell): Cell {
  if (raw === null || raw === undefined) return { kind: "missing" };
  if (raw === "C") return { kind: "current" };
  if (raw === "U") return { kind: "unavailable" };
  return { kind: "date", day: isoToDay(raw) };
}

export function seriesKey(
  chart: Chart,
  track: Track,
  category: string,
  column: Column,
): string {
  return `${chart}|${track}|${category}|${column}`;
}

/** Month string "YYYY-MM" to an absolute month number, for arithmetic. */
export function monthToAbsolute(month: string): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return y * 12 + (m - 1);
}

export function absoluteToMonth(absolute: number): string {
  const y = Math.floor(absolute / 12);
  const m = (absolute % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

/** US federal fiscal year containing this absolute month. */
export function fiscalYearOf(absolute: number): number {
  const year = Math.floor(absolute / 12);
  const month = (absolute % 12) + 1;
  return month >= 10 ? year + 1 : year;
}

/** 0 = October, 11 = September. Fiscal-year position drives the seasonality. */
export function fiscalMonthIndex(absolute: number): number {
  const calendarMonth = absolute % 12; // 0 = January
  return (calendarMonth + 3) % 12;
}

export function getSeries(
  bundle: Bundle,
  chart: Chart,
  track: Track,
  category: string,
  column: Column,
): Cell[] | null {
  const raw = bundle.series[seriesKey(chart, track, category, column)];
  if (!raw) return null;
  return raw.map(decodeCell);
}

/** Index of the last cell that is not "missing", or -1. */
export function lastKnownIndex(cells: Cell[]): number {
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    if (cells[i]!.kind !== "missing") return i;
  }
  return -1;
}

export function monthAt(bundle: Bundle, index: number): string {
  return absoluteToMonth(monthToAbsolute(bundle.start_month) + index);
}

/** Points for a history chart: month plus cutoff, skipping gaps. */
export interface HistoryPoint {
  month: string;
  /** Days since epoch, or null for Current / Unavailable / missing. */
  day: number | null;
  kind: CellKind;
}

export function historyPoints(
  bundle: Bundle,
  chart: Chart,
  category: string,
  column: Column,
  months = 120,
): HistoryPoint[] {
  const cells = getSeries(bundle, chart, "employment", category, column);
  if (!cells) return [];
  const from = Math.max(0, cells.length - months);
  const out: HistoryPoint[] = [];
  for (let i = from; i < cells.length; i += 1) {
    const cell = cells[i]!;
    if (cell.kind === "missing") continue;
    out.push({
      month: monthAt(bundle, i),
      day: cell.kind === "date" ? cell.day! : null,
      kind: cell.kind,
    });
  }
  return out;
}
