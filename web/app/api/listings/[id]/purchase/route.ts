import { fulfillPurchase, PLATFORM_FEE_PERCENT, type ResolvedAffiliate } from '@/app/lib/backend/fulfillPurchase';
import { Listing, Transaction, User } from '@/app/lib/models';
import connectDB from '@/app/lib/mongodb';
import { Affiliate } from '@/app/models/Affiliate';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/lib/backend/authConfig';
import { Client, TransferTransaction, Hbar } from '@hiero-ledger/sdk';

/**
 * **Legacy, session-signed purchase route.** Pulls the buyer's raw private key out of
 * MongoDB and signs the transfer server-side - an agent has no key in the database, by
 * design, so this route is unreachable from the agent lane and always will be. Agents buy
 * over x402 instead (`POST /api/v1/agent/purchase/listing/:id`). This route stays working
 * for the human lane only; invest nothing further in it.
 *
 * **The on-chain transfer below sends the full price to the platform treasury, not the
 * seller.** `sellerAmount`/affiliate fee are ledger entries (`fulfillPurchase`,
 * `paymentFlow: 'admin'`) awaiting off-chain payout, not on-chain settlements.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userIdFromHeader = session.user.id;

    let affiliateCodeFromHeader = null;
    try {
      const body = await request.json();
      affiliateCodeFromHeader = body.affiliateCode;
    } catch (e) {}

    await connectDB();

    const buyerUser = await User.findById(userIdFromHeader);
    if (!buyerUser || !buyerUser.accountId || !buyerUser.privateKey) {
      return NextResponse.json({ error: 'Buyer Hedera account not found' }, { status: 400 });
    }

    const params = await context.params;
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'Listing ID is required' }, { status: 400 });
    }

    const listing = await Listing.findById(id)
      .populate('item')
      .populate('seller');

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    if (listing.status !== 'active') {
      return NextResponse.json({ error: 'This listing is no longer available for purchase' }, { status: 400 });
    }

    if (listing.seller._id.toString() === userIdFromHeader) {
      return NextResponse.json({ error: 'You cannot purchase your own listing' }, { status: 400 });
    }

    const sellerUser = listing.seller;
    if (!sellerUser.accountId) {
      return NextResponse.json({ error: 'Seller Hedera account not found' }, { status: 400 });
    }

    const existingTransaction = await Transaction.exists({
      listing: id,
      buyer: userIdFromHeader,
      status: 'completed'
    });

    if (existingTransaction) {
      return NextResponse.json({ error: 'You have already purchased this item' }, { status: 400 });
    }

    const priceTinybars = BigInt(listing.priceTinybars);
    const platformFee = (priceTinybars * PLATFORM_FEE_PERCENT) / BigInt(100);
    let affiliateFee = BigInt(0);
    let affiliateUser = null;
    let affiliateRecord = null;

    if (affiliateCodeFromHeader && listing.affiliateEnabled) {
      affiliateRecord = await Affiliate.findOne({ affiliateCode: affiliateCodeFromHeader, listing: id, status: 'active' }).populate('affiliateUser');
      if (affiliateRecord && affiliateRecord.affiliateUser && affiliateRecord.affiliateUser.accountId && affiliateRecord.affiliateUser._id.toString() !== userIdFromHeader) {
        affiliateFee = (priceTinybars * BigInt(affiliateRecord.commissionRate)) / BigInt(100);
        affiliateUser = affiliateRecord.affiliateUser;
      }
    }

    const sellerAmount = priceTinybars - platformFee - affiliateFee;
    const platformAccount = process.env.PLATFORM_TREASURY_ACCOUNT_ID;
    if (!platformAccount) {
      return NextResponse.json({ error: 'Platform fee account not configured' }, { status: 500 });
    }

    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      return NextResponse.json({ error: 'Hedera operator configuration missing from environment variables.' }, { status: 500 });
    }

    const client = Client.forTestnet();
    // Use buyer's private key to sign the transaction since they are paying!
    client.setOperator(buyerUser.accountId, buyerUser.privateKey);

    let tx = new TransferTransaction()
      .addHbarTransfer(buyerUser.accountId, Hbar.fromTinybars((-priceTinybars).toString()))
      .addHbarTransfer(platformAccount, Hbar.fromTinybars(priceTinybars.toString()));

    const txResponse = await tx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    if (receipt.status.toString() !== "SUCCESS") {
      return NextResponse.json({ error: 'Hedera transaction failed' }, { status: 400 });
    }

    const blockchainTransactionId = txResponse.transactionId.toString();

    const affiliate: ResolvedAffiliate | null =
      affiliateUser && affiliateRecord
        ? { record: affiliateRecord, affiliateUser, feeTinybars: affiliateFee, code: affiliateCodeFromHeader }
        : null;

    const result = await fulfillPurchase({
      target: { type: 'listing', doc: listing },
      buyerId: userIdFromHeader,
      transactionId: blockchainTransactionId,
      priceTinybars: listing.priceTinybars,
      platformFee,
      sellerAmount,
      affiliate,
      paymentFlow: 'direct',
      payer: buyerUser.accountId,
    });

    return NextResponse.json({
      transactionData: {
        transaction: result.transaction,
        copiedItem: result.copiedItem,
        paymentDetails: result.paymentDetails,
        message: 'Purchase completed successfully',
        affiliateCommission: result.affiliateCommission
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('POST /api/listings/[id]/purchase error:', error);

    const status =
      error.code === 11000 ? 400 :
      error.message === 'Buyer root folder not found' ? 404 :
      error.message === 'Original item not found' ? 404 : 500;

    const message =
      error.code === 11000 ? 'Transaction already exists' :
      error.message || 'Failed to complete purchase';

    return NextResponse.json({ error: message }, { status });
  }
}
