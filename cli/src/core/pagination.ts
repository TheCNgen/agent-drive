import { AgentDriveError } from "../errors.js";

/** The SDK's single normalized pagination shape, replacing the backend's five envelopes. */
export interface Page<T> {
  data: T[];
  page: number;
  totalPages: number;
  count: number;
  totalItems: number;
  limit: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor: string | null;
}

/**
 * Pagination metadata for the three report endpoints whose `totalPages` is always `1`
 * on the backend (computed from the current page's array length, not a real count):
 * `/affiliates/transactions`, `/transactions/commissions`, `/transactions/earnings`.
 */
export interface FakeTotalPagination {
  page: number;
  totalPages: number;
  count: number;
  totalItems: number;
  limit: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

const MAX_ITERATE_PAGES = 1000;

interface RawPaginationMeta {
  current?: unknown;
  total?: unknown;
  count?: unknown;
  totalItems?: unknown;
  hasNextPage?: unknown;
  hasPreviousPage?: unknown;
  nextCursor?: unknown;
  limit?: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Normalizes one of the backend's five pagination envelopes (`items`, `listings`,
 * `links`, `affiliates`, `transactions`) into a single {@link Page} shape. Every field
 * has a documented fallback for when the envelope omits it — this never throws, even
 * against a completely malformed response.
 */
export function normalizePage<T>(raw: unknown, dataKey: string, requestedLimit: number): Page<T> {
  const root = isPlainObject(raw) ? raw : {};
  const dataRaw = root[dataKey];
  const data = Array.isArray(dataRaw) ? (dataRaw as T[]) : [];
  const pagination: RawPaginationMeta = isPlainObject(root.pagination) ? root.pagination : {};

  const page = typeof pagination.current === "number" ? pagination.current : 1;
  const totalPages = typeof pagination.total === "number" ? pagination.total : 1;
  const count = typeof pagination.count === "number" ? pagination.count : data.length;
  const totalItems = typeof pagination.totalItems === "number" ? pagination.totalItems : count;
  const limit = typeof pagination.limit === "number" ? pagination.limit : requestedLimit;
  const hasNextPage =
    typeof pagination.hasNextPage === "boolean" ? pagination.hasNextPage : page < totalPages;
  const hasPreviousPage =
    typeof pagination.hasPreviousPage === "boolean" ? pagination.hasPreviousPage : page > 1;
  const nextCursor = typeof pagination.nextCursor === "string" ? pagination.nextCursor : null;

  return { data, page, totalPages, count, totalItems, limit, hasNextPage, hasPreviousPage, nextCursor };
}

/**
 * Corrects the fake `pagination.total` on the three report endpoints listed on
 * {@link FakeTotalPagination}: `totalPages` becomes the current page number (so it never
 * falsely implies there's only one page), and `hasNextPage` is inferred from whether the
 * page was full (`count === limit`) instead of trusting the backend's always-true-or-false
 * `total`.
 */
export function normalizeFakeTotalPagination(raw: unknown, requestedLimit: number): FakeTotalPagination {
  const pagination: RawPaginationMeta = isPlainObject(raw) ? raw : {};
  const page = typeof pagination.current === "number" ? pagination.current : 1;
  const count = typeof pagination.count === "number" ? pagination.count : 0;
  const totalItems = typeof pagination.totalItems === "number" ? pagination.totalItems : count;

  return {
    page,
    totalPages: page,
    count,
    totalItems,
    limit: requestedLimit,
    hasNextPage: count === requestedLimit,
    hasPreviousPage: page > 1,
  };
}

/**
 * Shared `iterate()` implementation used by every resource's list method. Prefers
 * `nextCursor` when the backend provides one (currently only `/items`); otherwise
 * increments `page`. Stops as soon as a page reports no next page *or* returns zero
 * items — the second condition matters because `/items` computes `hasNextPage` as
 * `items.length === limit`, so a final page that exactly fills the limit reports one
 * phantom extra page. Caps at 1000 pages and throws a `AgentDriveError` with code
 * `pagination_runaway` rather than looping forever against a malformed envelope.
 */
export async function* iteratePages<T>(
  fetchPage: (params: Record<string, unknown>) => Promise<Page<T>>,
  params: Record<string, unknown> = {},
): AsyncGenerator<T> {
  let cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  let page = typeof params.page === "number" ? params.page : 1;
  let pagesFetched = 0;

  for (;;) {
    const requestParams: Record<string, unknown> = { ...params };
    if (cursor) {
      requestParams.cursor = cursor;
      delete requestParams.page;
    } else {
      requestParams.page = page;
      delete requestParams.cursor;
    }

    const result = await fetchPage(requestParams);
    for (const item of result.data) yield item;
    pagesFetched++;

    if (pagesFetched >= MAX_ITERATE_PAGES) {
      throw new AgentDriveError(
        `iterate() did not terminate after ${MAX_ITERATE_PAGES} pages; the pagination envelope may be malformed.`,
        "pagination_runaway",
      );
    }

    if (!result.hasNextPage || result.data.length === 0) return;

    if (result.nextCursor) {
      cursor = result.nextCursor;
    } else {
      cursor = undefined;
      page += 1;
    }
  }
}
