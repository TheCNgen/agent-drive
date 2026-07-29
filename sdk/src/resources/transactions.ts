import type { HttpClient } from "../core/http.js";
import { iteratePages, normalizeFakeTotalPagination, normalizePage, type Page } from "../core/pagination.js";
import type { Logger } from "../types/common.js";
import type {
  CommissionsReport,
  CommissionsReportParams,
  EarningsReport,
  EarningsReportParams,
  ListTransactionsParams,
  Transaction,
  TransactionWithRole,
  UnsafeUpdateTransactionInput,
  UnsafeUpdateTransactionResult,
} from "../types/transaction.js";

const DEFAULT_LIST_LIMIT = 20;
/** `/transactions/commissions` loads the entire Commission collection per request (§7.6). */
const SLOW_REPORT_TIMEOUT_MS = 60_000;

export class TransactionsResource {
  constructor(
    private readonly getHttp: () => Promise<HttpClient>,
    private readonly logger: Logger,
  ) {}

  /**
   * Lists your transactions (purchases and/or sales). **Requires `transactions:read`.**
   * Each row carries a server-computed `userRole: 'buyer' | 'seller'`.
   *
   * @example
   * const page = await client.transactions.list({ type: "purchases" });
   */
  async list(params: ListTransactionsParams = {}): Promise<Page<TransactionWithRole>> {
    const limit = params.limit ?? DEFAULT_LIST_LIMIT;
    const http = await this.getHttp();
    const raw = await http.request<unknown>("GET", "/transactions", {
      query: {
        type: params.type,
        status: params.status,
        transactionType: params.transactionType,
        paymentFlow: params.paymentFlow,
        page: params.page,
        limit,
      },
    });
    return normalizePage<TransactionWithRole>(raw, "transactions", limit);
  }

  /** Async-generator form of {@link list}. */
  async *iterate(params: ListTransactionsParams = {}): AsyncGenerator<TransactionWithRole> {
    yield* iteratePages<TransactionWithRole>(
      (p) => this.list(p as ListTransactionsParams),
      params as Record<string, unknown>,
    );
  }

  /**
   * Fetches a single transaction. **Requires `transactions:read`.**
   *
   * The backend overwrites the stored `transactionType` with `'purchase'`/`'sale'` based
   * on your role as the caller, so a commission transaction fetched by id here always
   * reports `'purchase'` or `'sale'`, never `'commission'` (§7.9). Use `list()` if you
   * need the true stored value.
   *
   * @example
   * const transaction = await client.transactions.get(transactionId);
   */
  async get(id: string): Promise<Transaction & { transactionType: "purchase" | "sale" }> {
    const http = await this.getHttp();
    return http.request<Transaction & { transactionType: "purchase" | "sale" }>(
      "GET",
      `/transactions/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Commission transactions you've received as a seller. **Requires `transactions:read`.**
   *
   * Loads the entire Commission collection per request and filters in memory (§7.6), so
   * this call uses a 60s timeout instead of the usual 30s. `pagination.totalPages` is
   * always `1` on the backend regardless of how many pages actually exist; this method
   * corrects it to the current page number and derives `hasNextPage` from `count === limit`.
   *
   * @example
   * const { summary } = await client.transactions.commissions();
   */
  async commissions(params: CommissionsReportParams = {}): Promise<CommissionsReport> {
    const limit = params.limit ?? DEFAULT_LIST_LIMIT;
    const http = await this.getHttp();
    const raw = await http.request<{
      commissions: {
        transactions: CommissionsReport["transactions"];
        records: CommissionsReport["records"];
        summary: CommissionsReport["summary"];
      };
      pagination: unknown;
    }>("GET", "/transactions/commissions", {
      query: { page: params.page, limit, status: params.status },
      timeoutMs: SLOW_REPORT_TIMEOUT_MS,
    });
    return {
      transactions: raw.commissions.transactions,
      records: raw.commissions.records,
      summary: raw.commissions.summary,
      pagination: normalizeFakeTotalPagination(raw.pagination, limit),
    };
  }

  /**
   * Sales and commission earnings summary. **Requires `transactions:read`.**
   *
   * Runs the same unfiltered `Commission.find({})` scan as `commissions()` (§7.6), but
   * the backend doesn't currently single it out for a longer timeout — the SDK keeps the
   * default 30s here, matching the spec, even though it may be similarly slow in
   * practice. `pagination.totalPages` has the same "always `1`" defect and is corrected
   * the same way as `commissions()`.
   *
   * @example
   * const { summary } = await client.transactions.earnings();
   */
  async earnings(params: EarningsReportParams = {}): Promise<EarningsReport> {
    const limit = params.limit ?? DEFAULT_LIST_LIMIT;
    const http = await this.getHttp();
    const raw = await http.request<{
      earnings: {
        sales: EarningsReport["sales"];
        commissions: EarningsReport["commissions"];
        affiliateActivity: EarningsReport["affiliateActivity"];
        summary: EarningsReport["summary"];
      };
      pagination: unknown;
    }>("GET", "/transactions/earnings", { query: { page: params.page, limit } });
    return {
      sales: raw.earnings.sales,
      commissions: raw.earnings.commissions,
      affiliateActivity: raw.earnings.affiliateActivity,
      summary: raw.earnings.summary,
      pagination: normalizeFakeTotalPagination(raw.pagination, limit),
    };
  }

  /**
   * @internal
   * @deprecated Calls `PATCH /transactions/:id`, which has **no authentication at all**
   * on the backend — it trusts a bare `x-user-id` header with no session check, no
   * ownership check, and no validation (security defect, §7.1). Any caller can rewrite
   * any transaction's status. Logs a warning on every call. Never expose this to
   * untrusted callers; it exists only so trusted, server-side tooling isn't blocked
   * while the backend is unfixed.
   *
   * @example
   * await client.transactions.unsafeUpdate(transactionId, { userId, status: "completed" });
   */
  async unsafeUpdate(id: string, input: UnsafeUpdateTransactionInput): Promise<UnsafeUpdateTransactionResult> {
    this.logger.warn(
      "transactions.unsafeUpdate() calls a backend endpoint with no authentication " +
        "(PATCH /transactions/:id trusts a bare x-user-id header) — any caller can rewrite any transaction.",
      { transactionId: id, userId: input.userId },
    );
    const http = await this.getHttp();
    return http.request<UnsafeUpdateTransactionResult>("PATCH", `/transactions/${encodeURIComponent(id)}`, {
      body: { status: input.status, metadata: input.metadata },
      headers: { "x-user-id": input.userId },
    });
  }
}
