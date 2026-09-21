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
 * you are on. At default text size every card now reaches the same minimum
 * height, so the track holds still and this does nothing; at accessibility
 * sizes the cards grow by different amounts and it earns its keep again. A first attempt sized it to the tallest card, which is simpler
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
 * The link to a card's full note is not here. It used to sit above the track and
 * only appeared for cards that had one, so swiping between them moved the card
 * up and down. It is inside each card now, anchored to the bottom, where the
 * uniform height keeps it in one place.
 *
 * The pills are 32 points tall, as drawn, with hit slop taking the real touch
 * target past the 44 points iOS asks for. A tappable label also solves what the
 * arrows were there for: a horizontal swipe inside a vertically scrolling
 * screen is awkward to start and easy to miss.
 */

import React, { useEffect, useRef, useState } from "react";
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
import type { CardDetail } from "./DetailSheet";
import { FlipCard } from "./FlipCard";
import { NoteBack } from "./NoteBack";

/** Matches the results screen's horizontal padding. */
const PAGE_PADDING = 20;
const GAP = 12;

export interface CarouselItem {
  key: string;
  /** Shown on the pill, so it has to be short. */
  title: string;
  node: React.ReactNode;
  /** The long note, when this card has working worth showing. */
  detail?: CardDetail;
}

export function CardCarousel({
  theme,
  items,
  onOpenDetail,
  initialFlipped,
}: {
  theme: Theme;
  items: CarouselItem[];
  onOpenDetail?: (detail: CardDetail) => void;
  /** QA harness only: the key of the card to render face-down on mount. */
  initialFlipped?: string;
}) {
  const { width } = useWindowDimensions();
  const pageWidth = Math.max(240, width - PAGE_PADDING * 2);
  const stride = pageWidth + GAP;

  const scroller = useRef<ScrollView>(null);
  const tabs = useRef<ScrollView>(null);
  /** Where each pill sits, so the strip can follow the selection. */
  const offsets = useRef<Array<{ x: number; w: number } | undefined>>([]);
  /** The strip's own viewport and where it is scrolled to. */
  const [stripWidth, setStripWidth] = useState(0);
  const stripX = useRef(0);
  /**
   * Bumped whenever a pill reports its position.
   *
   * Without it the reveal could run before any pill had been measured, find
   * nothing to scroll to, and never run again, because neither the index nor
   * the strip width changed afterwards. That is why the selected pill
   * sometimes stayed clipped no matter which card was showing.
   */
  const [measured, setMeasured] = useState(0);
  /** Only one card is ever face-down, and only the one being looked at. */
  const [flipped, setFlipped] = useState<string | null>(initialFlipped ?? null);
  // QA harness only: land on the flipped card's own page, not page 0. Without
  // this the seeded flip was invisible, since the pager still opened on
  // whichever card sorts first and the flipped one sat off-screen.
  const [index, setIndex] = useState(() =>
    initialFlipped ? Math.max(0, items.findIndex((item) => item.key === initialFlipped)) : 0,
  );
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

  // Set while a tap is driving an animated jump to a known target, so onScroll
  // (below) knows not to touch the index until it arrives. Without this, a tap
  // that jumps several cards away animates smoothly through every page in
  // between, and each of those intermediate pages briefly became "the" index,
  // flashing across the pill row before landing on the one actually tapped.
  const jumping = useRef(false);

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, next));
    jumping.current = true;
    setIndex(clamped);
    scroller.current?.scrollTo({ x: clamped * stride, animated: true });
  };

  /**
   * Bring the selected pill fully into view, moving as little as possible.
   *
   * Two things were wrong before. It ran from the swipe and tap handlers rather
   * than from the selection itself, so a swipe that did not produce a momentum
   * event left the strip where it was and the pill stayed clipped at the right
   * edge. And when it did run it always left-aligned the pill, which for one
   * near the end of the strip scrolled past it and clipped it at the LEFT edge
   * instead. Driving it from the index means it runs however the selection
   * changed, and scrolling only far enough to uncover the pill keeps both ends
   * of the strip reachable.
   */
  // Turning a card over then swiping away would leave it face-down behind you.
  // Skipped on the very first run: this effect fires on mount like any other,
  // and without the guard it would immediately clear a QA-seeded initial flip
  // before a screenshot ever saw it.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setFlipped(null);
  }, [index]);

  // QA harness only: land the pager on the flipped card's own page. The
  // `contentOffset` prop below is a best-effort first paint, but RN silently
  // drops it on iOS when it fires before the native scroll view has measured
  // its content, which is exactly the case here since the page width depends
  // on a layout pass. An explicit scrollTo once after mount is what actually
  // works; `animated: false` keeps it invisible in a screenshot taken after
  // launch rather than showing a stray swipe.
  useEffect(() => {
    if (initialFlipped && index > 0) {
      scroller.current?.scrollTo({ x: index * stride, animated: false });
    }
    // Intentionally mount-only: re-running this on every stride change would
    // fight the reader's own scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const at = offsets.current[index];
    if (!at || stripWidth <= 0) return;
    const pad = 12;
    const from = stripX.current;
    let target = from;
    if (at.x - pad < from) target = at.x - pad;
    else if (at.x + at.w + pad > from + stripWidth) target = at.x + at.w + pad - stripWidth;
    target = Math.max(0, target);
    if (Math.abs(target - from) > 1) {
      stripX.current = target;
      tabs.current?.scrollTo({ x: target, animated: true });
    }
  }, [index, stripWidth, measured, items.length]);

  const nearestIndex = (x: number) => Math.max(0, Math.min(items.length - 1, Math.round(x / stride)));

  // The pill row used to learn which page was showing only from
  // onMomentumScrollEnd, which fires once, after the whole fling has finished
  // decelerating. A fast swipe across several cards left the pill frozen on
  // the card the reader started from for as long as the deceleration took,
  // sometimes the better part of a second, then jumped straight to the final
  // one. Updating it from onScroll too means it tracks the page actually
  // under the reader's finger throughout the gesture, the way a page
  // indicator normally does, rather than only after the gesture ends.
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    setOffset(x);
    if (!jumping.current) {
      setIndex(nearestIndex(x));
    }
  };

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    setOffset(x);
    setIndex(nearestIndex(x));
    jumping.current = false;
  };

  return (
    <View style={{ gap: 10 }}>
      <ScrollView
        ref={tabs}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}
        onScroll={(event) => {
          stripX.current = event.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={32}
        contentContainerStyle={{ gap: 6, paddingRight: 12 }}
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
                const had = offsets.current[i];
                offsets.current[i] = { x, w };
                if (!had || had.x !== x || had.w !== w) setMeasured((n) => n + 1);
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
        contentOffset={{ x: index * stride, y: 0 }}
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
            {item.detail && onOpenDetail ? (
              <FlipCard
                flipped={flipped === item.key}
                onToggle={() => setFlipped((k) => (k === item.key ? null : item.key))}
                frontLabel={item.title}
                front={item.node}
                back={
                  <NoteBack
                    theme={theme}
                    detail={item.detail}
                    onReadMore={() => onOpenDetail(item.detail!)}
                  />
                }
              />
            ) : (
              item.node
            )}
          </View>
        ))}
      </ScrollView>

    </View>
  );
}
