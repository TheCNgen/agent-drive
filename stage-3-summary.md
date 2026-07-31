# Stage 3 — SDK: Resources — Summary

Attaches `items`, `listings`, `sharedLinks`, `affiliates`, and `transactions` to the
`AgentDrive` client built in Stage 2, with a single normalized pagination shape, a
`Ref<T>`/`ObjectId`/`ISODate`/`Tinybars` type vocabulary, hbar/file utilities, and a new
`agent-drive/node` entry for `fileFromPath()`. All non-payment AgentDrive endpoints are now
typed, JSDoc'd methods; the two purchase endpoints remain unimplemented per the stage's
explicit scope, and there is no `ai` surface anywhere.

## What was built

### Pagination (`src/core/pagination.ts`)
- `Page<T>` — the one normalized shape (`data, page, totalPages, count, totalItems,
  limit, hasNextPage, hasPreviousPage, nextCursor`) that every list method returns.
- `normalizePage(raw, dataKey, requestedLimit)` — tolerates every missing/malformed key
  via typeof-guarded fallbacks; never throws, confirmed against a deliberately garbage
  envelope during development.
- `normalizeFakeTotalPagination(raw, requestedLimit)` — the correction for the three
  endpoints whose `pagination.total` the backend computes as
  `Math.ceil(currentPageArray.length / limit)` (always `1`): sets `totalPages` to the
  current page number and derives `hasNextPage` from `count === limit` instead (§7.5).
- `iteratePages()` — the shared engine behind every resource's `iterate()`. Prefers
  `nextCursor` when present (currently only `/items`), otherwise increments `page`; stops
  on `!hasNextPage || data.length === 0` (the second condition is load-bearing — `/items`
  computes `hasNextPage` as `items.length === limit`, so a final page that exactly fills
  the limit reports one phantom extra page); caps at 1000 pages and throws
  `AgentDriveError` (`pagination_runaway`) rather than looping forever.

### Types (`src/types/{common,item,listing,sharedLink,affiliate,transaction}.ts`)
- `common.ts` gained `ObjectId`, `ISODate`, `Tinybars`, `Ref<T>` with `isPopulated()`/
  `refId()` guards (accepts either `_id` or `id` — no key rewriting, per S3-3), and the
  two populated-reference shapes reused verbatim across resources (`PopulatedItemRef`,
  `PopulatedUserRef`) because the backend's `.populate(...)` select strings are
  byte-for-byte identical across listings/shared-links/transactions.
- Every resource has its own request/response types built directly from its Mongoose
  schema and route handler — not guessed. No `any` anywhere in an exported type;
  genuinely unknowable shapes (`Transaction.metadata`, Commission `records`,
  `affiliateActivity`) are `Record<string, unknown>`.
- `Commission` types both `amountTinybars` (the actual schema field) and
  `commissionAmountTinybars` (what the purchase flow's `Commission.create()` calls
  actually write — a field name that doesn't exist on the schema) as optional, defensive
  fallbacks. This is a **second, undocumented defect** in the same family as §7.3, found
  while typing affiliates: `Commission.amountTinybars` is `required: true` on the schema,
  but every `Commission.create()` call in the purchase routes passes
  `commissionAmountTinybars` instead — a name Mongoose strict mode silently drops, so
  those `create()` calls should throw a validation error every time, silently swallowed
  by a `catch` block around affiliate-commission processing. It's inside Stage 4's
  purchase flow, so out of scope to fix here, but worth flagging before Stage 4 starts:
  today, no Commission document is ever actually created by a real purchase.

### Utilities
- `src/utils/hbar.ts` — `hbarToTinybars` parses the decimal string by hand (split on
  `.`, pad the fraction to 8, reject >8 places, reject via `BigInt`) — never `parseFloat`.
  `percentOfTinybars` uses `(v * BigInt(percent)) / 100n` and requires an integer percent,
  matching the backend's own fee arithmetic exactly (`BigInt()` itself rejects a
  fractional rate, so this is a real backend constraint, not an invented one).
- `src/utils/file.ts` — `FileLike = File` (the global `File`, present in every browser and
  in Node 20+ via undici) and the extension→MIME table.
- `src/node.ts` — new entry, `fileFromPath()`. Verified by inspecting the built output
  that `node:fs`/`node:path` only appear in `dist/node.js`, never in `dist/index.js` or
  any chunk it statically imports — the existing Stage 2 pattern (dynamic
  `import("./agent/configStore.js")`, Node-gated) already kept the root bundle clean, and
  `node.ts` follows the same discipline as its own dedicated entry.

### Resources
- **`items`** (`resources/items.ts`) — `list/iterate/getRootFolder/get/createFolder/
  upload/createFromUrl/update/delete/path`. `list()` transparently resolves and caches
  (for the process lifetime) the owner's root folder id via one `getRootFolder()` call,
  so `items.list()` with no `parentId` returns root **children**, not the backend's raw
  "root folder as a single-element array" response — `getRootFolder()` stays available
  for the raw behavior. `upload`/`createFromUrl` always send `multipart/form-data`
  (the backend only reads `url` from form data, never JSON); `HttpClient` was extended to
  skip `JSON.stringify`/`Content-Type` for a `FormData` body. `delete()` is marked
  `@destructive` (recursive: item, descendants, AI chunks, GCS objects).
  - **Deviation from the spec text, noted deliberately:** §4.1 says to get the root
    folder id "from `client.agent.me()`". The live `GET /v1/agent/me` response (checked
    against `web/app/api/v1/agent/me/route.ts` and confirmed live) has no `rootFolder`
    field — `MeResult` is `{ agent, wallet, owner }`, and `/api/user` (which does return
    `rootFolder`) is session-only, unreachable with a Bearer key. The only way an
    agent-authenticated caller can discover its root folder id against the real backend
    is the quirk itself: `GET /items` with no `parentId`. `items.getRootFolder()` (backed
    by that call) is what `list()` actually uses and caches; this is what the DoD's
    "confirmed to return root children" checkbox is verified against below.
- **`listings`** (`resources/listings.ts`) — `list/iterate/get/create/update/delete/
  getPurchaseStatus/getPublicDetails/tags`. `update()` sends `PATCH`, never `PUT` (there
  is no `PUT /listings/:id`). Client-side pre-flight throws `ValidationError` before any
  network call for `priceTinybars` (must match `/^[1-9][0-9]*$/`) and `status`.
  `getPublicDetails()` coerces the backend's always-`undefined` `price` to `null` per the
  documented defect rather than leaking `undefined`.
- **`sharedLinks`** (`resources/sharedLinks.ts`) — `list/iterate/create/access/
  getDetails/claim`. `create()` sends `price`, `priceTinybars`, and `affiliateEnabled`
  together, with a comment pointing at §7.3, per the locked wire-format decision.
  `linkId` (the 16-char public id) is the parameter name everywhere, never `_id`.
  `claim()`/`access()` surface `GoneError` (410) and `PaymentRequiredError` (402) — both
  new error classes, since neither existed in Stage 2's hierarchy.
- **`affiliates`** (`resources/affiliates.ts`) — `list/iterate/get/create/update/delete/
  getByCode/listCommissionTransactions/updateCommission`. `create()`'s JSDoc documents the
  two-mode (self-enroll vs. owner-enrolls) behavior and the listing-must-have-
  `affiliateEnabled` check explicitly, since neither is guessable from the method
  signature. `listCommissionTransactions()` gets the 60s timeout (§7.6) and the
  fake-total pagination correction. `updateCommission()` is `@internal @deprecated` and
  logs a `logger.warn()` on every call, naming the missing ownership check (§7.4).
- **`transactions`** (`resources/transactions.ts`) — `list/iterate/get/commissions/
  earnings/unsafeUpdate`. `get()`'s JSDoc documents the `transactionType` overwrite
  (§7.9); `commissions()` gets the 60s timeout and fake-total correction. `unsafeUpdate()`
  is `@internal @deprecated`, warns on every call, and is the one method that needed
  `HttpClient` extended with a per-request `headers` option — the endpoint reads a plain
  `x-user-id` header, not a body field, so `unsafeUpdate(id, { userId, ... })` maps
  `userId` to that header rather than the JSON body.
  - **Also noted but not specially timed:** `earnings()` runs the identical unfiltered
    `Commission.find({})` scan as `commissions()`, but §7.6 names only two endpoints for
    the 60s timeout. Followed the spec literally (default 30s for `earnings()`) and left
    a comment explaining the asymmetry rather than silently "fixing" it.

### Core extensions (`errors.ts`, `core/http.ts`)
- New error classes: `GoneError` (`gone`, 410), `PaymentRequiredError`
  (`payment_required`, 402). `errorFromApiResponse()` branches on both `code` and a
  status fallback, since the backend's `withErrorHandler` returns these without a `code`
  field on the shared-links routes.
- `InsufficientScopeError.message` changed from Stage 2's
  `This agent lacks the required scope "X" for this action.` to the Stage 3 spec's exact
  wording: `` This agent lacks the `items:write` scope. `` (backtick style matches the
  existing convention in `KeyRevokedError`'s message).
- `HttpClient.request()` gained: `FormData` body support (no `Content-Type`, so `fetch`
  sets its own multipart boundary), a per-request `headers` option (merged in after
  auth, so it can override), and a per-request `timeoutMs` override (used by the two
  §7.6 slow-report calls).

### Client wiring (`client.ts`)
`AgentDrive`'s constructor now resolves the logger eagerly (pure, no I/O — unlike
`HttpClient`, which is still built lazily on first use) so `affiliates`/`transactions`
can log their `@internal` warnings without needing an async accessor.

## Live verification (2026-07-27) — real MongoDB Atlas, real GCS, real backend

Same throwaway-infrastructure pattern as Stages 1–2, all torn down afterward:

- **MongoDB**: temporary Atlas user `stage3_test_user` (6h auto-`deleteAfter` safety net),
  `readWrite` on a fresh `agentdrive_stage3_test` database on the existing `cachedrive-dev`
  cluster. Seeded directly via `mongosh` (bypassing onboarding, which Stage 2 already
  verified end-to-end): two `User`s with root folders, two `Agent`s owned by the seller —
  one with all nine resource scopes, one with only `items:read` — with real
  `keyHash`/`keyPrefix` pairs matching real bearer tokens.
- **GCS**: a temporary bucket (`agentdrive-stage3-test-<timestamp>`) in the already-
  authenticated `oe-dev-env-2026` project, so `items.upload()` exercised **real** file
  bytes through **real** `@google-cloud/storage`, not the "GCS not configured" placeholder
  path.
- **App**: `web/` via `next dev` against a throwaway `.env.local` — real Mongo URI, a
  fresh `NEXTAUTH_SECRET`, real GCS bucket/project, and Hedera/KMS/Mistral placeholder
  strings (only truthiness is checked at boot; none of this stage's endpoints touch
  Hedera, KMS, or Mistral). `.env.local` deleted afterward.

**Results**, run via the built `dist/index.js` and `dist/node.js` against
`http://localhost:3000`:

- `items.getRootFolder()` returned the raw root-folder-as-single-item response;
  `items.list()` with no arguments returned `0` children on a fresh DB, then `1` after
  `createFolder()` — **DoD item confirmed**: root children, not the root folder itself.
- `createFolder` → `createFromUrl` → `get` → `update` (rename) → `path()` chain produced
  a correct root-first breadcrumb array.
- `items.upload()` with `fileFromPath()` on a real local file produced a real
  `storage.googleapis.com` URL and `aiProcessing: { status: 'none', topics: [],
  chunksCount: 0 }` for a `.txt` file (queued-processing fields absent because the file
  content itself didn't trigger the backend's async path in the observation window —
  the `aiProcessing.queued` field itself was confirmed to exist on the type and is set by
  the backend for `.txt`/`.pdf`/`.docx` per the route source read earlier).
- Attempting to move a folder under a non-folder item threw `ValidationError` ("Invalid
  parent folder"). Note: this specific live check used a file as the bogus target, which
  trips the backend's "is this even a folder" guard before it reaches the actual
  descendant-loop check — it does not exercise the "Cannot move folder into itself or its
  children" message quoted in `items.update()`'s JSDoc, which requires the target to be a
  real folder that's a genuine descendant of the source (confirmed by reading
  `web/app/api/items/[id]/route.ts`'s `checkIfDescendantWithSession` path directly, not
  independently re-verified live in this pass).
- `listings.create/list/get(incrementView)/update/tags/getPurchaseStatus` all round-
  tripped correctly; view count incremented `1 → 2` across two `get()` calls.
- **DoD item confirmed**: `listings.getPublicDetails()` returned `{ price: null, title:
  "Stage 3 Report", sellerWallet: "0xseller..." }` against a real API-created listing —
  the defect reproduced live, not just reasoned about from source.
- Client-side `priceTinybars` validation rejected `"0"` before any network call.
- **DoD item confirmed** — the real `/listings` pagination envelope was observed
  (`{listings, pagination: {current, total, count, totalItems}}`, no `hasNextPage`/
  `nextCursor`/`limit` keys) and matches the adapter's documented fallback behavior; same
  for `/shared-links` (`{links, pagination: {...}}`, identical shape).
- **§7.3 confirmed live, precisely**: a monetized shared link created via the SDK came
  back with `price: 250000000` but `priceTinybars: undefined` — reading
  `web/app/api/shared-links/route.ts` explains why: the `POST` handler destructures
  `{ itemId, type, price, title, description, expiresAt }` from the body and **never
  destructures `priceTinybars` at all**, so even sending both fields (as the SDK does)
  can't make it round-trip today. `access()`/`claim()` don't depend on `priceTinybars`
  (only the Stage-4 purchase route does), so `claim()` on the unpaid monetized link still
  correctly threw `PaymentRequiredError` (402).
- Shared-link `access()`, `getDetails()` (confirmed `alreadyPaid: false` hardcoded),
  and `claim()` (public link succeeded; expired link threw `GoneError` with the backend's
  real "Link has expired" message, for both `access()` and `claim()`) all verified live.
- `affiliates.create()` with an affiliate-enabled listing succeeded with a real
  server-generated `nanoid(8)` code; a duplicate `(content, owner, affiliateUser)` threw
  `ConflictError`; a listing without `affiliateEnabled` threw `ValidationError` with the
  real backend message. `getByCode()` round-tripped the same commission rate.
  `listCommissionTransactions()`'s corrected pagination (`totalPages === page`,
  `hasNextPage: count === limit`) was verified against the live (empty, since no real
  Commission documents exist — see the defect noted above) response.
- `transactions.list/commissions/earnings` all returned real, well-formed reports;
  `commissions()`/`earnings()` pagination correction verified live.
- **§7.1 confirmed live**: seeded a `pending` `Transaction` directly, then called
  `transactions.unsafeUpdate(txId, { userId: "000000000000000000000099", status:
  "completed" })` — an arbitrary id that is neither the transaction's buyer, seller, nor
  the calling agent's owner — and the transaction's status flipped to `completed` on
  re-fetch. No ownership check, exactly as documented.
- **DoD item confirmed** — `07-scopes`: the limited-scope agent (`items:read` only)
  calling `items.createFolder()` and `listings.create()` both threw
  `InsufficientScopeError` with `.message === "This agent lacks the \`items:write\`
  scope."` / `` `listings:write` `` respectively and `.requiredScope` set correctly; the
  same agent's `items.list()` (a read, which it does have) succeeded.
- `iterate()` over a folder with 7 children yielded all 7 across `limit: 2` pages.

All temporary infrastructure was torn down afterward: dev server stopped, `.env.local`
deleted, GCS bucket and its objects deleted, all Mongo collections dropped, and the Atlas
database user deleted (in addition to its 6h auto-expiry safety net).

## Build/lint verification
`npm run typecheck`, `npm run build`, `npm run smoke` (ESM + CJS), and `npm run
lint:pack` (`publint` + `attw --pack .`) all pass. `agent-drive/node`'s `attw` node10
resolution status matches the pre-existing `agent-drive/agent` entry exactly (expected —
same subpath-export shape), not a regression.

## Out of scope (unchanged)

Purchases (`listings.purchase`, `sharedLinks.purchase`) remain unimplemented — Stage 4,
x402. No `ai` namespace, no `ai:invoke` scope, no `resources/ai.ts`/`types/ai.ts`. No
CLI commands were added for these resources (the stage's testing section only exercises
the SDK directly; the CLI's `onboard`/`whoami`/`logout` surface from Stage 2 is
unchanged).
