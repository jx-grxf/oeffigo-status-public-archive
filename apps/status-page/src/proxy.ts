import { db, eq } from "@openstatus/db";
import { page } from "@openstatus/db/src/schema";
import { NextResponse, type NextRequest } from "next/server";

import { LOCALE_COOKIE, prefersEnglish } from "./lib/locale-cookie";
import { ORIGIN_LOCK_HEADER, originLockAllows } from "./lib/origin-lock";

type Tenant = { accessType: string | null; published: boolean | null };
let tenantCache: { at: number; tenant: Tenant | undefined } | null = null;
const TENANT_TTL_MS = 30_000;

// Jeder Seitenaufruf fragte sonst die Datenbank; eine Freigabeänderung wirkt nach höchstens 30 s.
async function readTenant() {
  const now = Date.now();
  if (tenantCache && now - tenantCache.at < TENANT_TTL_MS)
    return tenantCache.tenant;
  const tenant = await db
    .select({ accessType: page.accessType, published: page.published })
    .from(page)
    .where(eq(page.id, 1))
    .get();
  tenantCache = { at: now, tenant };
  return tenant;
}

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
  // Prototyp ohne Datenbank; im Produktionsbuild fällt der Pfad in die Umschreibung und endet im 404.
  if (
    process.env.NODE_ENV !== "production" &&
    url.pathname.startsWith("/proto/")
  )
    return NextResponse.next();
  const tenant = await readTenant();
  if (!tenant?.published || tenant.accessType !== "public")
    return new NextResponse("Not found", { status: 404 });
  if (url.pathname.startsWith("/oeffigo/")) return NextResponse.next();
  // Next lehnt relative Ziele ab (500 am 27.10.); nextUrl trägt hinter dem Proxy den
  // internen Host, deshalb der öffentliche aus den Kopfzeilen.
  if (
    url.pathname === "/" &&
    prefersEnglish(
      req.headers.get("accept-language"),
      req.cookies.has(LOCALE_COOKIE),
    )
  ) {
    const host =
      req.headers.get("x-forwarded-host") ??
      req.headers.get("host") ??
      "status.oeffigo.app";
    const target = new URL(`/en${url.search}`, `https://${host}`);
    const response = NextResponse.redirect(target, 307);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Vary", "Accept-Language, Cookie");
    return response;
  }
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
