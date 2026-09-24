import { expect } from "@std/expect";
import { test } from "@std/testing/bdd";

import { subscribeWithVerification } from "./subscribe";

const request = {
  email: "visitor@example.invalid",
  pageId: 1,
  componentIds: [8],
  turnstileToken: "test-proof",
};

function dependencies(acceptedAt: Date | null, sent: { count: number }) {
  return {
    verifyTurnstile: async () => undefined,
    claimMailCooldown: async () => undefined,
    upsertSelfSignupSubscriber: async () => ({
      id: 42,
      pageId: 1,
      pageName: "Status",
      pageSlug: "oeffigo",
      channelType: "email" as const,
      email: request.email,
      token: "private-management-token",
      acceptedAt,
      componentIds: [8],
      customDomain: "status.example.invalid",
    }),
    getChannel: () => ({
      id: "email",
      validateConfig: async () => ({ valid: true }),
      sendVerification: async () => {
        sent.count++;
      },
      sendNotifications: async () => undefined,
    }),
  } as NonNullable<Parameters<typeof subscribeWithVerification>[1]>;
}

test("public subscribe receipt does not reveal an existing address or its scope", async () => {
  const sent = { count: 0 };
  const receipt = await subscribeWithVerification(
    request,
    dependencies(new Date("2026-09-23T00:00:00Z"), sent),
  );
  expect(receipt).toEqual({ requestReceived: true });
  expect(sent.count).toBe(0);
});

test("new subscriptions return the same receipt after sending verification", async () => {
  const sent = { count: 0 };
  const receipt = await subscribeWithVerification(
    request,
    dependencies(null, sent),
  );
  expect(receipt).toEqual({ requestReceived: true });
  expect(sent.count).toBe(1);
});
