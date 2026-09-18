/**
 * EB-2 and EB-3 on one axis.
 *
 * Two ranges written as text make the reader hold four dates in their head and
 * subtract. On a shared axis the comparison is the picture: which band starts
 * earlier, which is wider, and whether they overlap so much that the difference
 * is not a difference.
 *
 * The verdict beneath is the same one the full comparison screen gives, read
 * from the estimates rather than today's chart, and the card links through to
 * the working rather than restating it.
 */

import React from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import type { Comparison, SwitchSuggestion } from "@gc-eta/model";
import { monthToAbsolute } from "@gc-eta/model";

import { Text } from "./Text";
import { CARD_MIN_HEIGHT } from "./Card";
import { ChevronRight } from "./Icons";
import { categoryLabel, columnLabel } from "../data";
import type { Theme } from "../theme";
import type { CaseDraft } from "../types";

const LABEL_W = 42;
const PAD_RIGHT = 6;
const ROW_Y = [26, 66];
const TICK_Y = 92;
const HEIGHT = 100;

export function CompareCard({
  theme,
  comparison,
  suggestion,
  draft,
  width,
  onOpen,
}: {
  theme: Theme;
  comparison: Comparison;
  suggestion: SwitchSuggestion;
  draft: CaseDraft;
  width: number;
  onOpen: () => void;
}) {
  const start = monthToAbsolute(comparison.sides[0]!.estimate.asOfMonth);

  const marks = comparison.sides.map((side) => ({
    category: side.category,
    low: side.estimate.p10 ? monthToAbsolute(side.estimate.p10) : null,
    mid: side.estimate.p50 ? monthToAbsolute(side.estimate.p50) : null,
    high: side.estimate.p90 ? monthToAbsolute(side.estimate.p90) : null,
  }));

  const furthest = Math.max(
    start + 24,
    ...marks.flatMap((m) => [m.high ?? 0, m.mid ?? 0, m.low ?? 0]),
  );
  const end = furthest + Math.max(6, Math.round((furthest - start) * 0.12));
  const span = Math.max(1, end - start);
  const inner = width - LABEL_W - PAD_RIGHT;
  const x = (absolute: number) => LABEL_W + ((Math.min(absolute, end) - start) / span) * inner;

  const firstYear = Math.floor(start / 12) + 1;
  const lastYear = Math.floor(end / 12);
  const allYears: number[] = [];
  for (let y = firstYear; y <= lastYear; y += 1) allYears.push(y);
  const step = Math.max(1, Math.ceil(allYears.length / Math.max(1, Math.floor(inner / 40))));
  const ticks = allYears.filter((_, i) => i % step === 0);

  const drawable = marks.some((m) => m.low || m.mid);

  return (
    <View style={{ minHeight: CARD_MIN_HEIGHT, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          EB-2 or EB-3?
        </Text>
        <Text style={{ fontSize: 12, color: theme.secondary }}>
          Same date, {columnLabel(draft.column)}
        </Text>
      </View>

      {drawable ? (
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <LinearGradient id="cmpTailMine" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={theme.accent} stopOpacity={0.9} />
              <Stop offset="0.7" stopColor={theme.accent} stopOpacity={0.9} />
              <Stop offset="1" stopColor={theme.accent} stopOpacity={0.12} />
            </LinearGradient>
            <LinearGradient id="cmpTailOther" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={theme.track} stopOpacity={1} />
              <Stop offset="0.7" stopColor={theme.track} stopOpacity={1} />
              <Stop offset="1" stopColor={theme.track} stopOpacity={0.12} />
            </LinearGradient>
          </Defs>
          {marks.map((mark, i) => {
            const y = ROW_Y[i]!;
            const mine = mark.category === draft.category;
            const bandStart = x(mark.low ?? start);
            const bandEnd = mark.high ? x(mark.high) : width - PAD_RIGHT;
            return (
              <React.Fragment key={mark.category}>
                <SvgText x={0} y={y + 4} fontSize={12} fill={theme.text} fontFamily="IBMPlexSans_600SemiBold">
                  {categoryLabel(mark.category)}
                </SvgText>
                <Line x1={LABEL_W} y1={y} x2={width - PAD_RIGHT} y2={y} stroke={theme.border} strokeWidth={1.5} />
                {mark.low || mark.mid ? (
                  <Rect
                    x={bandStart}
                    y={y - 7}
                    width={Math.max(8, bandEnd - bandStart)}
                    height={14}
                    rx={7}
                    // A band with no ninetieth percentile does not end where the
                    // card runs out of room; a hard edge would say it does.
                    fill={
                      mark.high
                        ? mine
                          ? theme.accent
                          : theme.track
                        : mine
                          ? "url(#cmpTailMine)"
                          : "url(#cmpTailOther)"
                    }
                    fillOpacity={mark.high && mine ? 0.9 : 1}
                  />
                ) : null}
                {!mark.high && (mark.low || mark.mid) ? (
                  <Path
                    d={`M${width - PAD_RIGHT - 7} ${y - 4} l4 4 l-4 4`}
                    stroke={theme.secondary}
                    strokeWidth={1.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {mark.mid ? (
                  <Circle cx={x(mark.mid)} cy={y} r={5} fill={theme.card} stroke={theme.accent} strokeWidth={2} />
                ) : null}
              </React.Fragment>
            );
          })}

          {ticks.map((year) => {
            const at = x(year * 12);
            // "Now" is drawn at the left edge of the axis, so a tick within its
            // width collides with it. 2027 was printing on top of it.
            if (at < LABEL_W + 32 || at > width - PAD_RIGHT - 6) return null;
            return (
              <SvgText
                key={year}
                x={at}
                y={TICK_Y}
                fontSize={11}
                textAnchor="middle"
                fill={theme.secondary}
                fontFamily="IBMPlexSans_400Regular"
              >
                {year}
              </SvgText>
            );
          })}
          <SvgText x={LABEL_W} y={TICK_Y} fontSize={11} fill={theme.secondary} fontFamily="IBMPlexSans_400Regular">
            Now
          </SvgText>
        </Svg>
      ) : (
        <Text style={{ fontSize: 13, lineHeight: 18, color: theme.secondary }}>
          Neither category has a dated estimate for your priority date, so there is
          nothing to put on an axis.
        </Text>
      )}

      <Text display style={{ fontSize: 18, color: theme.text, letterSpacing: -0.2 }}>
        {suggestion.headline}
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        hitSlop={8}
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: theme.accent }}>
          See both side by side
        </Text>
        <ChevronRight color={theme.accent} size={16} />
      </Pressable>
    </View>
  );
}
