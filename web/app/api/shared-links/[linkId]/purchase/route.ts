import { fulfillPurchase, PLATFORM_FEE_PERCENT, type ResolvedAffiliate } from '@/app/lib/backend/fulfillPurchase';
import { SharedLink, User } from '@/app/lib/models';
import connectDB from '@/app/lib/mongodb';
import { Affiliate } from '@/app/models/Affiliate';
import { Types } from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/lib/backend/authConfig';
import { Client, TransferTransaction, Hbar } from '@hiero-ledger/sdk';

interface SharedLinkDocument {
  _id: Types.ObjectId;
  linkId: string;
  title: string;
  priceTinybars: string;
  type: 'public' | 'monetized';
  isActive: boolean;
  expiresAt?: Date;
  paidUsers: Types.ObjectId[];
  affiliateEnabled: boolean;
  owner: {
    _id: Types.ObjectId;
    name: string;
    email: string;
    wallet: string;
    accountId?: string;
  };
  item: {
    _id: Types.ObjectId;
    name: string;
    type: string;
    size: number;
    mimeType: string;
  };
}

async function getSharedLinkWithAuth(
  linkId: string,
  userId?: string
): Promise<SharedLinkDocument> {
  const sharedLink = await SharedLink.findOne({
    linkId,
    isActive: true,
    type: 'monetized'
  })
  .populate('owner', 'name email wallet accountId')
  .populate('item', 'name type size mimeType')
  .lean<SharedLinkDocument>();

  if (!sharedLink) {
    throw new Error('Monetized link not found or expired');
  }

  if (sharedLink.expiresAt && new Date() > sharedLink.expiresAt) {
    throw new Error('Link has expired');
  }

  if (sharedLink.owner._id.toString() === userId) {
    throw new Error('You cannot purchase your own content');
  }

  const hasPaid = sharedLink.paidUsers.some(
    (paidUserId: Types.ObjectId) => paidUserId.toString() === userId
  );

  if (hasPaid) {
    throw new Error('You have already paid for this content');
  }

  return sharedLink;
}

/**
 * **Legacy, session-signed purchase route.** Pulls the buyer's raw private key out of
 * MongoDB and signs the transfer server-side - an agent has no key in the database, by
 * design, so this route is unreachable from the agent lane and always will be. Agents buy
 * over x402 instead (`POST /api/v1/agent/purchase/link/:linkId`). This route stays working
 * for the human lane only; invest nothing further in it.
 *
 * Unlike a listing purchase, **nothing is copied here** - the buyer is only added to
 * `paidUsers`; they must claim the link (`POST /api/shared-links/:linkId`) separately to
 * receive the item. **The on-chain transfer below sends the full price to the platform
 * treasury, not the seller** - see `fulfillPurchase`'s doc for the ledger-vs-settlement
 * distinction.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
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

    const { linkId } = await params;
    if (!linkId) {
      return NextResponse.json({ error: 'Link ID is required' }, { status: 400 });
    }

    const sharedLink = await getSharedLinkWithAuth(linkId, userIdFromHeader);

    const sellerUser = sharedLink.owner;
    if (!sellerUser.accountId) {
      return NextResponse.json({ error: 'Seller Hedera account not found' }, { status: 400 });
    }

    const priceTinybars = BigInt(sharedLink.priceTinybars);
    const platformFee = (priceTinybars * PLATFORM_FEE_PERCENT) / BigInt(100);
    let affiliateFee = BigInt(0);
    let affiliateUser = null;
    let affiliateRecord = null;

    if (affiliateCodeFromHeader && sharedLink.affiliateEnabled) {
      affiliateRecord = await Affiliate.findOne({ affiliateCode: affiliateCodeFromHeader, sharedLink: sharedLink._id, status: 'active' }).populate('affiliateUser');
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
      target: { type: 'sharedLink', doc: sharedLink },
      buyerId: userIdFromHeader,
      transactionId: blockchainTransactionId,
      priceTinybars: sharedLink.priceTinybars,
      platformFee,
      sellerAmount,
      affiliate,
      paymentFlow: 'direct',
      payer: buyerUser.accountId,
    });

    return NextResponse.json({
      transactionData: {
        transaction: result.transaction,
        paymentDetails: result.paymentDetails,
        message: 'Purchase completed successfully',
        sharedLink: {
          linkId: sharedLink.linkId,
          title: sharedLink.title
        },
        affiliateCommission: result.affiliateCommission
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('POST /api/shared-links/[linkId]/purchase error:', error);

    const status =
      error.code === 11000 ? 400 :
      error.message === 'Link has expired' ? 410 :
      error.message === 'Monetized link not found or expired' ? 404 : 500;

    const message =
      error.code === 11000 ? 'Transaction already exists' :
      error.message || 'Failed to complete purchase';

    return NextResponse.json({ error: message }, { status });
  }
}
