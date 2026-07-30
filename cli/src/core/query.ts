export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/** Builds a query string from a flat record, skipping undefined/null values. Never returns a leading '?'. */
export function buildQueryString(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  return search.toString();
}
