import { db, sql } from "@openstatus/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.run(sql`SELECT 1`);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
