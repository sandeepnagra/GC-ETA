/**
 * What changed, for this reader.
 *
 * Not a river of headlines. Every item is curated, filtered to this case, and
 * says what it means for the wait rather than only what happened. Items carry
 * their confidence, and anything not confirmed against a primary source says so
 * on its face rather than in a footer nobody reads.
 */

import React from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Text } from "../components/Text";
import type { NewsItem } from "@gc-eta/model";

import { prettyDate } from "../data";
import type { Theme } from "../theme";

interface Props {
  theme: Theme;
  items: NewsItem[];
  onBack: () => void;
}

function toneColor(tone: NewsItem["tone"], theme: Theme): string {
  if (tone === "adverse") return theme.negative;
  if (tone === "favourable") return theme.accent;
  return theme.secondary;
}

function toneGlyph(tone: NewsItem["tone"]): string {
  if (tone === "adverse") return "▼";
  if (tone === "favourable") return "▲";
  return "■";
}

export function NewsScreen({ theme, items, onBack }: Props) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Text style={{ fontSize: 17, color: theme.accent }}>Back</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: theme.text }}>What changed</Text>
          <Text style={{ fontSize: 12, color: theme.secondary }}>
            Filtered to your country, category and route
          </Text>
        </View>
      </View>

      {items.map((item) => {
        const color = toneColor(item.tone, theme);
        return (
          <View
            key={item.id}
            style={{
              backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1,
              borderRadius: 16, padding: 16, gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 13, color }}>{toneGlyph(item.tone)}</Text>
              <Text style={{ fontSize: 12, color: theme.secondary, flex: 1 }}>{prettyDate(item.date)}</Text>
              {item.direct ? (
                <Text style={{ fontSize: 11, fontWeight: "700", color: theme.heroText, backgroundColor: color, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: "hidden" }}>
                  AFFECTS YOU
                </Text>
              ) : null}
            </View>

            <Text style={{ fontSize: 16, fontWeight: "600", lineHeight: 21, color: theme.text }}>
              {item.title}
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>{item.summary}</Text>
            <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "600", color }}>
              {item.meaning}
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {item.confidence === "secondary" ? (
                <Text style={{ fontSize: 12, color: theme.caution }}>
                  Not yet confirmed against a primary source
                </Text>
              ) : null}
              {item.sourceUrl ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => { void Linking.openURL(item.sourceUrl!); }}
                  hitSlop={8}
                >
                  <Text style={{ fontSize: 13, color: theme.accent }}>Read the source</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}

      <Text style={{ fontSize: 11, lineHeight: 15, textAlign: "center", color: theme.secondary }}>
        Curated from government sources. Not a complete news service, and not legal advice.
      </Text>
    </ScrollView>
  );
}
