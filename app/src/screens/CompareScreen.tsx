/**
 * EB-2 against EB-3 for one person, in full, with no verdict.
 *
 * The screen exists because the two categories genuinely move differently and
 * the difference is often large. It shows every number either side has,
 * including each one's estimated date, its queue and what it actually receives
 * each year. It does not print a saving in years, and the reason is in the
 * archive rather than in caution: India EB-3 led EB-2 by two years and four
 * months in October 2021, retrogressed two years by that December, and was
 * nearly three years behind by August 2022.
 *
 * The India column as it stands makes the case better than any argument. The
 * EB-3 cutoff is years ahead of EB-2, which is Unavailable, and the EB-3
 * estimate is still the later of the two. A headline reducing that to "EB-3 is
 * faster" would be true about today's chart and wrong about the question the
 * reader is actually asking.
 */

import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "../components/Text";
import type { Comparison, SwitchSuggestion } from "@gc-eta/model";

import { categoryLabel, columnLabel, prettyDate, prettyMonth } from "../data";
import { verdictStyle, type Theme } from "../theme";
import type { CaseDraft } from "../types";

interface Props {
  theme: Theme;
  draft: CaseDraft;
  comparison: Comparison;
  suggestion: SwitchSuggestion;
  onBack: () => void;
}

function cellText(cell: { kind: string; day?: number }): string {
  if (cell.kind === "current") return "Current";
  if (cell.kind === "unavailable") return "Unavailable";
  if (cell.kind === "date" && cell.day !== undefined) {
    return prettyDate(new Date(cell.day * 86_400_000).toISOString().slice(0, 10));
  }
  return "Not published";
}

export function CompareScreen({ theme, draft, comparison, suggestion, onBack }: Props) {
  const { sides, crossover, notes, startMonth } = comparison;
  const share =
    crossover.monthsCompared > 0
      ? Math.round((crossover.monthsAhead / crossover.monthsCompared) * 100)
      : null;

  const rows: Array<{ label: string; values: string[]; hint?: string }> = [
    {
      label: "Approval date",
      values: sides.map((s) => cellText(s.cutoff)),
    },
    {
      label: "Filing chart",
      values: sides.map((s) => cellText(s.filing)),
    },
    {
      label: "Estimated for you",
      values: sides.map((s) =>
        s.estimate.beyondHorizon
          ? "Beyond horizon"
          : s.estimate.status === "current"
            ? "Already current"
            : s.estimate.p50
              ? prettyMonth(s.estimate.p50)
              : "Not enough data",
      ),
      hint: "The midpoint of the range, from how the cutoff has moved.",
    },
    {
      label: "People ahead",
      values: sides.map((s) =>
        s.queue.ok && s.queue.peopleAhead
          ? Math.round(s.queue.peopleAhead.mid).toLocaleString("en-US")
          : "Not countable",
      ),
      hint: "Labour certification cases only, counting spouses and children.",
    },
    {
      label: "Visas a year",
      values: sides.map((s) =>
        s.supply ? Math.round(s.supply.mid).toLocaleString("en-US") : "Not recorded",
      ),
      hint: "What this country and category actually received, median year.",
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 16 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to your estimate" onPress={onBack} hitSlop={12}>
          <Text style={{ fontSize: 17, color: theme.accent }}>Back</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: theme.text }}>
            EB-2 and EB-3 · {columnLabel(draft.column)}
          </Text>
          <Text style={{ fontSize: 12, color: theme.secondary }}>
            Priority date {prettyDate(draft.priorityDate)}
          </Text>
        </View>
      </View>

      <SuggestionCard theme={theme} suggestion={suggestion} />

      <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          What it would take, and what can go wrong
        </Text>
        {suggestion.caveats.map((caveat) => (
          <Text key={caveat} style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
            · {caveat}
          </Text>
        ))}
      </View>

      <View
        style={{
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
          <Text style={{ flex: 1.15, fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }} />
          {sides.map((side) => (
            <Text
              key={side.category}
              style={{
                flex: 1,
                fontSize: 13,
                fontWeight: "700",
                color: side.category === draft.category ? theme.accent : theme.text,
                textAlign: "right",
              }}
            >
              {categoryLabel(side.category)}
              {side.category === draft.category ? " · yours" : ""}
            </Text>
          ))}
        </View>

        {rows.map((row, i) => (
          <View
            key={row.label}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 12,
              gap: 4,
              borderTopColor: theme.border,
              borderTopWidth: 1,
              backgroundColor: i % 2 === 1 ? theme.bg : "transparent",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <Text style={{ flex: 1.15, fontSize: 14, color: theme.secondary }}>{row.label}</Text>
              {row.values.map((value, j) => (
                <Text
                  key={sides[j]!.category}
                  style={{ flex: 1, fontSize: 15, fontWeight: "600", color: theme.text, textAlign: "right" }}
                >
                  {value}
                </Text>
              ))}
            </View>
            {row.hint ? (
              <Text style={{ fontSize: 12, lineHeight: 17, color: theme.secondary }}>{row.hint}</Text>
            ) : null}
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          How stable is the gap
        </Text>
        {share !== null ? (
          <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
            Since {prettyMonth(startMonth)}, {categoryLabel(sides[1]!.category)} has been ahead of{" "}
            {categoryLabel(sides[0]!.category)} in {share}% of published months.
          </Text>
        ) : null}
        {crossover.switches > 0 ? (
          <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
            The lead has changed hands {crossover.switches} times
            {crossover.lastSwitch ? `, most recently in ${prettyMonth(crossover.lastSwitch)}` : ""}.
          </Text>
        ) : null}
        {notes.map((note) => (
          <Text key={note} style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
            {note}
          </Text>
        ))}
      </View>

    </ScrollView>
  );
}

/**
 * The verdict, first on the screen because it is what the reader came for.
 *
 * It reads the estimated dates rather than today's chart, which is the only
 * thing that makes it worth showing. In September 2026 India EB-3's approval
 * date is January 2014 against an Unavailable EB-2, and the card still says
 * moving would not help, because the estimate for a 2015 priority date runs the
 * other way. A card built on the chart would say the opposite and be wrong.
 *
 * The reasoning sits with the verdict. The costs and the reversal history sit
 * in their own card below, and are shown for every verdict including the
 * negative ones, so a "probably not" is as well explained as a "worth asking".
 */
function SuggestionCard({ theme, suggestion }: { theme: Theme; suggestion: SwitchSuggestion }) {
  const style = verdictStyle(suggestion.verdict, theme);
  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderColor: suggestion.verdict === "worth_asking" ? style.color : theme.border,
        borderWidth: suggestion.verdict === "worth_asking" ? 2 : 1,
        borderRadius: 16,
        padding: 16,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 15, color: style.color }}>{style.glyph}</Text>
        <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase", color: style.color }}>
          {style.label}
        </Text>
      </View>
      <Text style={{ fontSize: 17, fontWeight: "600", lineHeight: 24, color: theme.text }}>
        {suggestion.headline}
      </Text>
      {suggestion.because.map((reason) => (
        <Text key={reason} style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
          · {reason}
        </Text>
      ))}
    </View>
  );
}
