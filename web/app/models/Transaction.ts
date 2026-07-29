import mongoose, { Document, Schema } from 'mongoose';

export interface ITransaction extends Document {
  listing?: mongoose.Types.ObjectId;
  sharedLink?: mongoose.Types.ObjectId;
  buyer: mongoose.Types.ObjectId;
  seller: mongoose.Types.ObjectId;
  item: mongoose.Types.ObjectId;
  amountTinybars: string;
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  transactionId: string;
  settlementTransactionId?: string;
  consensusTimestamp?: string;
  distributionTransactionId?: string;
  distributionStatus: 'complete' | 'pending';
  transferBreakdown?: {
    account: string;
    tinybars: string;
    role: 'platform' | 'seller' | 'affiliate';
  }[];
  receiptNumber: string;
  purchaseDate: Date;
  transactionType: 'purchase' | 'sale' | 'commission';
  /**
   * `direct`/`x402`: an on-chain transfer actually happened for this row (legacy
   * session-signed transfer vs. an x402-settled one). `admin`: a ledger-only entry
   * (seller/affiliate distribution) awaiting off-chain payout - never settled on-chain.
   * Previously accepted by `Transaction.create()` calls but absent from the schema, so
   * Mongoose strict mode silently dropped it on every write; `paymentFlow` queries
   * (see /api/transactions) always matched zero documents until this field existed.
   */
  paymentFlow?: 'direct' | 'x402' | 'admin';
  affiliateInfo?: {
    isAffiliateSale: boolean;
    originalAmount: string;
    netAmount: string;
    commissionDistribution: {
      affiliateId: mongoose.Types.ObjectId;
      amount: string;
      commissionRate: number;
    }[];
  };
  agent?: mongoose.Types.ObjectId | null;
  parentTransaction?: mongoose.Types.ObjectId;
  metadata?: {
    blockchainTransaction?: string;
    network?: string;
    payer?: string;
    success?: boolean;
    paymentResponseRaw?: string;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>({
  listing: {
    type: Schema.Types.ObjectId,
    ref: 'Listing',
    required: false
  },
  sharedLink: {
    type: Schema.Types.ObjectId,
    ref: 'SharedLink',
    required: false
  },
  buyer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  seller: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  item: {
    type: Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  amountTinybars: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['completed', 'pending', 'failed', 'refunded'],
    default: 'completed'
  },
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  settlementTransactionId: {
    type: String
  },
  consensusTimestamp: {
    type: String
  },
  distributionTransactionId: {
    type: String
  },
  distributionStatus: {
    type: String,
    enum: ['complete', 'pending'],
    default: 'complete'
  },
  transferBreakdown: [{
    account: String,
    tinybars: String,
    role: { type: String, enum: ['platform', 'seller', 'affiliate'] }
  }],
  receiptNumber: {
    type: String,
    required: true,
    unique: true
  },
  purchaseDate: {
    type: Date,
    default: Date.now
  },
  transactionType: {
    type: String,
    enum: ['purchase', 'sale', 'commission'],
    required: true
  },
  paymentFlow: {
    type: String,
    enum: ['direct', 'x402', 'admin'],
    required: false
  },
  affiliateInfo: {
    type: {
      isAffiliateSale: Boolean,
      originalAmount: String,
      netAmount: String,
      commissionDistribution: [{
        affiliateId: {
          type: Schema.Types.ObjectId,
          ref: 'Affiliate'
        },
        amount: String,
        commissionRate: Number
      }]
    },
    required: false
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    default: null,
    index: true,
  },
  parentTransaction: {
    type: Schema.Types.ObjectId,
    ref: 'Transaction',
    required: false
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true,
});

// Indexes
transactionSchema.index({ buyer: 1, purchaseDate: -1 });
transactionSchema.index({ seller: 1, purchaseDate: -1 });
transactionSchema.index({ transactionType: 1, parentTransaction: 1 });
transactionSchema.index({ 'affiliateInfo.commissionDistribution.affiliateId': 1 });
transactionSchema.index({ settlementTransactionId: 1 }, { unique: true, sparse: true });
transactionSchema.index({ agent: 1, status: 1 });

export const Transaction = mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', transactionSchema); 