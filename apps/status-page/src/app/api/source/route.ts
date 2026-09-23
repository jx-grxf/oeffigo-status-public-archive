import { sourceUrl } from "../../../lib/source-url";

export const dynamic = "force-dynamic";
export async function GET() {
  const url = sourceUrl(
    process.env.PUBLIC_SOURCE_REPO_URL,
    process.env.RAILWAY_GIT_COMMIT_SHA,
  );
  if (!url)
    return Response.json(
      { error: "source_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  return new Response(null, {
    status: 307,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
}
