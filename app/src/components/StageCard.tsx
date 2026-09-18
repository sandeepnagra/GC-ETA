/**
 * Where a filed case actually is.
 *
 * Once Form I-485 is filed the bulletin stops being the thing standing in the
 * way, and the app's headline question stops being the reader's question. This
 * card answers the one they now have: what has happened, what is happening, and
 * what is left.
 *
 * IT DOES NOT ESTIMATE THE DECISION. Doing that needs USCIS processing-time
 * data, which is published as service-centre ranges rather than a distribution
 * and has not been assessed here. Printing a date from it would be inventing
 * the one number on this card that the reader cares about most. The stage is
 * marked as pending and the reason is stated.
 */

import React from "react";
import { View } from "react-native";
import type { CaseAssessment } from "@gc-eta/model";

import { Text } from "./Text";
import { CARD_MIN_HEIGHT } from "./Card";
import { CheckIcon } from "./Icons";
import { prettyDate, prettyMonth } from "../data";
import type { Theme } from "../theme";
import type { CaseDraft } from "../types";

type State = "done" | "now" | "waiting";

interface Stage {
  label: string;
  when: string;
  state: State;
}

function monthsSince(iso: string): number | null {
  const then = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((Date.now() - then) / (1000 * 60 * 60 * 24 * 30.44)));
}

export function StageCard({
  theme,
  draft,
  assessment,
}: {
  theme: Theme;
  draft: CaseDraft;
  assessment: CaseAssessment;
}) {
  const current = assessment.finalAction.status === "current";
  const pending = draft.filedOn ? monthsSince(draft.filedOn) : null;

  const stages: Stage[] = [
    {
      label: "Filed",
      when: draft.filedOn ? prettyDate(draft.filedOn) : "date not given",
      state: "done",
    },
    {
      label: "Date became current",
      when: current
        ? assessment.standing.since
          ? prettyMonth(assessment.standing.since)
          : "now"
        : "not yet",
      state: current ? "done" : "waiting",
    },
    {
      label: "In line among current cases",
      when: current ? "now" : "once current",
      state: current ? "now" : "waiting",
    },
    {
      label: "Decision",
      when: "not estimated",
      state: "waiting",
    },
  ];

  return (
    <View style={{ minHeight: CARD_MIN_HEIGHT, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          Your I-485
        </Text>
        <Text style={{ fontSize: 12, color: theme.secondary }}>
          {pending !== null ? `Pending ${pending} month${pending === 1 ? "" : "s"}` : "Pending"}
        </Text>
      </View>

      <View>
        {stages.map((stage, i) => {
          const last = i === stages.length - 1;
          const filled = stage.state === "done";
          const ringed = stage.state === "now";
          return (
            <View key={stage.label} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
              <View style={{ width: 22, alignItems: "center" }}>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: filled ? theme.accent : theme.card,
                    borderWidth: filled ? 0 : 2,
                    borderColor: ringed ? theme.accent : theme.border,
                    borderStyle: ringed || filled ? "solid" : "dashed",
                  }}
                >
                  {filled ? <CheckIcon color={theme.card} size={12} /> : null}
                </View>
                {!last ? (
                  <View style={{ width: 2, height: 22, backgroundColor: filled ? theme.accent : theme.border }} />
                ) : null}
              </View>
              <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: "600", color: theme.text }}>
                  {stage.label}
                </Text>
                <Text style={{ flexShrink: 0, fontSize: 14, lineHeight: 20, color: theme.secondary }}>
                  {stage.when}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, lineHeight: 17, color: theme.secondary }}>
          The decision is not estimated. That needs USCIS processing-time data, which is
          published as service-centre ranges rather than a distribution, and it has not
          been checked closely enough here to put a date on your case.
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 17, color: theme.secondary }}>
          A pending application stays alive if your date retrogresses. It waits rather
          than failing, so keep the work permit and travel document renewed.
        </Text>
      </View>
    </View>
  );
}
