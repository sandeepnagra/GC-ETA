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
 * The carousel says how much there is. A label reads "3 of 6" with the current
 * card's name, so the reader knows the remaining cards exist and what they are,
 * rather than discovering them by accident.
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
 * Arrows sit next to the dots because a horizontal swipe is awkward for anyone
 * with limited dexterity, and because a swipe target inside a vertically
 * scrolling screen is easy to miss.
 */

import React, { useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

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

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous card"
          accessibilityState={{ disabled: current === 0 }}
          onPress={() => goTo(current - 1)}
          hitSlop={12}
        >
          <Text style={{ fontSize: 20, color: current === 0 ? theme.border : theme.accent }}>‹</Text>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          {items.map((item, i) => (
            <View
              key={item.key}
              style={{
                width: i === current ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === current ? theme.accent : theme.border,
              }}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next card"
          accessibilityState={{ disabled: current === items.length - 1 }}
          onPress={() => goTo(current + 1)}
          hitSlop={12}
        >
          <Text
            style={{
              fontSize: 20,
              color: current === items.length - 1 ? theme.border : theme.accent,
            }}
          >
            ›
          </Text>
        </Pressable>

        <Text style={{ flex: 1, textAlign: "right", fontSize: 12, color: theme.secondary }}>
          {current + 1} of {items.length} · {items[current]!.title}
        </Text>
      </View>
    </View>
  );
}
