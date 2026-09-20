/** Step 1: the three inputs that determine everything. */

import React, { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { Text } from "../components/Text";
import DateTimePicker from "@react-native-community/datetimepicker";

import { CATEGORIES, COLUMNS, prettyDate } from "../data";
import { AppMark, CardWatermark, MonitorIcon, MoonIcon, SunIcon } from "../components/Icons";
import type { Theme, ThemeMode } from "../theme";
import type { CaseDraft } from "../types";

interface Props {
  theme: Theme;
  draft: CaseDraft;
  onChange: (next: CaseDraft) => void;
  onSubmit: () => void;
  mode: ThemeMode;
  onMode: (mode: ThemeMode) => void;
}

/**
 * The earliest selectable priority date, and today's date is the latest.
 *
 * 1990 was an arbitrary round number with no basis in the data. The earliest
 * live cutoff ever published across the whole bulletin archive, all employment
 * categories and countries, is 22 April 2001 (EB-3 Mexico). No priority date
 * before that has ever been the boundary anyone was waiting behind, so 2000
 * comfortably covers every real case while cutting nine pointless decades off
 * a spinner that already has to reach back a long way.
 */
const EARLIEST = new Date(2000, 0, 1);

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

function fromIso(iso: string, fallback: Date): Date {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return fallback;
  return new Date(year, month - 1, day);
}

export function CaseScreen({ theme, draft, onChange, onSubmit, mode, onMode }: Props) {
  const [picking, setPicking] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(draft.priorityDate);
  // One instant, reused everywhere "today" means something. The picker's
  // value and its own maximumDate used to come from two separate `new Date()`
  // calls a render apart, so the value could sit a few milliseconds ahead of
  // the maximum it was being checked against on every re-render while the
  // picker was open. Native date pickers do not handle a value past their own
  // maximumDate gracefully, and it read as the picker letting a future date
  // through even though the prop looked right.
  const today = new Date();
  const todayIso = toIso(today);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 22 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* The green-card watermark moved here from the results header: this is
          the screen where the user actually fills in the card it depicts,
          rather than a screen they pass through on every visit. */}
      {/* zIndex here, not just on the popover below: React Native stacks flex
          siblings in tree order by default, and the Country field comes right
          after this block, so without it the popover painted underneath the
          chips rather than over them the moment it opened. */}
      <View style={{ position: "relative", zIndex: showAppearance ? 10 : 0 }}>
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: "absolute", right: -12, top: -34, opacity: theme.dark ? 0.09 : 0.06 }}
        >
          <CardWatermark color={theme.accent} width={200} />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <AppMark size={32} dark={theme.dark} />
            <Text display style={{ fontSize: 28, color: theme.accent, letterSpacing: -0.5 }}>
              GC ETA
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change appearance"
            accessibilityState={{ expanded: showAppearance }}
            onPress={() => setShowAppearance((open) => !open)}
            style={{
              width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
              backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
            }}
          >
            {mode === "system" ? (
              <MonitorIcon color={theme.text} />
            ) : mode === "light" ? (
              <SunIcon color={theme.text} />
            ) : (
              <MoonIcon color={theme.text} />
            )}
          </Pressable>
        </View>
        <Text style={{ fontSize: 15, lineHeight: 21, color: theme.secondary, marginTop: 4 }}>
          Three things set your column and your place in line.
        </Text>

        {showAppearance ? (
          <View
            style={{
              position: "absolute", top: 46, left: 0, right: 0, zIndex: 10,
              padding: 14, gap: 10, backgroundColor: theme.card,
              borderWidth: 1, borderColor: theme.border, borderRadius: 16,
              shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
              elevation: 6,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
                Appearance
              </Text>
              <Text style={{ fontSize: 12, color: theme.secondary }}>
                {mode === "system" ? "Following your phone" : mode === "light" ? "Light" : "Dark"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {(["system", "light", "dark"] as const).map((option) => {
                const active = option === mode;
                const Icon = option === "system" ? MonitorIcon : option === "light" ? SunIcon : MoonIcon;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onMode(option);
                      setShowAppearance(false);
                    }}
                    style={{
                      flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                      borderRadius: 10, borderWidth: 1,
                      backgroundColor: active ? theme.accent : theme.bg,
                      borderColor: active ? theme.accent : theme.border,
                    }}
                  >
                    <Icon color={active ? theme.heroText : theme.text} size={16} />
                    <Text style={{ fontSize: 14, fontWeight: active ? "600" : "500", color: active ? theme.heroText : theme.text }}>
                      {option === "system" ? "System" : option === "light" ? "Light" : "Dark"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: 12, lineHeight: 17, color: theme.secondary }}>
              System follows your phone's light or dark setting and changes with it, including on a schedule. Choose Light or Dark to override it just for this app.
            </Text>
          </View>
        ) : null}
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
              value={fromIso(draft.priorityDate, today)}
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
                if (!selected) return;
                // A second, independent guard on the value itself rather than
                // trusting the picker's own maximumDate. String comparison is
                // safe here because both sides are zero-padded YYYY-MM-DD.
                const iso = toIso(selected);
                onChange({ ...draft, priorityDate: iso > todayIso ? todayIso : iso });
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

      {/* Optional, and last, because most people arrive before this stage and a
          required question they cannot answer is worse than no question. */}
      <Field
        theme={theme}
        label="Have you filed Form I-485?"
        hint="Optional. Once it is filed the remaining wait is a USCIS decision rather than the bulletin, which is a different question."
      >
        <Chips
          theme={theme}
          options={[
            { code: "no", label: "Not yet" },
            { code: "yes", label: "Yes, it is pending" },
          ]}
          selected={draft.filedI485 ? "yes" : "no"}
          onSelect={(value) =>
            onChange({
              ...draft,
              filedI485: value === "yes",
              filedOn: value === "yes" ? draft.filedOn : undefined,
            })
          }
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
