/** The estimate, its outlook, and what is acting on it. */

import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { CaseAssessment } from "@gc-eta/model";
import { dayToIso, historyPoints } from "@gc-eta/model";
import { bundle } from "../data";
import { HistoryChart } from "../components/HistoryChart";

import { prettyMonth } from "../data";
import { outlookStyle, type Theme } from "../theme";
import type { CaseDraft } from "../types";

interface Props {
  theme: Theme;
  draft: CaseDraft;
  assessment: CaseAssessment;
  onBack: () => void;
  onExplain: () => void;
  onNews: () => void;
  newsCount: number;
}

export function ResultsScreen({ theme, draft, assessment, onBack, onExplain, onNews, newsCount }: Props) {
  const { finalAction, filing, risk } = assessment;
  const outlook = outlookStyle(risk.outlook, theme);
  const blockers = assessment.events.filter((e) => e.relevance === "blocks");
  const context = assessment.events.filter((e) => e.relevance === "context");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit your case" onPress={onBack} hitSlop={12}>
          <Text style={{ fontSize: 17, color: theme.accent }}>Edit</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: theme.text }}>
            {draft.category.replace(/_/g, " ")} · {draft.column} · {draft.priorityDate}
          </Text>
          <Text style={{ fontSize: 12, color: theme.secondary }}>
            Bulletin {prettyMonth(assessment.asOfMonth)}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="How this works" onPress={onExplain} hitSlop={12}>
          <Text style={{ fontSize: 17, color: theme.accent }}>?</Text>
        </Pressable>
      </View>

      {/* Hero */}
      <View style={{ backgroundColor: theme.heroBg, borderRadius: 16, padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.4, color: theme.heroText, opacity: 0.85, textTransform: "uppercase" }}>
          {finalAction.status === "current" ? "Your date is current" : "Final action likely"}
        </Text>
        <Text style={{ fontSize: 28, fontWeight: "700", lineHeight: 34, color: theme.heroText, letterSpacing: -0.5 }}>
          {headline(assessment)}
        </Text>
        {finalAction.p50 && !finalAction.beyondHorizon ? (
          <Text style={{ fontSize: 14, color: theme.heroText, opacity: 0.9 }}>
            Most likely {prettyMonth(finalAction.p50)} · confidence {finalAction.confidence}
          </Text>
        ) : null}
      </View>

      {/* Right now */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Tile theme={theme} label="Final action now" value={cutoffText(finalAction)} tone={finalAction.currentCutoff.kind === "unavailable" ? theme.negative : theme.text} />
        <Tile theme={theme} label="Filing chart" value={cutoffText(filing)} tone={theme.text} />
      </View>

      {/* Outlook. Colour is never the only signal: glyph and label carry it too. */}
      <Card theme={theme}>
        <Row theme={theme} title="Next 3 to 6 months" trailing={`${risk.score} / 100`} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 18, color: outlook.color }}>{outlook.glyph}</Text>
          <Text style={{ fontSize: 20, fontWeight: "700", color: outlook.color }}>{outlook.label}</Text>
        </View>
        {risk.reasons.map((reason) => (
          <Text key={reason} style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
            {reason}
          </Text>
        ))}
      </Card>

      <Card theme={theme}>
        <Row theme={theme} title="Ten years of movement" trailing={`${draft.category.replace(/_/g, " ")} · ${draft.column}`} />
        <HistoryChart
          theme={theme}
          points={historyPoints(bundle, "final_action", draft.category, draft.column)}
          priorityDate={draft.priorityDate}
        />
      </Card>

      <Card theme={theme}>
        <Row theme={theme} title="What drives this" />
        {finalAction.drivers.map((driver) => (
          <Text key={driver} style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
            · {driver}
          </Text>
        ))}
      </Card>

      {blockers.length > 0 ? (
        <Card theme={theme}>
          <Row theme={theme} title="Affects you directly" trailing={String(blockers.length)} />
          {blockers.map((item) => (
            <View key={item.event.id} style={{ gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: theme.text }}>
                {item.event.title}{item.upcoming ? " (from " + item.event.start + ")" : ""}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 18, color: theme.secondary }}>{item.event.summary}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {context.length > 0 ? (
        <Card theme={theme}>
          <Row theme={theme} title="Moving the numbers behind you" trailing={String(context.length)} />
          {context.slice(0, 4).map((item) => (
            <Text key={item.event.id} style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
              · {item.event.title}
            </Text>
          ))}
        </Card>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onNews}
        style={{
          flexDirection: "row", alignItems: "center", gap: 12,
          backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1,
          borderRadius: 16, padding: 16, minHeight: 44,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: theme.text }}>What changed</Text>
          <Text style={{ fontSize: 13, lineHeight: 18, color: theme.secondary }}>
            {newsCount > 0
              ? `${newsCount} change${newsCount === 1 ? "" : "s"} acting on your case`
              : "Nothing currently acting on your case directly"}
          </Text>
        </View>
        <Text style={{ fontSize: 20, color: theme.secondary }}>›</Text>
      </Pressable>

      {assessment.warnings.map((warning) => (
        <View key={warning} style={{ backgroundColor: theme.accentFill, borderRadius: 14, padding: 14 }}>
          <Text style={{ fontSize: 13, lineHeight: 18, color: theme.text }}>{warning}</Text>
        </View>
      ))}

      <Text style={{ fontSize: 11, lineHeight: 15, textAlign: "center", color: theme.secondary }}>
        Unofficial estimate from public data. Not legal advice.
      </Text>
    </ScrollView>
  );
}

function headline(assessment: CaseAssessment): string {
  const fa = assessment.finalAction;
  if (fa.status === "current") return "You are current";
  if (fa.status === "insufficient_data") return "Not enough published data";
  if (fa.beyondHorizon) return "Beyond this model's horizon";
  if (fa.p10 && fa.p90) return `${prettyMonth(fa.p10)} to ${prettyMonth(fa.p90)}`;
  return "No estimate";
}

function cutoffText(estimate: CaseAssessment["finalAction"]): string {
  const cell = estimate.currentCutoff;
  if (cell.kind === "date") return dayToIso(cell.day!);
  if (cell.kind === "current") return "Current";
  if (cell.kind === "unavailable") return "Unavailable";
  return "Not published";
}

function Tile({ theme, label, value, tone }: { theme: Theme; label: string; value: string; tone: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 14, padding: 12, gap: 2 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>{label}</Text>
      <Text style={{ fontSize: 17, fontWeight: "600", color: tone }}>{value}</Text>
    </View>
  );
}

function Card({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 }}>
      {children}
    </View>
  );
}

function Row({ theme, title, trailing }: { theme: Theme; title: string; trailing?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
      <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>{title}</Text>
      {trailing ? <Text style={{ fontSize: 12, color: theme.secondary }}>{trailing}</Text> : null}
    </View>
  );
}
