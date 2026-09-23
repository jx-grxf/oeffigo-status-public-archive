import assert from "node:assert/strict";
import { test } from "node:test";

import { advanceAlerts, configuredChannels } from "./alert-delivery.ts";
import {
  CONFIRM,
  evaluateAlerts,
  formatAlert,
  formatWelcome,
  readSignals,
} from "./alerts.ts";

const start = Date.parse("2026-09-11T08:00:00Z");
const minute = (n) => start + n * 60_000;
const entry = (id, status = "operational") => ({
  id,
  name: id.toUpperCase(),
  status,
  detail: `${id} detail`,
});
const report = (overrides = {}) => ({
  components: [entry("api"), entry("wiener_linien")],
  router: [entry("vao"), entry("mgate")],
  sources: [entry("vao"), entry("wiener_linien"), entry("traffic", "standby")],
  predictionDelivery: { state: "idle", reason: "no_recent_demand" },
  ...overrides,
});
const input = (overrides = {}) => ({
  healthFailures: 0,
  websiteFailures: 0,
  databaseFailures: 0,
  reportFresh: true,
  staleChecks: 0,
  report: report(),
  ...overrides,
});
/** One component over time, either the product's own or a data pipeline. */
const component = (id, status) =>
  input({
    report: { components: [entry(id, status)], router: [], sources: [] },
  });

function session(memory = {}) {
  const events = [];
  return {
    get memory() {
      return memory;
    },
    events,
    /** Applies the same reading for `count` checks, one per minute from `from`. */
    hold(reading, from, count = 1) {
      for (let i = 0; i < count; i++) {
        const result = evaluateAlerts(
          memory,
          readSignals(reading),
          minute(from + i),
        );
        memory = result.memory;
        events.push(...result.events.map((e) => ({ ...e, at: from + i })));
      }
      return this;
    },
  };
}

test("sources never reach the alert path and providers are judged together", () => {
  const ids = readSignals(input()).signals.map((s) => s.id);
  assert.deepEqual(ids, [
    "health",
    "website",
    "database",
    "report",
    "component:api",
    "component:wiener_linien",
    "providers",
    "prediction-delivery",
  ]);
  assert.deepEqual(
    readSignals(input()).signals.filter((s) => s.level !== null),
    [],
  );
});

test("one failing provider is their bad day, all of them is our outage", () => {
  const one = input({
    report: report({ router: [entry("vao", "down"), entry("mgate")] }),
  });
  assert.equal(
    readSignals(one).signals.find((s) => s.id === "providers").level,
    null,
  );
  const all = input({
    report: report({
      router: [entry("vao", "down"), entry("mgate", "degraded")],
    }),
  });
  const providers = readSignals(all).signals.find((s) => s.id === "providers");
  assert.equal(providers.level, "down");
  assert.match(providers.detail, /Kein Provider erreichbar/);
});

test("a data pipeline speaks up only when it is really down", () => {
  const dipping = session()
    .hold(component("stmk_gtfs_rt", "operational"), 0)
    .hold(component("stmk_gtfs_rt", "degraded"), 1, 30);
  assert.deepEqual(dipping.events, [], "half an hour of degraded stays quiet");

  const gone = session()
    .hold(component("stmk_gtfs_rt", "operational"), 0)
    .hold(component("stmk_gtfs_rt", "down"), 1, CONFIRM.down);
  assert.deepEqual(
    gone.events.map((e) => [e.at, e.kind, e.level]),
    [[2, "problem", "down"]],
  );
});

test("the product's own components still report a restriction", () => {
  const run = session()
    .hold(component("api", "operational"), 0)
    .hold(component("api", "degraded"), 1, CONFIRM.degraded + 1)
    .hold(component("api", "operational"), 20, CONFIRM.recovered);
  assert.deepEqual(
    run.events.map((e) => [e.at, e.kind, e.level]),
    [
      [15, "problem", "degraded"],
      [24, "recovered", undefined],
    ],
  );
});

test("an outage alerts on the third failed check, as the public page does", () => {
  const run = session()
    .hold(input(), 0)
    .hold(input({ healthFailures: 1 }), 1)
    .hold(input({ healthFailures: 2 }), 2)
    .hold(input({ healthFailures: 3 }), 3)
    .hold(input(), 4, 2);
  assert.deepEqual(
    run.events.map((e) => [e.at, e.kind, e.id]),
    [
      [3, "problem", "health"],
      [5, "recovered", "health"],
    ],
  );
});

test("the same signal stays quiet for six hours and is muted after the second alert", () => {
  const run = session()
    .hold(component("api", "operational"), 0)
    .hold(component("api", "degraded"), 1, 20)
    .hold(component("api", "operational"), 21, 10)
    .hold(component("api", "degraded"), 60, 20)
    .hold(component("api", "operational"), 80, 10)
    .hold(component("api", "degraded"), 400, 20)
    .hold(component("api", "operational"), 420, 10);
  assert.deepEqual(
    run.events.map((e) => [e.at, e.kind, e.muted]),
    [
      [15, "problem", false],
      [25, "recovered", undefined],
      [414, "problem", true],
    ],
  );
});

test("an outage breaks through the mute of a flapping signal", () => {
  const run = session()
    .hold(component("api", "operational"), 0)
    .hold(component("api", "degraded"), 1, 20)
    .hold(component("api", "operational"), 21, 10)
    .hold(component("api", "degraded"), 400, 20)
    .hold(component("api", "operational"), 420, 10)
    .hold(component("api", "down"), 800, CONFIRM.down);
  assert.deepEqual(
    run.events.filter((e) => e.at >= 800).map((e) => [e.at, e.level]),
    [[801, "down"]],
  );
});

test("messages name the problem, the time and the recovery", () => {
  const single = formatAlert(
    [
      {
        kind: "problem",
        id: "health",
        label: "API /health",
        level: "down",
        detail: "3 Prüfungen hintereinander fehlgeschlagen",
      },
    ],
    minute(0),
  );
  assert.equal(single.subject, "ÖffiGo · Ausfall: API /health");
  assert.match(
    single.text,
    /^🔴 Ausfall\n\nAusfall: API \/health · seit \d\d:\d\d/,
  );
  assert.match(single.html, /<b>Ausfall<\/b>/);
  assert.match(single.text, /https:\/\/status\.oeffigo\.app$/);

  const many = formatAlert(
    [
      { kind: "problem", id: "a", label: "A", level: "down" },
      { kind: "problem", id: "b", label: "B", level: "degraded" },
    ],
    minute(0),
  );
  assert.equal(many.subject, "ÖffiGo · Ausfall und Einschränkung");

  const back = formatAlert(
    [
      {
        kind: "recovered",
        id: "c",
        label: "C",
        since: new Date(minute(0)).toISOString(),
      },
    ],
    minute(125),
  );
  assert.equal(back.subject, "ÖffiGo · Wieder in Ordnung: C");
  assert.match(back.text, /C · nach 2 Std\./);

  const muted = formatAlert(
    [
      {
        kind: "problem",
        id: "component:x",
        label: "Steiermark GTFS-RT",
        level: "degraded",
        muted: true,
      },
    ],
    minute(0),
  );
  assert.match(muted.text, /24 Std\. stumm/);
});

test("markup in a label cannot break the Telegram message", () => {
  const message = formatAlert(
    [{ kind: "problem", id: "x", label: "A <b>& B", level: "down" }],
    minute(0),
  );
  assert.match(message.html, /A &lt;b&gt;&amp; B/);
});

test("the welcome message explains what stays quiet", () => {
  const welcome = formatWelcome(
    {
      health: {
        level: "down",
        since: new Date(minute(0)).toISOString(),
        label: "API /health",
      },
    },
    minute(3),
  );
  assert.equal(welcome.subject, "ÖffiGo · Alarme aktiv");
  assert.match(
    welcome.text,
    /Still: einzelne Datenquellen und fremde Provider/,
  );
  assert.match(welcome.text, /🔴 Ausfall: API \/health · seit 3 Min\./);
});

test("channels need their full configuration", () => {
  assert.deepEqual(configuredChannels({}), []);
  assert.deepEqual(configuredChannels({ TELEGRAM_BOT_TOKEN: "t" }), []);
  assert.deepEqual(
    configuredChannels({
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_CHAT_ID: "1",
      RESEND_API_KEY: "r",
      OWNER_EMAIL: "o@example.com",
      EMAIL_FROM: "Status <s@example.com>",
    }),
    ["telegram", "mail"],
  );
});

test("only an outage skips the ten-minute bundle", async () => {
  const sent = [];
  const sender = async (channel, message) => {
    sent.push([channel, message.subject]);
  };
  const queued = {
    memory: {},
    outbox: {
      mail: [
        {
          kind: "problem",
          id: "component:x",
          label: "Steiermark GTFS-RT",
          level: "degraded",
        },
      ],
    },
    greeted: ["mail"],
    lastSentAt: { mail: new Date(minute(0)).toISOString() },
  };
  const held = await advanceAlerts(
    queued,
    { ...input(), now: minute(5) },
    ["mail"],
    sender,
  );
  assert.deepEqual(sent, []);
  assert.equal(held.outbox.mail.length, 1);

  const later = await advanceAlerts(
    held,
    { ...input(), now: minute(11) },
    ["mail"],
    sender,
  );
  assert.deepEqual(sent, [
    ["mail", "ÖffiGo · Einschränkung: Steiermark GTFS-RT"],
  ]);
  assert.deepEqual(later.outbox, {});
});

test("each channel greets once and keeps its own outbox", async () => {
  const sent = [];
  let telegramUp = false;
  const sender = async (channel, message) => {
    if (channel === "telegram" && !telegramUp) throw new Error("offline");
    sent.push([channel, message.subject]);
  };
  const quiet = console.error;
  console.error = () => {};
  try {
    let state = { memory: {}, outbox: {}, greeted: [] };
    state = await advanceAlerts(
      state,
      { ...input(), now: minute(0) },
      ["telegram", "mail"],
      sender,
    );
    assert.deepEqual(sent, [["mail", "ÖffiGo · Alarme aktiv"]]);

    for (const n of [1, 2, 3])
      state = await advanceAlerts(
        state,
        { ...input({ websiteFailures: n }), now: minute(n) },
        ["telegram", "mail"],
        sender,
      );
    assert.deepEqual(sent.slice(1), [
      ["mail", "ÖffiGo · Ausfall: Website oeffigo.app"],
    ]);
    assert.equal(state.outbox.telegram.length, 1);

    telegramUp = true;
    state = await advanceAlerts(
      state,
      { ...input({ websiteFailures: 4 }), now: minute(4) },
      ["telegram", "mail"],
      sender,
    );
    assert.deepEqual(sent.slice(2), [
      ["telegram", "ÖffiGo · Alarme aktiv"],
      ["telegram", "ÖffiGo · Ausfall: Website oeffigo.app"],
    ]);
    assert.deepEqual(state.outbox, {});
  } finally {
    console.error = quiet;
  }
});
