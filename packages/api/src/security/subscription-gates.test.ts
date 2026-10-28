import { expect } from "@std/expect";
import { test } from "@std/testing/bdd";

import { emailRouter } from "../router/email";
import { pageSubscriberRouter } from "../router/pageSubscriber";
import { statusPageRouter } from "../router/statusPage";
import { createInnerTRPCContext } from "../trpc";

test("all public signup and resend procedures reject missing proof before database or email work", async () => {
  const context = createInnerTRPCContext({ session: null });
  await expect(
    statusPageRouter.createCaller(context).subscribe({
      slug: "oeffigo",
      email: "person@example.com",
      subscribeComponents: false,
      pageComponents: [],
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    pageSubscriberRouter.createCaller(context).upsert({
      email: "person@example.com",
      pageId: 1,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    emailRouter.createCaller(context).sendPageSubscriptionVerification({
      id: 1,
      token: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
