import type { HttpClient } from "../core/http.js";
import { iteratePages, normalizePage, type Page } from "../core/pagination.js";
import { ValidationError } from "../errors.js";
import { isValidTinybars } from "../utils/hbar.js";
import type {
  CreateListingInput,
  ListListingsParams,
  Listing,
  ListingPublicDetails,
  ListingPurchaseStatus,
  UpdateListingInput,
} from "../types/listing.js";

const DEFAULT_LIST_LIMIT = 20;

function assertValidPriceTinybars(value: string): void {
  if (!isValidTinybars(value)) {
    throw new ValidationError(
      `priceTinybars must match /^[1-9][0-9]*$/ (no "0", no leading zeros), got "${value}".`,
    );
  }
}

export class ListingsResource {
  constructor(private readonly getHttp: () => Promise<HttpClient>) {}

  /**
   * Lists marketplace listings. **Public** — no scope required, though the SDK sends the
   * Bearer header on every request regardless.
   *
   * @example
   * const page = await client.listings.list({ status: "active", sortBy: "createdAt" });
   */
  async list(params: ListListingsParams = {}): Promise<Page<Listing>> {
    const limit = params.limit ?? DEFAULT_LIST_LIMIT;
    const http = await this.getHttp();
    const raw = await http.request<unknown>("GET", "/listings", {
      query: {
        status: params.status,
        sellerId: params.sellerId,
        search: params.search,
        tags: params.tags?.join(","),
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
        page: params.page,
        limit,
      },
    });
    return normalizePage<Listing>(raw, "listings", limit);
  }

  /** Async-generator form of {@link list}. */
  async *iterate(params: ListListingsParams = {}): AsyncGenerator<Listing> {
    yield* iteratePages<Listing>((p) => this.list(p as ListListingsParams), params as Record<string, unknown>);
  }

  /**
   * Fetches a single listing. **Public.** Pass `incrementView: true` to bump its view
   * counter as a side effect.
   *
   * @example
   * const listing = await client.listings.get(listingId, { incrementView: true });
   */
  async get(id: string, options: { incrementView?: boolean } = {}): Promise<Listing> {
    const http = await this.getHttp();
    return http.request<Listing>("GET", `/listings/${encodeURIComponent(id)}`, {
      query: { incrementView: options.incrementView },
    });
  }

  /**
   * Creates a listing for an item you own. **Requires `listings:write`.**
   *
   * @example
   * const listing = await client.listings.create({
   *   itemId, title: "My report", description: "A great report.", priceTinybars: "500000000",
   * });
   */
  async create(input: CreateListingInput): Promise<Listing> {
    assertValidPriceTinybars(input.priceTinybars);
    const http = await this.getHttp();
    return http.request<Listing>("POST", "/listings", { body: input });
  }

  /**
   * Updates a listing you own. **Requires `listings:write`.**
   *
   * Sent as `PATCH` — there is no `PUT /listings/:id` on the backend; using PUT there
   * returns a 405 that looks like a routing bug rather than a validation error.
   *
   * @example
   * const updated = await client.listings.update(listingId, { status: "inactive" });
   */
  async update(id: string, input: UpdateListingInput): Promise<Listing> {
    if (input.priceTinybars !== undefined) assertValidPriceTinybars(input.priceTinybars);
    if (input.status !== undefined && input.status !== "active" && input.status !== "inactive") {
      throw new ValidationError(`status must be "active" or "inactive", got "${input.status as string}".`);
    }
    const http = await this.getHttp();
    return http.request<Listing>("PATCH", `/listings/${encodeURIComponent(id)}`, { body: input });
  }

  /**
   * Deletes a listing you own. **Requires `listings:write`.**
   *
   * @example
   * await client.listings.delete(listingId);
   */
  async delete(id: string): Promise<{ message: string }> {
    const http = await this.getHttp();
    return http.request<{ message: string }>("DELETE", `/listings/${encodeURIComponent(id)}`);
  }

  /**
   * Whether the caller has completed a purchase of this listing. **Requires `listings:read`.**
   *
   * @example
   * const { hasPurchased } = await client.listings.getPurchaseStatus(listingId);
   */
  async getPurchaseStatus(id: string): Promise<ListingPurchaseStatus> {
    const http = await this.getHttp();
    return http.request<ListingPurchaseStatus>("GET", `/listings/${encodeURIComponent(id)}/purchase-status`);
  }

  /**
   * A public, unauthenticated summary of a listing. **Public.**
   *
   * `price` is always `null` in practice — a documented backend defect, not a missing
   * price. Use `listings.get(id).priceTinybars` for the real amount.
   *
   * @example
   * const { title, sellerWallet } = await client.listings.getPublicDetails(listingId);
   */
  async getPublicDetails(id: string): Promise<ListingPublicDetails> {
    const http = await this.getHttp();
    const raw = await http.request<{ price?: number | null; title: string; sellerWallet?: string | null }>(
      "GET",
      `/listings/${encodeURIComponent(id)}/details`,
    );
    return { price: raw.price ?? null, title: raw.title, sellerWallet: raw.sellerWallet ?? null };
  }

  /**
   * Popular tags across active listings. **Public.** Cached 5 minutes in the backend's
   * module scope.
   *
   * The backend's aggregation groups on the whole tags array instead of unwinding it
   * first, and drops any tag combination used exactly once — treat this as a hint, not
   * an exhaustive list of tags in use.
   *
   * @example
   * const tags = await client.listings.tags();
   */
  async tags(): Promise<string[]> {
    const http = await this.getHttp();
    return http.request<string[]>("GET", "/listings/tags");
  }
}
