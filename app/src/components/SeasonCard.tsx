/**
 * How this category moves through a fiscal year.
 *
 * Drawn from the archive for the pair being looked at rather than asserted as a
 * general rule, because the rule is not general. India EB-2 creeps a few days a
 * month and shuts in the summer; China EB-2 advances about a month every month
 * and only stalls in September. A fixed explainer would be wrong for most
 * categories, and the difference between those two shapes is exactly what a
 * reader wants to know.
 */

import React from "react";
import { View } from "react-native";
import type { Season } from "@gc-eta/model";

import { Text } from "./Text";
import type { Theme } from "../theme";

const MAX_BAR = 42;
const MIN_BAR = 5;

export function SeasonCard({ theme, season }: { theme: Theme; season: Season }) {
  if (!season.usable) {
    return (
      <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          A typical year
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
          There are too few published months for this category to show a pattern through the year.
        </Text>
      </View>
    );
  }

  const peak = Math.max(1, ...season.months.map((m) => Math.abs(m.medianAdvanceDays)));
  const best = [...season.months].sort((a, b) => b.medianAdvanceDays - a.medianAdvanceDays)[0]!;
  const freezes = season.months.reduce((sum, m) => sum + m.unavailable, 0);
  const summerFreezes = season.months.slice(9).reduce((sum, m) => sum + m.unavailable, 0);

  return (
    <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          A typical year
        </Text>
        <Text style={{ fontSize: 12, color: theme.secondary }}>Oct to Sep</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 3, alignItems: "flex-end", height: MAX_BAR + 18 }}>
        {season.months.map((month) => {
          const height = Math.max(MIN_BAR, (Math.abs(month.medianAdvanceDays) / peak) * MAX_BAR);
          const shut = month.unavailable > 0;
          const now = month.fiscalMonth === season.currentFiscalMonth;
          return (
            <View key={month.label} style={{ flex: 1, alignItems: "center", gap: 4 }}>
              {/* Height is how far it moved; the rule underneath is whether it
                  has ever shut. Colouring the bar itself for a freeze made July
                  read as the strongest month and a closed month at once, which
                  are both true and cannot be said with one colour. */}
              <View
                style={{
                  width: "100%",
                  height,
                  borderRadius: 4,
                  backgroundColor: month.medianAdvanceDays > 0 ? theme.accent : theme.border,
                  borderWidth: now ? 2 : 0,
                  borderColor: theme.text,
                }}
              />
              <View
                style={{
                  width: "100%",
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: shut ? theme.negative : "transparent",
                }}
              />
              <Text style={{ fontSize: 9, color: now ? theme.text : theme.secondary, fontWeight: now ? "600" : "400" }}>
                {month.label[0]}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={{ gap: 5 }}>
        <Text style={{ fontSize: 13, lineHeight: 18, color: theme.text }}>
          Bar height is how far the cutoff has typically moved in that month.{" "}
          {best.medianAdvanceDays > 0
            ? `${best.label} has moved it furthest, about ${best.medianAdvanceDays} days.`
            : "No month has typically moved this category forward at all."}
        </Text>
        {freezes > 0 ? (
          <Text style={{ fontSize: 13, lineHeight: 18, color: theme.text }}>
            A red rule under a month means this category has been Unavailable in it.{" "}
            {summerFreezes > 0
              ? `${summerFreezes} of those ${freezes === summerFreezes ? "closures were all" : "fell"} in July to September, when the annual limit runs out. A month can both move furthest and be one that has closed.`
              : "None of them fell in the summer."}
          </Text>
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 18, color: theme.text }}>
            This category has never been Unavailable in the published record.
          </Text>
        )}
        <Text style={{ fontSize: 11, lineHeight: 15, color: theme.secondary }}>
          The outlined bar is where the current bulletin sits in the year.
        </Text>
      </View>
    </View>
  );
}
