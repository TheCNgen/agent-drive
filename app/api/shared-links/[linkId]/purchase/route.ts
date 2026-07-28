import { SharedLink, Transaction, User } from '@/app/lib/models';
import connectDB from '@/app/lib/mongodb';
import { Affiliate } from '@/app/models/Affiliate';
import { Commission } from '@/app/models/Commission';
import { Types } from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/lib/backend/authConfig';
import { Client, TransferTransaction, Hbar } from '@hashgraph/sdk';
import { submitHCSRecord } from '@/app/lib/hedera';

// 5% platform fee
const PLATFORM_FEE_PERCENTAGE = 5;

interface SharedLinkDocument {
  _id: Types.ObjectId;
  linkId: string;
  title: string;
  price: number;
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

const generateReceiptNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RCP-${timestamp}-${random}`;
};

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
    } catch(e) {}
    
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

    const price = sharedLink.price;
    const platformFee = (price * PLATFORM_FEE_PERCENTAGE) / 100;
    let affiliateFee = 0;
    let affiliateUser = null;
    let affiliateRecord = null;
    
    if (affiliateCodeFromHeader && sharedLink.affiliateEnabled) {
      affiliateRecord = await Affiliate.findOne({ affiliateCode: affiliateCodeFromHeader, sharedLink: sharedLink._id, status: 'active' }).populate('affiliateUser');
      if (affiliateRecord && affiliateRecord.affiliateUser && affiliateRecord.affiliateUser.accountId && affiliateRecord.affiliateUser._id.toString() !== userIdFromHeader) {
        affiliateFee = (price * affiliateRecord.commissionRate) / 100;
        affiliateUser = affiliateRecord.affiliateUser;
      }
    }

    const sellerAmount = price - platformFee - affiliateFee;
    const platformAccount = process.env.HEDERA_PLATFORM_FEE_ACCOUNT;
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
      .addHbarTransfer(buyerUser.accountId, new Hbar(-price))
      .addHbarTransfer(platformAccount, new Hbar(platformFee))
      .addHbarTransfer(sellerUser.accountId!, new Hbar(sellerAmount));
      
    if (affiliateUser) {
      tx = tx.addHbarTransfer(affiliateUser.accountId, new Hbar(affiliateFee));
    }
    
    const txResponse = await tx.execute(client);
    const receipt = await txResponse.getReceipt(client);
    
    if (receipt.status.toString() !== "SUCCESS") {
      return NextResponse.json({ error: 'Hedera transaction failed' }, { status: 400 });
    }
    
    const blockchainTransactionId = txResponse.transactionId.toString();

    const transaction = await Transaction.create({
      sharedLink: sharedLink._id,
      buyer: userIdFromHeader,
      seller: sharedLink.owner._id,
      item: sharedLink.item._id,
      amount: sharedLink.price,
      status: 'completed',
      transactionId: blockchainTransactionId,
      receiptNumber: generateReceiptNumber(),
      purchaseDate: new Date(),
      transactionType: 'purchase',
      paymentFlow: 'direct',
      metadata: {
        blockchainTransaction: blockchainTransactionId,
        network: 'hedera-testnet',
        payer: buyerUser.accountId,
        success: true
      }
    });

    await SharedLink.findByIdAndUpdate(sharedLink._id, {
      $addToSet: { paidUsers: userIdFromHeader }
    });

    let commission = null;
    let commissionTransaction = null;
    let sellerTransaction = null;
    
    if (affiliateUser && affiliateRecord) {
      try {
        // Create commission transaction record (platform pays affiliate)
        commissionTransaction = await Transaction.create({
          sharedLink: sharedLink._id,
          buyer: sharedLink.owner._id, // platform/original seller pays
          seller: affiliateUser._id, // affiliate receives
          item: sharedLink.item._id,
          amount: affiliateFee,
          status: 'completed', // completed immediately via Hedera
          transactionId: uuidv4(),
          receiptNumber: generateReceiptNumber(),
          purchaseDate: new Date(),
          transactionType: 'commission',
          paymentFlow: 'admin',
          parentTransaction: transaction._id,
          metadata: {
            affiliateCode: affiliateCodeFromHeader,
            commissionRate: affiliateRecord.commissionRate,
            originalPurchaseAmount: sharedLink.price,
            originalBuyer: userIdFromHeader
          }
        });

        // Create seller transaction record (platform pays seller)
        sellerTransaction = await Transaction.create({
          sharedLink: sharedLink._id,
          buyer: sharedLink.owner._id, // platform/original seller pays (self-transaction for accounting)
          seller: sharedLink.owner._id, // original seller receives
          item: sharedLink.item._id,
          amount: sellerAmount,
          status: 'completed', // completed immediately via Hedera
          transactionId: uuidv4(),
          receiptNumber: generateReceiptNumber(),
          purchaseDate: new Date(),
          transactionType: 'sale',
          paymentFlow: 'admin',
          parentTransaction: transaction._id,
          metadata: {
            isAffiliateDistribution: true,
            originalPurchaseAmount: sharedLink.price,
            commissionDeducted: affiliateFee,
            originalBuyer: userIdFromHeader
          }
        });

        await Transaction.findByIdAndUpdate(transaction._id, {
          affiliateInfo: {
            isAffiliateSale: true,
            originalAmount: sharedLink.price,
            netAmount: sellerAmount,
            commissionDistribution: [{
              affiliateId: affiliateRecord._id,
              amount: affiliateFee,
              commissionRate: affiliateRecord.commissionRate
            }]
          }
        });

        [commission] = await Promise.all([
          Commission.create({
            affiliate: affiliateRecord._id,
            originalTransaction: transaction._id,
            commissionTransaction: commissionTransaction._id,
            commissionRate: affiliateRecord.commissionRate,
            commissionAmount: affiliateFee,
            status: 'completed'
          }),
          Affiliate.findByIdAndUpdate(affiliateRecord._id, {
            $inc: { 
              totalEarnings: affiliateFee,
              totalSales: 1
            }
          })
        ]);
      } catch (affiliateError) {
        console.error('Error processing affiliate commission:', affiliateError);
      }
    }
    
    submitHCSRecord('TRANSACTION_COMPLETED', {
      transactionId: transaction._id.toString(),
      blockchainTransactionId: blockchainTransactionId,
      buyer: userIdFromHeader,
      seller: sharedLink.owner._id.toString(),
      item: sharedLink.item._id.toString(),
      amount: sharedLink.price
    });

    return NextResponse.json({
      transactionData: {
        transaction,
        paymentDetails: { transaction: blockchainTransactionId, network: 'hedera-testnet', payer: buyerUser.accountId, success: true },
        message: 'Purchase completed successfully',
        sharedLink: {
          linkId: sharedLink.linkId,
          title: sharedLink.title
        },
        affiliateCommission: commission ? {
          amount: commission.commissionAmount,
          rate: commission.commissionRate,
          commissionTransaction: commissionTransaction,
          sellerTransaction: sellerTransaction
        } : null
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
