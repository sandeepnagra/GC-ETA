/** Step 1: the three inputs that determine everything. */

import React, { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { Text } from "../components/Text";
import DateTimePicker from "@react-native-community/datetimepicker";

import { CATEGORIES, COLUMNS, prettyDate } from "../data";
import type { Theme } from "../theme";
import type { CaseDraft } from "../types";

interface Props {
  theme: Theme;
  draft: CaseDraft;
  onChange: (next: CaseDraft) => void;
  onSubmit: () => void;
}

/** Priority dates run from the early 1990s to today; none can be in the future. */
const EARLIEST = new Date(1990, 0, 1);

// A priority date is a calendar date with no time and no zone. Converting
// through UTC shifts it: parsing "2015-03-10" as UTC midnight and rendering it
// in a timezone behind UTC shows the 9th, and writing it back with
// toISOString() then shifts it again. The picker was visibly one day behind the
// field because of exactly this. Stay in local calendar components throughout.
function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

export function CaseScreen({ theme, draft, onChange, onSubmit }: Props) {
  const [picking, setPicking] = useState(false);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(draft.priorityDate);
  const today = new Date();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 22 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 4 }}>
        <Text display style={{ fontSize: 28, color: theme.accent, letterSpacing: -0.5 }}>
          GC ETA
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 21, color: theme.secondary }}>
          Three things set your column and your place in line.
        </Text>
      </View>

      <Field theme={theme} label="Country of birth" hint="Your birth country sets your column, not your citizenship. Hong Kong, Macau and Taiwan count separately from mainland China.">
        <Chips
          theme={theme}
          options={COLUMNS.map((c) => ({ code: c.code, label: c.label }))}
          selected={draft.column}
          onSelect={(code) => onChange({ ...draft, column: code as CaseDraft["column"], birthCountry: code === "ROW" ? draft.birthCountry : code })}
        />
      </Field>

      <Field
        theme={theme}
        label="Priority date"
        hint="On your I-140 approval notice. For PERM cases it is the day the Labor Department received the PERM, not the day it was certified. Future dates are not selectable."
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            valid
              ? `Priority date, currently ${prettyDate(draft.priorityDate)}. Opens a date picker.`
              : "Priority date, not set yet. Opens a date picker."
          }
          onPress={() => setPicking((open) => !open)}
          style={{
            minHeight: 52, paddingHorizontal: 16, justifyContent: "center",
            backgroundColor: theme.card, borderWidth: 1,
            borderColor: picking ? theme.accent : valid ? theme.border : theme.negative,
            borderRadius: 14,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ flex: 1, fontSize: 17, color: valid ? theme.text : theme.secondary }}>
              {valid ? prettyDate(draft.priorityDate) : "Choose your priority date"}
            </Text>
            <Text style={{ fontSize: 14, color: theme.accent }}>
              {picking ? "Done" : valid ? "Change" : "Choose"}
            </Text>
          </View>
        </Pressable>

        {picking ? (
          <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 14, overflow: "hidden" }}>
            <DateTimePicker
              value={fromIso(draft.priorityDate)}
              mode="date"
              // A spinner beats a calendar grid here: priority dates are often
              // a decade back, and paging a month at a time to reach 2013 is
              // punishing. The spinner jumps by year directly.
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minimumDate={EARLIEST}
              maximumDate={today}
              themeVariant={theme.dark ? "dark" : "light"}
              onChange={(_event, selected) => {
                if (Platform.OS !== "ios") setPicking(false);
                if (selected) onChange({ ...draft, priorityDate: toIso(selected) });
              }}
            />
          </View>
        ) : null}
      </Field>

      <Field theme={theme} label="I-140 category" hint="The classification on your I-140, not the PERM.">
        <Chips
          theme={theme}
          options={CATEGORIES.map((c) => ({ code: c.code, label: c.label }))}
          selected={draft.category}
          onSelect={(category) => onChange({ ...draft, category })}
        />
      </Field>

      <Field theme={theme} label="Where you will finish" hint="Consular cases are affected by interview pauses abroad. Cases inside the US are not.">
        <Chips
          theme={theme}
          options={[
            { code: "adjustment", label: "In the US" },
            { code: "consular", label: "At a consulate" },
          ]}
          selected={draft.path}
          onSelect={(path) => onChange({ ...draft, path: path as CaseDraft["path"] })}
        />
      </Field>

      <Pressable
        accessibilityRole="button"
        disabled={!valid}
        onPress={onSubmit}
        style={{
          height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center",
          backgroundColor: valid ? theme.accent : theme.track,
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: "600", color: valid ? theme.heroText : theme.secondary }}>
          Show my estimate
        </Text>
      </Pressable>
      <Text style={{ fontSize: 12, lineHeight: 17, textAlign: "center", color: theme.secondary }}>
        Nothing you enter leaves this phone. Not legal advice.
      </Text>
    </ScrollView>
  );
}

function Field({
  theme, label, hint, children,
}: { theme: Theme; label: string; hint: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: theme.secondary }}>{label}</Text>
      {children}
      <Text style={{ fontSize: 12, lineHeight: 17, color: theme.secondary }}>{hint}</Text>
    </View>
  );
}

function Chips({
  theme, options, selected, onSelect,
}: {
  theme: Theme;
  options: ReadonlyArray<{ code: string; label: string }>;
  selected: string;
  onSelect: (code: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((option) => {
        const active = option.code === selected;
        return (
          <Pressable
            key={option.code}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(option.code)}
            style={{
              minHeight: 44, paddingHorizontal: 16, justifyContent: "center",
              borderRadius: 22, borderWidth: 1,
              backgroundColor: active ? theme.accent : theme.card,
              borderColor: active ? theme.accent : theme.border,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: active ? "600" : "500", color: active ? theme.heroText : theme.text }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
