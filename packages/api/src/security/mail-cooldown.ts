import { and, db, like, lt, lte } from "@openstatus/db";
import { verificationToken } from "@openstatus/db/src/schema";

export class MailCooldownError extends Error {
  constructor() {
    super("Bitte warte eine Minute, bevor du erneut eine E-Mail anforderst.");
    this.name = "MailCooldownError";
  }
}

export async function claimMailCooldown(
  scope: "subscribe" | "login",
  email: string,
  options: { db?: Pick<typeof db, "insert" | "delete">; now?: Date } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const store = options.db ?? db;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${scope}:${email.trim().toLowerCase()}`),
  );
  const hash = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  const identifier = `turnstile-cooldown:v1:${hash}`;
  const expires = new Date(now.getTime() + 60_000);
  // Namespaced leases share Auth.js' expiry table but cannot match an email identifier.
  await store
    .delete(verificationToken)
    .where(
      and(
        like(verificationToken.identifier, "turnstile-cooldown:v1:%"),
        lt(verificationToken.expires, new Date(now.getTime() - 86_400_000)),
      ),
    )
    .run();
  const claimed = await store
    .insert(verificationToken)
    .values({ identifier, token: "cooldown", expires })
    .onConflictDoUpdate({
      target: [verificationToken.identifier, verificationToken.token],
      set: { expires },
      setWhere: lte(verificationToken.expires, now),
    })
    .returning({ identifier: verificationToken.identifier })
    .get();
  if (!claimed) throw new MailCooldownError();
}
