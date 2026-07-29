export interface RetryPolicy {
  maxAttempts: number;
  baseMs: number;
  capMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseMs: 300,
  capMs: 5000,
};

const RETRYABLE_METHODS = new Set(["GET", "HEAD"]);
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

// A retried x402 purchase submission re-sends an already-signed payment payload. POST is
// already excluded from RETRYABLE_METHODS above, which already blocks this - this is a
// second, independent check so a future loosening of the method policy (e.g. allowing
// idempotent POSTs generically) can't silently re-enable retrying a `/purchase` call.
const NEVER_RETRY_PATH_SUBSTRINGS = ["/purchase"];

export function isRetryableMethod(method: string): boolean {
  return RETRYABLE_METHODS.has(method.toUpperCase());
}

export function isRetryablePath(path: string): boolean {
  return !NEVER_RETRY_PATH_SUBSTRINGS.some((s) => path.includes(s));
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/** Exponential backoff with full jitter: a uniform random delay in [0, min(cap, base * 2^attempt)]. */
export function computeBackoffMs(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const ceiling = Math.min(policy.capMs, policy.baseMs * 2 ** attempt);
  return Math.random() * ceiling;
}

/** Parses a Retry-After header (seconds, or an HTTP date) into milliseconds, if valid. */
export function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
