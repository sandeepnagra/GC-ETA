/**
 * A gauge for one share, drawn as a partial ring.
 *
 * THE OLD DIAL ON THIS SCREEN SHOWED A RISK SCORE OUT OF 100 and was deleted,
 * because the backtest measured that kind of reading as no more accurate at six
 * months than assuming the cutoff does not move. A needle is a confident
 * object, and pointing one at a number with no measured skill is the most
 * misleading thing a chart can do.
 *
 * What this draws is not a judgement. It is a count: of the simulated futures
 * the model ran, how many reached the reader's date inside the horizon. That
 * number is already on the screen as a sentence; the ring only makes it legible
 * at a glance.
 *
 * No coloured zones. Green, amber and red would say a share is good or bad,
 * which is a verdict, and a small share is not the reader's fault or their
 * failure. The fill is one colour and the words underneath carry the meaning.
 */

import React from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Text } from "./Text";
import type { Theme } from "../theme";

/** Leaves a gap at the bottom so the ring reads as a gauge, not a pie. */
const SWEEP = 260;
const START = 90 + (360 - SWEEP) / 2;

function pointOn(cx: number, cy: number, r: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const a = pointOn(cx, cy, r, from);
  const b = pointOn(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export function Dial({
  theme,
  /** 0 to 1. */
  value,
  label,
  size = 148,
}: {
  theme: Theme;
  value: number;
  label: string;
  size?: number;
}) {
  const share = Math.max(0, Math.min(1, value));
  const stroke = 14;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const end = START + SWEEP * share;

  // Below about a degree there is no arc to draw, and a zero-length path
  // renders as nothing, which would look like a missing chart rather than a
  // very small number. A dot marks the start instead.
  const drawable = SWEEP * share >= 1.5;
  const percent = share >= 0.995 ? 100 : share <= 0.005 && share > 0 ? 1 : Math.round(share * 100);

  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <View style={{ width: size, height: size * 0.84, justifyContent: "flex-start" }}>
        <Svg width={size} height={size}>
          <Path
            d={arcPath(cx, cy, r, START, START + SWEEP)}
            stroke={theme.track}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
          />
          {drawable ? (
            <Path
              d={arcPath(cx, cy, r, START, end)}
              stroke={theme.accent}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
            />
          ) : (
            <Circle {...pointOn(cx, cy, r, START)} r={stroke / 2} fill={theme.accent} />
          )}
        </Svg>
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: size * 0.3,
            alignItems: "center",
          }}
          pointerEvents="none"
        >
          <Text display style={{ fontSize: 34, color: theme.text, letterSpacing: -0.5 }}>
            {percent}
            <Text display style={{ fontSize: 19, color: theme.secondary }}>
              %
            </Text>
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 12, textAlign: "center", color: theme.secondary }}>{label}</Text>
    </View>
  );
}
