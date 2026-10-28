/** @jsxRuntime automatic @jsxImportSource react */

import { type Duration, Effect, Schedule } from "effect";
import { render } from "react-email";
import { Resend } from "resend";

import FollowUpEmail from "../emails/followup";
import MonitorAlertEmail, {
  monitorAlertSubject,
} from "../emails/monitor-alert";
import type { MonitorAlertProps } from "../emails/monitor-alert";
import PageSubscriptionEmail from "../emails/page-subscription";
import type { PageSubscriptionProps } from "../emails/page-subscription";
import PrivateLocationAlertEmail, {
  privateLocationAlertSubject,
} from "../emails/private-location-alert";
import type { PrivateLocationAlertProps } from "../emails/private-location-alert";
import SlackFeedbackEmail from "../emails/slack-feedback";
import StatusPageMagicLinkEmail from "../emails/status-page-magic-link";
import type { StatusPageMagicLinkProps } from "../emails/status-page-magic-link";
import StatusReportEmail from "../emails/status-report";
import type { StatusReportProps } from "../emails/status-report";
import TeamInvitationEmail from "../emails/team-invitation";
import type { TeamInvitationProps } from "../emails/team-invitation";
import { env } from "./env";
import {
  resolveEmailFrom,
  resolveEmailReplyTo,
  unsubscribeHeaders,
} from "./sender";

export function statusReportSubject(req: {
  status: StatusReportProps["status"];
  reportTitle: string;
}): string {
  if (req.status === "resolved") return `Behoben: ${req.reportTitle}`;
  if (req.status === "maintenance")
    return `Geplante Wartung: ${req.reportTitle}`;
  return req.reportTitle;
}

const SYSTEM_FROM = "openstatus <notifications@notifications.openstatus.dev>";

// Deterministic Resend rejections: retrying the identical request can never
// succeed (e.g. 409 invalid_idempotent_request when a key is reused with a
// different body), it only burns the backoff and re-logs the error.
const NON_RETRYABLE_RESEND_ERRORS = new Set<string>([
  "invalid_idempotent_request",
  "invalid_idempotency_key",
  "validation_error",
]);

function isRetryableSendError(error: { name: string }): boolean {
  return !NON_RETRYABLE_RESEND_ERRORS.has(error.name);
}

// split an array into chunks of a given size.
function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export class EmailClient {
  public readonly client: Resend;
  // Base delay for the per-batch send retry. Overridable so tests can run the
  // retry path without the real ~1s exponential sleep.
  private readonly retryBackoff: Duration.Input;

  constructor(opts: { apiKey: string; retryBackoff?: Duration.Input }) {
    this.client = new Resend(opts.apiKey);
    this.retryBackoff = opts.retryBackoff ?? "1000 millis";
  }

  public async sendFollowUp(req: { to: string }) {
    if (env.NODE_ENV === "development") {
      return;
    }

    try {
      const html = await render(<FollowUpEmail />);
      const result = await this.client.emails.send({
        from: resolveEmailFrom(
          "Thibault Le Ouay Ducasse <welcome@openstatus.dev>",
        ),
        replyTo: "Thibault Le Ouay Ducasse <thibault@openstatus.dev>",
        subject: "How's it going with openstatus?",
        to: req.to,
        html,
      });

      if (!result.error) {
        return;
      }

      throw result.error;
    } catch {
      throw new Error("Email delivery failed");
    }
  }

  public async sendFollowUpBatched(req: { to: string[] }) {
    if (env.NODE_ENV === "development") {
      return;
    }

    const html = await render(<FollowUpEmail />);
    const result = await this.client.batch.send(
      req.to.map((subscriber) => ({
        from: resolveEmailFrom(
          "Thibault Le Ouay Ducasse <thibault@openstatus.dev>",
        ),
        subject: "How's it going with openstatus?",
        to: subscriber,
        html,
      })),
    );

    if (result.error) {
      //  We only throw the error if we are rate limited
      if (result.error?.name === "rate_limit_exceeded") {
        throw result.error;
      }
      //  Otherwise let's log the error and continue
      return;
    }
  }

  public async sendSlackFeedback(req: { to: string }) {
    if (env.NODE_ENV === "development") {
      return;
    }

    try {
      const html = await render(<SlackFeedbackEmail />);
      const result = await this.client.emails.send({
        from: resolveEmailFrom(
          "Thibault Le Ouay Ducasse <thibault@openstatus.dev>",
        ),
        replyTo: "Thibault Le Ouay Ducasse <thibault@openstatus.dev>",
        subject: "How's the Slack app working for you?",
        to: req.to,
        html,
      });

      if (!result.error) {
        return;
      }

      throw result.error;
    } catch {
      throw new Error("Email delivery failed");
    }
  }

  public async sendSlackFeedbackBatched(req: { to: string[] }) {
    if (env.NODE_ENV === "development") {
      return;
    }

    const html = await render(<SlackFeedbackEmail />);
    const result = await this.client.batch.send(
      req.to.map((subscriber) => ({
        from: resolveEmailFrom(
          "Thibault Le Ouay Ducasse <thibault@openstatus.dev>",
        ),
        subject: "How's the Slack app working for you?",
        to: subscriber,
        html,
      })),
    );

    if (result.error) {
      if (result.error?.name === "rate_limit_exceeded") {
        throw result.error;
      }
      return;
    }
  }

  public async sendStatusReportUpdate(
    req: Omit<
      StatusReportProps,
      "unsubscribeUrl" | "manageUrl" | "statusPageUrl"
    > & {
      subscribers: Array<{ email: string; token: string }>;
      pageSlug: string;
      customDomain?: string | null;
      // Base key for Resend idempotency. The per-batch retry below would
      // otherwise re-send the whole chunk if a request succeeds server-side
      // but the response is lost. Must be stable across retries.
      idempotencyKey?: string;
    },
  ) {
    const statusPageBaseUrl = req.customDomain
      ? `https://${req.customDomain}`
      : `https://${req.pageSlug}.openstatus.dev`;

    if (env.NODE_ENV === "development") {
      return;
    }

    const chunks = chunk(req.subscribers, 100);
    for (let i = 0; i < chunks.length; i++) {
      const recipients = chunks[i];
      // suffix the chunk index so a multi-batch send doesn't collide its
      // own chunks on a single shared key
      const batchKey = req.idempotencyKey
        ? `${req.idempotencyKey}:${i}`
        : undefined;
      const sendEmail = Effect.tryPromise({
        try: () =>
          this.client.batch.send(
            recipients.map((subscriber) => {
              const unsubscribeUrl = `${statusPageBaseUrl}/unsubscribe/${subscriber.token}`;
              const manageUrl = `${statusPageBaseUrl}/manage/${subscriber.token}`;
              return {
                from: resolveEmailFrom(
                  `${req.pageTitle} <notifications@notifications.openstatus.dev>`,
                ),
                replyTo: resolveEmailReplyTo(),
                headers: unsubscribeHeaders(
                  `${statusPageBaseUrl}/api/unsubscribe/${subscriber.token}`,
                ),
                subject: statusReportSubject(req),
                to: subscriber.email,
                react: (
                  <StatusReportEmail
                    {...req}
                    statusPageUrl={statusPageBaseUrl}
                    unsubscribeUrl={unsubscribeUrl}
                    manageUrl={manageUrl}
                  />
                ),
              };
            }),
            batchKey ? { idempotencyKey: batchKey } : undefined,
          ),
        catch: (_unknown) => new Error("Email delivery failed"),
      }).pipe(
        Effect.andThen((result) =>
          result.error ? Effect.fail(result.error) : Effect.succeed(result),
        ),
        Effect.retry({
          times: 3,
          schedule: Schedule.exponential(this.retryBackoff),
          while: isRetryableSendError,
        }),
      );
      await Effect.runPromise(sendEmail).catch(() => {
        throw new Error("Email delivery failed");
      });
    }
  }

  public async sendTeamInvitation(req: TeamInvitationProps & { to: string }) {
    if (env.NODE_ENV === "development") {
      return;
    }

    try {
      const html = await render(<TeamInvitationEmail {...req} />);
      const result = await this.client.emails.send({
        from: resolveEmailFrom(
          `${
            req.workspaceName || "ÖffiGo Status"
          } <notifications@notifications.openstatus.dev>`,
        ),
        replyTo: resolveEmailReplyTo(),
        subject: `You've been invited to join ${
          req.workspaceName || "ÖffiGo Status"
        }`,
        to: req.to,
        html,
      });

      if (!result.error) {
        return;
      }

      throw result.error;
    } catch {
      throw new Error("Email delivery failed");
    }
  }

  public async sendMonitorAlert(req: MonitorAlertProps & { to: string }) {
    if (env.NODE_ENV === "development") {
      return;
    }

    try {
      const { to: _to, ...props } = req;
      const html = await render(<MonitorAlertEmail {...props} />);
      const result = await this.client.emails.send({
        from: resolveEmailFrom(SYSTEM_FROM),
        replyTo: resolveEmailReplyTo(),
        subject: monitorAlertSubject(props),
        to: req.to,
        html,
      });

      if (!result.error) {
        return;
      }

      throw result.error;
    } catch {
      throw new Error("Email delivery failed");
    }
  }

  public async sendPageSubscription(
    req: PageSubscriptionProps & { to: string },
  ) {
    if (env.NODE_ENV === "development") {
      return;
    }

    try {
      const html = await render(<PageSubscriptionEmail {...req} />);
      const result = await this.client.emails.send({
        from: resolveEmailFrom(
          "Status Page <notifications@notifications.openstatus.dev>",
        ),
        replyTo: resolveEmailReplyTo(),
        subject: `Bitte bestätige dein Abo für ${req.page} Status`,
        to: req.to,
        html,
      });

      if (!result.error) {
        return;
      }

      throw result.error;
    } catch {
      throw new Error("Email delivery failed");
    }
  }

  public async sendStatusPageMagicLink(
    req: StatusPageMagicLinkProps & { to: string },
  ) {
    if (env.NODE_ENV === "development") {
      return;
    }

    try {
      const html = await render(<StatusPageMagicLinkEmail {...req} />);
      const result = await this.client.emails.send({
        from: resolveEmailFrom(
          "Status Page <notifications@notifications.openstatus.dev>",
        ),
        subject: `Authenticate to ${req.page}`,
        to: req.to,
        html,
      });

      if (!result.error) {
        return;
      }

      throw result.error;
    } catch {
      throw new Error("Email delivery failed");
    }
  }

  public async sendMaintenanceNotification(req: {
    subscribers: Array<{ email: string; token: string }>;
    pageTitle: string;
    pageSlug: string;
    customDomain?: string | null;
    maintenanceTitle: string;
    message: string;
    from: string;
    to: string;
    pageComponents: string[];
    idempotencyKey?: string;
  }) {
    const statusPageBaseUrl = req.customDomain
      ? `https://${req.customDomain}`
      : `https://${req.pageSlug}.openstatus.dev`;

    if (env.NODE_ENV === "development") {
      return;
    }

    const chunks = chunk(req.subscribers, 100);
    for (let i = 0; i < chunks.length; i++) {
      const recipients = chunks[i];
      const batchKey = req.idempotencyKey
        ? `${req.idempotencyKey}:${i}`
        : undefined;
      const sendEmail = Effect.tryPromise({
        try: () =>
          this.client.batch.send(
            recipients.map((subscriber) => {
              const unsubscribeUrl = `${statusPageBaseUrl}/unsubscribe/${subscriber.token}`;
              const manageUrl = `${statusPageBaseUrl}/manage/${subscriber.token}`;
              return {
                from: resolveEmailFrom(
                  `${req.pageTitle} <notifications@notifications.openstatus.dev>`,
                ),
                replyTo: resolveEmailReplyTo(),
                headers: unsubscribeHeaders(
                  `${statusPageBaseUrl}/api/unsubscribe/${subscriber.token}`,
                ),
                subject: statusReportSubject({
                  status: "maintenance",
                  reportTitle: req.maintenanceTitle,
                }),
                to: subscriber.email,
                react: (
                  <StatusReportEmail
                    pageTitle={req.pageTitle}
                    reportTitle={req.maintenanceTitle}
                    status="maintenance"
                    date={`${req.from} - ${req.to}`}
                    message={req.message}
                    pageComponents={req.pageComponents}
                    statusPageUrl={statusPageBaseUrl}
                    unsubscribeUrl={unsubscribeUrl}
                    manageUrl={manageUrl}
                  />
                ),
              };
            }),
            batchKey ? { idempotencyKey: batchKey } : undefined,
          ),
        catch: (_unknown) => new Error("Email delivery failed"),
      }).pipe(
        Effect.andThen((result) =>
          result.error ? Effect.fail(result.error) : Effect.succeed(result),
        ),
        Effect.retry({
          times: 3,
          schedule: Schedule.exponential(this.retryBackoff),
          while: isRetryableSendError,
        }),
      );
      await Effect.runPromise(sendEmail).catch(() => {
        throw new Error("Email delivery failed");
      });
    }
  }

  public async sendPrivateLocationAlert(
    req: Omit<PrivateLocationAlertProps, "lastSeenAt"> & {
      to: string[];
      lastSeenAt: Date;
    },
  ) {
    if (req.to.length === 0) return;

    const subject = privateLocationAlertSubject(req);

    if (env.NODE_ENV === "development") {
      return;
    }

    try {
      const html = await render(
        <PrivateLocationAlertEmail
          locationName={req.locationName}
          status={req.status}
          lastSeenAt={req.lastSeenAt.toISOString()}
          monitorCount={req.monitorCount}
        />,
      );
      const result = await this.client.batch.send(
        req.to.map((to) => ({
          from: resolveEmailFrom(SYSTEM_FROM),
          replyTo: resolveEmailReplyTo(),
          subject,
          to,
          html,
        })),
      );

      if (result.error) {
        if (result.error?.name === "rate_limit_exceeded") {
          throw result.error;
        }
        return;
      }
    } catch {
      throw new Error("Email delivery failed");
    }
  }
}
