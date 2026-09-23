import { readStatus } from "../../../lib/oeffigo/collector";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await readStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "status_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
