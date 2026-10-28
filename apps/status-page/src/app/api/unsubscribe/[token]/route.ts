import { appRouter } from "@openstatus/api/src/root";
import { createTRPCContext } from "@openstatus/api/src/trpc";
import { type NextRequest, NextResponse } from "next/server";

import { stripHostPort } from "../../../../lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ token: string }> };

function requestHost(request: NextRequest) {
  return (
    stripHostPort(request.headers.get("x-forwarded-host")) ??
    new URL(request.url).hostname
  );
}

// Link scanners open URLs with GET, so only a person reaching the page can confirm.
export async function GET(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const path = TOKEN.test(token) ? `/unsubscribe/${token}` : "/";
  return NextResponse.redirect(
    new URL(path, `https://${requestHost(request)}`),
    { status: 303, headers: NO_STORE },
  );
}

/** RFC 8058 one-click unsubscribe, sent by mail clients without cookies. */
export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  if (!TOKEN.test(token))
    return new NextResponse(null, { status: 400, headers: NO_STORE });
  try {
    // Mail clients send no session; the public procedure resolves the token for this host.
    const caller = appRouter.createCaller(
      await createTRPCContext({ req: request }),
    );
    await caller.statusPage.unsubscribe({
      token,
      domain: requestHost(request),
    });
    return new NextResponse(null, { status: 200, headers: NO_STORE });
  } catch {
    return new NextResponse(null, { status: 404, headers: NO_STORE });
  }
}
