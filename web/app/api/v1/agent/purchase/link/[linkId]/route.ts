import { NextRequest, NextResponse } from 'next/server';
import { handleX402Purchase } from '@/app/lib/backend/x402PurchaseHandler';
import { quoteSharedLinkPurchase } from '@/app/lib/backend/purchaseQuote';

/**
 * Buy a monetized shared link over x402. `402` without an `X-PAYMENT` header (a quote), `201`
 * with one (a completed purchase). See `handleX402Purchase` for the full two-phase protocol.
 *
 * **Nothing is copied here** - a successful purchase only adds the buyer to `paidUsers`; the
 * item is copied by claiming the link separately (`POST /api/shared-links/:linkId`, or the SDK's
 * `sharedLinks.claim()`/`purchaseAndClaim()`). See §1.3 of the stage doc for this asymmetry
 * with listing purchases.
 *
 * **The on-chain transfer settled here goes to the platform treasury for the full price, not
 * the seller** - see `fulfillPurchase`'s doc for the ledger-vs-settlement distinction.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ linkId: string }> },
): Promise<NextResponse> {
  const { linkId } = await context.params;
  return handleX402Purchase(request, (buyerId, affiliateCode) => quoteSharedLinkPurchase(linkId, buyerId, affiliateCode));
}
