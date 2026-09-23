import { db, eq } from "@openstatus/db";
import { page } from "@openstatus/db/src/schema";
import { NextResponse, type NextRequest } from "next/server";

import { ORIGIN_LOCK_HEADER, originLockAllows } from "./lib/origin-lock";

// A single public tenant; Auth.js must not replace the internal rewrite origin.
export default async function proxy(req: NextRequest) {
  const url = req.nextUrl.clone();
  if (
    !originLockAllows({
      pathname: url.pathname,
      header: req.headers.get(ORIGIN_LOCK_HEADER),
      expected: process.env.ORIGIN_LOCK,
    })
  )
    return new NextResponse(null, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  // Machine routes serve themselves; only the lock above applies to them.
  if (url.pathname.startsWith("/api/")) return NextResponse.next();
  if (/^\/(brand|fonts)\//.test(url.pathname)) return NextResponse.next();
  const tenant = await db
    .select({ accessType: page.accessType, published: page.published })
    .from(page)
    .where(eq(page.id, 1))
    .get();
  if (!tenant?.published || tenant.accessType !== "public")
    return new NextResponse("Not found", { status: 404 });
  if (url.pathname.startsWith("/oeffigo/")) return NextResponse.next();
  const english = url.pathname === "/en" || url.pathname.startsWith("/en/");
  const path = english ? url.pathname.slice(3) : url.pathname;
  url.pathname = `/oeffigo/${english ? "en" : "de"}${path === "/" ? "" : path}`;
  return NextResponse.rewrite(url);
}
export const config = {
  // `api` stays in: the origin lock has to see those requests too.
  matcher: [
    "/((?!assets|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
