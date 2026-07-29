import { processFileForAI } from '@/app/lib/ai/aiService';
import { Item, Listing, Transaction, User } from '@/app/lib/models';
import connectDB from '@/app/lib/mongodb';
import { copyItemWithBFS } from '@/app/lib/utils/itemUtils';
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

const generateReceiptNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RCP-${timestamp}-${random}`;
};

async function getOrCreateMarketplaceFolder(buyerId: string): Promise<Types.ObjectId> {
  const buyer = await User.findById(buyerId);
  if (!buyer?.rootFolder) {
    throw new Error('Buyer root folder not found');
  }

  const marketplaceFolder = await Item.findOneAndUpdate(
    {
      name: 'marketplace',
      type: 'folder',
      parentId: buyer.rootFolder.toString(),
      owner: buyerId
    },
    {},
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );

  return marketplaceFolder._id;
}

async function copyPurchasedItem(originalItemId: string, newParentId: string, buyerId: string) {
  const copiedItem = await copyItemWithBFS(originalItemId, newParentId, buyerId, '(Purchased)');
  return {
    _id: copiedItem._id,
    name: copiedItem.name,
    path: `/marketplace/${copiedItem.name}`
  };
}

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
    } catch(e) {}
    
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
    const platformFee = (priceTinybars * BigInt(PLATFORM_FEE_PERCENTAGE)) / BigInt(100);
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
    
    const transaction = await Transaction.create({
      listing: listing._id,
      buyer: userIdFromHeader,
      seller: listing.seller._id,
      item: listing.item._id,
      amountTinybars: listing.priceTinybars,
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

    const marketplaceFolderId = await getOrCreateMarketplaceFolder(userIdFromHeader);
    const copiedItem = await copyPurchasedItem(listing.item._id.toString(), marketplaceFolderId.toString(), userIdFromHeader);

    try {
      await Item.findByIdAndUpdate(copiedItem._id, { contentSource: 'marketplace_purchase' });
      await processFileForAI(copiedItem._id.toString());
    } catch (processError) {
      console.error('Error auto-processing purchased content for AI:', processError);
    }

    let commission = null;
    let commissionTransaction = null;
    let sellerTransaction = null;
    
    if (affiliateUser && affiliateRecord) {
      try {
        // Create commission transaction record (platform pays affiliate)
        commissionTransaction = await Transaction.create({
          listing: listing._id,
          buyer: listing.seller._id, // platform/original seller pays
          seller: affiliateUser._id, // affiliate receives
          item: listing.item._id,
          amountTinybars: affiliateFee.toString(),
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
            originalPurchaseAmount: listing.priceTinybars,
            originalBuyer: userIdFromHeader
          }
        });

        // Create seller transaction record (platform pays seller)
        sellerTransaction = await Transaction.create({
          listing: listing._id,
          buyer: listing.seller._id, // platform/original seller pays (self-transaction for accounting)
          seller: listing.seller._id, // original seller receives
          item: listing.item._id,
          amountTinybars: sellerAmount.toString(),
          status: 'completed', // completed immediately via Hedera
          transactionId: uuidv4(),
          receiptNumber: generateReceiptNumber(),
          purchaseDate: new Date(),
          transactionType: 'sale',
          paymentFlow: 'admin',
          parentTransaction: transaction._id,
          metadata: {
            isAffiliateDistribution: true,
            originalPurchaseAmount: listing.priceTinybars,
            commissionDeducted: affiliateFee.toString(),
            originalBuyer: userIdFromHeader
          }
        });

        await Transaction.findByIdAndUpdate(transaction._id, {
          affiliateInfo: {
            isAffiliateSale: true,
            originalAmountTinybars: listing.priceTinybars,
            netAmountTinybars: sellerAmount.toString(),
            commissionDistribution: [{
              affiliateId: affiliateRecord._id,
              amountTinybars: affiliateFee.toString(),
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
            commissionAmountTinybars: affiliateFee.toString(),
            status: 'completed'
          }),
          Affiliate.findByIdAndUpdate(affiliateRecord._id, {
            $inc: { 
              totalSales: 1
            }
          })
        ]);
        
        // Handle earnings calculation directly without relying on $inc for BigInt
        const affiliateObj = await Affiliate.findById(affiliateRecord._id);
        if (affiliateObj) {
          const currentEarnings = affiliateObj.totalEarnings || "0";
          const newEarnings = (BigInt(currentEarnings) + affiliateFee).toString();
          await Affiliate.findByIdAndUpdate(affiliateRecord._id, {
             totalEarnings: newEarnings
          });
        }

      } catch (affiliateError) {
        console.error('Error processing affiliate commission:', affiliateError);
      }
    }

    submitHCSRecord('TRANSACTION_COMPLETED', {
      transactionId: transaction._id.toString(),
      blockchainTransactionId: blockchainTransactionId,
      buyer: userIdFromHeader,
      seller: listing.seller._id.toString(),
      item: listing.item._id.toString(),
      amountTinybars: listing.priceTinybars
    });

    return NextResponse.json({
      transactionData: {
        transaction,
        copiedItem,
        paymentDetails: { transaction: blockchainTransactionId, network: 'hedera-testnet', payer: buyerUser.accountId, success: true },
        message: 'Purchase completed successfully',
        affiliateCommission: commission ? {
          commission: commission,
          amountTinybars: commission.commissionAmountTinybars,
          rate: commission.commissionRate,
          commissionTransaction: commissionTransaction,
          sellerTransaction: sellerTransaction
        } : null
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
