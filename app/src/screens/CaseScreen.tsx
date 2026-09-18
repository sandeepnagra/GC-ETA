/** Step 1: the three inputs that determine everything. */

import React from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { CATEGORIES, COLUMNS } from "../data";
import type { Theme } from "../theme";
import type { CaseDraft } from "../types";

interface Props {
  theme: Theme;
  draft: CaseDraft;
  onChange: (next: CaseDraft) => void;
  onSubmit: () => void;
}

export function CaseScreen({ theme, draft, onChange, onSubmit }: Props) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(draft.priorityDate);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 22 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 28, fontWeight: "700", color: theme.accent, letterSpacing: -0.5 }}>
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
        hint="On your I-140 approval notice. For PERM cases it is the day the Labor Department received the PERM, not the day it was certified."
      >
        <TextInput
          value={draft.priorityDate}
          onChangeText={(priorityDate) => onChange({ ...draft, priorityDate })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.secondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            height: 52, paddingHorizontal: 16, fontSize: 17, color: theme.text,
            backgroundColor: theme.card, borderWidth: 1,
            borderColor: valid ? theme.border : theme.negative, borderRadius: 14,
          }}
        />
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
