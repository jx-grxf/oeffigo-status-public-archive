import type { Client } from "@libsql/client";

import {
  type AlertEvent,
  type AlertMemory,
  type AlertMessage,
  evaluateAlerts,
  formatAlert,
  formatWelcome,
  readSignals,
} from "./alerts";

export type Channel = "telegram" | "mail";

export type AlertState = {
  memory: AlertMemory;
  /** Undelivered events per channel; a failing channel never holds back the other. */
  outbox: Partial<Record<Channel, AlertEvent[]>>;
  greeted: Channel[];
  /** Last delivery per channel, so the bundle survives a restart. */
  lastSentAt?: Partial<Record<Channel, string>>;
};

export type Sender = (channel: Channel, message: AlertMessage) => Promise<void>;

const OUTBOX_LIMIT = 50;
const TELEGRAM_LIMIT = 4000;
/** Anything but an outage waits this long, so one bad minute is one message. */
const BUNDLE_MS = 10 * 60_000;

export function configuredChannels(env = process.env): Channel[] {
  const channels: Channel[] = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) channels.push("telegram");
  if (env.RESEND_API_KEY && env.OWNER_EMAIL && env.EMAIL_FROM)
    channels.push("mail");
  return channels;
}

async function send(channel: Channel, message: AlertMessage) {
  const response =
    channel === "telegram"
      ? await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: message.html.slice(0, TELEGRAM_LIMIT),
              parse_mode: "HTML",
              disable_web_page_preview: true,
            }),
            signal: AbortSignal.timeout(8000),
          },
        )
      : await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: [process.env.OWNER_EMAIL],
            subject: message.subject,
            text: message.text,
          }),
          signal: AbortSignal.timeout(8000),
        });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`${channel} rejected the alert`);
}

/** One check: evaluates the signals and drains each configured channel's outbox. */
export async function advanceAlerts(
  state: AlertState,
  input: Parameters<typeof readSignals>[0] & { now: number },
  channels: readonly Channel[],
  sender: Sender,
): Promise<AlertState> {
  const evaluated = evaluateAlerts(state.memory, readSignals(input), input.now);
  const lastSentAt = { ...state.lastSentAt };
  const next: AlertState = {
    memory: evaluated.memory,
    outbox: {},
    greeted: state.greeted.filter((channel) => channels.includes(channel)),
    lastSentAt,
  };
  const sentAt = new Date(input.now).toISOString();
  for (const channel of channels) {
    if (!next.greeted.includes(channel)) {
      try {
        await sender(channel, formatWelcome(evaluated.memory, input.now));
        next.greeted.push(channel);
        lastSentAt[channel] = sentAt;
      } catch {
        console.error(`ÖffiGo ${channel} alert channel is not reachable`);
      }
    }
    const queue = [...(state.outbox[channel] ?? []), ...evaluated.events].slice(
      -OUTBOX_LIMIT,
    );
    if (queue.length === 0) continue;
    const outage = queue.some(
      (event) => event.kind === "problem" && event.level === "down",
    );
    const last = state.lastSentAt?.[channel];
    if (!outage && last && input.now - Date.parse(last) < BUNDLE_MS) {
      next.outbox[channel] = queue;
      continue;
    }
    try {
      await sender(channel, formatAlert(queue, input.now));
      lastSentAt[channel] = sentAt;
    } catch {
      console.error(`ÖffiGo ${channel} alert could not be delivered`);
      next.outbox[channel] = queue;
    }
  }
  return next;
}

// One collector replica owns the state; the table only carries it across restarts.
let current: AlertState | undefined;
let persisted = "";

async function load(client: Client): Promise<AlertState> {
  if (current) return current;
  const empty: AlertState = { memory: {}, outbox: {}, greeted: [] };
  try {
    await client.execute(
      "CREATE TABLE IF NOT EXISTS oeffigo_alert (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL, updated_at TEXT NOT NULL)",
    );
    const stored = await client.execute(
      "SELECT state FROM oeffigo_alert WHERE id = 1",
    );
    const row = stored.rows[0];
    current = row ? { ...empty, ...JSON.parse(String(row.state)) } : empty;
    persisted = row ? String(row.state) : "";
  } catch {
    // Alert from memory while the database is unreachable; later saves overwrite the row.
    return empty;
  }
  return current ?? empty;
}

export async function processAlerts(
  client: Client,
  input: Parameters<typeof readSignals>[0] & { now: number },
) {
  const loaded = await load(client);
  current = await advanceAlerts(loaded, input, configuredChannels(), send);
  const serialized = JSON.stringify(current);
  if (serialized === persisted) return;
  try {
    await client.execute({
      sql: "INSERT INTO oeffigo_alert (id, state, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at",
      args: [serialized, new Date(input.now).toISOString()],
    });
    persisted = serialized;
  } catch {
    console.error("ÖffiGo alert state could not be persisted");
  }
}
