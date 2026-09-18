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
  limits: Array<{
    fiscal_year: number;
    employment_worldwide: number | null;
    family_worldwide: number | null;
    per_country: number | null;
    determined: boolean;
  }>;
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

export type Outlook = "advance" | "hold" | "retrogress";

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
  confidence: "low" | "medium" | "high";
  /** Plain-language drivers, most important first. */
  drivers: string[];
}

export interface RiskAssessment {
  /** 0 to 100. Higher means more likely to retrogress or go unavailable. */
  score: number;
  outlook: Outlook;
  reasons: string[];
}
