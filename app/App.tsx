import React, { useMemo, useState } from "react";
import { SafeAreaView, StatusBar, useColorScheme } from "react-native";
import { assessCase, caseTimeline } from "@gc-eta/model";

import { bundle, events, prettyMonth } from "./src/data";
import { CaseScreen } from "./src/screens/CaseScreen";
import { ExplainScreen } from "./src/screens/ExplainScreen";
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
          newsCount={timeline.filter((i) => i.direct).length}
        />
      ) : screen === "news" ? (
        <NewsScreen theme={theme} items={timeline} onBack={() => setScreen("results")} />
      ) : (
        <ExplainScreen
          theme={theme}
          mode={mode}
          onMode={setMode}
          onBack={() => setScreen("results")}
          dataAsOf={prettyMonth(bundle.end_month)}
        />
      )}
    </SafeAreaView>
  );
}
