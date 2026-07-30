import type { FakeTotalPagination } from "../core/pagination.js";
import type { ISODate, ObjectId, PopulatedItemRef, PopulatedUserRef, Ref, Tinybars } from "./common.js";

export type TransactionStatus = "completed" | "pending" | "failed" | "refunded";
export type TransactionKind = "purchase" | "sale" | "commission";
export type PaymentFlow = "direct" | "admin";

export interface PopulatedListingRef {
  _id: ObjectId;
  title: string;
  price?: number;
  status?: string;
}

export interface PopulatedSharedLinkRef {
  _id: ObjectId;
  title: string;
  price?: number;
}

export interface PopulatedParentTransactionRef {
  _id: ObjectId;
  transactionId: string;
  transactionType: TransactionKind;
}

export interface AffiliateCommissionDistribution {
  affiliateId: ObjectId;
  amountTinybars: string;
  commissionRate: number;
}

export interface TransactionAffiliateInfo {
  isAffiliateSale: boolean;
  originalAmountTinybars: string;
  netAmountTinybars: string;
  commissionDistribution: AffiliateCommissionDistribution[];
}

export interface Transaction {
  _id: ObjectId;
  listing?: Ref<PopulatedListingRef>;
  sharedLink?: Ref<PopulatedSharedLinkRef>;
  buyer: Ref<PopulatedUserRef>;
  seller: Ref<PopulatedUserRef>;
  item: Ref<PopulatedItemRef>;
  amountTinybars: Tinybars;
  status: TransactionStatus;
  transactionId: string;
  settlementTransactionId?: string;
  consensusTimestamp?: string;
  distributionTransactionId?: string;
  distributionStatus: "complete" | "pending";
  receiptNumber: string;
  purchaseDate: ISODate;
  transactionType: TransactionKind;
  affiliateInfo?: TransactionAffiliateInfo;
  parentTransaction?: Ref<PopulatedParentTransactionRef>;
  metadata?: Record<string, unknown>;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type TransactionRole = "buyer" | "seller";

/** A row from `transactions.list()`, carrying the server-computed role of the caller. */
export interface TransactionWithRole extends Transaction {
  userRole: TransactionRole;
}

export interface ListTransactionsParams {
  type?: "all" | "purchases" | "sales";
  status?: TransactionStatus;
  transactionType?: TransactionKind;
  paymentFlow?: PaymentFlow;
  page?: number;
  limit?: number;
}

export interface CommissionsReportParams {
  page?: number;
  limit?: number;
  status?: "pending" | "paid" | "failed";
}

export interface CommissionsReportSummary {
  totalPendingTinybars: string;
  totalPaidTinybars: string;
  totalFailedTinybars: string;
  totalEarningsTinybars: string;
  pendingCount: number;
  paidCount: number;
  failedCount: number;
  totalCount: number;
}

export interface CommissionsReport {
  transactions: TransactionWithRole[];
  records: Record<string, unknown>[];
  summary: CommissionsReportSummary;
  pagination: FakeTotalPagination;
}

export interface EarningsReportParams {
  page?: number;
  limit?: number;
}

export interface EarningsBucket {
  transactions: Transaction[];
  totalTinybars: string;
  count: number;
}

export interface EarningsSummary {
  totalEarningsTinybars: string;
  totalSales: number;
  totalCommissions: number;
  totalAffiliateCommissionsPaidTinybars: string;
}

export interface EarningsReport {
  sales: EarningsBucket;
  commissions: EarningsBucket;
  affiliateActivity: Record<string, unknown>[];
  summary: EarningsSummary;
  pagination: FakeTotalPagination;
}

export interface UnsafeUpdateTransactionInput {
  userId: string;
  status?: TransactionStatus;
  metadata?: Record<string, unknown>;
}

export interface UnsafeUpdateTransactionResult {
  message: string;
  transaction: Transaction;
}
