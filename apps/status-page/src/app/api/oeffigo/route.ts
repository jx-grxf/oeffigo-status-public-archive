import { type Range, ranges } from "../../../lib/oeffigo/availability";
import { readStatus } from "../../../lib/oeffigo/collector";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const asked = new URL(request.url).searchParams.get("range");
  const range: Range = ranges.includes(asked as Range)
    ? (asked as Range)
    : "24h";
  try {
    return Response.json(await readStatus(range), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "status_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
