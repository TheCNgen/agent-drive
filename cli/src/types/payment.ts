/**
 * Local, isomorphic mirror of the `@x402/core` v2 `PaymentRequirements`/`PaymentPayload`
 * wire shapes - kept independent of `@x402/core`'s types (a Node-only dependency for this
 * SDK, per the stage doc) so this file can be imported from `cash-drive` (root) as well as
 * `cash-drive/agent` without pulling in Hedera SDK code. `LocalKeySigner` (Node-only) is
 * where these are actually built and structurally match the real `@x402/core` types.
 */
export interface XPaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

export interface XPaymentPayload {
  x402Version: number;
  accepted: XPaymentRequirements;
  payload: Record<string, unknown>;
  resource?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

/**
 * The seam between the payment flow and however a signature actually gets produced. Only
 * one implementation ships in this stage ({@link LocalKeySigner}, `cash-drive/agent`), but
 * the interface is the extension point for hardware signers, KMS-backed signers, and spend
 * limits without a redesign.
 */
export interface PaymentSigner {
  readonly accountId: string;
  readonly evmAddress: string;
  signPaymentPayload(requirements: XPaymentRequirements): Promise<XPaymentPayload>;
}

export type PurchaseTarget = { type: "listing"; id: string } | { type: "sharedLink"; linkId: string };

export interface PaymentQuoteBreakdown {
  platformFeeTinybars: string;
  affiliateFeeTinybars: string;
  sellerAmountTinybars: string;
}

export interface PaymentQuoteAffiliate {
  applied: boolean;
  code?: string;
  rate?: number;
}

export interface PaymentQuote {
  /** Client-generated identifier for this quote, used as the payment journal's key. */
  quoteId: string;
  target: PurchaseTarget;
  priceTinybars: string;
  breakdown: PaymentQuoteBreakdown;
  affiliate: PaymentQuoteAffiliate;
  network: string;
  payTo: string;
  feePayer: string;
  expiresInSeconds: number;
}

export interface Balance {
  accountId: string | null;
  balanceTinybars: string;
}

export interface PurchaseOptions {
  affiliateCode?: string;
  /** Refuse to pay above this amount, checked against the quoted price before signing. */
  maxPriceTinybars?: string;
  /** Runs between quoting and paying; throwing here aborts cleanly - nothing has been signed yet. */
  onQuote?: (quote: PaymentQuote) => void | Promise<void>;
  /** Overrides the default `LocalKeySigner` built from the active profile. */
  signer?: PaymentSigner;
}

export interface PurchaseResult {
  transaction: Record<string, unknown>;
  /** Only set for a listing purchase - always `null` for a shared-link purchase (§1.3). */
  copiedItem: { _id: string; name: string; path: string } | null;
  paymentDetails: { transaction: string; network: string; payer: string; success: true };
  affiliateCommission: Record<string, unknown> | null;
  /**
   * `false` when an `affiliateCode` was supplied but the backend silently declined to
   * attribute it (§1.2's silent-failure defect) - a `logger.warn` is also emitted naming
   * the code. `true` when no code was supplied at all.
   */
  affiliateApplied: boolean;
  settlement: Record<string, unknown>;
}

/** `~/.cash-drive/pending/<quoteId>.json` - written before phase 2, deleted only after a 201. */
export interface PendingPaymentEntry {
  quoteId: string;
  target: PurchaseTarget;
  priceTinybars: string;
  submittedAt: string;
  status: "submitted";
}

export interface RecoveryResult {
  quoteId: string;
  target: PurchaseTarget;
  priceTinybars: string;
  /** `recovered`: the purchase landed and the journal entry was cleaned up. `needs_investigation`: unresolved - do not automatically re-pay. */
  outcome: "recovered" | "needs_investigation";
  message: string;
}
