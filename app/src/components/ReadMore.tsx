/**
 * The link to a card's full note, anchored to the bottom of that card.
 *
 * It used to sit above the carousel and only appeared for cards that had a
 * note, so swiping from one that did to one that did not moved the card up and
 * down under the reader's thumb. Reserving an empty row would have stopped the
 * jump at the cost of a wasted row on every card.
 *
 * Inside the card is better on three counts. Every card is now the same height,
 * so a bottom-anchored link is always at the same place on screen and nothing
 * shifts. It sits with the thing it explains rather than floating above the
 * stack. And it uses the space the uniform height created, which was otherwise
 * empty on the shorter cards.
 *
 * `marginTop: "auto"` is what does the anchoring: the card is a flex column, so
 * this pushes the link to the bottom whatever the content above it.
 */

import React from "react";
import { Pressable, View } from "react-native";

import { Text } from "./Text";
import { ChevronRight } from "./Icons";
import type { Theme } from "../theme";

export function ReadMore({ theme, onPress }: { theme: Theme; onPress?: () => void }) {
  if (!onPress) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Read the full note for this card"
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{ marginTop: "auto", paddingTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 }}
    >
      <Text style={{ fontSize: 13, fontWeight: "600", color: theme.accent }}>Read the full note</Text>
      <ChevronRight color={theme.accent} size={16} />
    </Pressable>
  );
}
