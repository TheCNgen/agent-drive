const REDACTED_KEYS = new Set(
  [
    "apiKey",
    "api_key",
    "privateKey",
    "private_key",
    "code",
    "claimCode",
    "authorization",
    "password",
    "secret",
    "token",
  ].map((k) => k.toLowerCase()),
);

/** Keeps the first 12 characters (enough to identify a key prefix) and elides the rest. */
export function redactSecret(v: string): string {
  if (v.length <= 12) return "…";
  return `${v.slice(0, 12)}…`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-redacts known secret-shaped keys, case-insensitively, at any depth. Never mutates the input. */
export function redactObject<T>(o: T): T {
  if (Array.isArray(o)) {
    return o.map((item) => redactObject(item)) as unknown as T;
  }
  if (isPlainObject(o)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(o)) {
      if (REDACTED_KEYS.has(key.toLowerCase())) {
        out[key] = typeof value === "string" ? redactSecret(value) : "[REDACTED]";
      } else {
        out[key] = redactObject(value);
      }
    }
    return out as unknown as T;
  }
  return o;
}
