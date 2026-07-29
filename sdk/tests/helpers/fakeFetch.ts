export type FetchHandler = (url: URL, init: RequestInit, callCount: number) => Response | Promise<Response>;

export interface FakeFetch {
  fetch: typeof globalThis.fetch;
  calls: Array<{ url: URL; init: RequestInit }>;
}

/** A minimal fetch stand-in for injecting into HttpClient/redeemClaim in tests. */
export function createFakeFetch(handler: FetchHandler): FakeFetch {
  const calls: Array<{ url: URL; init: RequestInit }> = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : (input as Request).url);
    const resolvedInit = init ?? {};
    calls.push({ url, init: resolvedInit });

    if (resolvedInit.signal?.aborted) {
      const err = new Error("The operation was aborted.");
      err.name = "AbortError";
      throw err;
    }

    return handler(url, resolvedInit, calls.length);
  }) as typeof fetch;

  return { fetch: fetchImpl, calls };
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function textResponse(status: number, text: string, headers: Record<string, string> = {}): Response {
  return new Response(text, { status, headers: { "Content-Type": "text/html", ...headers } });
}
