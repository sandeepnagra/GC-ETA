/**
 * Disruptions, grouped by what they mean for this case.
 *
 * The design gives each one a tinted row and a filled icon, which is doing real
 * work rather than decoration: a court order that was vacated and a pause that
 * is in force read identically as two lines of text, and they are opposite
 * facts. Amber is something acting on the case now, green is something that was
 * stopped, grey is something pending that has not happened.
 *
 * Colour is never the only signal. Each row carries a distinct icon and its
 * status in words.
 */

import React from "react";
import { Pressable, View } from "react-native";
import type { CaseAssessment } from "@gc-eta/model";

import { Text } from "./Text";
import { CARD_MIN_HEIGHT } from "./Card";
import { CapitolIcon, CheckIcon, PauseIcon } from "./Icons";
import type { Theme } from "../theme";
import { kindColours, statusLook, type EventKind } from "../eventStatus";

/**
 * Acting, stopped or pending, plus the wording. Shared with the disruptions
 * screen so an event never reads one way on one screen and the other way on
 * the next.
 */
function classify(item: CaseAssessment["events"][number]): { kind: EventKind; word: string } {
  const look = statusLook(item.event.status);
  // Something in force that does not touch this case is not a warning. Amber
  // is reserved for what actually acts on it.
  if (look.kind === "acting" && item.relevance !== "blocks") {
    return { kind: "pending", word: "In force elsewhere" };
  }
  return look;
}

export function EventsCard({
  theme,
  events,
  onAll,
}: {
  theme: Theme;
  events: CaseAssessment["events"];
  onAll?: () => void;
}) {
  // Blocking and active first; the registry already sorts that way.
  const shown = events.slice(0, 2);

  return (
    <View style={{ minHeight: CARD_MIN_HEIGHT, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          Disruptions for you
        </Text>
        {onAll ? (
          <Pressable accessibilityRole="button" onPress={onAll} hitSlop={10}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: theme.accent }}>All events</Text>
          </Pressable>
        ) : (
          <Text style={{ fontSize: 12, color: theme.secondary }}>{events.length} tracked</Text>
        )}
      </View>

      {shown.length === 0 ? (
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.secondary }}>
          Nothing tracked is acting on your case.
        </Text>
      ) : (
        <View style={{ gap: 10 }}>
          {shown.map((item) => {
            const { kind, word } = classify(item);
            const { ink: badge, fill } = kindColours(kind, theme);
            const Glyph = kind === "acting" ? PauseIcon : kind === "stopped" ? CheckIcon : CapitolIcon;
            return (
              <View
                key={item.event.id}
                style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 12, borderRadius: 12, backgroundColor: fill }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: badge,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Glyph color={theme.card} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", lineHeight: 18, color: theme.text }}>
                    {item.event.title}
                  </Text>
                  <Text
                    numberOfLines={3}
                    style={{ fontSize: 12, lineHeight: 16, color: theme.secondary }}
                  >
                    {word} · {item.why}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
      {events.length > shown.length ? (
        <Text style={{ fontSize: 11, lineHeight: 15, color: theme.secondary }}>
          {events.length - shown.length} more tracked, including ones that do not touch
          your case.
        </Text>
      ) : null}
    </View>
  );
}
