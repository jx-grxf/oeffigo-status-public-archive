import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const path = "/app/oeffigo-source.tar.gz";
    const info = await stat(path);
    // Node's web stream contains the bytes emitted by the file stream.
    const body = Readable.toWeb(
      createReadStream(path),
    ) as ReadableStream<Uint8Array>;
    return new Response(body, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(info.size),
        "Content-Disposition":
          "attachment; filename=oeffigo-status-source.tar.gz",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "source_unavailable" }, { status: 503 });
  }
}
