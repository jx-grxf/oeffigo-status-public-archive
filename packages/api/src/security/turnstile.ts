export type TurnstileAction = "status-subscribe" | "status-login";

const HOSTS: Record<TurnstileAction, string> = {
  "status-subscribe": "status.oeffigo.app",
  "status-login": "status-admin.oeffigo.app",
};
const TEST_SECRETS = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export class TurnstileError extends Error {
  constructor() {
    super("Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.");
    this.name = "TurnstileError";
  }
}

export async function verifyTurnstile(args: {
  token: unknown;
  action: TurnstileAction;
  requestHostname?: string;
}): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const testSecret = secret ? TEST_SECRETS.has(secret) : false;
  const localTest =
    process.env.NODE_ENV !== "production" &&
    testSecret &&
    (args.requestHostname === "localhost" ||
      args.requestHostname === "127.0.0.1");
  if (
    !secret ||
    (testSecret && !localTest) ||
    typeof args.token !== "string" ||
    args.token.length === 0 ||
    args.token.length > 2048
  )
    throw new TurnstileError();

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: args.token }),
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      },
    );
    if (!response.ok) throw new TurnstileError();
    const result: unknown = await response.json();
    if (!result || typeof result !== "object") throw new TurnstileError();
    const verification = result as Record<string, unknown>;
    const timestamp =
      typeof verification.challenge_ts === "string"
        ? Date.parse(verification.challenge_ts)
        : Number.NaN;
    const age = Date.now() - timestamp;
    if (
      verification.success !== true ||
      verification.hostname !==
        (localTest ? "localhost" : HOSTS[args.action]) ||
      verification.action !== (localTest ? "test" : args.action) ||
      !Number.isFinite(age) ||
      age < -30_000 ||
      age > 300_000
    ) {
      throw new TurnstileError();
    }
  } catch {
    throw new TurnstileError();
  }
}
