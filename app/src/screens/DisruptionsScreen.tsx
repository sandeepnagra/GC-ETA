/**
 * Everything tracked, not only what acts on this case.
 *
 * The results card shows the three disruptions that reach the reader. This is
 * the whole register, because "is there a ban on my country" is a question
 * people arrive with, and answering it needs the ones that do not apply as much
 * as the ones that do. An event that ended is as much of an answer as one in
 * force.
 *
 * The bars are the point. A list of dates makes a reader build the overlap in
 * their head; drawn against a common axis it is obvious which pauses ran at
 * once, which had ended before another began, and which is still open.
 */

import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";
import type { CaseAssessment, EventsFile, GcEvent } from "@gc-eta/model";

import { Text } from "../components/Text";
import { BackIcon } from "../components/Icons";
import { prettyDate } from "../data";
import { kindColours, statusLook } from "../eventStatus";
import type { Theme } from "../theme";

type Filter = "mine" | "active" | "all";

const DAY = 86_400_000;

interface Props {
  theme: Theme;
  events: EventsFile;
  applicable: CaseAssessment["events"];
  onBack: () => void;
}

/** A short line of who, when and what it touches. */
function meta(event: GcEvent): string {
  const parts: string[] = [];
  if (event.start && event.end) parts.push(`${prettyDate(event.start)} to ${prettyDate(event.end)}`);
  else if (event.start) parts.push(`From ${prettyDate(event.start)}`);
  if (event.affects.length) {
    parts.push(
      event.affects.length === 2
        ? "Both routes"
        : event.affects[0] === "consular"
          ? "Consular only"
          : "In-US cases only",
    );
  }
  return parts.join(" · ");
}

export function DisruptionsScreen({ theme, events, applicable, onBack }: Props) {
  const [filter, setFilter] = useState<Filter>("mine");
  const mine = new Set(applicable.map((a) => a.event.id));

  const shown = useMemo(() => {
    const all = events.events;
    if (filter === "all") return all;
    if (filter === "active") return all.filter((e) => statusLook(e.status).kind === "acting");
    return all.filter((e) => mine.has(e.id));
  }, [events, filter, applicable]);

  // The bar chart covers only events that have a start; undated ones such as
  // pending legislation have nothing to draw and are listed below instead.
  const dated = events.events.filter((e) => e.start);
  const now = Date.now();
  const earliest = dated.reduce(
    (min, e) => Math.min(min, new Date(`${e.start}T00:00:00Z`).getTime()),
    now,
  );
  const span = Math.max(DAY * 90, now - earliest);
  const chartWidth = 318;
  const labelWidth = 104;
  const trackWidth = chartWidth - labelWidth - 6;
  const x = (time: number) => labelWidth + ((Math.min(time, now) - earliest) / span) * trackWidth;
  const rowHeight = 20;
  const chartHeight = dated.length * rowHeight + 24;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to your estimate"
          onPress={onBack}
          style={{ width: 44, height: 44, marginLeft: -10, alignItems: "center", justifyContent: "center", borderRadius: 22 }}
        >
          <BackIcon color={theme.text} />
        </Pressable>
        <View style={{ flex: 1, gap: 1 }}>
          <Text display style={{ fontSize: 19, color: theme.text, letterSpacing: -0.2 }}>
            Disruptions
          </Text>
          <Text style={{ fontSize: 12, color: theme.secondary }}>
            Pauses, bans, rules and court orders
          </Text>
        </View>
      </View>

      <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          When each one ran
        </Text>
        <Svg width={chartWidth} height={chartHeight}>
          {dated.map((event, i) => {
            const y = i * rowHeight + 8;
            const from = new Date(`${event.start}T00:00:00Z`).getTime();
            const to = event.end ? new Date(`${event.end}T00:00:00Z`).getTime() : now;
            const look = statusLook(event.status);
            const { ink } = kindColours(look.kind, theme);
            return (
              <React.Fragment key={event.id}>
                <SvgText
                  x={0}
                  y={y + 8}
                  fontSize={9}
                  fill={theme.secondary}
                  fontFamily="IBMPlexSans_400Regular"
                >
                  {event.title.length > 20 ? `${event.title.slice(0, 19)}…` : event.title}
                </SvgText>
                <Rect
                  x={x(from)}
                  y={y + 2}
                  width={Math.max(4, x(to) - x(from))}
                  height={8}
                  rx={4}
                  fill={ink}
                  // A bar drawn to today says "still running". Some orders were
                  // struck down without an end date recorded, so theirs would
                  // have said the opposite of their own status badge. Those are
                  // drawn faint: it ran through here, and when it stopped is
                  // not in the register.
                  fillOpacity={
                    look.kind === "pending"
                      ? 0.4
                      : look.kind === "stopped" && !event.end
                        ? 0.3
                        : 0.85
                  }
                />
              </React.Fragment>
            );
          })}
          <Line
            x1={x(now)}
            y1={4}
            x2={x(now)}
            y2={chartHeight - 18}
            stroke={theme.text}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <SvgText
            x={x(now)}
            y={chartHeight - 4}
            fontSize={10}
            textAnchor="end"
            fill={theme.text}
            fontFamily="IBMPlexSans_600SemiBold"
          >
            Now
          </SvgText>
        </Svg>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {(
          [
            ["mine", "Affects me"],
            ["active", "Active"],
            ["all", "All"],
          ] as Array<[Filter, string]>
        ).map(([value, label]) => {
          const on = filter === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(value)}
              hitSlop={{ top: 6, bottom: 6 }}
              style={{
                height: 36,
                paddingHorizontal: 14,
                justifyContent: "center",
                borderRadius: 18,
                borderWidth: 1,
                backgroundColor: on ? theme.text : theme.card,
                borderColor: on ? theme.text : theme.border,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: on ? "600" : "400", color: on ? theme.bg : theme.text }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {shown.length === 0 ? (
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.secondary }}>
          Nothing tracked matches that filter.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {shown.map((event) => {
            const look = statusLook(event.status);
            const { ink, fill } = kindColours(look.kind, theme);
            return (
              <View
                key={event.id}
                style={{
                  flexDirection: "row",
                  gap: 12,
                  alignItems: "center",
                  padding: 12,
                  paddingHorizontal: 14,
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderWidth: 1,
                  borderRadius: 14,
                }}
              >
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ink }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", lineHeight: 18, color: theme.text }}>
                    {event.title}
                  </Text>
                  <Text style={{ fontSize: 12, lineHeight: 16, color: theme.secondary }}>
                    {meta(event)}
                  </Text>
                  <Text style={{ fontSize: 12, lineHeight: 16, color: theme.secondary }}>
                    {event.summary}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: fill }}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: ink }}>{look.word}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Text style={{ fontSize: 11, lineHeight: 15, textAlign: "center", color: theme.secondary }}>
        Curated from the Federal Register, USCIS alerts, State notices and court dockets.
        Each entry is checked by a person before it changes anything the app says.
      </Text>
    </ScrollView>
  );
}
