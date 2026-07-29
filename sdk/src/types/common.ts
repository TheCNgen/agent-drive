export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

export interface Logger {
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
}

export interface ApiErrorBody {
  error: string;
  code: string;
  [key: string]: unknown;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A Mongo `_id` (or, where the backend chose `id`, that) — never rewritten by the SDK. */
export type ObjectId = string;

/** An ISO-8601 timestamp as sent back by the backend. */
export type ISODate = string;

/** Tinybars (1 HBAR = 10^8 tinybars) as a decimal-string integer. Never `number`, never `bigint`. */
export type Tinybars = string;

/**
 * A Mongoose reference that may or may not be populated: either the bare id string, or
 * the populated document. Use {@link isPopulated} to narrow and {@link refId} to get the
 * id either way.
 */
export type Ref<T> = string | T;

/** Narrows a {@link Ref} to its populated form. True whenever the backend expanded the reference. */
export function isPopulated<T>(ref: Ref<T>): ref is T {
  return typeof ref === "object" && ref !== null;
}

/** Returns the id of a {@link Ref}, whether or not it's populated. Accepts either `_id` or `id`. */
export function refId<T extends { _id?: ObjectId; id?: ObjectId }>(ref: Ref<T>): ObjectId {
  if (typeof ref === "string") return ref;
  if (typeof ref._id === "string") return ref._id;
  if (typeof ref.id === "string") return ref.id;
  throw new TypeError("refId(): populated reference has neither `_id` nor `id`.");
}

/**
 * The `item` population shape used identically by listings, shared links, and
 * transactions (`.populate('item', 'name type size mimeType url')`).
 */
export interface PopulatedItemRef {
  _id: ObjectId;
  name: string;
  type: "file" | "folder";
  size?: number;
  mimeType?: string | null;
  /**
   * A presigned, expiring GCS URL. Do not persist it — re-fetch the parent resource to
   * refresh it once it's close to expiring.
   */
  url?: string | null;
}

/**
 * A partial `User` population. Which fields are actually present depends on the
 * endpoint's `.select(...)` — see each resource method's JSDoc.
 */
export interface PopulatedUserRef {
  _id: ObjectId;
  name?: string;
  email?: string;
  wallet?: string;
  accountId?: string;
}
