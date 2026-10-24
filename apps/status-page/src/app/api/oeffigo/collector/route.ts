import { lastCheckAge } from "../../../../lib/oeffigo/collector";

export const dynamic = "force-dynamic";

// Drei verpasste Minuten: ab dann zeigt die Seite einen alten Stand.
const MAX_AGE_MS = 180_000;

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const age = await lastCheckAge();
    const ok = age <= MAX_AGE_MS;
    return Response.json(
      { ok, ageSeconds: Number.isFinite(age) ? Math.round(age / 1000) : null },
      { status: ok ? 200 : 503, headers },
    );
  } catch {
    return Response.json(
      { ok: false, ageSeconds: null },
      { status: 503, headers },
    );
  }
}
