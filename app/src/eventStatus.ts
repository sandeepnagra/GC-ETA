/**
 * How a tracked event's status reads, in one place.
 *
 * Both the results card and the disruptions screen show the same statuses, and
 * an event that says "Struck down" on one screen and "In force" on the other
 * would be worse than either. The mapping is explicit rather than pattern
 * matched: three of the registry's statuses are neither plainly on nor plainly
 * off, and matching only "vacated" once left "vacated_on_appeal" reading as in
 * force, the opposite of the truth.
 */

import type { Theme } from "./theme";

export type EventKind = "acting" | "stopped" | "pending";

export interface StatusLook {
  kind: EventKind;
  /** Short badge text. */
  word: string;
}

export const EVENT_STATUS: Record<string, StatusLook> = {
  in_force: { kind: "acting", word: "In force" },
  active: { kind: "acting", word: "Active" },
  vacated: { kind: "stopped", word: "Vacated" },
  ended_by_court: { kind: "stopped", word: "Ended by court" },
  vacated_on_appeal: { kind: "stopped", word: "Vacated, on appeal" },
  scheduled: { kind: "pending", word: "Scheduled" },
  pending: { kind: "pending", word: "Pending" },
  minor: { kind: "pending", word: "Minor" },
};

export function statusLook(status: string): StatusLook {
  return EVENT_STATUS[status] ?? { kind: "pending", word: status.replace(/_/g, " ") };
}

export function kindColours(kind: EventKind, theme: Theme): { ink: string; fill: string } {
  if (kind === "acting") return { ink: theme.caution, fill: theme.cautionFill };
  if (kind === "stopped") return { ink: theme.accent, fill: theme.accentFill };
  return { ink: theme.secondary, fill: theme.neutralFill };
}
