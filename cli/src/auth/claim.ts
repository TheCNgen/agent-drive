import { NetworkError, ServerError, TimeoutError, ValidationError, errorFromApiResponse } from "../errors.js";
import type { ClaimResult } from "../types/agent.js";
import { SDK_VERSION } from "../version.js";

const CLAIM_CODE_PATTERN = /^[0-9a-f]{32}$/;
const CLAIM_PATH = "/v1/agent/claim";

export interface RedeemClaimOptions {
  code: string;
  baseUrl: string;
  apiPrefix?: string | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  timeoutMs?: number | undefined;
}

/** Strips pasted whitespace and a `--claim=`/`claim=` artefact, then lowercases. */
function normalizeClaimCode(raw: string): string {
  let code = raw.trim();
  const flagPrefix = /^--?claim[=\s]/i;
  if (flagPrefix.test(code)) {
    code = code.replace(flagPrefix, "");
  }
  return code.trim().toLowerCase();
}

function isNodeRuntime(): boolean {
  return typeof process !== "undefined" && process.versions != null && process.versions.node != null;
}

function buildClientInfo() {
  const isNode = isNodeRuntime();
  return {
    name: "agent-drive",
    version: SDK_VERSION,
    platform: isNode ? process.platform : typeof navigator !== "undefined" ? navigator.platform : "unknown",
    runtime: isNode ? "node" : "browser",
  };
}

/**
 * Redeems a single-use claim code for an API key. Never retries — the redemption is a
 * one-shot server-side state transition, and a retry after a lost response would spend
 * the code without the caller ever seeing the key.
 */
export async function redeemClaim(options: RedeemClaimOptions): Promise<ClaimResult> {
  const code = normalizeClaimCode(options.code);
  if (!CLAIM_CODE_PATTERN.test(code)) {
    throw new ValidationError("Claim codes are 32 hexadecimal characters.");
  }

  const apiPrefix = (options.apiPrefix ?? "/api").replace(/\/+$/, "");
  const base = options.baseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}${apiPrefix}${CLAIM_PATH}`);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ code, client: buildClientInfo() }),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    if (aborted) {
      throw new TimeoutError(`Claim redemption timed out after ${timeoutMs}ms.`, {
        method: "POST",
        path: CLAIM_PATH,
      });
    }
    throw new NetworkError(err instanceof Error ? err.message : "Network request failed.", {
      method: "POST",
      path: CLAIM_PATH,
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }

  if (!res.ok) {
    if (parsed && typeof parsed === "object") {
      throw errorFromApiResponse(res.status, parsed as Record<string, unknown>, {
        method: "POST",
        path: CLAIM_PATH,
      });
    }
    throw new ServerError(res.statusText || `Request failed with status ${res.status}`, {
      status: res.status,
      method: "POST",
      path: CLAIM_PATH,
      body: text.slice(0, 500),
    });
  }

  return parsed as ClaimResult;
}
