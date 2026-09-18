import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { applicableEvents, staleEvents } from "../src/events.js";
import { assessCase } from "../src/assess.js";
import { caseTimeline } from "../src/news.js";
import type { Bundle, EventsFile } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string) =>
  JSON.parse(readFileSync(resolve(here, `../../../data/${name}`), "utf8"));
const events = read("events.json") as EventsFile;
const bundle = read("app-bundle.json") as Bundle;
const TODAY = "2026-09-17";

const ids = (list: ReturnType<typeof applicableEvents>) => list.map((a) => a.event.id);
const find = (list: ReturnType<typeof applicableEvents>, id: string) =>
  list.find((a) => a.event.id === id);

test("the worldwide interview pause blocks a consular case", () => {
  const list = applicableEvents(events, {
    birthCountry: "IN", category: "EB2", path: "consular", onDate: TODAY,
  });
  const pause = find(list, "dos-worldwide-iv-interview-pause-2026");
  assert.ok(pause);
  assert.equal(pause!.relevance, "blocks");
  assert.equal(pause!.activeNow, true);
});

test("the same pause is context, not a blocker, for an adjustment case", () => {
  const list = applicableEvents(events, {
    birthCountry: "IN", category: "EB2", path: "adjustment", onDate: TODAY,
  });
  const pause = find(list, "dos-worldwide-iv-interview-pause-2026");
  assert.ok(pause);
  assert.equal(pause!.relevance, "context");
  assert.match(pause!.why, /moves the visa numbers/);
});

test("the public charge rule reads as upcoming on the day before it takes effect", () => {
  const before = find(
    applicableEvents(events, { birthCountry: "IN", category: "EB2", path: "adjustment", onDate: "2026-09-17" }),
    "dhs-public-charge-rule-2026",
  );
  assert.equal(before!.upcoming, true);
  assert.equal(before!.activeNow, false);

  const after = find(
    applicableEvents(events, { birthCountry: "IN", category: "EB2", path: "adjustment", onDate: "2026-09-18" }),
    "dhs-public-charge-rule-2026",
  );
  assert.equal(after!.activeNow, true);
  assert.equal(after!.relevance, "blocks");
});

test("a travel ban matches on birth country, not the bulletin column", () => {
  // Nigeria sits inside the Rest of World column, so matching on the column
  // would wrongly tell this applicant that no ban applies.
  const nigerian = applicableEvents(events, {
    birthCountry: "NG", category: "EB2", path: "consular", onDate: TODAY,
  });
  assert.ok(ids(nigerian).includes("proclamation-10998-travel-ban-expansion"));

  const indian = applicableEvents(events, {
    birthCountry: "IN", category: "EB2", path: "consular", onDate: TODAY,
  });
  assert.ok(!ids(indian).includes("proclamation-10998-travel-ban-expansion"));
  assert.ok(!ids(indian).includes("proclamation-10949-travel-ban"));
});

test("an incomplete country list is surfaced rather than silently excluding someone", () => {
  const list = applicableEvents(events, {
    birthCountry: "IN", category: "EB2", path: "consular", onDate: TODAY,
  });
  const partial = find(list, "dos-iv-pause-75-countries-2026");
  assert.ok(partial, "kept despite no country match, because the list is flagged incomplete");
  assert.equal(partial!.relevance, "context");
  assert.match(partial!.why, /not fully recorded/);
});

test("category-scoped events do not leak to other categories", () => {
  const eb2 = ids(applicableEvents(events, {
    birthCountry: "IN", category: "EB2", path: "adjustment", onDate: TODAY,
  }));
  assert.ok(!eb2.includes("eb4-religious-worker-sunset-2026"));

  const crw = ids(applicableEvents(events, {
    birthCountry: "IN", category: "EB4_CERTAIN_RELIGIOUS_WORKERS", path: "adjustment", onDate: TODAY,
  }));
  assert.ok(crw.includes("eb4-religious-worker-sunset-2026"));
});

test("blockers are ordered ahead of context", () => {
  const list = applicableEvents(events, {
    birthCountry: "IN", category: "EB2", path: "consular", onDate: "2026-09-18",
  });
  const firstContext = list.findIndex((a) => a.relevance === "context");
  const lastBlock = list.map((a) => a.relevance).lastIndexOf("blocks");
  if (firstContext >= 0 && lastBlock >= 0) assert.ok(lastBlock < firstContext);
});

test("no tracked event is stale as of the review date", () => {
  assert.equal(staleEvents(events, TODAY).length, 0);
});

test("assessCase returns both charts, a risk read and events", () => {
  const result = assessCase(bundle, events, {
    birthCountry: "IN", column: "IN", category: "EB2",
    priorityDate: "2015-03-10", path: "adjustment",
  }, TODAY);
  assert.equal(result.asOfMonth, "2026-09");
  assert.equal(result.finalAction.status, "not_current");
  assert.ok(result.filing.status.length > 0);
  assert.ok(result.risk.score >= 0);
  assert.ok(result.events.length > 0);
  assert.ok(
    result.warnings.some((w) => w.includes("optimistic")),
    "the known optimism in the low end is surfaced, not hidden",
  );
});

test("a negligible supply draw is never shown as a direct blocker", () => {
  // The Gold Card draws on EB-1 and EB-2 but has produced one approval. It
  // belongs in context, not in the list of things stopping this case.
  for (const path of ["adjustment", "consular"] as const) {
    const gold = find(
      applicableEvents(events, { birthCountry: "IN", category: "EB2", path, onDate: TODAY }),
      "gold-card-eb1-eb2",
    );
    assert.ok(gold);
    assert.equal(gold!.relevance, "context", `${path} should not be blocked by a supply draw`);
  }
});

test("only pauses, bans and adjudication standards can block", () => {
  const list = applicableEvents(events, {
    birthCountry: "NG", category: "EB2", path: "consular", onDate: "2026-09-18",
  });
  for (const item of list.filter((a) => a.relevance === "blocks")) {
    assert.ok(
      ["consular_pause", "adjudication_pause", "adjudication_standard", "entry_ban", "category_sunset"]
        .includes(item.event.type),
      `${item.event.id} of type ${item.event.type} should not block`,
    );
  }
});

test("the timeline is ordered newest first and always includes the bulletin", () => {
  const items = caseTimeline(bundle, events, {
    birthCountry: "IN", column: "IN", category: "EB2",
    priorityDate: "2015-03-10", path: "adjustment",
  }, TODAY);
  assert.ok(items.length > 1);
  for (let i = 1; i < items.length; i += 1) {
    assert.ok(items[i - 1]!.date >= items[i]!.date, "newest first");
  }
  assert.ok(items.some((i) => i.id.startsWith("bulletin-")));
});

test("timeline items say what they mean for this reader, not just what happened", () => {
  const consular = caseTimeline(bundle, events, {
    birthCountry: "IN", column: "IN", category: "EB2",
    priorityDate: "2015-03-10", path: "consular",
  }, TODAY);
  const pause = consular.find((i) => i.id === "dos-worldwide-iv-interview-pause-2026");
  assert.ok(pause);
  assert.equal(pause!.direct, true);
  assert.equal(pause!.tone, "adverse");

  const adjusting = caseTimeline(bundle, events, {
    birthCountry: "IN", column: "IN", category: "EB2",
    priorityDate: "2015-03-10", path: "adjustment",
  }, TODAY);
  const samePause = adjusting.find((i) => i.id === "dos-worldwide-iv-interview-pause-2026");
  assert.equal(samePause!.direct, false, "the same event reads differently by route");
  assert.match(samePause!.meaning, /behind you/);
});

test("a court defeat for a restriction reads as favourable", () => {
  const items = caseTimeline(bundle, events, {
    birthCountry: "IN", column: "IN", category: "EB2",
    priorityDate: "2015-03-10", path: "consular",
  }, TODAY, 30);
  const vacated = items.find((i) => i.id === "dos-iv-pause-75-countries-2026");
  assert.equal(vacated!.tone, "favourable");
});

test("every timeline item carries a confidence flag", () => {
  const items = caseTimeline(bundle, events, {
    birthCountry: "NG", column: "ROW", category: "EB2",
    priorityDate: "2021-01-01", path: "consular",
  }, TODAY, 30);
  for (const item of items) {
    assert.ok(["verified", "secondary"].includes(item.confidence), item.id);
  }
});
