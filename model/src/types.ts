/**
 * Shared types for the prediction model.
 *
 * A bulletin cell is deliberately not a `Date | null`. "Current" and
 * "Unavailable" are not points on a date line, and collapsing either into a
 * date (or into null) corrupts both the velocity estimate and the backtest
 * metric. See PLAN.md sections 6.1 and 10.
 */

/** Raw encoding in the published bundle: ISO date, "C", "U", or absent. */
export type RawCell = string | null;

export type CellKind = "date" | "current" | "unavailable" | "missing";

export interface Cell {
  kind: CellKind;
  /** Days since the Unix epoch. Only set when kind === "date". */
  day?: number;
}

export type Chart = "final_action" | "dates_for_filing";
export type Track = "employment" | "family";

/** The five chargeability columns the published charts carry. */
export type Column = "ROW" | "CN" | "IN" | "MX" | "PH";

export interface Bundle {
  schema_version: number;
  generated_at: string;
  start_month: string;
  end_month: string;
  months: number;
  missing_months: string[];
  series: Record<string, RawCell[]>;
  /** Employment-based worldwide limit per fiscal year, where known. */
  employment_limit_by_fy: Record<string, number>;
  /** Statutory base used when a year is absent from the map above. */
  statutory_base: number;
  /** Per-category narrative sections by month, the Visa Office's own guidance. */
  sections?: Record<string, BulletinSection[]>;
  /**
   * Certified labour certifications by chargeability column and priority-date
   * month: how many people hold each month of the queue.
   */
  density?: Record<string, Record<string, { total: number; advanced?: number; bachelors?: number }>>;
  density_coverage?: { decision_years: string[]; missing_years: number[] };
  /**
   * Visa numbers actually issued, by fiscal year, chargeability column and
   * category, from Table V of the Report of the Visa Office. These already
   * include dependents, so they are visa numbers rather than principals.
   */
  issuance?: Record<string, Record<string, Record<string, number>>>;
  issuance_years?: string[];
  limits: Array<{
    fiscal_year: number;
    employment_worldwide: number | null;
    family_worldwide: number | null;
    per_country: number | null;
    determined: boolean;
  }>;
}

export interface SectionSignals {
  retrogressed: boolean;
  unavailable: boolean;
  warns_retrogress: boolean;
  warns_unavailable: boolean;
  signals_advance: boolean;
}

export interface BulletinSection {
  letter: string;
  title: string;
  body: string;
  category: string | null;
  /** null means the section speaks to the category in every column. */
  column: string | null;
  signals: SectionSignals;
}

export interface EstimateInput {
  /** Country of chargeability, already resolved for cross-chargeability. */
  column: Column;
  /** I-140 classification code, e.g. "EB2". */
  category: string;
  /** Priority date, ISO "YYYY-MM-DD". */
  priorityDate: string;
  /** Deterministic seed, so the same case always yields the same range. */
  seed?: number;
  iterations?: number;
}

export interface Estimate {
  status:
    | "current"
    | "not_current"
    | "category_unavailable"
    | "insufficient_data";
  /** What the chart says right now. */
  currentCutoff: Cell;
  asOfMonth: string;
  /** Percentiles of the simulated first-crossing month, ISO "YYYY-MM". */
  p10?: string;
  p50?: string;
  p90?: string;
  /**
   * Set when too few simulations crossed within the horizon. The honest
   * answer for a deeply backlogged case is not a number. PLAN.md 6.1.
   */
  beyondHorizon?: boolean;
  crossedFraction?: number;
  /**
   * Probability of becoming current within N months, for a few horizons.
   * More honest than a percentile alone: a P10 of "next month" can reflect a
   * single unusual historical jump rather than a likely outcome, and this says
   * how likely it actually is.
   */
  probabilityWithin?: { months: number; probability: number }[];
  confidence: "low" | "medium" | "high";
  /** Plain-language drivers, most important first. */
  drivers: string[];
}


/* ------------------------------------------------------------------ events */

export type ProcessingPath = "adjustment" | "consular";

export interface GcEvent {
  id: string;
  type: string;
  title: string;
  summary: string;
  countries: "all" | { list?: string; also?: string };
  affects: ProcessingPath[];
  categories: "all" | string[];
  start: string | null;
  end: string | null;
  status: string;
  modeling: Record<string, unknown>;
  confidence: "verified" | "secondary";
  verified_against: string | null;
  last_checked: string;
}

export interface EventsFile {
  schema_version: number;
  last_reviewed: string;
  country_lists: Record<string, { countries: string[]; complete?: boolean; note?: string }>;
  events: GcEvent[];
}

/* ------------------------------------------------------- case assessment */

export interface CaseInput {
  /** ISO country of birth, e.g. "IN". Drives event matching. */
  birthCountry?: string;
  /** Bulletin column, resolved from birth country or cross-chargeability. */
  column: Column;
  category: string;
  priorityDate: string;
  path: ProcessingPath;
  seed?: number;
}
