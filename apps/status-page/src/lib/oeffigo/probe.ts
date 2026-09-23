export async function probe(
  url: string,
  health = false,
  fetcher: typeof fetch = fetch,
) {
  const start = Date.now();
  let status: number | null = null;
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
      headers: { "User-Agent": "OeffiGo-Status/1.0" },
    });
    status = response.status;
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, ms: Date.now() - start, status, failure: "http" };
    }
    if (health) {
      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (
          error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name)
        )
          throw error;
        return {
          ok: false,
          ms: Date.now() - start,
          status,
          failure: "invalid_body",
        };
      }
      if (
        !body ||
        typeof body !== "object" ||
        !("ok" in body) ||
        typeof body.ok !== "boolean"
      )
        return {
          ok: false,
          ms: Date.now() - start,
          status,
          failure: "invalid_body",
        };
      return {
        ok: body.ok,
        ms: Date.now() - start,
        status,
        failure: body.ok ? null : "unhealthy",
      };
    }
    await response.body?.cancel();
    return { ok: true, ms: Date.now() - start, status, failure: null };
  } catch (error) {
    const timeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      ms: Date.now() - start,
      status,
      failure: timeout ? "timeout" : "network",
    };
  }
}
