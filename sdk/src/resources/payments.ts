import { isNodeRuntime } from "../config.js";
import type { HttpClient } from "../core/http.js";
import { computeBackoffMs, DEFAULT_RETRY_POLICY, sleep } from "../core/retry.js";
import {
  AgentNotActivatedError,
  CashDriveError,
  InsufficientBalanceError,
  NetworkError,
  PaymentRequiredError,
  PriceChangedError,
  ServerError,
  TimeoutError,
} from "../errors.js";
import type { Logger } from "../types/common.js";
import type {
  Balance,
  PaymentQuote,
  PaymentSigner,
  PendingPaymentEntry,
  PurchaseOptions,
  PurchaseResult,
  PurchaseTarget,
  RecoveryResult,
  XPaymentPayload,
  XPaymentRequirements,
} from "../types/payment.js";

function targetPath(target: PurchaseTarget): string {
  return target.type === "listing"
    ? `/v1/agent/purchase/listing/${encodeURIComponent(target.id)}`
    : `/v1/agent/purchase/link/${encodeURIComponent(target.linkId)}`;
}

function generateQuoteId(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let id = "";
  for (let i = 0; i < 10; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `q_${id}`;
}

function toPaymentQuote(target: PurchaseTarget, req: XPaymentRequirements): PaymentQuote {
  const cashdrive = (req.extra?.cashdrive ?? {}) as {
    breakdown?: PaymentQuote["breakdown"];
    affiliate?: PaymentQuote["affiliate"];
  };
  return {
    quoteId: generateQuoteId(),
    target,
    priceTinybars: req.amount,
    breakdown: cashdrive.breakdown ?? {
      platformFeeTinybars: "0",
      affiliateFeeTinybars: "0",
      sellerAmountTinybars: req.amount,
    },
    affiliate: cashdrive.affiliate ?? { applied: false },
    network: req.network,
    payTo: req.payTo,
    feePayer: typeof req.extra?.feePayer === "string" ? req.extra.feePayer : "",
    expiresInSeconds: req.maxTimeoutSeconds,
  };
}

/** Phase 1: request the endpoint with no `X-PAYMENT` header and read the 402's `accepts[0]`. */
async function fetchRequirements(
  getHttp: () => Promise<HttpClient>,
  path: string,
  affiliateCode: string | null,
): Promise<XPaymentRequirements> {
  const http = await getHttp();
  try {
    await http.request("POST", path, { body: affiliateCode ? { affiliateCode } : {}, retry: false });
  } catch (err) {
    if (err instanceof PaymentRequiredError && err.body && typeof err.body === "object") {
      const body = err.body as { accepts?: unknown };
      if (Array.isArray(body.accepts) && body.accepts.length > 0) {
        return body.accepts[0] as XPaymentRequirements;
      }
    }
    throw err;
  }
  throw new CashDriveError(
    "Expected the server to respond 402 with a quote, but it completed the purchase without payment.",
    "unexpected_response",
  );
}

/**
 * Phase 1 is a POST, so the shared HTTP core's method-based retry policy never applies to it
 * (POST is deliberately excluded - stage doc §4.4). Nothing has moved yet here, though, so
 * this wraps it in its own manual retry for transient network/5xx failures only - a 402
 * quote response itself is the success path, not a failure to retry.
 */
async function fetchRequirementsWithRetry(
  getHttp: () => Promise<HttpClient>,
  path: string,
  affiliateCode: string | null,
): Promise<XPaymentRequirements> {
  let lastError: unknown;
  for (let attempt = 0; attempt < DEFAULT_RETRY_POLICY.maxAttempts; attempt++) {
    try {
      return await fetchRequirements(getHttp, path, affiliateCode);
    } catch (err) {
      const transient = err instanceof NetworkError || err instanceof TimeoutError || err instanceof ServerError;
      if (!transient || attempt === DEFAULT_RETRY_POLICY.maxAttempts - 1) throw err;
      lastError = err;
      await sleep(computeBackoffMs(attempt));
    }
  }
  throw lastError;
}

async function assertActivated(profileName: string | undefined): Promise<void> {
  if (!isNodeRuntime()) {
    throw new CashDriveError(
      "Payments require a Node.js environment with a local profile. Import from \"cash-drive/agent\".",
      "node_required",
    );
  }
  const { readProfile } = await import("../agent/configStore.js");
  const profile = await readProfile(profileName);
  if (!profile || profile.agent.onboardingState !== "active") {
    throw new AgentNotActivatedError();
  }
}

async function defaultSigner(profileName: string | undefined): Promise<PaymentSigner> {
  const { LocalKeySigner } = await import("../agent/paymentSigner.js");
  return LocalKeySigner.fromProfile(profileName);
}

function encodePaymentHeader(payload: XPaymentPayload): string {
  const json = JSON.stringify(payload);
  if (typeof Buffer !== "undefined") return Buffer.from(json, "utf8").toString("base64");
  // No Buffer (browser): this path is unreachable in practice since signing itself requires
  // the Node-only signer above, but encode UTF-8-safely if it's ever hit.
  return btoa(unescape(encodeURIComponent(json)));
}

async function fetchBalance(getHttp: () => Promise<HttpClient>): Promise<Balance> {
  const http = await getHttp();
  const me = await http.request<{ wallet: { accountId: string | null; balanceTinybars: string } }>(
    "GET",
    "/v1/agent/me",
  );
  return { accountId: me.wallet.accountId, balanceTinybars: me.wallet.balanceTinybars };
}

/**
 * The shared purchase orchestration behind `listings.purchase()`/`sharedLinks.purchase()`:
 * quote -> pre-flight checks -> `onQuote` -> sign -> journal -> submit -> clear journal.
 * Standalone (not a `PaymentsResource` method) so both resources can call it without a
 * circular dependency between them and `PaymentsResource`.
 */
export async function executePurchase(
  ctx: { getHttp: () => Promise<HttpClient>; logger: Logger; profileName: string | undefined },
  target: PurchaseTarget,
  options: PurchaseOptions = {},
): Promise<PurchaseResult> {
  await assertActivated(ctx.profileName);

  const path = targetPath(target);
  const affiliateCode = options.affiliateCode ?? null;

  let requirements = await fetchRequirementsWithRetry(ctx.getHttp, path, affiliateCode);
  let quote = toPaymentQuote(target, requirements);
  const quotedAtMs = Date.now();

  if (options.maxPriceTinybars !== undefined && BigInt(quote.priceTinybars) > BigInt(options.maxPriceTinybars)) {
    throw new CashDriveError(
      `The quoted price (${quote.priceTinybars} tinybars) exceeds maxPriceTinybars (${options.maxPriceTinybars}). Refusing to pay.`,
      "price_exceeds_limit",
    );
  }

  const balance = await fetchBalance(ctx.getHttp);
  if (BigInt(balance.balanceTinybars) < BigInt(quote.priceTinybars)) {
    throw new InsufficientBalanceError(quote.priceTinybars, balance.balanceTinybars);
  }

  if (options.onQuote) {
    await options.onQuote(quote);
  }

  // onQuote may have waited on a human. Re-quote once if the original quote would have
  // expired by now, and refuse to silently pay a different price than what was shown.
  const elapsedSeconds = (Date.now() - quotedAtMs) / 1000;
  if (elapsedSeconds > quote.expiresInSeconds) {
    const freshRequirements = await fetchRequirementsWithRetry(ctx.getHttp, path, affiliateCode);
    const freshQuote = toPaymentQuote(target, freshRequirements);
    if (freshQuote.priceTinybars !== quote.priceTinybars) {
      throw new PriceChangedError(quote.priceTinybars, freshQuote.priceTinybars);
    }
    requirements = freshRequirements;
    quote = freshQuote;
  }

  if (affiliateCode && !quote.affiliate.applied) {
    ctx.logger.warn(
      `affiliateCode "${affiliateCode}" was not applied to this purchase - the backend silently declined attribution (invalid code, inactive affiliate, or the affiliate is the buyer).`,
    );
  }

  const signer = options.signer ?? (await defaultSigner(ctx.profileName));
  const signedPayload = await signer.signPaymentPayload(requirements);

  const { writePendingEntry, deletePendingEntry } = await import("../agent/paymentJournal.js");
  const pendingEntry: PendingPaymentEntry = {
    quoteId: quote.quoteId,
    target,
    priceTinybars: quote.priceTinybars,
    submittedAt: new Date().toISOString(),
    status: "submitted",
  };
  await writePendingEntry(pendingEntry);

  // Phase 2 is never retried, at any layer, for any reason - a retry here would re-submit an
  // already-signed payment payload. `retry: false` is defense in depth; POST is already
  // excluded from the shared HTTP core's retry policy (stage doc §4.4).
  const http = await ctx.getHttp();
  let responseBody: {
    transaction: Record<string, unknown>;
    copiedItem: PurchaseResult["copiedItem"];
    paymentDetails: PurchaseResult["paymentDetails"];
    affiliateCommission: PurchaseResult["affiliateCommission"];
    settlement: Record<string, unknown>;
  };
  try {
    responseBody = await http.request("POST", path, {
      body: affiliateCode ? { affiliateCode } : {},
      headers: { "X-PAYMENT": encodePaymentHeader(signedPayload) },
      retry: false,
    });
  } catch (err) {
    // The journal entry is deliberately left in place - its on-chain fate is unknown from
    // here. `payments.recoverPending()` resolves it later; never automatically re-pay.
    throw err;
  }

  await deletePendingEntry(quote.quoteId);

  return {
    transaction: responseBody.transaction,
    copiedItem: responseBody.copiedItem,
    paymentDetails: responseBody.paymentDetails,
    affiliateCommission: responseBody.affiliateCommission,
    affiliateApplied: affiliateCode ? quote.affiliate.applied : true,
    settlement: responseBody.settlement,
  };
}

export class PaymentsResource {
  constructor(
    private readonly getHttp: () => Promise<HttpClient>,
    private readonly logger: Logger,
    private readonly profileName: string | undefined,
  ) {}

  /**
   * Requests a price quote without paying - phase 1 of the x402 protocol, no signature and
   * no payment involved. Lets an agent show its operator a price before spending.
   *
   * @example
   * const quote = await client.payments.quote({ type: "listing", id: listingId });
   */
  async quote(target: PurchaseTarget, options: { affiliateCode?: string } = {}): Promise<PaymentQuote> {
    await assertActivated(this.profileName);
    const requirements = await fetchRequirementsWithRetry(this.getHttp, targetPath(target), options.affiliateCode ?? null);
    return toPaymentQuote(target, requirements);
  }

  /** The agent's own Hedera account balance, from `GET /v1/agent/me`. */
  async balance(): Promise<Balance> {
    return fetchBalance(this.getHttp);
  }

  /**
   * Resolves every entry in the local payment journal (`~/.cash-drive/pending/`) against the
   * backend's real purchase state. A payment whose settlement succeeded but whose `201`
   * response never arrived locally is reported `recovered` and cleared; anything else is
   * reported `needs_investigation` with no automatic re-payment.
   */
  async recoverPending(): Promise<RecoveryResult[]> {
    if (!isNodeRuntime()) {
      throw new CashDriveError("recoverPending() requires Node.js.", "node_required");
    }
    const { listPendingEntries, deletePendingEntry } = await import("../agent/paymentJournal.js");
    const entries = await listPendingEntries();

    const results: RecoveryResult[] = [];
    for (const entry of entries) {
      let landed: boolean;
      try {
        landed = await this.checkLanded(entry.target);
      } catch (err) {
        results.push({
          quoteId: entry.quoteId,
          target: entry.target,
          priceTinybars: entry.priceTinybars,
          outcome: "needs_investigation",
          message: `Could not check purchase status (${err instanceof Error ? err.message : String(err)}). A payment for ${entry.priceTinybars} tinybars was submitted at ${entry.submittedAt}; do not re-pay without confirming manually.`,
        });
        continue;
      }

      if (landed) {
        await deletePendingEntry(entry.quoteId);
        results.push({
          quoteId: entry.quoteId,
          target: entry.target,
          priceTinybars: entry.priceTinybars,
          outcome: "recovered",
          message: "The purchase landed on the backend; the local journal entry has been cleared.",
        });
      } else {
        results.push({
          quoteId: entry.quoteId,
          target: entry.target,
          priceTinybars: entry.priceTinybars,
          outcome: "needs_investigation",
          message: `A payment for ${entry.priceTinybars} tinybars was submitted at ${entry.submittedAt} but no matching purchase was found. Check the facilitator/Hedera mirror node before re-paying.`,
        });
      }
    }
    return results;
  }

  private async checkLanded(target: PurchaseTarget): Promise<boolean> {
    const http = await this.getHttp();
    if (target.type === "listing") {
      const status = await http.request<{ hasPurchased: boolean }>(
        "GET",
        `/listings/${encodeURIComponent(target.id)}/purchase-status`,
      );
      return status.hasPurchased;
    }
    const access = await http.request<{ alreadyPaid?: boolean }>(
      "GET",
      `/shared-links/${encodeURIComponent(target.linkId)}`,
    );
    return access.alreadyPaid === true;
  }
}
