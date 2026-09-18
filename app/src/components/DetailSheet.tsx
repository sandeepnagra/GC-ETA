/**
 * The long note behind a card.
 *
 * The cards are deliberately short, and shortness costs something: the queue
 * count rests on a million labour certifications with real gaps in them, and a
 * caption cannot carry that. Rather than lengthen every card until none of them
 * fit, the working goes here and the card links to it.
 *
 * It is a sheet rather than a screen because it is an aside. The reader has not
 * left their estimate, and closing returns them to the exact card they were on.
 */

import React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "./Text";
import type { Theme } from "../theme";

export interface CardDetail {
  title: string;
  paragraphs: string[];
  /** Where the numbers come from, named so they can be checked. */
  sources?: string;
  /** What the reader should hold against it. */
  caveat?: string;
}

function CloseIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function DetailSheet({
  theme,
  detail,
  onClose,
}: {
  theme: Theme;
  detail: CardDetail | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={detail !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={{ flex: 1, backgroundColor: "rgba(28,27,24,0.45)", justifyContent: "flex-end" }}>
        {/* Tapping the dimmed area closes, which is what a sheet is expected to do. */}
        <Pressable accessibilityLabel="Close" accessibilityRole="button" style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 12,
            paddingHorizontal: 20,
            paddingBottom: 28,
            maxHeight: "86%",
            gap: 14,
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: "center" }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <Text display style={{ flex: 1, fontSize: 24, color: theme.text, letterSpacing: -0.3 }}>
              {detail?.title ?? ""}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={{ width: 44, height: 44, marginRight: -10, alignItems: "center", justifyContent: "center", borderRadius: 22 }}
            >
              <CloseIcon color={theme.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
            {detail?.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={{ fontSize: 15, lineHeight: 22, color: theme.text }}>
                {paragraph}
              </Text>
            ))}

            {detail?.caveat ? (
              <View style={{ flexDirection: "row", gap: 10, padding: 12, backgroundColor: theme.bg, borderRadius: 12 }}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" style={{ marginTop: 2 }}>
                  <Path
                    d="M12 22a10 10 0 100-20 10 10 0 000 20zM12 16v-4M12 8h.01"
                    stroke={theme.secondary}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
                <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: theme.secondary }}>
                  {detail.caveat}
                </Text>
              </View>
            ) : null}

            {detail?.sources ? (
              <Text style={{ fontSize: 12, lineHeight: 17, color: theme.secondary }}>
                Sources: {detail.sources}
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
