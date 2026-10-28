export function resolveEmailFrom(fallback: string): string {
  const sender = process.env.EMAIL_FROM?.trim();
  if (!sender && process.env.SELF_HOST !== "true") return fallback;
  if (
    !sender ||
    !/^[^<>\r\n]+ <[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/.test(sender)
  ) {
    throw new Error(
      "EMAIL_FROM must contain a display name and verified email address",
    );
  }
  return sender;
}

const PLAIN_ADDRESS = /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/;
const NAMED_ADDRESS = /^[^<>\r\n]+ <[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/;

export function resolveEmailReplyTo(): string | undefined {
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  if (!replyTo) return undefined;
  if (!PLAIN_ADDRESS.test(replyTo) && !NAMED_ADDRESS.test(replyTo)) {
    throw new Error("EMAIL_REPLY_TO must be a single email address");
  }
  return replyTo;
}

/** RFC 8058 one-click unsubscribe; the URL must accept a POST without cookies. */
export function unsubscribeHeaders(url: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
