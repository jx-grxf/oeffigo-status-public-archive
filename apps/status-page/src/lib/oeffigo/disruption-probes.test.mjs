import assert from "node:assert/strict";
import { test } from "node:test";

import {
  disruptionProbes,
  disruptionSignals,
  disruptionState,
  nextStreaks,
  PROBE_FAILURES,
  probeBody,
} from "./disruption-probes.ts";

const ok = { ok: true, ms: 40, status: 200, failure: null };
const hung = { ok: false, ms: 5000, status: null, failure: "timeout" };
const all = (result) =>
  Object.fromEntries(disruptionProbes.map((p) => [p.id, result]));

test("every request the app and the website send is checked, ÖBB included", () => {
  const urls = disruptionProbes.map((p) => p.url);
  assert.ok(urls.includes("https://api.oeffigo.app/v2/disruptions"));
  assert.equal(urls.filter((u) => u.includes("sources=ims,wl,oebb")).length, 2);
  assert.ok(urls.includes("https://oeffigo.app/stoerungen"));
});

test("a list answer counts, an error page or a bare object does not", async () => {
  const list = disruptionProbes.find((p) => p.id === "website_api");
  const reply =
    (body, status = 200) =>
    async () =>
      new Response(body, { status });
  assert.equal(
    (await probeBody(list.url, list.accept, reply('{"disruptions":[]}'))).ok,
    true,
  );
  assert.equal(
    (await probeBody(list.url, list.accept, reply("{}"))).failure,
    "invalid_body",
  );
  assert.equal(
    (await probeBody(list.url, list.accept, reply("", 503))).failure,
    "http",
  );
});

test("the page fails when it shows its own load error", async () => {
  const page = disruptionProbes.find((p) => p.id === "website_page");
  const html =
    "<p>Die Meldungen lassen sich gerade nicht laden. Versuch es in ein paar Minuten noch einmal.</p>";
  const result = await probeBody(
    page.url,
    page.accept,
    async () => new Response(html),
  );
  assert.equal(result.failure, "invalid_body");
});

test("a hanging request is a timeout, not a pass", async () => {
  const result = await probeBody(
    "https://example.invalid",
    () => true,
    async () => {
      const e = new Error("hung");
      e.name = "TimeoutError";
      throw e;
    },
  );
  assert.equal(result.failure, "timeout");
});

// 2026-10-27: only the lists with ÖBB hung; the default list kept working.
test("the ÖBB lists hanging limits travel alerts after three checks", () => {
  let streaks = {};
  const results = {
    ...all(ok),
    app_overview: hung,
    website_api: hung,
    website_page: hung,
  };
  for (let i = 1; i < PROBE_FAILURES; i++) {
    streaks = nextStreaks(streaks, results);
    assert.equal(disruptionState(streaks), null, `not yet after ${i}`);
  }
  streaks = nextStreaks(streaks, results);
  assert.equal(disruptionState(streaks), "degraded");
  const signals = disruptionSignals(streaks, results);
  assert.equal(signals.filter((s) => s.level === "degraded").length, 3);
  assert.equal(signals.find((s) => s.id === "disruptions:app").level, null);
  assert.equal(
    disruptionState(nextStreaks(streaks, all(ok))),
    null,
    "one good check clears it",
  );
});

test("the default list failing means travel alerts are down", () => {
  let streaks = {};
  for (let i = 0; i < PROBE_FAILURES; i++)
    streaks = nextStreaks(streaks, { ...all(ok), app: hung });
  assert.equal(disruptionState(streaks), "down");
});
