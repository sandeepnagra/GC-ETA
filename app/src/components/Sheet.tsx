/**
 * The sheet everything that is not a screen opens in.
 *
 * Three things used to arrive three different ways: the card note slid up as a
 * sheet, while the disruption register and the category comparison replaced the
 * whole screen and needed a back button. They are the same kind of thing, an
 * aside from the estimate, and arriving differently made them feel like
 * different depths of the app when they are not.
 *
 * Slides up, dims what is behind it, and closes on the backdrop, the button or
 * the system back gesture. The reader has not left their estimate: it is still
 * visible behind the dim, and closing puts them exactly where they were.
 */

import React from "react";
import { Modal, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "./Text";
import type { Theme } from "../theme";

function CloseIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Sheet({
  theme,
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  theme: Theme;
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={{ flex: 1, backgroundColor: "rgba(28,27,24,0.45)", justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 12,
            maxHeight: "88%",
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: "center" }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 10 }}>
            <View style={{ flex: 1, gap: 1 }}>
              <Text display style={{ fontSize: 24, color: theme.text, letterSpacing: -0.3 }}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={{ fontSize: 12, color: theme.secondary }}>{subtitle}</Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={{ width: 44, height: 44, marginRight: -10, alignItems: "center", justifyContent: "center", borderRadius: 22 }}
            >
              <CloseIcon color={theme.text} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}
