import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, StatusBar, View, useColorScheme } from "react-native";
import { useFonts } from "expo-font";
import { assessCase, caseTimeline, compareCategories, suggestSwitch } from "@gc-eta/model";

import { bundledData, prettyMonth } from "./src/data";
import { checkForUpdate, freshness, loadCached } from "./src/updates";
import { FONTS } from "./src/components/Text";
import { CaseScreen } from "./src/screens/CaseScreen";
import { CompareScreen } from "./src/screens/CompareScreen";
import { DisruptionsScreen } from "./src/screens/DisruptionsScreen";
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
    // Empty on purpose. A hardcoded date was a developer's convenience that
    // reached the screen: the app opened on 10 March 2015 and produced a full
    // estimate for a case nobody had entered, which reads as a real answer.
    priorityDate: "",
    path: "adjustment",
  });

  // The data can change while the app is open, so it is state rather than a
  // module constant. Every derived value below depends on it; without that the
  // download would succeed and the estimate would not move until a relaunch.
  const [data, setData] = useState(bundledData);
  const { bundle, events } = data;

  useEffect(() => {
    let live = true;
    void (async () => {
      const cached = await loadCached(bundledData);
      if (live && cached.source !== "bundled") setData(cached);
      const fresher = await checkForUpdate(cached);
      if (live && fresher) setData(fresher);
    })();
    return () => {
      live = false;
    };
  }, []);

  const [fontsLoaded] = useFonts(FONTS);

  const theme = resolveTheme(mode, system ?? null);
  const today = new Date().toISOString().slice(0, 10);

  // NOTHING IS COMPUTED UNTIL THERE IS A DATE TO COMPUTE FROM. Clearing the
  // hardcoded default exposed that every derived value ran on whatever was in
  // the draft, so an empty priority date reached date arithmetic and the app
  // died on launch with "Date value out of bounds". The case screen is the only
  // screen reachable without one.
  const ready = /^\d{4}-\d{2}-\d{2}$/.test(draft.priorityDate);
  const stale = useMemo(() => freshness(bundle), [bundle]);

  // Recomputed only when the case changes. The simulation is seeded, so the
  // same case always yields the same range rather than shifting on each render.
  const assessment = useMemo(
    () => (ready ? assessCase(bundle, events, { ...draft }, today) : null),
    [ready, bundle, events, draft, today],
  );
  const timeline = useMemo(
    () => (ready ? caseTimeline(bundle, events, { ...draft }, today) : []),
    [ready, bundle, events, draft, today],
  );
  // Only EB-2 and EB-3 are comparable this way. EB-1 needs a different petition
  // entirely rather than a re-filing, and EB-4 and EB-5 are not alternatives to
  // either, so offering the comparison there would imply a choice that is not
  // available.
  const comparable = ready && (draft.category === "EB2" || draft.category === "EB3");
  const comparison = useMemo(
    () => (comparable ? compareCategories(bundle, { ...draft }) : null),
    [bundle, draft, comparable],
  );
  const suggestion = useMemo(
    () => (comparison ? suggestSwitch(comparison, bundle, draft.column, draft.category) : null),
    [comparison, bundle, draft.column, draft.category],
  );

  // Held back until the faces are in memory. Every hook above runs first, so
  // the order is identical on both sides of this branch. Rendering through it
  // would show a frame of system font and then reflow the whole screen, which
  // is worse than a moment of the background colour.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.dark ? "light-content" : "dark-content"} backgroundColor={theme.bg} />
      {screen === "case" ? (
        <CaseScreen theme={theme} draft={draft} onChange={setDraft} onSubmit={() => setScreen("results")} />
      ) : screen === "results" && assessment ? (
        <ResultsScreen
          theme={theme}
          draft={draft}
          assessment={assessment}
          onBack={() => setScreen("case")}
          onExplain={() => setScreen("explain")}
          onNews={() => setScreen("news")}
          onCompare={comparison ? () => setScreen("compare") : undefined}
          comparison={comparison}
          suggestion={suggestion}
          events={events}
          onDisruptions={() => setScreen("disruptions")}
          bundle={bundle}
          stale={stale}
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
      ) : screen === "disruptions" && assessment ? (
        <DisruptionsScreen
          theme={theme}
          events={events}
          applicable={assessment.events}
          onBack={() => setScreen("results")}
        />
      ) : screen === "methodology" ? (
        <MethodologyScreen theme={theme} bundle={bundle} events={events} onBack={() => setScreen("explain")} />
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
