import type { Logger } from "../types/common.js";
import { NetworkError, ServerError, TimeoutError, errorFromApiResponse } from "../errors.js";
import { buildQueryString, type QueryParams } from "./query.js";
import { DEFAULT_RETRY_POLICY, computeBackoffMs, isRetryableMethod, isRetryableStatus, parseRetryAfterMs, sleep, type RetryPolicy } from "./retry.js";

export interface AuthStrategy {
  prepare(headers: Headers): void | Promise<void>;
}

export interface HttpClientConfig {
  baseUrl: string;
  apiPrefix: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  maxRetries: number;
  logger: Logger;
  auth?: AuthStrategy;
  retryPolicy?: RetryPolicy;
}

export interface RequestOptions {
  body?: unknown;
  query?: QueryParams | undefined;
  /** Set false to forbid retries even for GET/HEAD, e.g. one-shot state transitions. */
  retry?: boolean | undefined;
  signal?: AbortSignal | undefined;
}

function joinUrl(baseUrl: string, apiPrefix: string, path: string, query?: QueryParams): URL {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPrefix = "/" + apiPrefix.replace(/^\/+|\/+$/g, "");
  const normalizedPath = "/" + path.replace(/^\/+/, "");
  const url = new URL(trimmedBase + normalizedPrefix + normalizedPath);
  const qs = buildQueryString(query);
  if (qs) url.search = qs;
  return url;
}

export class HttpClient {
  constructor(private readonly config: HttpClientConfig) {}

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const { body, query, signal } = options;
    const url = joinUrl(this.config.baseUrl, this.config.apiPrefix, path, query);
    const policy = this.config.retryPolicy ?? DEFAULT_RETRY_POLICY;
    const canRetry = (options.retry ?? true) && isRetryableMethod(method);
    const maxAttempts = canRetry ? Math.max(1, this.config.maxRetries) : 1;

    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const onOuterAbort = () => controller.abort();
      signal?.addEventListener("abort", onOuterAbort);
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

      let res: Response;
      try {
        const headers = new Headers({ Accept: "application/json" });
        if (body !== undefined) headers.set("Content-Type", "application/json");
        if (this.config.auth) await this.config.auth.prepare(headers);

        const init: RequestInit = { method, headers, signal: controller.signal };
        if (body !== undefined) init.body = JSON.stringify(body);
        res = await this.config.fetchImpl(url, init);
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        if (aborted) {
          throw new TimeoutError(`Request timed out after ${this.config.timeoutMs}ms.`, { method, path });
        }
        const networkError = new NetworkError(
          err instanceof Error ? err.message : "Network request failed.",
          { method, path, cause: err },
        );
        if (canRetry && attempt < maxAttempts - 1) {
          lastError = networkError;
          await sleep(computeBackoffMs(attempt, policy));
          continue;
        }
        throw networkError;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onOuterAbort);
      }

      if (!res.ok && canRetry && isRetryableStatus(res.status) && attempt < maxAttempts - 1) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
        lastError = new ServerError(res.statusText || `Request failed with status ${res.status}`, {
          status: res.status,
          method,
          path,
        });
        await sleep(retryAfterMs ?? computeBackoffMs(attempt, policy));
        continue;
      }

      return await this.parseResponse<T>(res, method, path);
    }
    throw lastError;
  }

  private async parseResponse<T>(res: Response, method: string, path: string): Promise<T> {
    if (res.status === 204) return undefined as T;

    const text = await res.text();
    if (!text) {
      if (!res.ok) {
        throw errorFromApiResponse(res.status, { error: res.statusText }, { method, path });
      }
      return undefined as T;
    }

    let parsed: unknown;
    let isJson = true;
    try {
      parsed = JSON.parse(text);
    } catch {
      isJson = false;
    }

    if (!res.ok) {
      if (isJson && typeof parsed === "object" && parsed !== null) {
        throw errorFromApiResponse(res.status, parsed as Record<string, unknown>, { method, path });
      }
      // Next.js can crash and return an HTML page; there's no `code` to branch on there.
      throw new ServerError(res.statusText || `Request failed with status ${res.status}`, {
        status: res.status,
        method,
        path,
        body: text.slice(0, 500),
      });
    }

    return parsed as T;
  }
}
