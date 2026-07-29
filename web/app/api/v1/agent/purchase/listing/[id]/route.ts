import { NextRequest, NextResponse } from 'next/server';
import { handleX402Purchase } from '@/app/lib/backend/x402PurchaseHandler';
import { quoteListingPurchase } from '@/app/lib/backend/purchaseQuote';

/**
 * Buy a marketplace listing over x402. `402` without an `X-PAYMENT` header (a quote), `201`
 * with one (a completed purchase). See `handleX402Purchase` for the full two-phase protocol.
 *
 * **The on-chain transfer settled here goes to the platform treasury for the full price, not
 * the seller** - `sellerAmount`/affiliate fee are written as ledger-only `Transaction` rows
 * pending an off-chain payout, exactly as the legacy (session-signed) purchase route always
 * behaved. See `fulfillPurchase`'s doc for details.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params;
  return handleX402Purchase(request, (buyerId, affiliateCode) => quoteListingPurchase(id, buyerId, affiliateCode));
}
