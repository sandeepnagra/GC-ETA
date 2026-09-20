/**
 * The icons the design calls for, drawn rather than typed.
 *
 * The header used a text "Edit" link where the mockup has a back arrow, and a
 * bare "?" character where it has a help glyph. A punctuation mark set at 17
 * points is both a smaller tap target than the 44 points iOS asks for and a
 * different thing from an icon: it inherits the text baseline, it cannot be
 * given a title for a screen reader, and at a glance it does not read as a
 * control at all.
 *
 * Stroke paths, sized and coloured by prop, so they sit correctly on both
 * palettes and scale with nothing else changing.
 */

import React from "react";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";

export function BackIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 12H5M12 19l-7-7 7-7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function HelpIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} />
      <Path
        d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * The green card outline that sits behind the header.
 *
 * Drawn at very low opacity and marked non-interactive: it is the one piece of
 * illustration in the app and it has to stay behind the text rather than
 * compete with it. Taken from the mockup's header artwork.
 */
export function CardWatermark({ color, width = 190 }: { color: string; width?: number }) {
  return (
    <Svg width={width} height={width * 0.6} viewBox="0 0 100 60" fill="none">
      <G stroke={color} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Rect x={3} y={3} width={94} height={54} rx={8} strokeWidth={3} />
        <Rect x={12} y={18} width={22} height={26} rx={3} strokeWidth={2.5} />
        <Circle cx={23} cy={27} r={4.5} strokeWidth={2.5} />
        <Path d="M15 42c0-5 3.5-8.5 8-8.5s8 3.5 8 8.5" strokeWidth={2.5} />
        <Line x1={42} y1={22} x2={80} y2={22} strokeWidth={2.5} />
        <Line x1={42} y1={31} x2={70} y2={31} strokeWidth={2.5} />
        <Line x1={42} y1={40} x2={80} y2={40} strokeWidth={2.5} />
        <Rect x={78} y={9} width={10} height={7} rx={1.5} strokeWidth={2} />
      </G>
      <G fill={color}>
        <Circle cx={14} cy={11} r={1.6} />
        <Circle cx={20} cy={11} r={1.6} />
        <Circle cx={26} cy={11} r={1.6} />
        <Circle cx={32} cy={11} r={1.6} />
        <Circle cx={38} cy={11} r={1.6} />
        <Circle cx={66} cy={40} r={3} />
      </G>
    </Svg>
  );
}

/**
 * The app icon, small, for use as a wordmark lockup next to "GC ETA".
 *
 * Traced from the same geometry as `pipeline/make_icons.py` and the home
 * screen icon: a rounded square, an outline of a card carrying a photo panel
 * and a progress bar with a marker, which is the one detail that says "ETA"
 * rather than "ID card".
 *
 * TRANSPARENT, NOT A TILE. The home screen icon needs its own filled square,
 * because a launcher icon has to be a solid shape. Next to a title on a
 * screen the app already controls the background of, that square just reads
 * as a colour swap between light and dark mode rather than a mark. So this
 * draws only the line art, in one ink colour, on nothing: dark ink on a light
 * screen, light ink on a dark one. `dark` picks the ink; it does not derive it
 * from `theme`, because a logo is an identity mark rather than UI chrome, and
 * it now sits correctly on any background colour the app ever changes to.
 */
export function AppMark({ size = 32, dark = false }: { size?: number; dark?: boolean }) {
  // The two accents from theme.ts, not a plain neutral: the mark stays teal in
  // both modes rather than turning grey at night, which is what "matching"
  // means for a brand mark rather than for UI chrome.
  const ink = dark ? "#5CBFA8" : "#0E6B63";
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G fill="none" stroke={ink} strokeLinecap="round" strokeLinejoin="round">
        <Rect x={8} y={23} width={84} height={54} rx={9} strokeWidth={5} />
        <Rect x={17} y={41} width={22} height={26} rx={3} strokeWidth={4} />
        <Circle cx={28} cy={50} r={4.5} strokeWidth={3.5} />
        <Path d="M20 65c0-5 3.5-8.5 8-8.5s8 3.5 8 8.5" strokeWidth={3.5} />
        <Line x1={47} y1={45} x2={79} y2={45} strokeWidth={4} />
        <Line x1={47} y1={54} x2={70} y2={54} strokeWidth={4} />
        <Line x1={47} y1={63} x2={79} y2={63} strokeWidth={4} strokeOpacity={0.4} />
        <Line x1={47} y1={63} x2={66} y2={63} strokeWidth={4} />
        <Rect x={74} y={30} width={9} height={7} rx={1.5} strokeWidth={3} />
      </G>
      <G fill={ink}>
        <Circle cx={20} cy={33} r={2.2} />
        <Circle cx={27} cy={33} r={2.2} />
        <Circle cx={34} cy={33} r={2.2} />
        <Circle cx={41} cy={33} r={2.2} />
        <Circle cx={48} cy={33} r={2.2} />
        <Circle cx={66} cy={63} r={3.5} />
      </G>
    </Svg>
  );
}

export function ChevronRight({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18l6-6-6-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PauseIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={6} y={4} width={4} height={16} rx={1} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Rect x={14} y={4} width={4} height={16} rx={1} stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

export function CheckIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6L9 17l-5-5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CapitolIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ArrowUpIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 19V5M5 12l7-7 7 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ArrowDownIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M19 12l-7 7-7-7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
