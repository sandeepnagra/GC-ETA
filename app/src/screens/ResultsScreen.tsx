/** The estimate, its outlook, and what is acting on it. */

import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "../components/Text";
import { useContentWidth } from "../layout";
import type { CaseAssessment } from "@gc-eta/model";
import { dayToIso, historyPoints, seasonalPattern, supplyPicture, whatWouldChange } from "@gc-eta/model";
import { categoryLabel, columnLabel, prettyDate, shortDate } from "../data";
import { HistoryChart } from "../components/HistoryChart";
import { CardCarousel, type CarouselItem } from "../components/CardCarousel";
import { DetailSheet, type CardDetail } from "../components/DetailSheet";
import { Sheet } from "../components/Sheet";
import { DisruptionsBody } from "./DisruptionsScreen";
import { CompareBody } from "./CompareScreen";
import { CARD_MIN_HEIGHT } from "../components/Card";
import { BackIcon, HelpIcon } from "../components/Icons";
import { EstimateTimeline } from "../components/EstimateTimeline";
import { QueueCard } from "../components/QueueCard";
import { StageCard } from "../components/StageCard";
import { ConfidenceCard } from "../components/ConfidenceCard";
import { EventsCard } from "../components/EventsCard";
import { ChangesCard } from "../components/ChangesCard";
import { CompareCard } from "../components/CompareCard";
import { SeasonCard } from "../components/SeasonCard";
import { SupplyCard } from "../components/SupplyCard";

import { prettyMonth } from "../data";
import { directionStyle, type Theme } from "../theme";
import type { Bundle, Comparison, EventsFile, SwitchSuggestion } from "@gc-eta/model";
import type { Freshness } from "../updates";
import type { CaseDraft } from "../types";

interface Props {
  theme: Theme;
  draft: CaseDraft;
  assessment: CaseAssessment;
  onBack: () => void;
  onExplain: () => void;
  onNews: () => void;
  comparison?: Comparison | null;
  suggestion?: SwitchSuggestion | null;
  /** QA harness only: opens a sheet or a card's back on mount. */
  initialSheet?: "disruptions" | "compare";
  initialFlipped?: string;
  events: EventsFile;
  /** The live bundle, which may be newer than the one compiled into the app. */
  bundle: Bundle;
  stale: Freshness;
  newsCount: number;
}

const OUTLOOK_NOTE: CardDetail = {
  title: "What is scheduled",
  paragraphs: [
    "This card lists only things with a published source and a date: a rule taking effect, a category expiring, a court order starting or ending, or the Visa Office saying in writing what it intends for this category. The 1 October reset is included because it is the one date that is certain.",
    "It is not a forecast, and it used to be. A score out of 100 sat here, blending seasonality, how often the category had moved backwards and its recent direction. The backtest measured that kind of reading as no more accurate over six months than assuming the cutoff does not move, so it was removed rather than softened.",
    "When nothing is scheduled the card says so. That is an answer, not an empty state: knowing that no rule or deadline lands in the next few months is worth as much as knowing that one does.",
  ],
  caveat:
    "A warning about a category closing is withheld once it has already closed, which is why a category that is Unavailable shows the reopening rather than the warning.",
  sources:
    "Department of State Visa Bulletin, per-category sections. The tracked event register, checked by a person before it changes anything shown here.",
};

const HISTORY_NOTE: CardDetail = {
  title: "Ten years of movement",
  paragraphs: [
    "Every published cutoff for this category and country, month by month, against the date on your own petition. Where the line crosses your date is where the category reached you.",
    "Months the category was Unavailable are drawn as breaks rather than joined up. Interpolating across them would invent movement that did not happen, and those months are exactly when a category is stuck, so smoothing them away would flatter the picture.",
    "A line that runs backwards is a retrogression: the Visa Office moved the cutoff to an earlier date because more people qualified than there were numbers for. It happens most often between July and September.",
  ],
  caveat:
    "One month is missing from the government archive with no alternate copy, October 2012, so the 2013 fiscal year is drawn from eleven months.",
  sources:
    "Department of State Visa Bulletin archive, December 2009 to the current month.",
};

const EVENTS_NOTE: CardDetail = {
  title: "Disruptions for you",
  paragraphs: [
    "Pauses, bans, rules and court orders that touch employment-based cases. Each is matched against your country of birth, your category and whether you finish inside the United States or at a consulate, so a consular pause does not appear for someone adjusting status.",
    "Colour carries the status. Amber is acting on your case now, green is something that was stopped, grey is in force elsewhere or not in force at all. Three of the tracked statuses are neither plainly on nor plainly off, and each has its own wording rather than being rounded to the nearest.",
    "Detecting that something happened can be automatic. Deciding what it means for a queue is not, so every entry is read and classified by a person before it changes anything the app says.",
  ],
  caveat:
    "An entry that has not been re-checked recently is flagged as such. The register is curated, so it lags a fast-moving court docket by days rather than minutes.",
  sources:
    "Federal Register, USCIS newsroom, Department of State notices and court dockets. Each entry records what it was verified against and when.",
};

const COMPARE_NOTE: CardDetail = {
  title: "EB-2 or EB-3",
  paragraphs: [
    "Both categories on one axis for your own priority date, read from the estimates rather than from today's chart. The distinction matters: a category can be far ahead on the published chart because of the queue it has already cleared while being slower for a date like yours.",
    "The lead changes hands often. EB-3 has been ahead of EB-2 in a third of published months for India and about half for China, swapping eleven and seventeen times. In October 2021 India EB-3 led by two years and four months; by that December it had given back two years, and by August 2022 EB-2 was nearly three years ahead.",
    "So there is no saving stated in years. The verdict is a direction with its reasoning, and moving needs a new petition your employer files and pays for, which no number here can see.",
  ],
  caveat:
    "This advice works against itself at scale. When many people move to whichever category looks faster, that movement is part of what slows it down, and a crossover is often followed by a retrogression.",
  sources:
    "Visa Bulletin archive for both categories. Labour certification counts per category. Report of the Visa Office, Table V, for what each actually received.",
};

const CHANGES_NOTE: CardDetail = {
  title: "What would change this",
  paragraphs: [
    "The handful of things that would actually move this estimate, derived for your case rather than listed generically. Whether a country pause matters depends on your processing path; whether fall-down from EB-1 matters depends on your category; the size of a good spillover year is a figure from the record.",
    "Green is sooner, red is later. Each row carries its own numbers so you can judge the size of the lever rather than take the direction on trust.",
    "Nothing here carries odds. The data supports no probability for any of it, and the card's job is to tell you what to watch rather than what to expect.",
  ],
  caveat:
    "A row appears only when something in the record supports it, so a shorter list means less is known to be in play, not that nothing could happen.",
  sources:
    "Published annual limits by fiscal year, Report of the Visa Office issuance by country and category, and the tracked event register.",
};

const DRIVERS_NOTE: CardDetail = {
  title: "What drives this",
  paragraphs: [
    "The specific things that shaped the date above, in the order they mattered: the state of the category today, how far the cutoff sits behind your priority date, and how much published movement the estimate had to learn from.",
    "Advances are adjusted for the size of the year they happened in. A year with 281,507 visa numbers moved categories further than a year with 150,037, and treating those as comparable would inflate every estimate built on the larger one.",
    "The estimate is also adjusted for how many people hold the priority dates ahead of you, which differs sharply across years. Without that, a category that once moved quickly through a thin stretch of dates would be assumed to move as quickly through a dense one.",
  ],
  caveat:
    "Every driver is read from the past ten years. A change in the law is outside anything the estimate has seen.",
  sources:
    "Visa Bulletin archive, published annual limits FY2021 onward, and labour certification counts by priority-date month.",
};

const CURRENT_NOTE: CardDetail = {
  title: "Your date is current",
  paragraphs: [
    "A visa number is available for your priority date now. What stands between you and a decision is a government adjudication rather than the bulletin, which is a different question with a different answer.",
    "Being current is a state, not a milestone. Categories close and reopen: this card counts how long the present run has lasted, how many times the category has closed before, and how long past runs lasted, so you can see how settled this one is.",
    "Nine of the thirty category and country pairs are current at any given time, and how durable that is varies enormously. One has been current for the whole published record; another has closed six times.",
  ],
  caveat:
    "A month nobody published does not count as a month the category closed. The archive has gaps, and treating one as a closure would invent an event that never happened.",
  sources:
    "Department of State Visa Bulletin archive, December 2009 to the current month.",
};

const STAGE_NOTE: CardDetail = {
  title: "Your I-485",
  paragraphs: [
    "Where a filed application sits: when it was filed, whether your date has become current, and what is left. The months pending are counted from the filing date you gave.",
    "The decision is deliberately not estimated. Doing that needs USCIS processing-time data, which is published as service-centre ranges rather than a distribution and has not been assessed closely enough here to put a date on your case. Printing one anyway would invent the number on this card you care about most.",
    "A pending application does not fail if your date retrogresses. It waits. Keep the work permit and travel document renewed while it does.",
  ],
  caveat:
    "This tracks the bulletin side of your case only. It knows nothing about your own file, and nothing you enter here leaves the phone.",
  sources:
    "Your own filing date, and the Visa Bulletin archive for when the category became current.",
};

const QUEUE_NOTE: CardDetail = {
        title: "People ahead of you",
        paragraphs: [
          "The count is everyone in your category and country holding a priority date earlier than yours, with spouses and children included, because each of them uses a visa number of their own.",
          "It is built from the Department of Labor's published labour certifications. A certified labour certification carries the date the Department received it, and that date is the priority date, so counting certified cases by receipt month gives the shape of the queue. A little over a million of them are counted here.",
          "It cannot see everyone. People applying through a national interest waiver or an extraordinary ability petition never file a labour certification at all, and for Indian EB-2 that is a large and growing share. Nor does it know whether a certified case ever became a petition, or whether the person is still pursuing it.",
          "The filled dots are a rate, not a date. They show how much of the line one year of the visa numbers your country typically receives would cover. They do not say when the cutoff reaches you, because the cutoff moves to manage how many people file rather than working through this line in order.",
        ],
        caveat:
          "The record runs from 2013 to May 2023 and nothing will extend it at either end. Before 2013 the published files carry a decision date but no receipt date, and from mid-2023 the Labor Department's newer form stopped recording the applicant's country.",
        sources:
          "Department of Labor, OFLC labour certification disclosure files, FY2015 to FY2024. Department of State, Report of the Visa Office, Table V.",
      };

const SUPPLY_NOTE: CardDetail = {
      title: "Where the numbers come from",
      paragraphs: [
        "Congress set the employment-based limit at 140,000 a year in 1990 and has not changed it. No year on record has actually been 140,000, because family-sponsored numbers that go unused fall across into the employment pool, and the amount varies enormously.",
        "That pool is then divided by statute. The first, second and third preferences take 28.6% each; the fourth and fifth take 7.1% each. Within a category, no single country may take more than 7% unless there are numbers nobody else wants, which is why a heavily oversubscribed country can receive several times its nominal share in a good year and barely its floor in a poor one.",
        "The figures for what your country actually received come from Table V of the Report of the Visa Office, which counts both consular issuance and adjustments of status, and includes dependents. Roughly 85% of employment cases are adjustments, so a table covering only consular issuance would miss most of them.",
      ],
      caveat:
        "Next year's limit is not published until October, so the most recent complete year is shown instead of a projection.",
      sources:
        "INA 201 and 203. Department of State annual limits and Report of the Visa Office, Table V, FY2012 to FY2024.",
    };

const SEASON_NOTE: CardDetail = {
      title: "A typical year",
      paragraphs: [
        "Each bar is how far this category's cutoff has typically moved in that month of the fiscal year, measured across every published bulletin since 2009 rather than assumed from a general rule.",
        "The general rule is real but not universal. A new year of visa numbers arrives on 1 October, categories often advance steadily through the winter, hold in the spring while the Visa Office checks the pace, and freeze or move backwards in the summer as the annual limit runs out. How strongly any of that applies differs sharply between categories: some creep a few days a month and shut every summer, others advance about a month every month and only stall in September.",
        "A month the category spent Unavailable counts as a real zero in the average, not a month to skip. Skipping them would make a category that shuts every August look like one that merely advances less, which is a different claim.",
      ],
      caveat:
        "A median over about fifteen observations a month describes what has happened, not what will. A policy change or an unusually large spillover year can break the pattern entirely.",
      sources:
        "Department of State Visa Bulletin archive, December 2009 to the current month.",
    };

const CONFIDENCE_NOTE: CardDetail = {
      title: "How sure is this",
      paragraphs: [
        "The dial counts simulations. The model replays ten years of this category's published movement four thousand times, drawing multi-month blocks at random so a good year and a bad year stay intact rather than being averaged into a single smooth pace, and each run continues until the cutoff reaches your date or twenty-five years pass. The number on the dial is how many runs reached it.",
        "A small share does not mean the estimate is wrong. It means most simulated futures did not get there inside twenty-five years, which for a deeply backlogged category is the honest answer and is why the headline reads as a bound rather than a date.",
        "The lines below the dial are about the method rather than your case, and are the same for everyone. They come from replaying the model against the published archive: standing at a past month, making an estimate using only what was known then, and checking it against what actually happened.",
        "The weakest result is the one worth knowing. Over three to six months this model is no more accurate than assuming the cutoff does not move at all, and its odds of a date becoming current within two years scored no better than always saying fifty percent. The long-range range is where it earns its keep; the short-range precision is not there.",
      ],
      caveat:
        "Every simulation draws on the past ten years. A change in the law, or an unusually large spillover year, is outside anything it has seen.",
      sources:
        "Department of State Visa Bulletin archive. Backtest of 393 cases from quarterly origins between October 2016 and September 2023.",
    };

export function ResultsScreen({ theme, draft, assessment, onBack, onExplain, onNews, comparison, suggestion, events, bundle, stale, newsCount, initialSheet, initialFlipped }: Props) {
  const { finalAction, filing, outlook } = assessment;
  // The hero card sits inside the screen's 20pt padding and its own 16pt, so
  // the drawing has to be told how much room it really has. Measured from the
  // clamped content column, not the raw device width -- on a foldable opened
  // flat that column is narrower than the device, and sizing from the device
  // instead would draw a chart wider than the column it sits in.
  const screenWidth = useContentWidth();
  const [detail, setDetail] = useState<CardDetail | null>(null);
  // Both open the same way the card note does: an aside over the estimate,
  // never a place you navigate to and have to come back from.
  const [showDisruptions, setShowDisruptions] = useState(initialSheet === "disruptions");
  const [showCompare, setShowCompare] = useState(initialSheet === "compare");
  // Both depend only on the bundle and the pair, so they are cheap and stable.
  const season = useMemo(
    () => seasonalPattern(bundle, draft.category, draft.column),
    [bundle, draft.category, draft.column],
  );
  const supply = useMemo(
    () => supplyPicture(bundle, draft.column, draft.category),
    [bundle, draft.column, draft.category],
  );
  const changes = useMemo(
    () => whatWouldChange(bundle, events, { ...draft }),
    [bundle, events, draft],
  );
  const heroWidth = Math.max(240, screenWidth - 20 * 2 - 16 * 2);
  const blockers = assessment.events.filter((e) => e.relevance === "blocks");
  const context = assessment.events.filter((e) => e.relevance === "context");

  // The supporting detail, one card per page. The estimate itself and the two
  // chart tiles stay outside the carousel: the answer should never be a swipe
  // away. Cards with nothing to say are left out rather than shown empty, so
  // the "3 of 6" count always reflects what is really there.
  const cards: CarouselItem[] = [];

  // First card when the application is already filed, because at that point the
  // bulletin has stopped being what stands in the way.
  if (draft.filedI485) {
    cards.push({
      key: "stage",
      title: "Your I-485",
      detail: STAGE_NOTE,
      node: <StageCard theme={theme} draft={draft} assessment={assessment} />,
    });
  }

  // Then, when the date is already current, because the headline estimate has
  // nothing left to say and this is the whole answer.
  if (finalAction.status === "current") {
    cards.push({
      key: "current",
      title: "Current",
      detail: CURRENT_NOTE,
      node: <CurrentCard theme={theme} draft={draft} standing={assessment.standing} />,
    });
  }

  cards.push({
    key: "outlook",
    title: "Outlook",
    detail: OUTLOOK_NOTE,
    node: <OutlookCard theme={theme} outlook={outlook} />,
  });

  cards.push({
    key: "confidence",
    title: "How sure",
    node: <ConfidenceCard theme={theme} assessment={assessment} />,
    detail: CONFIDENCE_NOTE,
  });

  // Only when it will actually draw something. QueueCard renders nothing for a
  // date that is already current or a column with no density at all, and an
  // item with a null node is a blank page that still counts in "1 of 7".
  if (queueCardRenders(assessment.queue)) {
    cards.push({
      key: "queue",
      title: "Queue",
      node: <QueueCard theme={theme} assessment={assessment} draft={draft} />,
    detail: QUEUE_NOTE,
    });
  }

  cards.push({
    key: "supply",
    title: "Supply",
    node: <SupplyCard theme={theme} picture={supply} column={draft.column} category={draft.category} />,
    detail: SUPPLY_NOTE,
  });

  cards.push({
    key: "season",
    title: "Season",
    node: <SeasonCard theme={theme} season={season} />,
    detail: SEASON_NOTE,
  });

  cards.push({
      key: "history",
      title: "History",
      detail: HISTORY_NOTE,
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
  });

  if (assessment.events.length > 0) {
    cards.push({
      key: "events",
      title: "Events",
      detail: EVENTS_NOTE,
      node: <EventsCard theme={theme} events={assessment.events} onAll={() => setShowDisruptions(true)} />,
    });
  }

  if (comparison && suggestion) {
    cards.push({
      key: "compare",
      title: "EB-2 or EB-3?",
      detail: COMPARE_NOTE,
      node: (
        <CompareCard
          theme={theme}
          comparison={comparison}
          suggestion={suggestion}
          draft={draft}
          width={heroWidth}
          onOpen={() => setShowCompare(true)}
        />
      ),
    });
  }

  cards.push({
    key: "changes",
    title: "Changes",
    detail: CHANGES_NOTE,
    node: <ChangesCard theme={theme} changes={changes} />,
  });

  cards.push({
    key: "drivers",
    title: "Drivers",
    detail: DRIVERS_NOTE,
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
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 12 }}
    >
      {/* Header. The green-card watermark that used to sit behind this title
          moved to the case screen, where the user actually fills in the card
          the icon depicts, rather than repeating on every visit to the
          estimate. */}
      <View style={{ position: "relative" }}>
        {/* flex-start, not center: at accessibility text sizes the title wraps
            to several lines, and centering the 44pt icon buttons against that
            full height put the back arrow on top of the wrapped text rather
            than beside its first line. Confirmed on device at the largest
            Dynamic Type size. */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
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

      <CardCarousel theme={theme} items={cards} onOpenDetail={setDetail} initialFlipped={initialFlipped} />

      <DetailSheet theme={theme} detail={detail} onClose={() => setDetail(null)} />

      <Sheet
        theme={theme}
        visible={showDisruptions}
        title="Disruptions"
        subtitle="Pauses, bans, rules and court orders"
        onClose={() => setShowDisruptions(false)}
      >
        <DisruptionsBody theme={theme} events={events} applicable={assessment.events} />
      </Sheet>

      {comparison && suggestion ? (
        <Sheet
          theme={theme}
          visible={showCompare}
          title="EB-2 or EB-3"
          subtitle={`Same date, ${columnLabel(draft.column)}`}
          onClose={() => setShowCompare(false)}
        >
          <CompareBody theme={theme} draft={draft} comparison={comparison} suggestion={suggestion} />
        </Sheet>
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
    <View style={{ minHeight: CARD_MIN_HEIGHT, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 }}>
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
    queue.reason === "beyond_density_record" ||
    queue.reason === "no_perm_population"
  );
}
