/**
 * Only Cloudflare reaches the origin. The edge stamps a secret header on every
 * request for this host; anything arriving without it went around the proxy —
 * around its caching, its rules and its protection.
 *
 * Off while `ORIGIN_LOCK` is unset, so the lock can ship before the secret
 * exists and can be lifted by clearing one variable.
 */
export const ORIGIN_LOCK_HEADER = "x-oeffigo-edge";
/** The platform probes the container itself, from inside, without the header. */
const OPEN_PATHS = new Set(["/api/health"]);

function equals(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function originLockAllows(args: {
  pathname: string;
  header: string | null;
  expected?: string;
}): boolean {
  const expected = args.expected?.trim();
  if (!expected) return true;
  if (OPEN_PATHS.has(args.pathname)) return true;
  return Boolean(args.header) && equals(args.header as string, expected);
}
