/**
 * Data access.
 *
 * A snapshot ships inside the app so the very first launch works with no
 * network. Nothing about the user is sent to fetch an update: the request is
 * parameter-free and everyone downloads the same file, which is what keeps the
 * privacy claim in PLAN.md 7.1 true.
 */

import type { Bundle, EventsFile } from "@gc-eta/model";

import bundledBundle from "../assets/data/app-bundle.json";
import bundledEvents from "../assets/data/events.json";

export const bundle = bundledBundle as unknown as Bundle;
export const events = bundledEvents as unknown as EventsFile;

export const COLUMNS = [
  { code: "IN", label: "India" },
  { code: "CN", label: "China (mainland-born)" },
  { code: "MX", label: "Mexico" },
  { code: "PH", label: "Philippines" },
  { code: "ROW", label: "All other countries" },
] as const;

export const CATEGORIES = [
  { code: "EB1", label: "EB-1" },
  { code: "EB2", label: "EB-2" },
  { code: "EB3", label: "EB-3" },
  { code: "EB3_OTHER_WORKERS", label: "EB-3 Other Workers" },
  { code: "EB4", label: "EB-4" },
  { code: "EB5_UNRESERVED", label: "EB-5 Unreserved" },
] as const;

/** "2029-06" to "June 2029". */
export function prettyMonth(month: string): string {
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${names[m - 1]} ${y}`;
}

/** Display label for a category code, e.g. "EB3_OTHER_WORKERS" -> "EB-3 Other Workers". */
export function categoryLabel(code: string): string {
  return CATEGORIES.find((c) => c.code === code)?.label ?? code;
}

/** Display label for a chargeability column. */
export function columnLabel(code: string): string {
  return COLUMNS.find((c) => c.code === code)?.label ?? code;
}

/** "2015-03-10" to "10 March 2015". Raw ISO reads like a database field. */
export function prettyDate(iso: string): string {
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const parts = iso.split("-").map(Number);
  const [y, m, d] = parts as [number, number, number];
  if (!y || !m || !d) return iso;
  return `${d} ${names[m - 1]} ${y}`;
}
