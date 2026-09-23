import { sourceUrl } from "../../../lib/source-url";

export const dynamic = "force-dynamic";

/** AGPL-3.0 §13: every visitor can reach the source of the running version. */
export async function GET() {
  const source = sourceUrl(
    process.env.PUBLIC_SOURCE_REPO_URL,
    process.env.RAILWAY_GIT_COMMIT_SHA,
  );
  if (!source)
    return new Response("Source temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  const body = [
    "ÖffiGo Status",
    "",
    "Diese Statusseite basiert auf OpenStatus und steht unter der GNU Affero",
    "General Public License, Version 3 (AGPL-3.0).",
    "",
    `Quellcode dieser Version: ${source}`,
    "Lizenztext: https://www.gnu.org/licenses/agpl-3.0.html",
    "OpenStatus: https://github.com/openstatusHQ/openstatus",
    "",
    "This status page is based on OpenStatus and licensed under the GNU Affero",
    "General Public License v3.0. The source code of the running version is",
    "available at the link above.",
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
