/** The estimate, its outlook, and what is acting on it. */

import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { CaseAssessment } from "@gc-eta/model";
import { dayToIso, historyPoints } from "@gc-eta/model";
import { categoryLabel, columnLabel, prettyDate } from "../data";
import { HistoryChart } from "../components/HistoryChart";
import { CardCarousel, type CarouselItem } from "../components/CardCarousel";

import { prettyMonth } from "../data";
import { directionStyle, type Theme } from "../theme";
import type { Bundle } from "@gc-eta/model";
import type { Freshness } from "../updates";
import type { CaseDraft } from "../types";

interface Props {
  theme: Theme;
  draft: CaseDraft;
  assessment: CaseAssessment;
  onBack: () => void;
  onExplain: () => void;
  onNews: () => void;
  /** Absent when the category has no comparable alternative. */
  onCompare?: () => void;
  /** The live bundle, which may be newer than the one compiled into the app. */
  bundle: Bundle;
  stale: Freshness;
  newsCount: number;
}

export function ResultsScreen({ theme, draft, assessment, onBack, onExplain, onNews, onCompare, bundle, stale, newsCount }: Props) {
  const { finalAction, filing, outlook } = assessment;
  const blockers = assessment.events.filter((e) => e.relevance === "blocks");
  const context = assessment.events.filter((e) => e.relevance === "context");

  // The supporting detail, one card per page. The estimate itself and the two
  // chart tiles stay outside the carousel: the answer should never be a swipe
  // away. Cards with nothing to say are left out rather than shown empty, so
  // the "3 of 6" count always reflects what is really there.
  const cards: CarouselItem[] = [
    {
      key: "outlook",
      title: "What is scheduled",
      node: <OutlookCard theme={theme} outlook={outlook} />,
    },
    {
      key: "queue",
      title: "People ahead of you",
      node: <QueueCard theme={theme} assessment={assessment} draft={draft} />,
    },
    {
      key: "history",
      title: "Ten years of movement",
      node: (
        <Card theme={theme}>
          <Row theme={theme} title="Ten years of movement" trailing={columnLabel(draft.column)} />
          <HistoryChart
            theme={theme}
            points={historyPoints(bundle, "final_action", draft.category, draft.column)}
            priorityDate={draft.priorityDate}
          />
        </Card>
      ),
    },
    {
      key: "drivers",
      title: "What drives this",
      node: (
        <Card theme={theme}>
          <Row theme={theme} title="What drives this" />
          {finalAction.drivers.map((driver) => (
            <Text key={driver} style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
              · {driver}
            </Text>
          ))}
        </Card>
      ),
    },
  ];

  if (blockers.length > 0) {
    cards.push({
      key: "blockers",
      title: "Affects you directly",
      node: (
        <Card theme={theme}>
          <Row theme={theme} title="Affects you directly" trailing={String(blockers.length)} />
          {blockers.map((item) => (
            <View key={item.event.id} style={{ gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: theme.text }}>
                {item.event.title}
                {item.upcoming ? ` (from ${prettyDate(item.event.start!)})` : ""}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 18, color: theme.secondary }}>
                {item.event.summary}
              </Text>
            </View>
          ))}
        </Card>
      ),
    });
  }

  if (context.length > 0) {
    cards.push({
      key: "context",
      title: "Numbers behind you",
      node: (
        <Card theme={theme}>
          <Row theme={theme} title="Moving the numbers behind you" trailing={String(context.length)} />
          {context.slice(0, 4).map((item) => (
            <Text key={item.event.id} style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
              · {item.event.title}
            </Text>
          ))}
        </Card>
      ),
    });
  }

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
            {categoryLabel(draft.category)} · {columnLabel(draft.column)}
          </Text>
          <Text style={{ fontSize: 12, color: theme.secondary }}>
            Priority date {prettyDate(draft.priorityDate)} · bulletin {prettyMonth(assessment.asOfMonth)}
          </Text>
          {stale.stale ? (
            // A broken pipeline and a working one look identical to a reader
            // unless the app says which it is. PLAN.md 8.1.
            <Text style={{ fontSize: 12, color: theme.caution }}>{stale.note}</Text>
          ) : null}
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

      <CardCarousel theme={theme} items={cards} />

      {onCompare ? (
        <Pressable
          accessibilityRole="button"
          onPress={onCompare}
          style={{
            flexDirection: "row", alignItems: "center", gap: 12,
            backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1,
            borderRadius: 16, padding: 16, minHeight: 44,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: theme.text }}>
              Compare EB-2 and EB-3
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 18, color: theme.secondary }}>
              Both categories side by side for your date
            </Text>
          </View>
          <Text style={{ fontSize: 17, color: theme.secondary }}>›</Text>
        </Pressable>
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
  if (cell.kind === "date") return prettyDate(dayToIso(cell.day!));
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

/**
 * The count of people ahead, which is the best-grounded number in the app.
 *
 * It comes from a million certified labour certifications, not from a model.
 * The wait it implies is shown underneath and deliberately made secondary: the
 * head-to-head backtest found the queue division worse than the velocity model
 * at picking a date, and the supply figure it divides by cannot yet be
 * calibrated. So the count leads and the years follow, hedged in words rather
 * than presented as a second opinion of equal weight. PLAN.md, Phase 2 results.
 */
function QueueCard({
  theme,
  assessment,
  draft,
}: {
  theme: Theme;
  assessment: CaseAssessment;
  draft: Props["draft"];
}) {
  const q = assessment.queue;

  if (!q.ok) {
    // Silence would be worse than an explanation. A user whose cutoff sits
    // before the labour certification record begins should be told that is why
    // no count appears, not left to assume the queue is empty.
    if (q.reason === "beyond_density_record") {
      return (
        <Card theme={theme}>
          <Row theme={theme} title="People ahead of you" trailing="not countable" />
          <Text style={{ fontSize: 14, lineHeight: 20, color: theme.secondary }}>
            The public record of certified labour certifications ends in May 2023. The
            Labor Department's newer form records the employer's country and the
            attorney's country but no longer records the applicant's own, and a queue
            is counted per country. So for a priority date after that there is nothing
            honest to count.
          </Text>
        </Card>
      );
    }
    if (q.reason === "below_density_floor" || q.reason === "density_not_covered") {
      return (
        <Card theme={theme}>
          <Row theme={theme} title="People ahead of you" trailing="not countable" />
          <Text style={{ fontSize: 14, lineHeight: 20, color: theme.secondary }}>
            The public record of certified labour certifications only reaches back to
            2013, and the cutoff for your category sits at or before that. Counting
            from there would find almost nobody and give a badly wrong answer, so no
            count is shown.
          </Text>
        </Card>
      );
    }
    return null;
  }

  const people = Math.round(q.peopleAhead!.mid);
  const w = q.waitYears!;
  // When the category is Unavailable there is no cutoff today, and the count
  // runs from the last published one. Writing "today's cutoff" under a tile
  // that reads Unavailable would contradict the screen itself.
  const kind = assessment.finalAction.currentCutoff.kind;
  const live = kind === "date";
  const fromMonth = prettyMonth(q.countedFromMonth ?? "");
  const from = live ? "today's cutoff" : fromMonth;
  const aside = live
    ? ""
    : ` ${fromMonth} is the last cutoff published ${kind === "unavailable" ? "before this category went Unavailable" : "for this category"}.`;

  return (
    <Card theme={theme}>
      <Row
        theme={theme}
        title="People ahead of you"
        trailing={`${categoryLabel(draft.category)} · ${columnLabel(draft.column)}`}
      />
      <Text style={{ fontSize: 34, fontWeight: "700", color: theme.text, letterSpacing: -0.5 }}>
        {people.toLocaleString("en-US")}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
        Roughly this many people hold an earlier priority date than yours, counting
        spouses and children. That comes from{" "}
        {(q.principalsAhead ?? 0).toLocaleString("en-US")} certified labour
        certifications with priority dates between {from} and your own.{aside}
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 19, color: theme.secondary }}>
        This counts labour certification cases only. People applying through a
        national interest waiver or an extraordinary ability petition never file one,
        so they are ahead of you too and are not in this number.
      </Text>
      <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 4 }} />
      <Text style={{ fontSize: 13, lineHeight: 19, color: theme.secondary }}>
        {supplyLine(q)}
      </Text>
    </Card>
  );
}

/**
 * What the country actually receives, stated rather than divided into a date.
 *
 * This card used to end with "that queue implies somewhere between X and Y
 * years". It does not any more, and the reason is measured rather than
 * cautionary. Dividing the count by a supply figure assumes the cutoff moves as
 * numbers are consumed. Across every year where both the queue and the issuance
 * can be observed, the numbers issued per person the cutoff passed ran from
 * 0.36 to 19.3. The Visa Office moves a cutoff to manage how many people file,
 * not to record how many were admitted, so no divisor reconciles the two. The
 * count and the issuance are both facts. The quotient was not.
 */
function supplyLine(q: CaseAssessment["queue"]): string {
  const s = q.annualSupply;
  if (!s) return "";
  const n = (v: number) => Math.round(v).toLocaleString("en-US");
  if (s.basis === "statutory") {
    return `No issuance history is recorded for this category, so the only guide is the guaranteed per-country minimum of roughly ${n(s.low)} a year. The bulletin cutoff moves to manage how many people file rather than to track that number.`;
  }
  return `Across ${s.years} recorded years this country and category received about ${n(s.mid)} visa numbers in a typical year, ranging from ${n(s.low)} in a poor one to ${n(s.high)} in a good one. The cutoff moves to manage how many people file rather than to record those numbers, so the two can diverge for years at a time.`;
}

/**
 * What is scheduled to change, rather than a guess at what will.
 *
 * This replaced a score out of 100 built from seasonality, a retrogression base
 * rate and recent direction. The backtest measured that reading as no better
 * than assuming the cutoff does not move, so it is gone. What is left is only
 * things with a source: a rule with a commencement date, a category deadline, a
 * court order, or the Visa Office saying in writing what it intends.
 *
 * An empty list is the most common result and is treated as an answer, not as
 * an empty state. Telling someone that nothing is coming is useful.
 */
function OutlookCard({ theme, outlook }: { theme: Theme; outlook: CaseAssessment["outlook"] }) {
  const months = Math.round(outlook.windowDays / 30);
  return (
    <Card theme={theme}>
      <Row
        theme={theme}
        title={`Next ${months} months`}
        trailing={outlook.changes.length === 0 ? "nothing scheduled" : `${outlook.changes.length} scheduled`}
      />
      <Text style={{ fontSize: 15, lineHeight: 21, color: theme.text }}>{outlook.summary}</Text>
      {outlook.changes.map((change) => {
        const style = directionStyle(change.direction, theme);
        return (
          <View key={change.id} style={{ gap: 2, marginTop: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 13, color: style.color }}>{style.glyph}</Text>
              <Text style={{ fontSize: 15, fontWeight: "600", color: theme.text, flex: 1 }}>
                {change.title}
              </Text>
            </View>
            <Text style={{ fontSize: 13, lineHeight: 18, color: theme.secondary }}>
              {change.effective ? `${prettyDate(change.effective)} · ` : ""}
              {style.label}
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>{change.detail}</Text>
          </View>
        );
      })}
    </Card>
  );
}
