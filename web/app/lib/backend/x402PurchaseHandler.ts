import { decodePaymentSignatureHeader, encodePaymentResponseHeader } from '@x402/core/http';
import type { PaymentPayload, PaymentRequirements } from '@x402/core/types';
import { NextRequest, NextResponse } from 'next/server';
import { PrincipalError, principalErrorToResponse } from '@/app/lib/backend/errors';
import { requirePrincipal } from '@/app/lib/backend/resolvePrincipal';
import connectDB from '@/app/lib/mongodb';
import { fulfillPurchase } from './fulfillPurchase';
import { PurchaseValidationError, type PurchaseQuote } from './purchaseQuote';
import { FacilitatorError, getFeePayer, settle, verify } from './x402Facilitator';

const X402_VERSION = 2;
const MAX_TIMEOUT_SECONDS = 180;

async function buildPaymentRequirements(quote: PurchaseQuote): Promise<PaymentRequirements> {
  const feePayer = await getFeePayer();
  return {
    scheme: 'exact',
    network: 'hedera:testnet',
    asset: '0.0.0',
    amount: quote.priceTinybars,
    payTo: quote.payTo,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: {
      feePayer,
      cashdrive: {
        target: { type: quote.target.type, id: quote.targetId },
        breakdown: quote.breakdown,
        affiliate: quote.affiliate,
      },
    },
  };
}

function requirementsMatch(a: PaymentRequirements, b: PaymentRequirements): boolean {
  return a.scheme === b.scheme && a.network === b.network && a.asset === b.asset && a.amount === b.amount && a.payTo === b.payTo;
}

/**
 * Drives the x402 two-phase purchase protocol (stage doc §3.2) for either a listing or a
 * shared-link target - the two route handlers differ only in how they build a
 * {@link PurchaseQuote}. **Agent-only**: requires a Bearer principal with `payments:spend`;
 * never accepts the human session lane (the legacy `/api/listings/*`/`/api/shared-links/*`
 * purchase routes stay session-only).
 *
 * **The on-chain transfer this settles goes to the platform treasury, not the seller** -
 * `sellerAmount`/affiliate fee become ledger-only `Transaction` rows via `fulfillPurchase`,
 * pending an off-chain payout. See that function's doc for the full explanation.
 */
export async function handleX402Purchase(
  request: NextRequest,
  buildQuote: (buyerId: string, affiliateCode: string | null) => Promise<PurchaseQuote>,
): Promise<NextResponse> {
  try {
    await connectDB();

    const principal = await requirePrincipal(request, 'payments:spend');
    if (principal.kind !== 'agent') {
      throw new PrincipalError(401, 'unauthenticated', 'Bearer token required');
    }

    let affiliateCode: string | null = null;
    try {
      const body = await request.json();
      affiliateCode = typeof body?.affiliateCode === 'string' ? body.affiliateCode : null;
    } catch {
      // no body / not JSON - affiliateCode stays null
    }

    // Re-run phase-1 validation on every call, including phase 2: the listing/link may have
    // been deactivated, expired, or already purchased between the quote and the payment.
    let quote: PurchaseQuote;
    try {
      quote = await buildQuote(principal.userId, affiliateCode);
    } catch (err) {
      if (err instanceof PurchaseValidationError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
      }
      throw err;
    }

    const requirements = await buildPaymentRequirements(quote);
    const xPayment = request.headers.get('x-payment');

    if (!xPayment) {
      // Phase 1: quote only, nothing signed or paid yet.
      return NextResponse.json({ x402Version: X402_VERSION, accepts: [requirements] }, { status: 402 });
    }

    // Phase 2: a signed payment payload is attached.
    let paymentPayload: PaymentPayload;
    try {
      paymentPayload = decodePaymentSignatureHeader(xPayment);
    } catch {
      return NextResponse.json({ error: 'Malformed X-PAYMENT header.', code: 'payment_mismatch' }, { status: 400 });
    }

    if (!paymentPayload.accepted || !requirementsMatch(paymentPayload.accepted, requirements)) {
      return NextResponse.json(
        { error: 'Payment does not match the quoted requirements.', code: 'payment_mismatch' },
        { status: 400 },
      );
    }

    let verifyResult;
    try {
      verifyResult = await verify(paymentPayload, requirements);
    } catch (err) {
      console.error('[x402] verify failed:', err);
      if (err instanceof FacilitatorError && err.status === undefined) {
        return NextResponse.json(
          { error: 'The payment facilitator is unreachable.', code: 'facilitator_unavailable' },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { x402Version: X402_VERSION, accepts: [requirements], error: 'payment_verification_failed', code: 'payment_verification_failed' },
        { status: 402 },
      );
    }

    if (!verifyResult.isValid) {
      return NextResponse.json(
        {
          x402Version: X402_VERSION,
          accepts: [requirements],
          error: verifyResult.invalidReason ?? 'payment_invalid',
          code: 'payment_verification_failed',
        },
        { status: 402 },
      );
    }

    let settleResult;
    try {
      settleResult = await settle(paymentPayload, requirements);
    } catch (err) {
      console.error('[x402] settle failed - on-chain outcome unknown:', err);
      return NextResponse.json(
        { error: 'Settlement failed; its on-chain outcome is unknown.', code: 'settlement_failed' },
        { status: 502 },
      );
    }

    if (!settleResult.success) {
      return NextResponse.json(
        {
          error: settleResult.errorMessage ?? 'Settlement failed.',
          code: 'settlement_failed',
          errorReason: settleResult.errorReason,
        },
        { status: 502 },
      );
    }

    const result = await fulfillPurchase({
      target: quote.target,
      buyerId: principal.userId,
      transactionId: settleResult.transaction,
      priceTinybars: quote.priceTinybars,
      platformFee: quote.platformFee,
      sellerAmount: quote.sellerAmount,
      affiliate: quote.resolvedAffiliate,
      paymentFlow: 'x402',
      payer: settleResult.payer ?? verifyResult.payer ?? 'unknown',
    });

    const response = NextResponse.json(
      {
        transaction: result.transaction,
        copiedItem: result.copiedItem,
        paymentDetails: result.paymentDetails,
        message: 'Purchase completed successfully',
        affiliateCommission: result.affiliateCommission,
        settlement: settleResult,
      },
      { status: 201 },
    );
    response.headers.set('X-PAYMENT-RESPONSE', encodePaymentResponseHeader(settleResult));
    return response;
  } catch (error: any) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error('x402 purchase error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'server_error' }, { status: 500 });
  }
}
