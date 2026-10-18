// Operations client for the dashboard's own API, so incidents, maintenances,
// components and settings can be managed without the browser.
//
//   OPS_TOKEN=… node ops/admin.mjs statusPage.get '{"slug":"oeffigo"}'
//   OPS_TOKEN=… node ops/admin.mjs --query page.list
//   OPS_TOKEN=… node ops/admin.mjs --mutation statusReport.new '{…}'
//
// Without an explicit flag a call with input is a mutation and a call without
// input is a query — the two tRPC verbs the dashboard itself uses.
export const DEFAULT_URL = "https://status-admin.oeffigo.app";
// Cloudflare turns away obvious scripts; this is the same client the app is.
const USER_AGENT = "OeffiGo-Ops/1.0";

function usage(message) {
  console.error(
    `${message}\n\nusage: node ops/admin.mjs [--query|--mutation] <procedure> [json]\nenv:   OPS_TOKEN (required), OPS_URL (default ${DEFAULT_URL})`,
  );
  process.exit(2);
}

export function parseArgs(argv) {
  const args = [...argv];
  let kind;
  while (args[0]?.startsWith("--")) {
    const flag = args.shift();
    if (flag === "--query") kind = "query";
    else if (flag === "--mutation") kind = "mutation";
    else return { error: `unknown flag ${flag}` };
  }
  const [procedure, input] = args;
  if (!procedure || !/^[a-zA-Z][\w.]*$/.test(procedure))
    return { error: "a procedure path like statusReport.new is required" };
  if (args.length > 2)
    return { error: "pass the input as a single JSON value" };
  let parsed;
  if (input !== undefined) {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { error: "the input is not valid JSON" };
    }
  }
  return {
    procedure,
    input: parsed,
    kind: kind ?? (input === undefined ? "query" : "mutation"),
  };
}

export function buildRequest({ baseUrl, procedure, input, kind }) {
  const url = new URL(`/api/trpc/lambda/${procedure}`, baseUrl);
  // superjson is the transformer on both ends, hence the `json` envelope.
  const payload = JSON.stringify({ json: input ?? null });
  if (kind === "query") {
    if (input !== undefined) url.searchParams.set("input", payload);
    return { url: url.toString(), init: { method: "GET" } };
  }
  return {
    url: url.toString(),
    init: { method: "POST", body: payload },
  };
}

/** Unwraps the tRPC envelope into the data, or throws what went wrong. */
export function readResult(status, body) {
  const error = body?.error?.json ?? body?.error;
  if (error) {
    const code = error.data?.code ?? error.code ?? status;
    throw new Error(`${code}: ${error.message ?? "request failed"}`);
  }
  if (status >= 400) throw new Error(`HTTP ${status}`);
  const data = body?.result?.data;
  // `json` is present but null whenever a procedure returns nothing.
  if (data && typeof data === "object" && "json" in data) return data.json;
  return data ?? null;
}

/** One call against the dashboard API as the owner. Errors never carry the
 * request: its headers hold the token. */
export async function call({ procedure, input, kind, token, baseUrl = DEFAULT_URL }) {
  const { url, init } = buildRequest({ baseUrl, procedure, input, kind });
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "x-trpc-source": "server",
      "x-oeffigo-ops": token,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`HTTP ${response.status}: unexpected response`);
  }
  return readResult(response.status, body);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) usage(parsed.error);
  const token = process.env.OPS_TOKEN?.trim();
  if (!token) usage("OPS_TOKEN is not set");
  const result = await call({
    ...parsed,
    token,
    baseUrl: process.env.OPS_URL?.trim() || DEFAULT_URL,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((error) => {
    // Never echo the request: it carries the token header.
    console.error(error.message);
    process.exit(1);
  });
