/**
 * How the prediction is calculated, in plain language.
 *
 * Writing rule from PLAN.md 7.4: no statute citations and no section numbers.
 * If a sentence needs a citation to be credible it belongs on the data and
 * accuracy screen instead.
 */

import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { ThemeMode, Theme } from "../theme";

interface Props {
  theme: Theme;
  mode: ThemeMode;
  onMode: (mode: ThemeMode) => void;
  onBack: () => void;
  onMethodology: () => void;
  dataAsOf: string;
}

const STEPS = [
  {
    title: "How fast the cutoff has moved",
    body: "Ten years of monthly bulletins, including the jumps each October and the stalls each summer.",
  },
  {
    title: "How many people are ahead of you",
    body: "Applications already filed with earlier dates, measured against the visa numbers your country can expect each year.",
  },
  {
    title: "What could interrupt it",
    body: "Processing pauses, country bans and bills in Congress, each with an effect written down in advance.",
  },
];

export function ExplainScreen({ theme, mode, onMode, onBack, onMethodology, dataAsOf }: Props) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Text style={{ fontSize: 17, color: theme.accent }}>Back</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: "600", color: theme.text }}>How this works</Text>
      </View>

      <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          The basic idea
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 21, color: theme.text }}>
          Each month the State Department publishes one cutoff date for your category and country.
          The day that cutoff passes your priority date, you are current and a visa number can be
          used on your case.
        </Text>
      </View>

      <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          What we look at
        </Text>
        {STEPS.map((step, index) => (
          <View key={step.title} style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: theme.heroText }}>{index + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", lineHeight: 20, color: theme.text }}>{step.title}</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>{step.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: theme.accentFill, borderRadius: 16, padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: theme.text }}>Why a range, not a single date</Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
          The cutoff moves in monthly steps and leaps only a few times a year, usually in October.
          A single day would look precise and be wrong. We show the window we have confidence in
          and the most likely point inside it, and we widen the window when the data is thin.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onMethodology}
        style={{
          flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44,
          backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1,
          borderRadius: 16, padding: 16,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: theme.text }}>Data and accuracy</Text>
          <Text style={{ fontSize: 13, lineHeight: 18, color: theme.secondary }}>
            Which files this uses, how fresh they are, and where the estimate is weak
          </Text>
        </View>
        <Text style={{ fontSize: 20, color: theme.secondary }}>›</Text>
      </Pressable>

      <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          Appearance
        </Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(["system", "light", "dark"] as const).map((option) => {
            const active = option === mode;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onMode(option)}
                style={{
                  flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center",
                  borderRadius: 10, borderWidth: 1,
                  backgroundColor: active ? theme.accent : theme.bg,
                  borderColor: active ? theme.accent : theme.border,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: active ? "600" : "500", color: active ? theme.heroText : theme.text }}>
                  {option === "system" ? "System" : option === "light" ? "Light" : "Dark"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ fontSize: 12, lineHeight: 17, color: theme.secondary }}>
          System follows your phone and changes with it. Light or Dark overrides that for this app only.
        </Text>
      </View>

      <Text style={{ fontSize: 12, lineHeight: 17, textAlign: "center", color: theme.secondary }}>
        Data as of {dataAsOf}. An estimate from public data, not a promise and not legal advice.
      </Text>
    </ScrollView>
  );
}
