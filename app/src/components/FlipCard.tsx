/**
 * A card with a note on its back.
 *
 * Tapping turns the card over. The back carries the note that explains the
 * front, cut off with an ellipsis when it does not fit, and a link that opens
 * the whole thing in a sheet. Swiping to another card turns it back, so a card
 * is never left face-down behind you.
 *
 * WHY TRUNCATE RATHER THAN SCROLL THE BACK. A scrolling back would put a fourth
 * scroll surface inside a pager inside a screen that already scrolls, and the
 * gesture that scrolls it is the gesture that changes card. Cutting the text
 * and pointing at the sheet keeps every gesture meaning one thing.
 *
 * The flip is `rotateY` on two faces with their backs hidden, which is why both
 * are in the tree at once: the back is present and turned away rather than
 * mounted on demand, so the turn has something to reveal. The front stays in
 * normal flow and sets the height; the back fills it.
 */

import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";

const DURATION = 420;

export function FlipCard({
  flipped,
  onToggle,
  front,
  back,
  frontLabel,
}: {
  flipped: boolean;
  onToggle: () => void;
  front: React.ReactNode;
  back: React.ReactNode;
  frontLabel: string;
}) {
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(turn, {
      toValue: flipped ? 1 : 0,
      duration: DURATION,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [flipped, turn]);

  const frontSpin = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backSpin = turn.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: flipped }}
      accessibilityLabel={flipped ? `${frontLabel}. Showing the note. Turn back.` : `${frontLabel}. Turn over for the note.`}
      onPress={onToggle}
    >
      <View>
        <Animated.View
          style={{ backfaceVisibility: "hidden", transform: [{ perspective: 1200 }, { rotateY: frontSpin }] }}
        >
          {front}
        </Animated.View>
        <Animated.View
          // The back is hidden from assistive technology while it faces away,
          // or a screen reader would read both sides of the card at once.
          accessibilityElementsHidden={!flipped}
          importantForAccessibility={flipped ? "auto" : "no-hide-descendants"}
          style={[
            StyleSheet.absoluteFill,
            { backfaceVisibility: "hidden", transform: [{ perspective: 1200 }, { rotateY: backSpin }] },
          ]}
        >
          {back}
        </Animated.View>
      </View>
    </Pressable>
  );
}
