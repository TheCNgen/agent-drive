import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedKind,
  SupportedResponse,
  VerifyResponse,
} from '@x402/core/types';
import { config } from '@/app/lib/config';

const X402_VERSION = 2;
const SCHEME = 'exact';
const NETWORK = 'hedera:testnet';

const VERIFY_TIMEOUT_MS = 10_000;
const SETTLE_TIMEOUT_MS = 30_000;
const SUPPORTED_TIMEOUT_MS = 10_000;
const SUPPORTED_CACHE_MS = 5 * 60 * 1000;

// Nothing has moved for a /verify call, so a network failure is safe to retry. A /settle
// call is never retried, at any layer, for any reason - see the stage doc's §2.2/§3.3.
const VERIFY_MAX_ATTEMPTS = 3;
const VERIFY_RETRY_BASE_MS = 300;

function facilitatorUrl(): string {
  return config.payments.facilitatorUrl.replace(/\/+$/, '');
}

/**
 * Thrown for any failure talking to the facilitator - unreachable, timed out, or a non-2xx
 * response. Distinct from a *successful* call that reports `isValid: false` /
 * `success: false`, which is a normal `VerifyResponse`/`SettleResponse`, not a thrown error.
 */
export class FacilitatorError extends Error {
  readonly status?: number;
  readonly body?: unknown;
  constructor(message: string, options: { status?: number; body?: unknown; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'FacilitatorError';
    if (options.status !== undefined) this.status = options.status;
    if (options.body !== undefined) this.body = options.body;
  }
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

async function request<T>(path: string, options: { method: 'GET' | 'POST'; body?: unknown; timeoutMs: number }): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${facilitatorUrl()}${path}`, {
      method: options.method,
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(jsonSafe(options.body)) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new FacilitatorError(
      aborted ? `Facilitator ${path} timed out after ${options.timeoutMs}ms` : `Facilitator ${path} unreachable`,
      { cause: err },
    );
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
    throw new FacilitatorError(`Facilitator ${path} responded with status ${res.status}`, {
      status: res.status,
      body: parsed,
    });
  }

  return parsed as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let supportedCache: { value: SupportedResponse; expiresAt: number } | null = null;

function findHederaTestnetKind(supported: SupportedResponse): SupportedKind | undefined {
  return supported.kinds.find(
    (k) => k.x402Version === X402_VERSION && k.scheme === SCHEME && k.network === NETWORK,
  );
}

/**
 * `GET /supported`, cached 5 minutes. Validates `hedera:testnet` is still advertised and logs
 * the current fee payer on every real fetch (i.e. on cache miss, which includes the first
 * call) - a facilitator that silently stopped supporting Hedera should be a loud, early
 * failure, not a mysterious 402 on the next purchase.
 */
export async function getSupported(): Promise<SupportedResponse> {
  const now = Date.now();
  if (supportedCache && supportedCache.expiresAt > now) {
    return supportedCache.value;
  }

  const value = await request<SupportedResponse>('/supported', { method: 'GET', timeoutMs: SUPPORTED_TIMEOUT_MS });

  const hederaTestnet = findHederaTestnetKind(value);
  if (!hederaTestnet) {
    throw new FacilitatorError(
      `Facilitator at ${facilitatorUrl()} no longer advertises ${NETWORK}/${SCHEME}/v${X402_VERSION} support.`,
      { body: value },
    );
  }
  const feePayer = (hederaTestnet.extra as Record<string, unknown> | undefined)?.feePayer;
  console.log(`[x402] facilitator ${facilitatorUrl()} supports ${NETWORK}, fee payer: ${String(feePayer)}`);

  supportedCache = { value, expiresAt: now + SUPPORTED_CACHE_MS };
  return value;
}

/** The fee payer the facilitator currently advertises for `hedera:testnet`/`exact`. Never hardcoded. */
export async function getFeePayer(): Promise<string> {
  const supported = await getSupported();
  const kind = findHederaTestnetKind(supported);
  const feePayer = (kind?.extra as Record<string, unknown> | undefined)?.feePayer;
  if (typeof feePayer !== 'string' || !feePayer) {
    throw new FacilitatorError('Facilitator /supported did not advertise a feePayer for hedera:testnet.');
  }
  return feePayer;
}

/** `POST /verify`. Retried on network failure only - nothing has moved yet. */
export async function verify(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < VERIFY_MAX_ATTEMPTS; attempt++) {
    try {
      return await request<VerifyResponse>('/verify', {
        method: 'POST',
        timeoutMs: VERIFY_TIMEOUT_MS,
        body: { x402Version: X402_VERSION, paymentPayload, paymentRequirements },
      });
    } catch (err) {
      lastError = err;
      // A well-formed rejection (4xx with a body) is the facilitator telling us the payment
      // is invalid, not a transient failure - do not retry it.
      if (err instanceof FacilitatorError && err.status !== undefined) throw err;
      if (attempt < VERIFY_MAX_ATTEMPTS - 1) {
        await sleep(VERIFY_RETRY_BASE_MS * 2 ** attempt);
      }
    }
  }
  throw lastError;
}

/**
 * `POST /settle`. **Never retried, under any circumstances** - a retried settle can
 * double-submit a signed payment. If this throws, the transaction's on-chain fate is
 * ambiguous; callers must not treat a thrown `FacilitatorError` here as "nothing happened."
 */
export async function settle(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  return request<SettleResponse>('/settle', {
    method: 'POST',
    timeoutMs: SETTLE_TIMEOUT_MS,
    body: { x402Version: X402_VERSION, paymentPayload, paymentRequirements },
  });
}
