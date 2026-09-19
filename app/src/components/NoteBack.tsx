/**
 * The back of a card: its note, cut to fit, with a way to the whole thing.
 *
 * The notes run 200 to 280 words and a card back holds roughly ninety, so most
 * are truncated. That is the point rather than a compromise: the back answers
 * "what am I looking at" in the space it has, and anyone who wants the sources
 * and the caveats taps through to the sheet.
 *
 * The caveat leads, and is labelled so it reads as a caveat. It is the line most
 * likely to change what someone does with the number on the front, and it is
 * the first thing a truncated note would otherwise lose. Unlabelled it opened
 * the note as though it were the definition, which for a note whose caveat
 * begins "the record runs from 2013 to May 2023" is a confusing first line.
 */

import React from "react";
import { View } from "react-native";

import { Text } from "./Text";
import { ReadMore } from "./ReadMore";
import { CARD_MIN_HEIGHT } from "./Card";
import type { CardDetail } from "./DetailSheet";
import type { Theme } from "../theme";

export function NoteBack({
  theme,
  detail,
  onReadMore,
}: {
  theme: Theme;
  detail: CardDetail;
  onReadMore: () => void;
}) {
  const body = detail.paragraphs.join("\n\n");

  return (
    <View
      style={{
        minHeight: CARD_MIN_HEIGHT,
        flex: 1,
        backgroundColor: theme.card,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          The note
        </Text>
        <Text style={{ flexShrink: 1, fontSize: 12, color: theme.secondary, textAlign: "right" }}>
          {detail.title}
        </Text>
      </View>

      {detail.caveat ? (
        <View style={{ padding: 10, backgroundColor: theme.bg, borderRadius: 10, gap: 3 }}>
          <Text style={{ fontSize: 10, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
            Worth knowing
          </Text>
          <Text numberOfLines={4} ellipsizeMode="tail" style={{ fontSize: 13, lineHeight: 18, color: theme.text }}>
            {detail.caveat}
          </Text>
        </View>
      ) : null}

      <Text
        numberOfLines={detail.caveat ? 9 : 13}
        ellipsizeMode="tail"
        style={{ fontSize: 14, lineHeight: 20, color: theme.text }}
      >
        {body}
      </Text>

      <ReadMore theme={theme} onPress={onReadMore} />
    </View>
  );
}
