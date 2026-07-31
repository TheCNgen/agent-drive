"use server";

import connectDB from "@/app/lib/mongodb";
import { Item, Listing, SharedLink, Transaction, Affiliate, User } from "@/app/lib/models";
import { Client, TransferTransaction, Hbar, PrivateKey } from "@hiero-ledger/sdk";
import crypto from "crypto";

// 5% platform fee
const PLATFORM_FEE_PERCENTAGE = 5;

function getHederaClient(operatorId: string, operatorKey: string) {
  const client = Client.forTestnet();
  client.setOperator(operatorId, operatorKey);
  return client;
}

export async function purchaseFromMarketplace(wallet: string, id: string, affiliateCode?: string) {
  await connectDB();
  
  // Find buyer by wallet (evmAddress or accountId)
  const buyerUser = await User.findOne({ wallet });
  if (!buyerUser || !buyerUser.accountId) {
    throw new Error("Buyer not found or Hedera account missing");
  }

  throw new Error("Only agents can make purchases directly on the platform now.");

  // Find listing
  const listing = await Listing.findById(id).populate('seller');
  if (!listing) throw new Error("Listing not found");
  
  const sellerUser = listing.seller;
  if (!sellerUser || !sellerUser.accountId) {
    throw new Error("Seller Hedera account missing");
  }

  const price = listing.price;
  
  // Calculate fees
  const platformFee = (price * PLATFORM_FEE_PERCENTAGE) / 100;
  let affiliateFee = 0;
  let affiliateUser = null;
  
  if (affiliateCode && listing.affiliateEnabled) {
    const affiliate = await Affiliate.findOne({ code: affiliateCode, entityId: id, entityType: 'listing' }).populate('affiliateId');
    if (affiliate && affiliate.affiliateId && affiliate.affiliateId.accountId) {
      affiliateFee = (price * affiliate.commissionRate) / 100;
      affiliateUser = affiliate.affiliateId;
    }
  }

  const sellerAmount = price - platformFee - affiliateFee;
  
  const platformAccount = process.env.PLATFORM_TREASURY_ACCOUNT_ID;
  if (!platformAccount) throw new Error("Platform fee account not configured");

  // Create Hedera transaction
  const client = getHederaClient(buyerUser.accountId, buyerUser.privateKey);
  
  let tx = new TransferTransaction()
    .addHbarTransfer(buyerUser.accountId, new Hbar(-price))
    .addHbarTransfer(platformAccount as string, new Hbar(price));
  
  const txResponse = await tx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  
  if (receipt.status.toString() !== "SUCCESS") {
    throw new Error("Hedera transaction failed");
  }

  // Record transaction in DB
  const txId = txResponse.transactionId.toString();
  const receiptNumber = `RCPT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const transactionRecord = new Transaction({
    listing: listing._id,
    buyer: buyerUser._id,
    seller: sellerUser._id,
    item: listing.item,
    amount: price,
    status: 'completed',
    transactionId: txId,
    receiptNumber,
    purchaseDate: new Date(),
    transactionType: 'purchase',
    paymentFlow: 'direct',
    affiliateInfo: affiliateUser ? {
      isAffiliateSale: true,
      originalAmount: price,
      netAmount: sellerAmount,
      commissionDistribution: [{
        affiliateId: affiliateUser._id,
        amount: affiliateFee,
        commissionRate: affiliateFee / price * 100
      }]
    } : undefined
  });
  
  await transactionRecord.save();
  return { success: true, transactionId: txId };
}

export async function purchaseMonetizedLink(wallet: string, id: string) {
  await connectDB();
  
  // Find buyer
  const buyerUser = await User.findOne({ wallet });
  if (!buyerUser || !buyerUser.accountId) {
    throw new Error("Buyer not found or Hedera account missing");
  }

  throw new Error("Only agents can make purchases directly on the platform now.");

  // Find shared link
  const link = await SharedLink.findById(id).populate('createdBy');
  if (!link || link.type !== 'monetized') throw new Error("Link not found or not monetized");
  
  const sellerUser = link.createdBy;
  if (!sellerUser || !sellerUser.accountId) {
    throw new Error("Seller Hedera account missing");
  }

  const price = link.price || 0;
  
  // Calculate fees
  const platformFee = (price * PLATFORM_FEE_PERCENTAGE) / 100;
  const sellerAmount = price - platformFee;
  
  const platformAccount = process.env.PLATFORM_TREASURY_ACCOUNT_ID;
  if (!platformAccount) throw new Error("Platform fee account not configured");

  // Create Hedera transaction
  const client = getHederaClient(buyerUser.accountId, buyerUser.privateKey);
  
  const tx = new TransferTransaction()
    .addHbarTransfer(buyerUser.accountId, new Hbar(-price))
    .addHbarTransfer(platformAccount as string, new Hbar(price));
    
  const txResponse = await tx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  
  if (receipt.status.toString() !== "SUCCESS") {
    throw new Error("Hedera transaction failed");
  }

  // Record transaction in DB
  const txId = txResponse.transactionId.toString();
  const receiptNumber = `RCPT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const transactionRecord = new Transaction({
    sharedLink: link._id,
    buyer: buyerUser._id,
    seller: sellerUser._id,
    item: link.item,
    amount: price,
    status: 'completed',
    transactionId: txId,
    receiptNumber,
    purchaseDate: new Date(),
    transactionType: 'purchase',
    paymentFlow: 'direct'
  });
  
  await transactionRecord.save();
  return { success: true, transactionId: txId };
}
