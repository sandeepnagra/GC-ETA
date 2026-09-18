/**
 * How much to trust the date above.
 *
 * Two different things belong here and they are kept apart on purpose.
 *
 * The dial is about THIS case: of the simulated futures the model ran, how many
 * reached the reader's date inside the twenty-five year horizon. It varies
 * enormously, from a few in a hundred for a recent Indian EB-2 date to all of
 * them for a category that is nearly current, which is exactly what makes it
 * worth drawing.
 *
 * The lines underneath are about THE MODEL, and are the same for everyone: what
 * happened when this method was tested against past cases. That number does not
 * belong on a gauge, because a gauge reading 78 for every user is not a gauge.
 *
 * The old dial here showed a risk score out of 100 and was removed after the
 * backtest measured that reading as no better than assuming the cutoff does not
 * move. Nothing on this card is a forecast of direction. One is a count of
 * simulations, the others are measurements of past accuracy.
 */

import React from "react";
import { View } from "react-native";
import type { CaseAssessment } from "@gc-eta/model";

import { Text } from "./Text";
import { Dial } from "./Dial";
import { CARD_MIN_HEIGHT } from "./Card";
import { prettyMonth } from "../data";
import type { Theme } from "../theme";

/**
 * Measured by `npm run backtest` against the published archive. Quoted here so
 * the reader sees the model's record next to its answer, and updated whenever
 * that run changes.
 */
const MEASURED = {
  samples: 393,
  coverage: 78,
  medianErrorYears: 0.8,
};

export function ConfidenceCard({
  theme,
  assessment,
}: {
  theme: Theme;
  assessment: CaseAssessment;
}) {
  const fa = assessment.finalAction;
  const share = fa.crossedFraction;
  const horizon = fa.horizonMonth;

  return (
    <View style={{ minHeight: CARD_MIN_HEIGHT, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", color: theme.secondary }}>
          How sure is this
        </Text>
        <Text style={{ fontSize: 12, color: theme.secondary }}>
          {fa.status === "current" ? "already current" : "4,000 simulations"}
        </Text>
      </View>

      {fa.status === "current" ? (
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
          Your date is current, so there is no waiting time left to estimate. What
          remains is a government decision on your application rather than the bulletin.
        </Text>
      ) : share === undefined ? (
        <Text style={{ fontSize: 14, lineHeight: 20, color: theme.text }}>
          There is not enough published movement in this category to simulate it.
        </Text>
      ) : (
        <Dial
          theme={theme}
          value={share}
          label={
            horizon
              ? `of simulated futures reach your date by ${prettyMonth(horizon)}`
              : "of simulated futures reach your date inside the horizon"
          }
        />
      )}

      <View style={{ height: 1, backgroundColor: theme.border }} />

      <Text style={{ fontSize: 13, lineHeight: 18, color: theme.text }}>
        Tested against {MEASURED.samples} past cases, a range like the one above
        contained the true answer {MEASURED.coverage}% of the time, against the 80%
        intended. The midpoint was out by about {MEASURED.medianErrorYears} years.
      </Text>

      <Text style={{ fontSize: 11, lineHeight: 15, color: theme.secondary }}>
        Over three to six months the model is no more accurate than assuming the cutoff
        does not move at all, so read the direction and the reasoning rather than a
        precise month.
      </Text>
    </View>
  );
}
