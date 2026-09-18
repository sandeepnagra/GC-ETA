/**
 * The levers, not a forecast.
 *
 * Each row is derived for this case and carries its own figures rather than
 * being one of four fixed sentences: whether a country pause matters depends on
 * the processing path, whether EB-1 fall-down matters depends on the category,
 * and the size of a good spillover year is a number in the bundle.
 *
 * Nothing here says how likely any of it is. The data supports no probability,
 * and the card's job is to say what to watch rather than what to expect.
 */

import React from "react";
import { View } from "react-native";
import type { Change } from "@gc-eta/model";

import { Text } from "./Text";
import { ArrowDownIcon, ArrowUpIcon } from "./Icons";
import type { Theme } from "../theme";

export function ChangesCard({ theme, changes }: { theme: Theme; changes: Change[] }) {
  return (
    <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          What would change this
        </Text>
        <Text style={{ fontSize: 12, color: theme.secondary }}>Sooner or later</Text>
      </View>

      {changes.length === 0 ? (
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.secondary }}>
          Nothing tracked would obviously move this one way or the other.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {changes.map((change) => {
            const sooner = change.direction === "sooner";
            return (
              <View
                key={change.id}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: sooner ? theme.accentFill : theme.negativeFill,
                }}
              >
                <View style={{ paddingTop: 1 }}>
                  {sooner ? (
                    <ArrowUpIcon color={theme.accent} />
                  ) : (
                    <ArrowDownIcon color={theme.negative} />
                  )}
                </View>
                <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: theme.text }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }}>
                    {change.title}.{" "}
                  </Text>
                  {change.detail}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={{ fontSize: 11, lineHeight: 15, color: theme.secondary }}>
        These are what to watch, not predictions. Nothing here carries odds, because
        nothing in the data supports any.
      </Text>
    </View>
  );
}
