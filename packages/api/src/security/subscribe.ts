import type { PageVisitor } from "@openstatus/services/page-access";
import { upsertSelfSignupSubscriber } from "@openstatus/services/page-subscriber";
import { getChannel } from "@openstatus/subscriptions";
import { TRPCError } from "@trpc/server";

import { claimMailCooldown, MailCooldownError } from "./mail-cooldown";
import { verifyTurnstile, TurnstileError } from "./turnstile";

const defaultDependencies = {
  verifyTurnstile,
  claimMailCooldown,
  upsertSelfSignupSubscriber,
  getChannel,
};

export async function subscribeWithVerification(
  args: {
    email: string;
    pageId: number;
    componentIds?: number[];
    turnstileToken?: string;
    requestHostname?: string;
    visitor: PageVisitor | null;
  },
  dependencies = defaultDependencies,
) {
  try {
    await dependencies.verifyTurnstile({
      token: args.turnstileToken,
      action: "status-subscribe",
      requestHostname: args.requestHostname,
    });
    await dependencies.claimMailCooldown("subscribe", args.email);
    const { visitor, ...input } = args;
    const subscription = await dependencies.upsertSelfSignupSubscriber({
      input,
      visitor,
    });
    if (subscription.acceptedAt) return { requestReceived: true };
    if (!subscription.token || !subscription.customDomain)
      throw new Error("Subscription is unavailable");
    const channel = dependencies.getChannel("email");
    if (!channel?.sendVerification)
      throw new Error("Email channel unavailable");
    await channel.sendVerification(
      {
        ...subscription,
        token: subscription.token,
        unsubscribedAt: subscription.unsubscribedAt ?? undefined,
        channelType: "email",
        acceptedAt: undefined,
      },
      `https://${subscription.customDomain}/verify/${subscription.token}`,
    );
    return { requestReceived: true };
  } catch (error) {
    if (error instanceof TurnstileError)
      throw new TRPCError({ code: "FORBIDDEN", message: error.message });
    if (error instanceof MailCooldownError)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: error.message,
      });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Das Abonnement konnte nicht bestätigt werden. Bitte versuche es später erneut.",
    });
  }
}
