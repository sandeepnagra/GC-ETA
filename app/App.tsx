import React, { useMemo, useState } from "react";
import { SafeAreaView, StatusBar, useColorScheme } from "react-native";
import { assessCase, caseTimeline, compareCategories, suggestSwitch } from "@gc-eta/model";

import { bundle, events, prettyMonth } from "./src/data";
import { CaseScreen } from "./src/screens/CaseScreen";
import { CompareScreen } from "./src/screens/CompareScreen";
import { ExplainScreen } from "./src/screens/ExplainScreen";
import { MethodologyScreen } from "./src/screens/MethodologyScreen";
import { NewsScreen } from "./src/screens/NewsScreen";
import { ResultsScreen } from "./src/screens/ResultsScreen";
import { resolveTheme, type ThemeMode } from "./src/theme";
import type { CaseDraft, Screen } from "./src/types";

export default function App() {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");
  const [screen, setScreen] = useState<Screen>("case");
  const [draft, setDraft] = useState<CaseDraft>({
    column: "IN",
    birthCountry: "IN",
    category: "EB2",
    priorityDate: "2015-03-10",
    path: "adjustment",
  });

  const theme = resolveTheme(mode, system ?? null);
  const today = new Date().toISOString().slice(0, 10);

  // Recomputed only when the case changes. The simulation is seeded, so the
  // same case always yields the same range rather than shifting on each render.
  const assessment = useMemo(
    () => assessCase(bundle, events, { ...draft }, today),
    [draft, today],
  );
  const timeline = useMemo(
    () => caseTimeline(bundle, events, { ...draft }, today),
    [draft, today],
  );
  // Only EB-2 and EB-3 are comparable this way. EB-1 needs a different petition
  // entirely rather than a re-filing, and EB-4 and EB-5 are not alternatives to
  // either, so offering the comparison there would imply a choice that is not
  // available.
  const comparable = draft.category === "EB2" || draft.category === "EB3";
  const comparison = useMemo(
    () => (comparable ? compareCategories(bundle, { ...draft }) : null),
    [draft, comparable],
  );
  const suggestion = useMemo(
    () => (comparison ? suggestSwitch(comparison, bundle, draft.column, draft.category) : null),
    [comparison, draft.column, draft.category],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.dark ? "light-content" : "dark-content"} backgroundColor={theme.bg} />
      {screen === "case" ? (
        <CaseScreen theme={theme} draft={draft} onChange={setDraft} onSubmit={() => setScreen("results")} />
      ) : screen === "results" ? (
        <ResultsScreen
          theme={theme}
          draft={draft}
          assessment={assessment}
          onBack={() => setScreen("case")}
          onExplain={() => setScreen("explain")}
          onNews={() => setScreen("news")}
          onCompare={comparison ? () => setScreen("compare") : undefined}
          newsCount={timeline.filter((i) => i.direct).length}
        />
      ) : screen === "compare" && comparison && suggestion ? (
        <CompareScreen
          theme={theme}
          draft={draft}
          comparison={comparison}
          suggestion={suggestion}
          onBack={() => setScreen("results")}
        />
      ) : screen === "methodology" ? (
        <MethodologyScreen theme={theme} onBack={() => setScreen("explain")} />
      ) : screen === "news" ? (
        <NewsScreen theme={theme} items={timeline} onBack={() => setScreen("results")} />
      ) : (
        <ExplainScreen
          theme={theme}
          mode={mode}
          onMode={setMode}
          onBack={() => setScreen("results")}
          onMethodology={() => setScreen("methodology")}
          dataAsOf={prettyMonth(bundle.end_month)}
        />
      )}
    </SafeAreaView>
  );
}
