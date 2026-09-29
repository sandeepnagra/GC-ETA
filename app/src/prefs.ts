/**
 * The small amount of state that should survive closing the app.
 *
 * Only what the person typed and what they chose to look at: the case they
 * asked about, and the light/dark override. Nothing derived, nothing about
 * the device, no identifier, and nothing that is ever sent anywhere. The
 * privacy promise is that what you enter stays on your phone, and writing it
 * to that phone's own sandbox is the thing that keeps it there across
 * launches rather than a departure from it.
 *
 * WHY documentDirectory AND NOT cacheDirectory. The downloaded bundle lives
 * in the cache, and that is right: it is reproducible, and the OS is welcome
 * to reclaim it under pressure. A priority date is not reproducible -- it is
 * on a piece of paper the person had to go and find -- so losing it to a
 * low-storage sweep would be the same bug as never saving it.
 *
 * Every read is defensive. A preferences file that is missing, truncated,
 * half-written or from a future version of the app must never stop the app
 * opening; the worst case is the empty form the app has always started with.
 */

import * as FileSystem from "expo-file-system/legacy";

import type { CaseDraft } from "./types";
import type { ThemeMode } from "./theme";

const DIR = `${FileSystem.documentDirectory}gc-eta/`;
const FILE = `${DIR}prefs.json`;

/** Bumped only if the shape changes incompatibly; an unknown one is ignored. */
const SCHEMA = 1;

export interface Prefs {
  draft?: Partial<CaseDraft>;
  mode?: ThemeMode;
}

interface Stored extends Prefs {
  schema: number;
}

const MODES: ThemeMode[] = ["system", "light", "dark"];

/**
 * Re-validate on the way in rather than trusting the file.
 *
 * It is the app's own file, so this is not about a hostile writer; it is that
 * a half-written file, or one left by an older build with a different idea of
 * what a draft looks like, would otherwise put a malformed draft straight
 * into state and take a screen down on launch. Anything unrecognised is
 * dropped and the default is used for that field alone.
 */
function clean(value: unknown): Prefs {
  if (!value || typeof value !== "object") return {};
  const stored = value as Partial<Stored>;
  if (stored.schema !== SCHEMA) return {};

  const out: Prefs = {};

  if (stored.mode && MODES.includes(stored.mode)) out.mode = stored.mode;

  const draft = stored.draft;
  if (draft && typeof draft === "object") {
    const kept: Partial<CaseDraft> = {};
    if (typeof draft.column === "string") kept.column = draft.column;
    if (typeof draft.birthCountry === "string") kept.birthCountry = draft.birthCountry;
    if (typeof draft.category === "string") kept.category = draft.category;
    // The one field with a format the rest of the app relies on: everything
    // downstream does date arithmetic on it, and a malformed value reaches
    // that arithmetic before anything else can reject it.
    if (typeof draft.priorityDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(draft.priorityDate)) {
      kept.priorityDate = draft.priorityDate;
    }
    if (draft.path === "adjustment" || draft.path === "consular") kept.path = draft.path;
    if (typeof draft.filedI485 === "boolean") kept.filedI485 = draft.filedI485;
    if (typeof draft.filedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(draft.filedOn)) {
      kept.filedOn = draft.filedOn;
    }
    if (Object.keys(kept).length > 0) out.draft = kept;
  }

  return out;
}

/** Whatever was saved last, or nothing. Never throws. */
export async function loadPrefs(): Promise<Prefs> {
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (!info.exists) return {};
    return clean(JSON.parse(await FileSystem.readAsStringAsync(FILE)));
  } catch {
    return {};
  }
}

/**
 * Save, or quietly do not. A failed write costs the person re-entering their
 * date next time, which is the situation this whole module improves on; it is
 * not worth interrupting them with an error about it now.
 */
export async function savePrefs(prefs: Prefs): Promise<void> {
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    const payload: Stored = { schema: SCHEMA, ...prefs };
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(payload));
  } catch {
    // Deliberately silent. See above.
  }
}
