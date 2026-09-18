/**
 * Where a year's visa numbers come from.
 *
 * The one thing most people do not know about this system is that the size of
 * the pool is decided annually and is not a constant. The statute says 140,000;
 * no year on record has actually been 140,000, because unused family numbers
 * fall across, and the real figure has run from 150,037 to 281,507. A category
 * that "should" get a fixed share is therefore working from a moving total.
 *
 * Every figure here is from the bundle. Where next year is genuinely unpublished
 * the card says so rather than estimating it.
 */

import React from "react";
import { View } from "react-native";
import type { SupplyPicture } from "@gc-eta/model";

import { Text } from "./Text";
import { categoryLabel, columnLabel } from "../data";
import type { Theme } from "../theme";

const n = (v: number) => Math.round(v).toLocaleString("en-US");

function Bar({
  theme,
  label,
  value,
  fraction,
  offset = 0,
  color,
  strong,
}: {
  theme: Theme;
  label: string;
  value: string;
  fraction: number;
  offset?: number;
  color: string;
  strong?: boolean;
}) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 13, color: theme.text }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: "600", color: strong ? theme.accent : theme.text }}>
          {value}
        </Text>
      </View>
      <View style={{ height: 14, flexDirection: "row" }}>
        {offset > 0 ? <View style={{ flex: offset }} /> : null}
        <View style={{ flex: Math.max(0.02, fraction), backgroundColor: color, borderRadius: 7 }} />
        {1 - offset - fraction > 0 ? <View style={{ flex: 1 - offset - fraction }} /> : null}
      </View>
    </View>
  );
}

export function SupplyCard({
  theme,
  picture,
  column,
  category,
}: {
  theme: Theme;
  picture: SupplyPicture;
  column: string;
  category: string;
}) {
  const { limit, base, spillover, fiscalYear } = picture;
  if (!limit || spillover === null || !fiscalYear) {
    return (
      <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          Where the numbers come from
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
          No worldwide limit is recorded for a recent year, so the size of the pool cannot be shown.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          FY{fiscalYear} supply
        </Text>
        <Text style={{ fontSize: 12, color: theme.secondary }}>All employment categories</Text>
      </View>

      <View style={{ gap: 10 }}>
        <Bar theme={theme} label="Set by law" value={n(base)} fraction={base / limit} color={theme.text} />
        <Bar
          theme={theme}
          label="Unused family numbers"
          value={`+${n(spillover)}`}
          fraction={spillover / limit}
          offset={base / limit}
          color={theme.accent}
          strong
        />
        <Bar theme={theme} label="The pool that year" value={n(limit)} fraction={1} color={theme.accentFill} />
      </View>

      <View style={{ padding: 10, backgroundColor: theme.bg, borderRadius: 10, gap: 4 }}>
        <Text style={{ fontSize: 12, lineHeight: 17, color: theme.text }}>
          {categoryLabel(category)} takes {n(picture.categoryTotal ?? 0)} of that pool worldwide.{" "}
          {columnLabel(column)} is guaranteed {n(picture.perCountryFloor ?? 0)} of it.
        </Text>
        {picture.typicalReceived !== null ? (
          <Text style={{ fontSize: 12, lineHeight: 17, color: theme.text }}>
            Across {picture.yearsRecorded} recorded years it actually received about{" "}
            {n(picture.typicalReceived)} a year, from {n(picture.receivedLow ?? 0)} in a poor one to{" "}
            {n(picture.receivedHigh ?? 0)} in a good one.
          </Text>
        ) : null}
      </View>

      <Text style={{ fontSize: 11, lineHeight: 15, color: theme.secondary }}>
        The statute sets 140,000 and no year on record has been 140,000. The real limit has run from{" "}
        {n(picture.limitLow ?? 0)} to {n(picture.limitHigh ?? 0)}. Next year's is published in October.
      </Text>
    </View>
  );
}
