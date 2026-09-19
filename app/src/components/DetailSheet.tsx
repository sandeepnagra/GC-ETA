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
import { ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Sheet } from "./Sheet";

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
    <Sheet theme={theme} visible={detail !== null} title={detail?.title ?? ""} onClose={onClose}>
      <ScrollView contentContainerStyle={{ gap: 14, padding: 20, paddingTop: 14, paddingBottom: 32 }}>
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
    </Sheet>
  );
}
