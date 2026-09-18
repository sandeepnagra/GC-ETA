/**
 * A paged carousel for the detail cards.
 *
 * The brief for this screen was to make a dense page less overwhelming without
 * eliminating or hiding any information, which is a real tension: a carousel
 * shows one card at a time, and anything not on screen is, strictly, hidden.
 * Three things resolve it.
 *
 * The answer never moves. The estimate, the two chart tiles and the action
 * buttons stay outside the carousel, so the thing the user came for is always
 * visible and the carousel only holds supporting detail.
 *
 * The carousel names every card. A row of pills above the cards, one per card,
 * is what the design specifies and it is strictly better than the dots that
 * were here first: dots say how many cards exist, pills say what they are and
 * let the reader go straight to the one they want instead of swiping past
 * three. Nothing is hidden behind an anonymous marker.
 *
 * It never clips, and it does not pad. The track follows the height of the page
 * you are on. A first attempt sized it to the tallest card, which is simpler
 * and looked broken on a device: the people-ahead card is three times the
 * height of the drivers card, so every other page sat above seven hundred
 * points of blank and the dots were pushed off screen entirely.
 *
 * Following the page height means the track has to resize mid-swipe, while two
 * pages are both partly visible. Resizing at the end of the gesture would clip
 * the incoming card until it settled. So the height tracks the taller of the
 * two pages being straddled, recomputed as the scroll moves, which never clips
 * and never leaves a gap once the gesture finishes.
 *
 * The pills are 32 points tall, as drawn, with hit slop taking the real touch
 * target past the 44 points iOS asks for. A tappable label also solves what the
 * arrows were there for: a horizontal swipe inside a vertically scrolling
 * screen is awkward to start and easy to miss.
 */

import React, { useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { Text } from "./Text";

import type { Theme } from "../theme";

/** Matches the results screen's horizontal padding. */
const PAGE_PADDING = 20;
const GAP = 12;

export interface CarouselItem {
  key: string;
  /** Shown in the "3 of 6" label, so it has to be short. */
  title: string;
  node: React.ReactNode;
}

export function CardCarousel({ theme, items }: { theme: Theme; items: CarouselItem[] }) {
  const { width } = useWindowDimensions();
  const pageWidth = Math.max(240, width - PAGE_PADDING * 2);
  const stride = pageWidth + GAP;

  const scroller = useRef<ScrollView>(null);
  const tabs = useRef<ScrollView>(null);
  /** Where each pill sits, so the strip can follow the selection. */
  const offsets = useRef<Array<{ x: number; w: number } | undefined>>([]);
  const [index, setIndex] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);
  const [offset, setOffset] = useState(0);

  // Derived, not stored. An earlier version kept the height in its own state
  // and set it from inside a setHeights updater, which React is free to call
  // more than once and which must not have side effects. The track silently
  // kept the tallest height it had ever seen, which is exactly the bug the
  // page-height behaviour was meant to fix.
  const position = stride > 0 ? offset / stride : 0;
  const lower = Math.max(0, Math.floor(position));
  const upper = Math.min(items.length - 1, Math.ceil(position));
  const height = Math.max(heights[lower] ?? 0, heights[upper] ?? 0);

  if (items.length === 0) return null;
  const current = Math.min(index, items.length - 1);

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, next));
    setIndex(clamped);
    scroller.current?.scrollTo({ x: clamped * stride, animated: true });
    revealTab(clamped);
  };

  /** Keep the selected pill on screen when the strip is wider than the phone. */
  const revealTab = (i: number) => {
    const at = offsets.current[i];
    if (!at) return;
    tabs.current?.scrollTo({ x: Math.max(0, at.x - 12), animated: true });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setOffset(event.nativeEvent.contentOffset.x);
  };

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    setOffset(x);
    setIndex(Math.max(0, Math.min(items.length - 1, Math.round(x / stride))));
  };

  return (
    <View style={{ gap: 10 }}>
      <ScrollView
        ref={tabs}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingRight: 4 }}
      >
        {items.map((item, i) => {
          const on = i === current;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${item.title}, card ${i + 1} of ${items.length}`}
              onPress={() => goTo(i)}
              hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
              onLayout={(event) => {
                const { x, width: w } = event.nativeEvent.layout;
                offsets.current[i] = { x, w };
              }}
              style={{
                height: 32,
                paddingHorizontal: 12,
                justifyContent: "center",
                borderRadius: 16,
                borderWidth: 1,
                backgroundColor: on ? theme.text : theme.card,
                borderColor: on ? theme.text : theme.border,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: on ? "600" : "400",
                  color: on ? theme.bg : theme.text,
                }}
              >
                {item.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={stride}
        snapToAlignment="start"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={{ gap: GAP, alignItems: "flex-start" }}
        style={height > 0 ? { height } : undefined}
      >
        {items.map((item, i) => (
          <View
            key={item.key}
            style={{ width: pageWidth }}
            accessible={false}
            accessibilityLabel={`${item.title}, card ${i + 1} of ${items.length}`}
            onLayout={(event) => {
              const measured = event.nativeEvent.layout.height;
              setHeights((previous) => {
                if (previous[i] === measured) return previous;
                const next = [...previous];
                next[i] = measured;
                return next;
              });
            }}
          >
            {item.node}
          </View>
        ))}
      </ScrollView>

    </View>
  );
}
