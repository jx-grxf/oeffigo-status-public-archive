import type { Feed } from "feed";

export function newestFeedItemsFirst(feed: Feed) {
  feed.items.sort((a, b) => b.date.getTime() - a.date.getTime());
}
