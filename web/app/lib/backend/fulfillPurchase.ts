import { submitHCSRecord, allocateTreasuryFunds } from '@/app/lib/hedera';
import { Item, SharedLink, Transaction, User } from '@/app/lib/models';
import { copyItemWithBFS } from '@/app/lib/utils/itemUtils';
import { Affiliate } from '@/app/models/Affiliate';
import { Commission } from '@/app/models/Commission';
import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

/**
 * The platform's flat cut of every purchase price, matching the legacy purchase routes'
 * `PLATFORM_FEE_PERCENTAGE` exactly. Integer-floor arithmetic: `price * 5n / 100n`.
 */
export const PLATFORM_FEE_PERCENT = BigInt(5);

const generateReceiptNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RCP-${timestamp}-${random}`;
};

export interface ResolvedAffiliate {
  record: any;
  affiliateUser: any;
  feeTinybars: bigint;
  code: string;
}

export type PurchaseTarget =
  | { type: 'listing'; doc: any } // Listing, populated .item and .seller
  | { type: 'sharedLink'; doc: any }; // SharedLink, populated .item and .owner

export interface FulfillPurchaseInput {
  target: PurchaseTarget;
  buyerId: string;
  /** The on-chain (or legacy session-signed) transaction id. The Transaction's idempotency key. */
  transactionId: string;
  priceTinybars: string;
  platformFee: bigint;
  sellerAmount: bigint;
  affiliate: ResolvedAffiliate | null;
  /** `direct`: legacy session-signed transfer. `x402`: settled via the x402 facilitator. */
  paymentFlow: 'direct' | 'x402';
  /** The Hedera account id that actually paid (buyer's account for `direct`, agent's account for `x402`). */
  payer: string;
  agentId: string | null;
}

export interface FulfillPurchaseResult {
  transaction: any;
  /** Only set for a listing purchase; `null` for a shared-link purchase (see §1.3 of the stage doc). */
  copiedItem: { _id: Types.ObjectId; name: string; path: string } | null;
  paymentDetails: { transaction: string; network: string; payer: string; success: true };
  affiliateCommission: {
    commission: any;
    amountTinybars: string;
    rate: number;
    commissionTransaction: any;
    sellerTransaction: any;
  } | null;
  /**
   * True when `transactionId` had already been fulfilled (duplicate-key recovery, §3.4) -
   * every field below is the *original* run's result, not a freshly re-derived one. In
   * particular `copiedItem` is best-effort (`null` if it can't be relocated) since the
   * Item model doesn't track copy lineage back to its source.
   */
  idempotent: boolean;
}

async function getOrCreateMarketplaceFolder(buyerId: string): Promise<Types.ObjectId> {
  const buyer = await User.findById(buyerId);
  if (!buyer?.rootFolder) {
    throw new Error('Buyer root folder not found');
  }

  const marketplaceFolder = await Item.findOneAndUpdate(
    { name: 'marketplace', type: 'folder', parentId: buyer.rootFolder.toString(), owner: buyerId },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return marketplaceFolder._id;
}

async function copyPurchasedItem(originalItemId: string, newParentId: string, buyerId: string) {
  const copiedItem = await copyItemWithBFS(originalItemId, newParentId, buyerId, '(Purchased)');
  return {
    _id: copiedItem._id,
    name: copiedItem.name,
    path: `/marketplace/${copiedItem.name}`,
  };
}

/**
 * Runs the post-payment side effects shared by every purchase surface: writes the main
 * `Transaction`, copies the item into the buyer's `marketplace` folder (listings only),
 * queues AI processing, distributes the affiliate/seller ledger rows, and submits the HCS
 * record. Extracted from the legacy session-signed purchase routes so the x402 routes (and
 * any future purchase surface) share the exact same fee-split and ledger-writing logic - two
 * copies of this would inevitably drift, and the drift would be financial.
 *
 * **The on-chain transfer this function records already happened for the full `priceTinybars`,
 * to the platform treasury.** The `sellerAmount`/affiliate-fee `Transaction` rows this function
 * writes (`paymentFlow: 'admin'`) are ledger entries only - nothing here moves value to the
 * seller or the affiliate. Settlement to them is an off-chain payout process outside this
 * function's scope.
 *
 * Idempotent on `transactionId`: if the main `Transaction` insert hits the unique-index
 * duplicate-key error, the existing transaction is looked up and returned (`idempotent: true`)
 * rather than throwing or re-running any side effect a second time.
 */
export async function fulfillPurchase(input: FulfillPurchaseInput): Promise<FulfillPurchaseResult> {
  const { target, buyerId, transactionId, priceTinybars, platformFee, sellerAmount, affiliate, paymentFlow, payer, agentId } =
    input;

  const doc = target.doc;
  const sellerId: string = (target.type === 'listing' ? doc.seller._id : doc.owner._id).toString();
  const itemId: string = doc.item._id.toString();

  let transaction: any;
  let idempotent = false;
  try {
    transaction = await Transaction.create({
      ...(target.type === 'listing' ? { listing: doc._id } : { sharedLink: doc._id }),
      buyer: buyerId,
      seller: sellerId,
      item: itemId,
      amountTinybars: priceTinybars,
      status: 'completed',
      transactionId,
      receiptNumber: generateReceiptNumber(),
      purchaseDate: new Date(),
      transactionType: 'purchase',
      paymentFlow,
      agent: agentId,
      metadata: {
        blockchainTransaction: transactionId,
        network: 'hedera-testnet',
        payer,
        success: true,
      },
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const existing = await Transaction.findOne({ transactionId });
      if (!existing) throw error; // dup key on a different unique field - not our idempotency case
      return {
        transaction: existing,
        copiedItem: null,
        paymentDetails: { transaction: transactionId, network: 'hedera-testnet', payer, success: true },
        affiliateCommission: null,
        idempotent: true,
      };
    }
    throw error;
  }

  let copiedItem: FulfillPurchaseResult['copiedItem'] = null;
  if (target.type === 'listing') {
    const marketplaceFolderId = await getOrCreateMarketplaceFolder(buyerId);
    copiedItem = await copyPurchasedItem(itemId, marketplaceFolderId.toString(), buyerId);

    try {
      await Item.findByIdAndUpdate(copiedItem._id, { contentSource: 'marketplace_purchase' });
    } catch (processError) {
      console.error('Error auto-processing purchased content:', processError);
    }
  } else {
    await SharedLink.findByIdAndUpdate(doc._id, { $addToSet: { paidUsers: buyerId } });
  }

  let commission: any = null;
  let commissionTransaction: any = null;
  let sellerTransaction: any = null;

  if (affiliate) {
    try {
      commissionTransaction = await Transaction.create({
        ...(target.type === 'listing' ? { listing: doc._id } : { sharedLink: doc._id }),
        buyer: sellerId, // platform/original seller pays
        seller: affiliate.affiliateUser._id, // affiliate receives
        item: itemId,
        amountTinybars: affiliate.feeTinybars.toString(),
        status: 'completed',
        transactionId: uuidv4(),
        receiptNumber: generateReceiptNumber(),
        purchaseDate: new Date(),
        transactionType: 'commission',
        paymentFlow: 'admin',
        agent: null,
        parentTransaction: transaction._id,
        metadata: {
          affiliateCode: affiliate.code,
          commissionRate: affiliate.record.commissionRate,
          originalPurchaseAmount: priceTinybars,
          originalBuyer: buyerId,
        },
      });

      sellerTransaction = await Transaction.create({
        ...(target.type === 'listing' ? { listing: doc._id } : { sharedLink: doc._id }),
        buyer: sellerId, // platform/original seller pays (self-transaction for accounting)
        seller: sellerId, // original seller receives
        item: itemId,
        amountTinybars: sellerAmount.toString(),
        status: 'completed',
        transactionId: uuidv4(),
        receiptNumber: generateReceiptNumber(),
        purchaseDate: new Date(),
        transactionType: 'sale',
        paymentFlow: 'admin',
        agent: null,
        parentTransaction: transaction._id,
        metadata: {
          isAffiliateDistribution: true,
          originalPurchaseAmount: priceTinybars,
          commissionDeducted: affiliate.feeTinybars.toString(),
          originalBuyer: buyerId,
        },
      });

      await Transaction.findByIdAndUpdate(transaction._id, {
        affiliateInfo: {
          isAffiliateSale: true,
          originalAmountTinybars: priceTinybars,
          netAmountTinybars: sellerAmount.toString(),
          commissionDistribution: [
            {
              affiliateId: affiliate.record._id,
              amountTinybars: affiliate.feeTinybars.toString(),
              commissionRate: affiliate.record.commissionRate,
            },
          ],
        },
      });

      [commission] = await Promise.all([
        Commission.create({
          affiliate: affiliate.record._id,
          originalTransaction: transaction._id,
          commissionTransaction: commissionTransaction._id,
          commissionRate: affiliate.record.commissionRate,
          amountTinybars: affiliate.feeTinybars.toString(),
          // Commission.status is 'pending' | 'paid' | 'failed' (not 'completed' - the legacy
          // code's original value, which the Commission schema has never actually accepted;
          // masked until now by the commissionAmountTinybars field-name bug above always
          // throwing first). 'pending' is also the accurate status: the affiliate fee is a
          // ledger entry awaiting off-chain payout, not something actually paid yet.
          status: 'pending',
        }),
        Affiliate.findByIdAndUpdate(affiliate.record._id, { $inc: { totalSales: 1 } }),
      ]);

      const affiliateObj = await Affiliate.findById(affiliate.record._id);
      if (affiliateObj) {
        const currentEarnings = affiliateObj.totalEarnings || '0';
        const newEarnings = (BigInt(currentEarnings) + affiliate.feeTinybars).toString();
        await Affiliate.findByIdAndUpdate(affiliate.record._id, { totalEarnings: newEarnings });
      }
    } catch (affiliateError) {
      console.error('Error processing affiliate commission:', affiliateError);
    }
  }

  // Allocate funds in the Smart Contract Treasury ONLY if they were actually routed there
  if (platformFee > BigInt(0)) {
    try {
      await allocateTreasuryFunds(
        target.type === 'listing' ? doc.seller.payoutWallet : doc.owner.payoutWallet,
        affiliate?.affiliateUser?.payoutWallet,
        sellerAmount,
        affiliate?.feeTinybars || BigInt(0)
      );
    } catch (allocationError) {
      console.error('Failed to allocate treasury funds:', allocationError);
      // Continue fulfillment even if allocation fails so the buyer still gets their item.
      // In production, we'd want a retry queue or admin alert for this!
    }
  }

  await submitHCSRecord('TRANSACTION_COMPLETED', {
    transactionId: transaction._id.toString(),
    blockchainTransactionId: transactionId,
    buyer: buyerId,
    seller: sellerId,
    item: itemId,
    amountTinybars: priceTinybars,
  });

  return {
    transaction,
    copiedItem,
    paymentDetails: { transaction: transactionId, network: 'hedera-testnet', payer, success: true },
    affiliateCommission: commission
      ? {
          commission,
          amountTinybars: commission.amountTinybars,
          rate: commission.commissionRate,
          commissionTransaction,
          sellerTransaction,
        }
      : null,
    idempotent,
  };
}
