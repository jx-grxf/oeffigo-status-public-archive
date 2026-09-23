import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveEmailFrom,
  resolveEmailReplyTo,
  unsubscribeHeaders,
} from "./sender.ts";

test("self-host sender is mandatory and rejects header injection", () => {
  const previousSender = process.env.EMAIL_FROM;
  const previousSelfHost = process.env.SELF_HOST;
  try {
    process.env.SELF_HOST = "true";
    delete process.env.EMAIL_FROM;
    assert.throws(() => resolveEmailFrom("upstream@example.com"), /EMAIL_FROM/);
    process.env.EMAIL_FROM = "ÖffiGo <status@example.com>";
    assert.equal(
      resolveEmailFrom("upstream@example.com"),
      "ÖffiGo <status@example.com>",
    );
    process.env.EMAIL_FROM =
      "ÖffiGo\r\nBcc: other@example.com <status@example.com>";
    assert.throws(() => resolveEmailFrom("upstream@example.com"), /EMAIL_FROM/);
  } finally {
    if (previousSender === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousSender;
    if (previousSelfHost === undefined) delete process.env.SELF_HOST;
    else process.env.SELF_HOST = previousSelfHost;
  }
});

test("reply-to is optional and refuses anything but one address", () => {
  const previous = process.env.EMAIL_REPLY_TO;
  try {
    delete process.env.EMAIL_REPLY_TO;
    assert.equal(resolveEmailReplyTo(), undefined);
    process.env.EMAIL_REPLY_TO = "ÖffiGo <contact@example.com>";
    assert.equal(resolveEmailReplyTo(), "ÖffiGo <contact@example.com>");
    process.env.EMAIL_REPLY_TO = "contact@example.com";
    assert.equal(resolveEmailReplyTo(), "contact@example.com");
    process.env.EMAIL_REPLY_TO = "a@example.com, b@example.com";
    assert.throws(() => resolveEmailReplyTo(), /EMAIL_REPLY_TO/);
  } finally {
    if (previous === undefined) delete process.env.EMAIL_REPLY_TO;
    else process.env.EMAIL_REPLY_TO = previous;
  }
});

test("one-click unsubscribe headers follow RFC 8058", () => {
  assert.deepEqual(
    unsubscribeHeaders("https://status.example.com/api/unsubscribe/t"),
    {
      "List-Unsubscribe": "<https://status.example.com/api/unsubscribe/t>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  );
});
