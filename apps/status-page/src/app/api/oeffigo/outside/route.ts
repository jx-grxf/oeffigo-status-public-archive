import { type Range, ranges } from "../../../../lib/oeffigo/availability";
import { type Outside, readOutside } from "../../../../lib/oeffigo/outside";
export const dynamic = "force-dynamic";
// Grafana gets one query set per range and minute, not one per visitor.
const cache = new Map<Range, { at: number; data: Outside }>();
export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get("range");
  const range: Range = ranges.includes(asked as Range)
    ? (asked as Range)
    : "24h";
  const hit = cache.get(range);
  const now = Date.now();
  const data =
    hit && now - hit.at < 60_000 ? hit.data : await readOutside(range, now);
  if (data.available && hit?.data !== data) cache.set(range, { at: now, data });
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
