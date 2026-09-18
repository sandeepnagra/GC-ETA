/**
 * Ten years of cutoff movement, with the reader's priority date marked.
 *
 * Unavailable months are drawn as a visible break rather than interpolated
 * across. Joining the line through a freeze would draw a slope that never
 * happened, which is the visual form of the same mistake the model avoids by
 * treating "U" as a real zero rather than a gap.
 */

import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { HistoryPoint } from "@gc-eta/model";
import { isoToDay } from "@gc-eta/model";

import type { Theme } from "../theme";

interface Props {
  theme: Theme;
  points: HistoryPoint[];
  priorityDate: string;
  width?: number;
  height?: number;
}

export function HistoryChart({ theme, points, priorityDate, width = 326, height = 180 }: Props) {
  const dated = points.filter((p) => p.day !== null);
  if (dated.length < 2) {
    return (
      <Text style={{ fontSize: 13, color: theme.secondary }}>
        Not enough published history to chart this category.
      </Text>
    );
  }

  const padLeft = 34;
  const padBottom = 22;
  const padTop = 16;
  const plotWidth = width - padLeft - 6;
  const plotHeight = height - padBottom - padTop;

  const target = isoToDay(priorityDate);
  const days = dated.map((p) => p.day!);
  const minDay = Math.min(...days, target);
  const maxDay = Math.max(...days, target);
  const span = Math.max(1, maxDay - minDay);

  const x = (index: number) => padLeft + (index / (points.length - 1)) * plotWidth;
  const y = (day: number) => padTop + plotHeight - ((day - minDay) / span) * plotHeight;

  // Build the path in runs, breaking wherever the cutoff was not a date.
  const runs: string[] = [];
  let current = "";
  points.forEach((point, index) => {
    if (point.day === null) {
      if (current) runs.push(current);
      current = "";
      return;
    }
    const command = current ? "L" : "M";
    current += `${command}${x(index).toFixed(1)},${y(point.day).toFixed(1)} `;
  });
  if (current) runs.push(current);

  const frozen = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.kind === "unavailable");

  const yearLabel = (day: number) => new Date(day * 86_400_000).getUTCFullYear();
  const ticks = [minDay, (minDay + maxDay) / 2, maxDay];

  return (
    <View>
      <Svg width={width} height={height}>
        {ticks.map((tick) => (
          <React.Fragment key={tick}>
            <Line x1={padLeft} y1={y(tick)} x2={width - 6} y2={y(tick)} stroke={theme.border} strokeWidth={1} />
            <SvgText x={2} y={y(tick) + 4} fontSize={10} fill={theme.secondary}>
              {String(yearLabel(tick))}
            </SvgText>
          </React.Fragment>
        ))}

        {/* Months where the category was Unavailable. */}
        {frozen.map(({ index }) => (
          <Rect
            key={`u${index}`}
            x={x(index) - 1.5}
            y={padTop}
            width={3}
            height={plotHeight}
            fill={theme.negative}
            opacity={0.25}
          />
        ))}

        {runs.map((d, i) => (
          <Path key={i} d={d.trim()} stroke={theme.accent} strokeWidth={2.5} fill="none" />
        ))}

        <Line
          x1={padLeft} y1={y(target)} x2={width - 6} y2={y(target)}
          stroke={theme.negative} strokeWidth={1.5} strokeDasharray="4,4"
        />
        <SvgText x={width - 8} y={y(target) - 5} fontSize={10} fill={theme.negative} textAnchor="end">
          your date
        </SvgText>

        {(() => {
          const lastIndex = points.length - 1;
          const last = points[lastIndex];
          if (!last || last.day === null) return null;
          return <Circle cx={x(lastIndex)} cy={y(last.day)} r={4} fill={theme.accent} />;
        })()}

        <SvgText x={padLeft} y={height - 6} fontSize={10} fill={theme.secondary}>
          {points[0]?.month ?? ""}
        </SvgText>
        <SvgText x={width - 6} y={height - 6} fontSize={10} fill={theme.secondary} textAnchor="end">
          {points[points.length - 1]?.month ?? ""}
        </SvgText>
      </Svg>
      {frozen.length > 0 ? (
        <Text style={{ fontSize: 12, lineHeight: 17, color: theme.secondary, marginTop: 4 }}>
          Shaded bands are months when the category was Unavailable and no numbers were issued.
        </Text>
      ) : null}
    </View>
  );
}
