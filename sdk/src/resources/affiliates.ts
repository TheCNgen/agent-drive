import type { HttpClient } from "../core/http.js";
import { iteratePages, normalizeFakeTotalPagination, normalizePage, type Page } from "../core/pagination.js";
import { ValidationError } from "../errors.js";
import type { Logger } from "../types/common.js";
import type {
  Affiliate,
  AffiliateByCode,
  AffiliateTransactionsPage,
  CreateAffiliateInput,
  ListAffiliateCommissionsParams,
  ListAffiliatesParams,
  UpdateAffiliateInput,
  UpdateCommissionInput,
  UpdateCommissionResult,
} from "../types/affiliate.js";

const DEFAULT_LIST_LIMIT = 20;
/** `/affiliates/transactions` loads the entire Commission collection per request (§7.6). */
const SLOW_REPORT_TIMEOUT_MS = 60_000;

function assertValidCommissionRate(commissionRate: number | undefined): void {
  if (commissionRate !== undefined && (commissionRate < 0 || commissionRate > 100)) {
    throw new ValidationError(`commissionRate must be a percentage between 0 and 100, got ${commissionRate}.`);
  }
}

export class AffiliatesResource {
  constructor(
    private readonly getHttp: () => Promise<HttpClient>,
    private readonly logger: Logger,
  ) {}

  /**
   * Lists affiliate relationships you own or participate in. **Requires `affiliates:read`.**
   *
   * @example
   * const page = await client.affiliates.list({ type: "affiliate" });
   */
  async list(params: ListAffiliatesParams = {}): Promise<Page<Affiliate>> {
    const limit = params.limit ?? DEFAULT_LIST_LIMIT;
    const http = await this.getHttp();
    const raw = await http.request<unknown>("GET", "/affiliates", {
      query: { type: params.type, page: params.page, limit },
    });
    return normalizePage<Affiliate>(raw, "affiliates", limit);
  }

  /** Async-generator form of {@link list}. */
  async *iterate(params: ListAffiliatesParams = {}): AsyncGenerator<Affiliate> {
    yield* iteratePages<Affiliate>((p) => this.list(p as ListAffiliatesParams), params as Record<string, unknown>);
  }

  /**
   * Fetches a single affiliate relationship. **Requires `affiliates:read`.**
   *
   * @example
   * const affiliate = await client.affiliates.get(affiliateId);
   */
  async get(id: string): Promise<Affiliate> {
    const http = await this.getHttp();
    const raw = await http.request<{ affiliate: Affiliate }>("GET", `/affiliates/${encodeURIComponent(id)}`);
    return raw.affiliate;
  }

  /**
   * Creates an affiliate relationship for a listing or a shared link you own, or
   * self-enrolls as an affiliate for someone else's. **Requires `affiliates:write`.**
   *
   * Two modes, decided entirely by whether `affiliateUserId` is your own user id:
   * - **Self-enrolling** (`affiliateUserId === you`): the backend *ignores* any
   *   `commissionRate` you send and substitutes the content's own default — the
   *   listing's `defaultCommissionRate` (fallback `10`), or a flat `10` for shared links.
   * - **Content owner enrolling someone else**: you must own the listing/shared link,
   *   and your `commissionRate` is used as sent.
   *
   * Listing affiliates additionally require `listing.affiliateEnabled === true`, or this
   * throws `ValidationError` ("Affiliate program not enabled for this listing"). Shared
   * links have no equivalent check. A duplicate `(content, owner, affiliateUser)` throws
   * `ConflictError`. `commissionRate` is always a percentage (0-100).
   *
   * @example
   * const affiliate = await client.affiliates.create({ listingId, affiliateUserId: myUserId });
   */
  async create(input: CreateAffiliateInput): Promise<Affiliate> {
    assertValidCommissionRate(input.commissionRate);
    const http = await this.getHttp();
    const raw = await http.request<{ affiliate: Affiliate }>("POST", "/affiliates", { body: input });
    return raw.affiliate;
  }

  /**
   * Updates the commission rate and/or status of an affiliate you own. **Requires
   * `affiliates:write`.**
   *
   * @example
   * const affiliate = await client.affiliates.update(affiliateId, { status: "suspended" });
   */
  async update(id: string, input: UpdateAffiliateInput): Promise<Affiliate> {
    assertValidCommissionRate(input.commissionRate);
    const http = await this.getHttp();
    const raw = await http.request<{ affiliate: Affiliate }>("PUT", `/affiliates/${encodeURIComponent(id)}`, {
      body: input,
    });
    return raw.affiliate;
  }

  /**
   * Deletes an affiliate relationship you own. **Requires `affiliates:write`.**
   *
   * @example
   * await client.affiliates.delete(affiliateId);
   */
  async delete(id: string): Promise<{ message: string }> {
    const http = await this.getHttp();
    return http.request<{ message: string }>("DELETE", `/affiliates/${encodeURIComponent(id)}`);
  }

  /**
   * Looks up an affiliate by its public code. **Public.** Codes are server-generated
   * (`nanoid(8)`); you cannot choose one when creating an affiliate.
   *
   * @example
   * const { owner, commissionRate } = await client.affiliates.getByCode(code);
   */
  async getByCode(code: string): Promise<AffiliateByCode> {
    const http = await this.getHttp();
    const raw = await http.request<{ affiliate: AffiliateByCode }>(
      "GET",
      `/affiliates/code/${encodeURIComponent(code)}`,
    );
    return raw.affiliate;
  }

  /**
   * Lists your commission transactions — earned as an affiliate, or paid out as a
   * content owner. **Requires `affiliates:read`.**
   *
   * The backend loads its *entire* Commission collection per request and filters in
   * memory (§7.6), so this call uses a 60s timeout instead of the usual 30s.
   * `pagination.totalPages` is also always `1` on the backend regardless of how many
   * pages actually exist (computed from the current page's array length, not a real
   * count); this method corrects it to the current page number and derives `hasNextPage`
   * from `count === limit` instead.
   *
   * @example
   * const { transactions, summary } = await client.affiliates.listCommissionTransactions({ type: "earned" });
   */
  async listCommissionTransactions(params: ListAffiliateCommissionsParams = {}): Promise<AffiliateTransactionsPage> {
    const limit = params.limit ?? DEFAULT_LIST_LIMIT;
    const http = await this.getHttp();
    const raw = await http.request<{
      transactions: AffiliateTransactionsPage["transactions"];
      summary: AffiliateTransactionsPage["summary"];
      pagination: unknown;
    }>("GET", "/affiliates/transactions", {
      query: { type: params.type, page: params.page, limit },
      timeoutMs: SLOW_REPORT_TIMEOUT_MS,
    });
    return {
      transactions: raw.transactions,
      summary: raw.summary,
      pagination: normalizeFakeTotalPagination(raw.pagination, limit),
    };
  }

  /**
   * @internal
   * @deprecated Maps to `PATCH /affiliates/:id`, which **ignores `:id`** and performs no
   * ownership check on the Commission being updated (backend security defect, §7.4) —
   * any caller can update any commission belonging to anyone. Logs a warning on every
   * call. Do not expose this to untrusted callers.
   *
   * @example
   * await client.affiliates.updateCommission(affiliateId, { commissionId, status: "paid" });
   */
  async updateCommission(affiliateId: string, input: UpdateCommissionInput): Promise<UpdateCommissionResult> {
    this.logger.warn(
      "affiliates.updateCommission() calls a backend endpoint with no ownership check " +
        "(PATCH /affiliates/:id ignores :id) — any caller can update any commission.",
      { affiliateId, commissionId: input.commissionId },
    );
    const http = await this.getHttp();
    return http.request<UpdateCommissionResult>("PATCH", `/affiliates/${encodeURIComponent(affiliateId)}`, {
      body: {
        action: "updateCommission",
        commissionId: input.commissionId,
        status: input.status,
        paidAt: input.paidAt instanceof Date ? input.paidAt.toISOString() : input.paidAt,
      },
    });
  }
}
