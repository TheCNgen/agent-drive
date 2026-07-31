import { config } from '@/app/lib/config';
import { Listing, SharedLink, Transaction } from '@/app/lib/models';
import { Affiliate } from '@/app/models/Affiliate';
import type { PurchaseTarget, ResolvedAffiliate } from './fulfillPurchase';
import { PLATFORM_FEE_PERCENT } from './fulfillPurchase';

/** Typed validation failure for phase-1/phase-2 purchase checks - always a normal error, never a 402. */
export class PurchaseValidationError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'PurchaseValidationError';
    this.status = status;
    this.code = code;
  }
}

export interface QuoteBreakdown {
  platformFeeTinybars: string;
  affiliateFeeTinybars: string;
  sellerAmountTinybars: string;
}

export interface QuoteAffiliate {
  applied: boolean;
  code?: string;
  rate?: number;
}

export interface PurchaseQuote {
  target: PurchaseTarget;
  /** `listing._id` or the shared link's public `linkId` - whichever consumers address it by. */
  targetId: string;
  priceTinybars: string;
  platformFee: bigint;
  sellerAmount: bigint;
  breakdown: QuoteBreakdown;
  affiliate: QuoteAffiliate;
  resolvedAffiliate: ResolvedAffiliate | null;
  payTo: string;
  sellerAccountId: string;
  sellerPayoutWallet: string;
}

/** Mirrors `sdk/src/utils/hbar.ts`'s `percentOfTinybars` - separate packages, same integer-floor formula. */
function percentOfTinybars(value: bigint, percent: number): bigint {
  return (value * BigInt(percent)) / BigInt(100);
}

function treasuryAccountId(): string {
  const account = config.payments.treasuryContractId || config.payments.treasuryAccountId;
  if (!account) {
    throw new PurchaseValidationError(500, 'server_error', 'Platform fee account not configured.');
  }
  return account;
}

async function resolveAffiliate(
  affiliateCode: string | null | undefined,
  target: { listingId?: string; sharedLinkId?: string },
  affiliateEnabled: boolean,
  priceTinybars: bigint,
  buyerId: string,
): Promise<{ resolved: ResolvedAffiliate | null; summary: QuoteAffiliate }> {
  if (!affiliateCode || !affiliateEnabled) {
    return { resolved: null, summary: { applied: false, ...(affiliateCode ? { code: affiliateCode } : {}) } };
  }

  const query: Record<string, unknown> = { affiliateCode, status: 'active' };
  if (target.listingId) query.listing = target.listingId;
  if (target.sharedLinkId) query.sharedLink = target.sharedLinkId;

  const record = await Affiliate.findOne(query).populate('affiliateUser');
  const affiliateUser = record?.affiliateUser;
  const eligible =
    !!record && !!affiliateUser && !!affiliateUser.payoutWallet && affiliateUser._id.toString() !== buyerId;

  if (!eligible) {
    return { resolved: null, summary: { applied: false, code: affiliateCode } };
  }

  const feeTinybars = percentOfTinybars(priceTinybars, record.commissionRate);
  return {
    resolved: { record, affiliateUser, feeTinybars, code: affiliateCode },
    summary: { applied: true, code: affiliateCode, rate: record.commissionRate },
  };
}

/** Phase-1/phase-2 validation + fee breakdown + affiliate resolution for a listing purchase. */
export async function quoteListingPurchase(
  listingId: string,
  buyerId: string,
  affiliateCode?: string | null,
): Promise<PurchaseQuote> {
  const listing = await Listing.findById(listingId).populate('item').populate('seller');
  if (!listing) {
    throw new PurchaseValidationError(404, 'not_found', 'Listing not found.');
  }
  if (listing.status !== 'active') {
    throw new PurchaseValidationError(400, 'bad_request', 'This listing is no longer available for purchase.');
  }
  if (listing.seller._id.toString() === buyerId) {
    throw new PurchaseValidationError(400, 'bad_request', 'You cannot purchase your own listing.');
  }
  if (!listing.seller.payoutWallet) {
    throw new PurchaseValidationError(400, 'bad_request', 'Seller has not configured a payout wallet.');
  }

  const existing = await Transaction.exists({ listing: listingId, buyer: buyerId, status: 'completed' });
  if (existing) {
    throw new PurchaseValidationError(409, 'conflict', 'You have already purchased this item.');
  }

  const priceTinybars = BigInt(listing.priceTinybars);
  const platformFee = percentOfTinybars(priceTinybars, Number(PLATFORM_FEE_PERCENT));
  const { resolved, summary } = await resolveAffiliate(
    affiliateCode,
    { listingId },
    listing.affiliateEnabled,
    priceTinybars,
    buyerId,
  );
  const affiliateFee = resolved?.feeTinybars ?? BigInt(0);
  const sellerAmount = priceTinybars - platformFee - affiliateFee;

  return {
    target: { type: 'listing', doc: listing },
    targetId: listing._id.toString(),
    priceTinybars: listing.priceTinybars,
    platformFee,
    sellerAmount,
    breakdown: {
      platformFeeTinybars: platformFee.toString(),
      affiliateFeeTinybars: affiliateFee.toString(),
      sellerAmountTinybars: sellerAmount.toString(),
    },
    affiliate: summary,
    resolvedAffiliate: resolved,
    payTo: treasuryAccountId(),
    sellerAccountId: listing.seller.accountId,
    sellerPayoutWallet: listing.seller.payoutWallet,
  };
}

/** Phase-1/phase-2 validation + fee breakdown + affiliate resolution for a shared-link purchase. */
export async function quoteSharedLinkPurchase(
  linkId: string,
  buyerId: string,
  affiliateCode?: string | null,
): Promise<PurchaseQuote> {
  const sharedLink = await SharedLink.findOne({ linkId, isActive: true, type: 'monetized' })
    .populate('owner', 'name email wallet accountId')
    .populate('item', 'name type size mimeType');

  if (!sharedLink) {
    throw new PurchaseValidationError(404, 'not_found', 'Monetized link not found or expired.');
  }
  if (sharedLink.expiresAt && new Date() > sharedLink.expiresAt) {
    throw new PurchaseValidationError(410, 'gone', 'Link has expired.');
  }
  if (sharedLink.owner._id.toString() === buyerId) {
    throw new PurchaseValidationError(400, 'bad_request', 'You cannot purchase your own content.');
  }
  if (!sharedLink.owner.payoutWallet) {
    throw new PurchaseValidationError(400, 'bad_request', 'Owner has not configured a payout wallet.');
  }

  if (!sharedLink.owner.accountId) {
    throw new PurchaseValidationError(400, 'bad_request', 'Seller Hedera account not found.');
  }

  const hasPaid = sharedLink.paidUsers.some((paidUserId: { toString(): string }) => paidUserId.toString() === buyerId);
  if (hasPaid) {
    throw new PurchaseValidationError(409, 'conflict', 'You have already paid for this content.');
  }
  if (!sharedLink.priceTinybars) {
    throw new PurchaseValidationError(400, 'bad_request', 'This link has no price configured.');
  }

  const priceTinybars = BigInt(sharedLink.priceTinybars);
  const platformFee = percentOfTinybars(priceTinybars, Number(PLATFORM_FEE_PERCENT));
  const { resolved, summary } = await resolveAffiliate(
    affiliateCode,
    { sharedLinkId: sharedLink._id.toString() },
    sharedLink.affiliateEnabled,
    priceTinybars,
    buyerId,
  );
  const affiliateFee = resolved?.feeTinybars ?? BigInt(0);
  const sellerAmount = priceTinybars - platformFee - affiliateFee;

  return {
    target: { type: 'sharedLink', doc: sharedLink },
    targetId: sharedLink.linkId,
    priceTinybars: sharedLink.priceTinybars,
    platformFee,
    sellerAmount,
    breakdown: {
      platformFeeTinybars: platformFee.toString(),
      affiliateFeeTinybars: affiliateFee.toString(),
      sellerAmountTinybars: sellerAmount.toString(),
    },
    affiliate: summary,
    resolvedAffiliate: resolved,
    payTo: treasuryAccountId(),
    sellerAccountId: sharedLink.owner.accountId,
    sellerPayoutWallet: sharedLink.owner.payoutWallet,
  };
}
