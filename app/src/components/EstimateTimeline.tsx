/**
 * The estimate drawn on a time axis, which is the largest thing the design has
 * and the app did not.
 *
 * A range written as "October 2026 to June 2031" makes the reader do the
 * arithmetic. Drawn, the same numbers say at a glance how far away the whole
 * thing is, how wide the uncertainty is, and where the filing window sits
 * relative to the approval window, which is the distinction people find hardest
 * in the bulletin.
 *
 * THE OPEN-ENDED CASE IS THE NORMAL ONE HERE, not an edge case. A deeply
 * backlogged category often has no ninetieth percentile at all, because the
 * slow tenth of simulations never finish inside twenty-five years. Drawing the
 * band to a tidy right edge would say the opposite of what is true, so it runs
 * off the edge under a fade with an arrow, and the axis stops labelling years
 * before it gets there.
 *
 * When nothing crossed at all, this draws nothing. An axis with no marks on it
 * is not a humble chart, it is a confusing one, and the headline already says
 * the wait runs past the horizon.
 */

import React from "react";
import { View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import type { Estimate } from "@gc-eta/model";
import { monthToAbsolute } from "@gc-eta/model";

import type { Theme } from "../theme";

const PAD_LEFT = 16;
const PAD_RIGHT = 12;
const AXIS_Y = 64;
const FILING_Y = 30;
const YEAR_Y = 86;
const CAPTION_Y = 103;
const HEIGHT = 110;

interface Props {
  theme: Theme;
  asOfMonth: string;
  finalAction: Estimate;
  filing: Estimate;
  width: number;
}

function label(month: string): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${names[m - 1]} ${y}`;
}

/** "about 4 years 9 months", the thing people actually want to know. */
function distance(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years <= 0) return `${rest} mo away`;
  if (rest === 0) return `${years} yr away`;
  return `${years} yr ${rest} mo away`;
}

export function EstimateTimeline({ theme, asOfMonth, finalAction, filing, width }: Props) {
  const start = monthToAbsolute(asOfMonth);
  const p10 = finalAction.p10 ? monthToAbsolute(finalAction.p10) : null;
  const p50 = finalAction.p50 ? monthToAbsolute(finalAction.p50) : null;
  const p90 = finalAction.p90 ? monthToAbsolute(finalAction.p90) : null;

  // Nothing to place on an axis.
  if (!p10 && !p50) return null;

  const openEnded = !p90;
  const far = p90 ?? (p50 ? start + Math.round((p50 - start) * 1.6) : start + 60);
  const end = Math.max(far, start + 12);
  const span = end - start;

  const innerWidth = width - PAD_LEFT - PAD_RIGHT;
  const x = (absolute: number) =>
    PAD_LEFT + ((Math.min(absolute, end) - start) / span) * innerWidth;

  const ink = theme.heroText;

  // Year ticks, thinned out so they never collide on a narrow phone.
  const firstYear = Math.floor(start / 12) + 1;
  const lastYear = Math.floor(end / 12);
  const years: number[] = [];
  for (let y = firstYear; y <= lastYear; y += 1) years.push(y);
  const maxTicks = Math.floor(innerWidth / 44);
  const step = Math.max(1, Math.ceil(years.length / Math.max(1, maxTicks)));
  const ticks = years.filter((_, i) => i % step === 0);

  const bandStart = x(p10 ?? start);
  const bandEnd = openEnded ? width - PAD_RIGHT + 6 : x(p90!);

  const filingLow = filing.p10 ? monthToAbsolute(filing.p10) : null;
  const filingHigh = filing.p90 ? monthToAbsolute(filing.p90) : filing.p50 ? monthToAbsolute(filing.p50) : null;
  const filingCurrent = filing.status === "current";

  return (
    <View accessible accessibilityLabel={timelineLabel(asOfMonth, finalAction, filing)}>
      <Svg width={width} height={HEIGHT}>
        <Defs>
          {/* The band fades out where the wait runs past what can be charted. */}
          <LinearGradient id="tail" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={ink} stopOpacity={0.32} />
            <Stop offset="0.75" stopColor={ink} stopOpacity={0.32} />
            <Stop offset="1" stopColor={ink} stopOpacity={0.04} />
          </LinearGradient>
        </Defs>

        {/* Filing window, above the axis. */}
        <SvgText x={PAD_LEFT} y={FILING_Y - 8} fontSize={11} fill={ink} fillOpacity={0.85} fontFamily="IBMPlexSans_400Regular">
          Filing window
        </SvgText>
        {filingCurrent ? (
          <SvgText x={PAD_LEFT} y={FILING_Y + 10} fontSize={11} fill={ink} fontFamily="IBMPlexSans_600SemiBold">
            Open now
          </SvgText>
        ) : filingLow ? (
          <G>
            <Rect
              x={x(filingLow)}
              y={FILING_Y}
              width={Math.max(6, x(filingHigh ?? filingLow) - x(filingLow))}
              height={8}
              rx={4}
              fill={ink}
              fillOpacity={0.55}
            />
            <SvgText
              x={Math.min(x(filingLow) + 10, width - PAD_RIGHT - 120)}
              y={FILING_Y + 22}
              fontSize={11}
              fill={ink}
              fillOpacity={0.9}
              fontFamily="IBMPlexSans_400Regular"
            >
              {label(filing.p10!)}
              {filing.p90 ? ` to ${label(filing.p90)}` : " at the earliest"}
            </SvgText>
          </G>
        ) : (
          <SvgText x={PAD_LEFT} y={FILING_Y + 10} fontSize={11} fill={ink} fillOpacity={0.75} fontFamily="IBMPlexSans_400Regular">
            Not chartable yet
          </SvgText>
        )}

        {/* The likely window. */}
        <Rect
          x={bandStart}
          y={AXIS_Y - 7}
          width={Math.max(8, bandEnd - bandStart)}
          height={14}
          rx={7}
          fill={openEnded ? "url(#tail)" : ink}
          fillOpacity={openEnded ? 1 : 0.32}
        />

        <Line x1={PAD_LEFT} y1={AXIS_Y} x2={width - PAD_RIGHT} y2={AXIS_Y} stroke={ink} strokeOpacity={0.5} strokeWidth={1.5} />

        {openEnded ? (
          <Path
            d={`M${width - PAD_RIGHT - 8} ${AXIS_Y - 4} l4 4 l-4 4`}
            stroke={ink}
            strokeOpacity={0.8}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        <Circle cx={PAD_LEFT} cy={AXIS_Y} r={5} fill={ink} />
        {p50 ? (
          <G>
            <Circle cx={x(p50)} cy={AXIS_Y} r={7} fill={ink} />
            <Circle cx={x(p50)} cy={AXIS_Y} r={3} fill={theme.heroBg} />
          </G>
        ) : null}

        <SvgText x={PAD_LEFT} y={YEAR_Y} fontSize={11} fill={ink} fontFamily="IBMPlexSans_400Regular">
          Now
        </SvgText>
        {ticks.map((year) => {
          const at = x(year * 12);
          if (at < PAD_LEFT + 34 || at > width - PAD_RIGHT - 8) return null;
          return (
            <SvgText
              key={year}
              x={at}
              y={YEAR_Y}
              fontSize={11}
              textAnchor="middle"
              fill={ink}
              fillOpacity={0.85}
              fontFamily="IBMPlexSans_400Regular"
            >
              {year}
            </SvgText>
          );
        })}

        {p50 ? (
          <SvgText
            x={Math.max(PAD_LEFT + 26, Math.min(x(p50), width - PAD_RIGHT - 26))}
            y={CAPTION_Y}
            fontSize={11}
            textAnchor="middle"
            fill={ink}
            fontFamily="IBMPlexSans_600SemiBold"
          >
            {distance(p50 - start)}
          </SvgText>
        ) : (
          <SvgText x={PAD_LEFT} y={CAPTION_Y} fontSize={11} fill={ink} fillOpacity={0.9} fontFamily="IBMPlexSans_400Regular">
            Earliest {label(finalAction.p10!)}
          </SvgText>
        )}
      </Svg>
    </View>
  );
}

/** One sentence for a screen reader, since the drawing carries the meaning. */
function timelineLabel(asOfMonth: string, finalAction: Estimate, filing: Estimate): string {
  const parts: string[] = [];
  if (finalAction.p10 && finalAction.p90) {
    parts.push(`Approval likely between ${label(finalAction.p10)} and ${label(finalAction.p90)}`);
  } else if (finalAction.p10) {
    parts.push(`Approval no earlier than ${label(finalAction.p10)}, with no reliable late end`);
  }
  if (finalAction.p50) parts.push(`most likely ${label(finalAction.p50)}`);
  if (filing.status === "current") parts.push("the filing window is open now");
  else if (filing.p10) parts.push(`filing opens around ${label(filing.p10)}`);
  return `Timeline from ${label(asOfMonth)}. ${parts.join(", ")}.`;
}
