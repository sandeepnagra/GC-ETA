/**
 * The one place that knows how wide the app is willing to get.
 *
 * Every screen here was built against a phone's width, using
 * useWindowDimensions() directly for anything that has to size itself in
 * code (the hero chart, the card carousel). That was never wrong until
 * foldables unfolded: Android 16 stops enforcing the portrait/resizability
 * restrictions on a large-screen surface, and this app has no landscape or
 * tablet design to switch to when that happens. Rather than build one,
 * MAX_CONTENT_WIDTH clamps the app to a comfortable phone-sized column,
 * centered, on anything wider -- the same trick a lot of responsive web
 * layouts use. On an actual phone, portrait, this is always wider than the
 * device, so it changes nothing there.
 */

import { useWindowDimensions } from "react-native";

/**
 * Comfortably above any phone's portrait width (the widest common phones run
 * a little over 400dp), so this never engages on a phone -- only on a
 * foldable unfolded, or a tablet, where the raw device width would otherwise
 * feed straight into hero chart and carousel sizing.
 */
export const MAX_CONTENT_WIDTH = 520;

/** The width the app's content column actually gets, after the clamp. */
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return Math.min(width, MAX_CONTENT_WIDTH);
}
