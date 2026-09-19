/**
 * The queue drawn as a hundred dots, one per percent.
 *
 * "39,315 people are ahead of you" is a fact and it is hard to feel. A hundred
 * dots with eleven of them filled says the same thing and is immediately
 * legible: this is the share of the queue that one year of the visa numbers
 * your country actually receives would cover.
 *
 * WHAT THE FILLED SHARE IS, AND IS NOT. It is a rate, not a date. Dividing the
 * queue by an annual supply to produce a year when your date becomes current is
 * the thing the Table V work showed does not work: across every observable year
 * the numbers issued per person the cutoff passed ran from 0.36 to 19.3, so no
 * divisor reconciles the two. Saying "one year's numbers would cover this much
 * of the line" makes no claim about when the line moves, and the caption says
 * so. The estimate above the carousel is where dates come from.
 */

import React from "react";
import { View } from "react-native";
import type { CaseAssessment } from "@gc-eta/model";

import { Text } from "./Text";
import { CARD_MIN_HEIGHT } from "./Card";
import { categoryLabel, columnLabel } from "../data";
import type { Theme } from "../theme";
import type { CaseDraft } from "../types";

const DOTS = 100;
const COLUMNS = 10;

function Shell({
  theme,
  trailing,
  children,
}: {
  theme: Theme;
  trailing: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ minHeight: CARD_MIN_HEIGHT, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          People ahead of you
        </Text>
        <Text style={{ fontSize: 12, color: theme.secondary }}>{trailing}</Text>
      </View>
      {children}
    </View>
  );
}

export function QueueCard({
  theme,
  assessment,
  draft,
}: {
  theme: Theme;
  assessment: CaseAssessment;
  draft: CaseDraft;
}) {
  const q = assessment.queue;
  const pair = `${categoryLabel(draft.category)} ${columnLabel(draft.column)}`;

  if (!q.ok) {
    if (q.reason === "beyond_density_record") {
      return (
        <Shell theme={theme} trailing="not countable yet">
          <Text style={{ fontSize: 14, lineHeight: 20, color: theme.secondary }}>
            The public record of certified labour certifications ends in May 2023. The
            Labor Department's newer form records the employer's country and the
            attorney's country but no longer records the applicant's own, and a queue is
            counted per country. So for a priority date after that there is nothing
            honest to count.
          </Text>
        </Shell>
      );
    }
    if (q.reason === "below_density_floor" || q.reason === "density_not_covered") {
      return (
        <Shell theme={theme} trailing="not countable">
          <Text style={{ fontSize: 14, lineHeight: 20, color: theme.secondary }}>
            The public record of certified labour certifications only reaches back to
            2013, and the cutoff for your category sits at or before that. Counting from
            there would find almost nobody and give a badly wrong answer, so no count is
            shown.
          </Text>
        </Shell>
      );
    }
    return null;
  }

  const people = Math.round(q.peopleAhead!.mid);
  const perYear = q.annualSupply ? Math.round(q.annualSupply.mid) : null;
  // Rounded up, so a queue that one year barely dents still lights one dot
  // rather than none, which would read as "nothing moves at all".
  const covered =
    perYear && people > 0 ? Math.min(DOTS, Math.max(1, Math.round((perYear / people) * DOTS))) : 0;

  const rows: number[][] = [];
  for (let r = 0; r < DOTS / COLUMNS; r += 1) {
    rows.push(Array.from({ length: COLUMNS }, (_, c) => r * COLUMNS + c));
  }

  return (
    <Shell theme={theme} trailing={`${pair}, earlier dates`}>
      <Text display style={{ fontSize: 30, color: theme.text, letterSpacing: -0.5 }}>
        {people.toLocaleString("en-US")}
      </Text>

      <View
        accessible
        accessibilityLabel={
          perYear
            ? `A hundred dots, ${covered} filled. One year of this country's visa numbers would cover about ${covered} percent of the people ahead of you.`
            : "A hundred dots, none filled, because no issuance history is recorded."
        }
        style={{ gap: 4, paddingHorizontal: 6 }}
      >
        {rows.map((row, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 4 }}>
            {row.map((index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  height: 11,
                  borderRadius: 7,
                  backgroundColor: index < covered ? theme.accent : theme.border,
                }}
              />
            ))}
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: 14, justifyContent: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.accent }} />
          <Text style={{ fontSize: 12, color: theme.secondary }}>One year of numbers</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.border }} />
          <Text style={{ fontSize: 12, color: theme.secondary }}>Still ahead of you</Text>
        </View>
      </View>

      <Text style={{ fontSize: 13, lineHeight: 18, color: theme.text, textAlign: "center" }}>
        Each dot is 1% of the people with an earlier date.
        {perYear ? ` One year of this country's numbers covers about ${covered}%.` : ""}
      </Text>
    </Shell>
  );
}
