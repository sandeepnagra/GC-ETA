/** The estimate, its outlook, and what is acting on it. */

import React, { useMemo } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Text } from "../components/Text";
import type { CaseAssessment } from "@gc-eta/model";
import { dayToIso, historyPoints, seasonalPattern, supplyPicture } from "@gc-eta/model";
import { categoryLabel, columnLabel, prettyDate, shortDate } from "../data";
import { HistoryChart } from "../components/HistoryChart";
import { CardCarousel, type CarouselItem } from "../components/CardCarousel";
import { BackIcon, CardWatermark, HelpIcon } from "../components/Icons";
import { EstimateTimeline } from "../components/EstimateTimeline";
import { QueueCard } from "../components/QueueCard";
import { SeasonCard } from "../components/SeasonCard";
import { SupplyCard } from "../components/SupplyCard";

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
  // The hero card sits inside the screen's 20pt padding and its own 16pt, so
  // the drawing has to be told how much room it really has.
  const { width: screenWidth } = useWindowDimensions();
  // Both depend only on the bundle and the pair, so they are cheap and stable.
  const season = useMemo(
    () => seasonalPattern(bundle, draft.category, draft.column),
    [bundle, draft.category, draft.column],
  );
  const supply = useMemo(
    () => supplyPicture(bundle, draft.column, draft.category),
    [bundle, draft.column, draft.category],
  );
  const heroWidth = Math.max(240, screenWidth - 20 * 2 - 16 * 2);
  const blockers = assessment.events.filter((e) => e.relevance === "blocks");
  const context = assessment.events.filter((e) => e.relevance === "context");

  // The supporting detail, one card per page. The estimate itself and the two
  // chart tiles stay outside the carousel: the answer should never be a swipe
  // away. Cards with nothing to say are left out rather than shown empty, so
  // the "3 of 6" count always reflects what is really there.
  const cards: CarouselItem[] = [];

  // First card when the date is already current, because at that point the
  // headline estimate has nothing left to say and this is the whole answer.
  if (finalAction.status === "current") {
    cards.push({
      key: "current",
      title: "Current",
      node: <CurrentCard theme={theme} draft={draft} standing={assessment.standing} />,
    });
  }

  cards.push({
    key: "outlook",
    title: "Outlook",
    node: <OutlookCard theme={theme} outlook={outlook} />,
  });

  // Only when it will actually draw something. QueueCard renders nothing for a
  // date that is already current or a column with no density at all, and an
  // item with a null node is a blank page that still counts in "1 of 7".
  if (queueCardRenders(assessment.queue)) {
    cards.push({
      key: "queue",
      title: "Queue",
      node: <QueueCard theme={theme} assessment={assessment} draft={draft} />,
    });
  }

  cards.push({
    key: "supply",
    title: "Supply",
    node: <SupplyCard theme={theme} picture={supply} column={draft.column} category={draft.category} />,
  });

  cards.push({
    key: "season",
    title: "Season",
    node: <SeasonCard theme={theme} season={season} />,
  });

  cards.push(
    {
      key: "history",
      title: "History",
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
      title: "Drivers",
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
  );

  if (blockers.length > 0) {
    cards.push({
      key: "blockers",
      title: "Events",
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
      title: "Behind you",
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
      {/* Header. The watermark is drawn first so the text paints over it. */}
      <View style={{ position: "relative" }}>
        <View
          pointerEvents="none"
          style={{ position: "absolute", right: 38, top: -28, opacity: theme.dark ? 0.09 : 0.06 }}
        >
          <CardWatermark color={theme.accent} width={186} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to your case"
            onPress={onBack}
            style={{ width: 44, height: 44, marginLeft: -10, alignItems: "center", justifyContent: "center", borderRadius: 22 }}
          >
            <BackIcon color={theme.text} />
          </Pressable>

          <View style={{ flex: 1, gap: 1 }}>
            <Text display style={{ fontSize: 19, color: theme.text, letterSpacing: -0.2 }}>
              {columnLabel(draft.column)} · {categoryLabel(draft.category)} · {shortDate(draft.priorityDate)}
            </Text>
            <Text style={{ fontSize: 12, color: theme.secondary }}>
              Bulletin {prettyMonth(assessment.asOfMonth)}
              {stale.stale ? ` · ${stale.note}` : ""}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="How this works"
            onPress={onExplain}
            style={{ width: 44, height: 44, marginRight: -10, alignItems: "center", justifyContent: "center", borderRadius: 22 }}
          >
            <HelpIcon color={theme.text} />
          </Pressable>
        </View>
      </View>

      {/* Hero */}
      <View style={{ backgroundColor: theme.heroBg, borderRadius: 16, padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.4, color: theme.heroText, opacity: 0.85, textTransform: "uppercase" }}>
          {finalAction.status === "current" ? "Your date is current" : "Final action likely"}
        </Text>
        <Text display style={{ fontSize: 28, lineHeight: 34, color: theme.heroText, letterSpacing: -0.5 }}>
          {headline(assessment)}
        </Text>
        {heroSubtitle(finalAction) ? (
          <Text style={{ fontSize: 14, color: theme.heroText, opacity: 0.9 }}>
            {heroSubtitle(finalAction)}
          </Text>
        ) : null}
        {finalAction.status === "not_current" ? (
          <EstimateTimeline
            theme={theme}
            asOfMonth={assessment.asOfMonth}
            finalAction={finalAction}
            filing={filing}
            width={heroWidth}
          />
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

/**
 * The headline, which must describe the reader's case rather than the model.
 *
 * "Beyond this model's horizon" was the old answer whenever the midpoint fell
 * past twenty-five years, and it was wrong twice over. It is jargon about the
 * implementation, and it threw away everything that WAS known: for a 2018
 * Indian EB-2 date the model still had an earliest plausible month, the odds of
 * finishing inside one, two and five years, and a count of 187,000 people
 * ahead. Saying "no estimate" on top of all that is what makes the app look
 * like it has no model behind it.
 *
 * Now a case whose midpoint is past the horizon says so as a date: "after
 * September 2051". A case with an earliest month but no midpoint leads with
 * that month. Only a case where nothing at all crossed says so plainly.
 */
function headline(assessment: CaseAssessment): string {
  const fa = assessment.finalAction;
  if (fa.status === "current") return "You are current";
  if (fa.status === "insufficient_data") return "Not enough published data";
  if (fa.p10 && fa.p90) return `${prettyMonth(fa.p10)} to ${prettyMonth(fa.p90)}`;
  // With no late end, a range reading "October 2026 to beyond September 2051"
  // is technically true and says almost nothing. The midpoint is the useful
  // number, and the open tail is stated underneath instead.
  if (fa.p50) return `Around ${prettyMonth(fa.p50)}`;
  if (fa.p10) return `${prettyMonth(fa.p10)} at the earliest`;
  if (fa.horizonMonth) return `Later than ${prettyMonth(fa.horizonMonth)}`;
  return "No estimate";
}

/**
 * The line under the headline. Always says something: the midpoint when there
 * is one, otherwise how few simulations finished at all, which is the honest
 * shape of a very long wait.
 */
function heroSubtitle(fa: CaseAssessment["finalAction"]): string | null {
  if (fa.status === "current") return null;
  if (fa.p50 && !fa.beyondHorizon) {
    return fa.p90
      ? `Most likely ${prettyMonth(fa.p50)} · confidence ${fa.confidence}`
      : `Earliest ${prettyMonth(fa.p10!)}, with a slow tail running past ${prettyMonth(fa.horizonMonth ?? "")}`;
  }
  if (fa.crossedFraction !== undefined && fa.horizonMonth) {
    const pct = Math.round(fa.crossedFraction * 100);
    return pct >= 1
      ? `${pct} in 100 chance of reaching it by ${prettyMonth(fa.horizonMonth)}`
      : `Under 1 in 100 chance of reaching it by ${prettyMonth(fa.horizonMonth)}`;
  }
  return null;
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

/**
 * The answer for someone whose date is already current.
 *
 * Before this, such a user got one sentence: this category and country is
 * Current, so every priority date is eligible. Nine of the thirty category and
 * country pairs are current, including EB-1 and EB-2 for the rest of the world,
 * so that was a third of the combinations landing on an empty screen.
 *
 * What it does NOT do is estimate how long the remaining government processing
 * takes. That needs a source whose quality has not been assessed, and it should
 * not hold back the useful thing the archive can already say: being current is
 * not permanent, and the record says how permanent it has been. EB-1 for the
 * rest of the world has been current for three years after closing twice;
 * EB-2 has closed six times and has been current for six months. A screen
 * saying only "Current" makes those look identical.
 */
function CurrentCard({
  theme,
  draft,
  standing,
}: {
  theme: Theme;
  draft: CaseDraft;
  standing: CaseAssessment["standing"];
}) {
  const months = standing.monthsSoFar;
  const duration =
    months >= 24
      ? `${Math.floor(months / 12)} years`
      : months >= 1
        ? `${months} month${months === 1 ? "" : "s"}`
        : "this month";

  return (
    <Card theme={theme}>
      <Row theme={theme} title="How long this lasts" trailing={categoryLabel(draft.category)} />
      <Text display style={{ fontSize: 26, color: theme.text, letterSpacing: -0.4 }}>
        {standing.since ? `Current since ${prettyMonth(standing.since)}` : "Current"}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
        A visa number is available for your priority date now.{" "}
        {draft.path === "adjustment"
          ? "That is what lets Form I-485 be filed and approved. Check which chart U.S. Citizenship and Immigration Services has designated this month, because that decides which of the two dates applies to filing."
          : "The National Visa Center schedules interviews as numbers become available, so the next step sits with them and the consulate rather than with the bulletin."}
      </Text>
      <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 4 }} />
      <Text style={{ fontSize: 13, lineHeight: 19, color: theme.secondary }}>
        {standing.timesClosed === 0
          ? `It has been current for the whole published record, ${duration} and counting. That is unusual and is not a guarantee.`
          : `It has been current for ${duration}. Since 2009 this category has closed and reopened ${standing.timesClosed} ${standing.timesClosed === 1 ? "time" : "times"}${standing.medianClosedMonths ? `, and past stretches of being current lasted about ${standing.medianClosedMonths} months` : ""}. Being current is a state, not a milestone, and it can end.`}
      </Text>
    </Card>
  );
}

/** The reasons QueueCard has something on screen for. */
function queueCardRenders(queue: CaseAssessment["queue"]): boolean {
  if (queue.ok) return true;
  return (
    queue.reason === "below_density_floor" ||
    queue.reason === "density_not_covered" ||
    queue.reason === "beyond_density_record"
  );
}
