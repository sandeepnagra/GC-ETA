/**
 * Data, accuracy and limits.
 *
 * The reference sheet behind the plain-language explainer. This is where
 * citations, dates and known weaknesses live, so the explainer can stay
 * readable. Limitations are stated permanently here rather than only surfacing
 * as a caveat when a particular number looks bad.
 */

import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { bundle, events, prettyMonth } from "../data";
import type { Theme } from "../theme";

interface Props {
  theme: Theme;
  onBack: () => void;
}

const LIMITATIONS = [
  {
    title: "It reads movement, not queue depth",
    body:
      "The estimate is built from how fast the cutoff has moved, not from how many people hold each priority date. Where a category once moved quickly because fewer people held those dates, it will lean optimistic. Measuring the queue is the next piece of work.",
  },
  {
    title: "Years are adjusted for supply, but only back to 2021",
    body:
      "An advance made when 281,507 visas were available is discounted to today's smaller pool. Published limits only go back to FY2021; earlier years are left unadjusted rather than assumed, which errs toward longer waits.",
  },
  {
    title: "Measured accuracy, including where it fails",
    body:
      "Tested against 405 historical cases. The range contained the true answer 73% of the time, against a target of 80%, so the bands are a little too narrow. The midpoint was out by about 0.9 years on average.",
  },
  {
    title: "The short-term outlook has no proven edge",
    body:
      "Over six months the model is no more accurate than assuming the cutoff does not move at all, and its odds of becoming current within two years scored no better than a coin flip. Read the direction and the reasoning, not the precise odds.",
  },
  {
    title: "One month is missing from the record",
    body:
      "October 2012 is absent from the government archive with no alternate copy, so the 2013 fiscal year is measured from eleven months.",
  },
];

export function MethodologyScreen({ theme, onBack }: Props) {
  const sectionMonths = Object.keys(bundle.sections ?? {}).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Text style={{ fontSize: 17, color: theme.accent }}>Back</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: theme.text }}>Data and accuracy</Text>
          <Text style={{ fontSize: 12, color: theme.secondary }}>What this is built from, and where it is weak</Text>
        </View>
      </View>

      <Card theme={theme} title="Data in this estimate">
        <Row theme={theme} label="Visa Bulletin" value={prettyMonth(bundle.end_month)} />
        <Row theme={theme} label="Months of history" value={String(bundle.months)} />
        <Row theme={theme} label="Months with category guidance" value={String(sectionMonths)} />
        <Row theme={theme} label="Annual limits known" value={`${Object.keys(bundle.employment_limit_by_fy ?? {}).length} fiscal years`} />
        <Row theme={theme} label="Events reviewed" value={events.last_reviewed} />
        <Row theme={theme} label="Bundle built" value={bundle.generated_at.slice(0, 10)} />
      </Card>

      <Card theme={theme} title="Known limitations">
        {LIMITATIONS.map((item) => (
          <View key={item.title} style={{ gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: theme.text }}>{item.title}</Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: theme.secondary }}>{item.body}</Text>
          </View>
        ))}
      </Card>

      <Card theme={theme} title="Sources">
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
          Department of State Visa Bulletin, monthly, December 2009 to the present.
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
          USCIS employment-based adjustment of status guidance, for annual limits.
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
          Federal Register and agency notices, for the events list.
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 17, color: theme.secondary }}>
          All public government sources. Nothing about your case is sent anywhere; the app
          downloads the same file as every other reader.
        </Text>
      </Card>

      <Text style={{ fontSize: 11, lineHeight: 15, textAlign: "center", color: theme.secondary }}>
        Not affiliated with the U.S. government. Not legal advice.
      </Text>
    </ScrollView>
  );
}

function Card({ theme, title, children }: { theme: Theme; title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ fontSize: 14, color: theme.text, flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: 14, color: theme.secondary }}>{value}</Text>
    </View>
  );
}
