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
import { CapitolIcon, CheckIcon, PauseIcon } from "./Icons";
import type { Theme } from "../theme";

type Kind = "acting" | "stopped" | "pending";

/**
 * Statuses are mapped explicitly, never guessed at.
 *
 * Matching only "vacated" and "ended_by_court" left `vacated_on_appeal`
 * falling through to "In force", which is the opposite of the truth: that
 * order was struck down at district court and the government is appealing, so
 * it is stopped and contested. Three of the registry's statuses are neither
 * plainly on nor plainly off, and each needs its own words.
 */
const STATUS: Record<string, { kind: Kind; word: string }> = {
  in_force: { kind: "acting", word: "In force" },
  active: { kind: "acting", word: "In force" },
  vacated: { kind: "stopped", word: "Struck down" },
  ended_by_court: { kind: "stopped", word: "Ended by a court" },
  vacated_on_appeal: { kind: "stopped", word: "Struck down, under appeal" },
  scheduled: { kind: "pending", word: "Scheduled" },
  pending: { kind: "pending", word: "Not law" },
  minor: { kind: "pending", word: "Negligible so far" },
};

function classify(item: CaseAssessment["events"][number]): { kind: Kind; word: string } {
  const known = STATUS[item.event.status];
  if (known) {
    // Something in force that does not touch this case is not a warning. Amber
    // is reserved for what actually acts on it.
    if (known.kind === "acting" && item.relevance !== "blocks") {
      return { kind: "pending", word: "In force elsewhere" };
    }
    return known;
  }
  return item.activeNow
    ? { kind: item.relevance === "blocks" ? "acting" : "pending", word: "In force" }
    : { kind: "pending", word: "Not in force" };
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
  const shown = events.slice(0, 3);

  return (
    <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
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
            const fill =
              kind === "acting" ? theme.cautionFill : kind === "stopped" ? theme.accentFill : theme.neutralFill;
            const badge =
              kind === "acting" ? theme.caution : kind === "stopped" ? theme.accent : theme.secondary;
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
                  <Text style={{ fontSize: 12, lineHeight: 16, color: theme.secondary }}>
                    {word} · {item.why}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
