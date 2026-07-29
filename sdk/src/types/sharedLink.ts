import type { ISODate, ObjectId, PopulatedItemRef, PopulatedUserRef, Ref, Tinybars } from "./common.js";
import type { Item } from "./item.js";

export type SharedLinkType = "public" | "monetized";

export interface SharedLink {
  _id: ObjectId;
  item: Ref<PopulatedItemRef>;
  owner: Ref<PopulatedUserRef>;
  /** The 16-character public identifier — use this, not `_id`, in every shared-link URL/method. */
  linkId: string;
  type: SharedLinkType;
  price?: number;
  priceTinybars?: Tinybars;
  title: string;
  description?: string;
  isActive: boolean;
  expiresAt?: ISODate | null;
  accessCount: number;
  paidUsers: ObjectId[];
  affiliateEnabled: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ListSharedLinksParams {
  type?: SharedLinkType;
  page?: number;
  limit?: number;
}

export interface CreateSharedLinkInput {
  itemId: ObjectId;
  type: SharedLinkType;
  title: string;
  description?: string;
  priceTinybars?: Tinybars;
  expiresAt?: Date | string;
  affiliateEnabled?: boolean;
}

/**
 * The `link` field of `sharedLinks.access()` varies with access level: a full document
 * when you can access it, a limited subset (`_id`, `title`, `description`, `type`,
 * `price`, `owner`, a trimmed `item`) when you can't. This type covers the union of both.
 */
export interface SharedLinkAccessContent {
  _id: ObjectId;
  title: string;
  description?: string;
  type: SharedLinkType;
  price?: number;
  priceTinybars?: Tinybars;
  owner?: Ref<PopulatedUserRef>;
  item?: Ref<PopulatedItemRef> | { name: string; type: string; size?: number };
  linkId?: string;
  isActive?: boolean;
  expiresAt?: ISODate | null;
  accessCount?: number;
  paidUsers?: ObjectId[];
  affiliateEnabled?: boolean;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

export interface SharedLinkAccess {
  link: SharedLinkAccessContent;
  canAccess: boolean;
  requiresPayment: boolean;
  requiresAuth?: boolean;
  alreadyPaid?: boolean;
  isOwner?: boolean;
}

export interface SharedLinkDetailsLink {
  title: string;
  description: string;
  type: SharedLinkType;
  price: number;
  item: PopulatedItemRef | null;
  owner: PopulatedUserRef | null;
  createdAt: ISODate;
  expiresAt: ISODate | null;
  accessCount: number;
}

export interface SharedLinkDetails {
  link: SharedLinkDetailsLink;
  canAccess: boolean;
  requiresPayment: boolean;
  requiresAuth: boolean;
  /** Hardcoded `false` on the backend (a literal `// TODO`) — never trust this to reflect real payment state. */
  alreadyPaid: false;
  isOwner: boolean;
}

export interface ClaimSharedLinkResult {
  success: true;
  message: string;
  copiedItem: Item;
}
