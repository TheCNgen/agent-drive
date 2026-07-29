import type { FakeTotalPagination } from "../core/pagination.js";
import type { ISODate, ObjectId, PopulatedUserRef, Ref, Tinybars } from "./common.js";

export type AffiliateStatus = "active" | "inactive" | "suspended";

export interface AffiliateListingRef {
  _id: ObjectId;
  title: string;
  price?: number;
  status?: string;
}

export interface AffiliateSharedLinkRef {
  _id: ObjectId;
  title: string;
  price?: number;
  type?: "public" | "monetized";
  linkId?: string;
}

export interface Affiliate {
  _id: ObjectId;
  listing?: Ref<AffiliateListingRef>;
  sharedLink?: Ref<AffiliateSharedLinkRef>;
  owner: Ref<PopulatedUserRef>;
  affiliateUser: Ref<PopulatedUserRef>;
  /** A percentage (0-100), never a fraction and never basis points. */
  commissionRate: number;
  /** Server-generated `nanoid(8)`; callers cannot choose it. */
  affiliateCode: string;
  status: AffiliateStatus;
  totalEarnings: Tinybars;
  totalSales: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ListAffiliatesParams {
  type?: "owned" | "affiliate";
  page?: number;
  limit?: number;
}

export type CreateAffiliateInput =
  | { listingId: ObjectId; affiliateUserId: ObjectId; commissionRate?: number }
  | { sharedLinkId: ObjectId; affiliateUserId: ObjectId; commissionRate?: number };

export interface UpdateAffiliateInput {
  commissionRate?: number;
  status?: AffiliateStatus;
}

export interface AffiliateByCode {
  _id: ObjectId;
  commissionRate: number;
  /** Full `User` documents (minus a handful of always-excluded fields) — this type covers only the common subset. */
  affiliateUser: PopulatedUserRef;
  owner: PopulatedUserRef;
  content: AffiliateListingRef | AffiliateSharedLinkRef;
  contentType: "listing" | "sharedLink";
}

export interface ListAffiliateCommissionsParams {
  type?: "earned" | "paid";
  page?: number;
  limit?: number;
}

export interface Commission {
  _id: ObjectId;
  affiliate: Ref<{ _id: ObjectId; affiliateUser?: Ref<PopulatedUserRef>; [key: string]: unknown }>;
  originalTransaction: Ref<Record<string, unknown>>;
  commissionTransaction?: Ref<Record<string, unknown>>;
  amountTinybars?: Tinybars;
  /** The field name actually written by the purchase flow at commission-creation time; present defensively alongside `amountTinybars`. */
  commissionAmountTinybars?: Tinybars;
  commissionRate: number;
  status: "pending" | "paid" | "failed" | "completed";
  paidAt?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface AffiliateTransactionsSummaryEntry {
  amountTinybars: string;
  count: number;
}

export interface AffiliateTransactionsSummary {
  pending: AffiliateTransactionsSummaryEntry;
  paid: AffiliateTransactionsSummaryEntry;
  failed: AffiliateTransactionsSummaryEntry;
}

export interface AffiliateTransactionsPage {
  transactions: Commission[];
  summary: AffiliateTransactionsSummary;
  pagination: FakeTotalPagination;
}

export interface UpdateCommissionInput {
  commissionId: ObjectId;
  status?: "pending" | "paid" | "failed";
  paidAt?: Date | string;
}

export interface UpdateCommissionResult {
  message: string;
  commission: Commission;
}
