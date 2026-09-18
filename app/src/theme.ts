/**
 * Theme tokens and resolution.
 *
 * The app follows the phone's light or dark setting by default and updates
 * live when it changes. An explicit Light or Dark choice overrides that for
 * this app only, and is the single value stored on the device: a theme that
 * resets every launch is a bug, not a privacy feature. PLAN.md 7.3.
 */

import { useColorScheme } from "react-native";

export type ThemeMode = "system" | "light" | "dark";

export interface Theme {
  dark: boolean;
  bg: string;
  card: string;
  border: string;
  text: string;
  secondary: string;
  accent: string;
  /** Filled hero surface and the text that sits on it. */
  heroBg: string;
  heroText: string;
  /** Retrogression and other adverse states. */
  negative: string;
  /** Hold, warnings. */
  caution: string;
  /** Soft accent wash for callouts. */
  accentFill: string;
  /** Neutral track for bars and dials. */
  track: string;
  /** Tinted row backgrounds, for cards that group items by direction. */
  cautionFill: string;
  negativeFill: string;
  neutralFill: string;
}

export const light: Theme = {
  dark: false,
  bg: "#F3EFE6",
  card: "#FFFDF8",
  border: "#D9D3C5",
  text: "#1C1B18",
  secondary: "#5B5850",
  accent: "#0E6B63",
  heroBg: "#0E6B63",
  heroText: "#FFFFFF",
  negative: "#A8401F",
  caution: "#8A5A00",
  accentFill: "#E9F2F0",
  track: "#E1D9C4",
  cautionFill: "#F6E9C9",
  negativeFill: "#F5DCD2",
  neutralFill: "#F3EFE6",
};

export const dark: Theme = {
  dark: true,
  bg: "#14130F",
  card: "#1F1D18",
  border: "#35322A",
  text: "#F2EEE4",
  secondary: "#A8A294",
  // The light accent fails contrast on a dark ground, so it lightens rather
  // than being reused. PLAN.md 7.3.
  accent: "#5CBFA8",
  heroBg: "#12564E",
  heroText: "#EAF5F2",
  negative: "#E8927A",
  caution: "#D9A22E",
  accentFill: "#17332D",
  track: "#35322A",
  cautionFill: "#2E2716",
  negativeFill: "#33201A",
  neutralFill: "#26241E",
};

export function resolveTheme(mode: ThemeMode, system: "light" | "dark" | null): Theme {
  if (mode === "light") return light;
  if (mode === "dark") return dark;
  return system === "dark" ? dark : light;
}

export function useTheme(mode: ThemeMode): Theme {
  const system = useColorScheme();
  return resolveTheme(mode, system ?? null);
}

/**
 * Status colour plus an icon and a label.
 *
 * Never encode an outcome in colour alone: teal, amber and rust are
 * indistinguishable for roughly 8% of men, and dark mode does not excuse it.
 * Every caller renders the glyph and the label as well as the colour.
 */
/**
 * Styling for a scheduled change, by which way it should push the dates.
 *
 * Colour is never the only signal. Every state carries a glyph and a word as
 * well, so the card reads correctly in greyscale and to anyone who cannot
 * separate the accent green from the warning red. Finding 43.
 */
export function directionStyle(
  direction: "helps" | "hurts" | "unclear",
  theme: Theme,
): { color: string; glyph: string; label: string } {
  if (direction === "helps") return { color: theme.accent, glyph: "▲", label: "Should help" };
  if (direction === "hurts") return { color: theme.negative, glyph: "▼", label: "Could slow it" };
  return { color: theme.caution, glyph: "■", label: "Unclear effect" };
}

/**
 * Styling for a category-switch verdict.
 *
 * Four states, each with a glyph and a word as well as a colour, so the card
 * reads in greyscale and without colour vision. "Probably not" is deliberately
 * neutral rather than red: it is not a warning, it is an answer.
 */
export function verdictStyle(
  verdict: "worth_asking" | "too_close" | "probably_not" | "cannot_tell",
  theme: Theme,
): { color: string; glyph: string; label: string } {
  if (verdict === "worth_asking") return { color: theme.accent, glyph: "▲", label: "Worth asking about" };
  if (verdict === "too_close") return { color: theme.caution, glyph: "■", label: "Too close to call" };
  if (verdict === "probably_not") return { color: theme.secondary, glyph: "●", label: "Probably not" };
  return { color: theme.secondary, glyph: "?", label: "Not enough to say" };
}
