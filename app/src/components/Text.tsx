/**
 * Text in the project's typefaces.
 *
 * REACT NATIVE DOES NOT PICK A WEIGHT FROM A CUSTOM FAMILY. With the system
 * font, `fontWeight: "600"` gets you semibold. With a custom family, iOS keeps
 * the one face it was given and either ignores the weight or synthesises a
 * smeared fake bold. Each weight is a separate registered family, so the weight
 * has to be resolved into a family name here, once, rather than at 37 call
 * sites.
 *
 * So every screen imports `Text` from this file instead of from react-native,
 * keeps writing `fontWeight` exactly as before, and gets the right face. The
 * weight is then stripped from the style it passes down, because leaving it
 * beside a custom family is what triggers the synthetic bold.
 *
 * `display` switches to Fraunces, the serif, for the few places the design uses
 * it: the headline estimate and the large numbers. Everything else is IBM Plex
 * Sans, which is what the mockup specified and what a screen full of dates and
 * counts needs.
 */

import React from "react";
import { StyleSheet, Text as NativeText, type TextProps, type TextStyle } from "react-native";

/**
 * Loaded once at start-up, and vendored rather than taken from the
 * `@expo-google-fonts` packages.
 *
 * Those packages ship every weight and every italic. With Expo bundling all
 * assets, that put 32 font files and 4.5 MB into a 37 MB app to use four of
 * them. Copying the four in is 736 KB, removes two dependencies, and makes it
 * obvious at a glance which faces the app actually has. Both families are under
 * the SIL Open Font License and its terms require the licence to travel with
 * the fonts, so both licence files sit beside them in assets/fonts.
 */
export const FONTS = {
  IBMPlexSans_400Regular: require("../../assets/fonts/IBMPlexSans_400Regular.ttf"),
  IBMPlexSans_600SemiBold: require("../../assets/fonts/IBMPlexSans_600SemiBold.ttf"),
  IBMPlexSans_700Bold: require("../../assets/fonts/IBMPlexSans_700Bold.ttf"),
  Fraunces_700Bold: require("../../assets/fonts/Fraunces_700Bold.ttf"),
};

const BODY: Record<string, string> = {
  "400": "IBMPlexSans_400Regular",
  "500": "IBMPlexSans_600SemiBold",
  "600": "IBMPlexSans_600SemiBold",
  "700": "IBMPlexSans_700Bold",
  "800": "IBMPlexSans_700Bold",
  "900": "IBMPlexSans_700Bold",
  bold: "IBMPlexSans_700Bold",
  normal: "IBMPlexSans_400Regular",
};

export interface Props extends TextProps {
  /** Fraunces, the serif, for headline figures. */
  display?: boolean;
}

export function Text({ display, style, ...rest }: Props) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const { fontWeight, ...withoutWeight } = flat;
  const family = display
    ? "Fraunces_700Bold"
    : (BODY[String(fontWeight ?? "400")] ?? BODY["400"]!);
  return (
    <NativeText
      {...rest}
      // Android reserves extra space above and below every line for accent
      // marks a Latin font never uses, which iOS does not do at all. Left at
      // its default, a pill or chip sized to fit the text on iOS shows a
      // visible gap above and below the same text on Android. One place to
      // turn it off, since every screen already renders text through here.
      style={[withoutWeight, { fontFamily: family, includeFontPadding: false }]}
    />
  );
}
