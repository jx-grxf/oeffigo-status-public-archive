import type { NextRequest } from "next/server";

import { stripHostPort } from "../../../lib/domain";

export const dynamic = "force-dynamic";

/** AGPL-3.0 §13: every visitor can reach the source of the running version. */
export async function GET(request: NextRequest) {
  const host =
    stripHostPort(request.headers.get("x-forwarded-host")) ??
    new URL(request.url).hostname;
  const body = [
    "ÖffiGo Status",
    "",
    "Diese Statusseite basiert auf OpenStatus und steht unter der GNU Affero",
    "General Public License, Version 3 (AGPL-3.0).",
    "",
    `Quellcode dieser Version: https://${host}/api/source`,
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
      "Cache-Control": "public, max-age=3600",
    },
  });
}
