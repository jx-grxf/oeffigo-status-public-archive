import assert from "node:assert/strict";
import { test } from "node:test";

import { Feed } from "feed";

import { newestFeedItemsFirst } from "./feed-order.ts";

test("RSS and Atom publish the newest incident first", () => {
  const feed = new Feed({
    id: "https://status.example.invalid/feed/rss",
    title: "Status",
    description: "Updates",
    link: "https://status.example.invalid",
    copyright: "© Status",
    updated: new Date("2026-09-23T12:00:00Z"),
  });
  feed.addItem({
    id: "older",
    title: "Older incident",
    link: "https://status.example.invalid/events/report/1",
    date: new Date("2026-09-20T12:00:00Z"),
  });
  feed.addItem({
    id: "newer",
    title: "Newer incident",
    link: "https://status.example.invalid/events/report/2",
    date: new Date("2026-09-23T12:00:00Z"),
  });

  newestFeedItemsFirst(feed);
  for (const xml of [feed.rss2(), feed.atom1()]) {
    assert.ok(xml.indexOf("Newer incident") < xml.indexOf("Older incident"));
  }
});
