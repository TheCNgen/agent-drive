import type { ISODate, ObjectId, PopulatedItemRef, PopulatedUserRef, Ref, Tinybars } from "./common.js";

export type ListingStatus = "active" | "inactive" | "suspended";

export interface Listing {
  _id: ObjectId;
  item: Ref<PopulatedItemRef>;
  seller: Ref<PopulatedUserRef>;
  title: string;
  description: string;
  /** Legacy numeric price field; `undefined` on API-created listings. Use `priceTinybars`. */
  price?: number;
  priceTinybars: Tinybars;
  status: ListingStatus;
  tags: string[];
  views: number;
  affiliateEnabled: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ListListingsParams {
  status?: "active" | "inactive";
  sellerId?: ObjectId;
  search?: string;
  tags?: string[];
  sortBy?: "createdAt" | "priceTinybars" | "views" | "title";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface CreateListingInput {
  itemId: ObjectId;
  title: string;
  description: string;
  priceTinybars: Tinybars;
  tags?: string[];
  affiliateEnabled?: boolean;
}

export interface UpdateListingInput {
  title?: string;
  description?: string;
  priceTinybars?: Tinybars;
  status?: "active" | "inactive";
  tags?: string[];
}

export interface ListingPurchaseStatus {
  hasPurchased: boolean;
  transaction: { id: ObjectId; date: ISODate } | null;
}

/**
 * `price` is always `null` in practice: the backend `.select()`s a `price` field that
 * `Listing` documents populated via the API don't have (they store `priceTinybars`).
 * Use `listings.get(id).priceTinybars` for the real amount.
 */
export interface ListingPublicDetails {
  price: number | null;
  title: string;
  sellerWallet: string | null;
}
