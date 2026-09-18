/**
 * The shell every carousel card sits in.
 *
 * The design draws all of them at one size, 326 by 330, and matching that is
 * not only tidiness: a carousel whose track resizes on every swipe makes the
 * whole page jump, and the reader loses their place in what is underneath.
 *
 * MINIMUM HEIGHT, NOT FIXED HEIGHT. A hard height would clip anyone using large
 * text, and clipping the end of a sentence about a legal deadline is a worse
 * failure than an uneven track. PLAN.md finding 43 already settled this for the
 * screen as a whole: scrolling always stays available and nothing is pinned to
 * a viewport. At default text size every card reaches the same height and the
 * track stops moving; at accessibility sizes the cards grow and the track grows
 * with them.
 *
 * Cards are written to fill roughly this height rather than to overflow it. The
 * long working lives in the detail sheet, which exists precisely so a card does
 * not have to carry it.
 */

import React from "react";
import { View, type ViewStyle } from "react-native";

import { Text } from "./Text";
import type { Theme } from "../theme";

export const CARD_MIN_HEIGHT = 384;

export function Card({
  theme,
  children,
  style,
}: {
  theme: Theme;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          minHeight: CARD_MIN_HEIGHT,
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: 16,
          padding: 16,
          gap: 10,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** The small uppercase title, with an optional right-hand note. */
export function CardRow({
  theme,
  title,
  trailing,
}: {
  theme: Theme;
  title: string;
  trailing?: string;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
        {title}
      </Text>
      {trailing ? (
        <Text style={{ flexShrink: 1, fontSize: 12, color: theme.secondary, textAlign: "right" }}>
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}
