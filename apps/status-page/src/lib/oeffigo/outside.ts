import type { Range } from "./availability";

// Synthetic checks from Frankfurt and Zürich, read from Grafana Cloud with a read-only token.
// Grafana Free keeps 14 days, so longer ranges show what exists and say since when.
const RETENTION_MS = 14 * 86_400_000;
const targets = {
  api: "API Lebenszeichen",
  website: "Website",
} as const;
export type Target = keyof typeof targets;

const window: Record<Range, { span: number; step: number }> = {
  "24h": { span: 86_400_000, step: 15 * 60_000 },
  "7d": { span: 7 * 86_400_000, step: 2 * 3_600_000 },
  "30d": { span: RETENTION_MS, step: 6 * 3_600_000 },
  "90d": { span: RETENTION_MS, step: 6 * 3_600_000 },
};

export type LatencyPoint = {
  t: number;
  p50: number | null;
  p95: number | null;
};
export type Outside = {
  available: boolean;
  from: string | null;
  series: Record<Target, LatencyPoint[]>;
  checks: { ok: number; total: number; regions: string[] } | null;
};

function config() {
  const url = process.env.GRAFANA_PROM_URL;
  const user = process.env.GRAFANA_PROM_USER;
  const token = process.env.GRAFANA_READ_TOKEN;
  if (!url || !user || !token) return null;
  return {
    url,
    auth: `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`,
  };
}

type PromResult = {
  metric: Record<string, string>;
  values?: [number, string][];
  value?: [number, string];
}[];

async function prom(
  path: string,
  params: Record<string, string>,
): Promise<PromResult | null> {
  const c = config();
  if (!c) return null;
  try {
    const response = await fetch(
      `${c.url}/api/v1/${path}?${new URLSearchParams(params)}`,
      {
        headers: { Authorization: c.auth, "User-Agent": "OeffiGo-Status/1.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) return null;
    const body = await response.json();
    return body?.status === "success" ? (body.data.result as PromResult) : null;
  } catch {
    return null;
  }
}

const ms = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1000) : null;
};

export async function readOutside(range: Range, now: number): Promise<Outside> {
  const { span, step } = window[range];
  // Include the running step; Prometheus evaluates up to now.
  const end = Math.ceil(now / step) * step;
  const start = end - span;
  const stepSec = String(step / 1000);
  const jobs = Object.values(targets).join("|");
  const query = (q: number) =>
    prom("query_range", {
      query: `max by (job) (quantile_over_time(${q}, probe_duration_seconds{job=~"${jobs}"}[${stepSec}s]))`,
      start: String(start / 1000),
      end: String(end / 1000),
      step: stepSec,
    });
  const [p50, p95, latest] = await Promise.all([
    query(0.5),
    query(0.95),
    prom("query", { query: "probe_success" }),
  ]);
  const empty = { api: [], website: [] } as Record<Target, LatencyPoint[]>;
  if (!p50 || !p95)
    return { available: false, from: null, series: empty, checks: null };
  const series = { ...empty };
  let first: number | null = null;
  for (const [id, job] of Object.entries(targets) as [Target, string][]) {
    const upper = new Map(
      (p95.find((r) => r.metric.job === job)?.values ?? []).map(([t, v]) => [
        t,
        ms(v),
      ]),
    );
    series[id] = (p50.find((r) => r.metric.job === job)?.values ?? []).map(
      ([t, v]) => {
        first = first === null ? t * 1000 : Math.min(first, t * 1000);
        return { t: t * 1000, p50: ms(v), p95: upper.get(t) ?? null };
      },
    );
  }
  const checks = latest
    ? {
        ok: latest.filter((r) => r.value?.[1] === "1").length,
        total: latest.length,
        regions: [
          ...new Set(latest.map((r) => r.metric.probe).filter(Boolean)),
        ].sort(),
      }
    : null;
  return {
    available: true,
    from: first === null ? null : new Date(first).toISOString(),
    series,
    checks,
  };
}
