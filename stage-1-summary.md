# Stage 1 — Backend: Agent Model & Auth Lane — Summary

Implements the agent claim/auth lane described in the Stage 1 spec: mint → claim → wallet →
funded → active, plus dual-lane auth (`Authorization: Bearer` alongside the existing
NextAuth session) across all protected routes. All work is backend-only, in `web/`.

## What was built

### Data model
- `web/app/models/Agent.ts` — `Agent` schema exactly as specified (owner immutable, status/
  onboardingState machines, scopes, key material, wallet fields). Exports `ALL_SCOPES` and
  `DEFAULT_SCOPES` (everything except `payments:spend`). No `privateKey` field exists in the
  schema; a `pre('validate')` hook throws if one is ever assigned, as a second layer of
  defense on top of Mongoose strict mode silently dropping unknown fields.
- `web/app/models/AgentClaim.ts` — one-time claim codes. `codeHash` is unique-indexed;
  `expiresAt` has a `expireAfterSeconds: 3600` TTL index for cleanup only. Expiry is enforced
  by the `expiresAt: { $gt: new Date() }` clause in the redemption query, not by the TTL
  monitor (which can lag up to ~60s).
- Both exported from `web/app/lib/models.ts` alongside the existing models.

### Dual-lane resolver — `web/app/lib/backend/resolvePrincipal.ts`
- `resolvePrincipal(request)`: checks `Authorization: Bearer` first (indexed `keyPrefix`
  lookup + `crypto.timingSafeEqual` hash comparison), falls back to
  `getServerSession(authOptions)` for the human lane. Returns `null` if neither is present.
- `requirePrincipal(request, scope?)`: throws a typed `PrincipalError` (401) if unauthenticated,
  or 403 `insufficient_scope` (with `requiredScope` in the body) if an agent principal lacks
  the scope. A user principal always passes scope checks — scopes constrain agents, not
  their owners.
- `requireAgentPrincipal(request)`: for the `/api/v1/agent/*` SDK-only endpoints, which never
  accept a session cookie.
- Both principal kinds carry `userId`, `rootFolder`, `email`, `name` so every downstream route
  can be written identically regardless of which lane authenticated the caller. For an agent,
  `userId`/`rootFolder`/`email` are the **owning user's**, satisfying "an agent acts on behalf
  of its owner."
- Route gating for partially-onboarded agents lives here: a `pending` agent may call
  `/wallet`, `/me`, `/activate`, `/revoke` (`ONBOARDING_PATHS`); everything else needs
  `status === 'active'`. A `revoked` agent gets 401 `key_revoked` everywhere **except**
  `/revoke` itself, which stays reachable so revocation is idempotent.
- `lastSeenAt` is updated fire-and-forget (`.catch()`, never `await`ed) so it can't add
  latency to the auth hot path.
- `web/app/lib/backend/errors.ts` — `PrincipalError` (status + code + extra fields) and
  `principalErrorToResponse()`, used identically across every migrated route so error
  shapes (`{ error, code }`) are consistent everywhere.
- `web/app/lib/backend/security.ts` — `containsPrivateKeyField()`, a recursive, case-
  insensitive scan used by `/wallet` to reject any request body carrying a `privateKey` at
  any depth.
- `web/app/lib/backend/agentKeys.ts` — key/code generation: `cdk_test_` + 43 base62 chars
  (matches `/^cdk_test_[0-9A-Za-z]{43}$/`, ~256 bits of entropy from `crypto.randomBytes(43)`),
  32-hex-char claim codes from `crypto.randomBytes(16)`, SHA-256 hashing helper, the 10-minute
  claim TTL constant, and the suggested-funding constant.

### Funding watcher — `web/app/lib/backend/agentFunding.ts`
- No background interval anywhere. `refreshAgentWalletState(agent)` is a lazy, pull-based
  check driven entirely by callers (`GET /me`, the SSE tick).
- `fetchMirrorAccount(idOrAlias)` hits `{mirrorNodeUrl}/api/v1/accounts/{idOrAlias}` (works
  for both an EVM alias and a `0.0.x` id), 5s timeout via `AbortController`, returns `null`
  on 404.
- A module-level `Map` cache: 5s TTL for the funding-state check, 10s TTL for `/me`'s
  `balanceTinybars`. A mirror-node failure is caught, logged, and falls back to the last
  cached value (or `null`) — it **never** fails the request it's backing.
- `refreshAgentWalletState` only ever advances `wallet → funded` (storing the real
  `accountId` the first time the alias resolves to an account). `funded → active` is never
  inferred here — it requires the explicit self-paid activation transaction, confirmed only
  by `POST /activate`.

### Agent-lane endpoints — `web/app/api/v1/agent/`
- `POST /claim` — unauthenticated, the only unauthenticated write in the system. Atomic
  `findOneAndUpdate({ codeHash, claimedAt: null, expiresAt: { $gt: now } })` redemption (no
  transaction needed — single document). Not-found / expired / already-redeemed / malformed
  all return the same `400 claim_invalid`. Generates and returns the API key **only here**;
  stores just `keyHash`/`keyPrefix` on the agent.
- `POST /wallet` — rejects any `privateKey` anywhere in the body before touching anything
  else; validates `/^0x[0-9a-f]{40}$/`; idempotent on the same address (200), `409
  wallet_already_registered` on a different one; never sets `accountId` (that's the funding
  watcher's job once a real account exists at the alias).
- `GET /me` — the SDK's poll/whoami endpoint; lazily refreshes wallet state when
  `onboardingState` is `wallet`/`funded`, returns cached `balanceTinybars`.
- `POST /activate` — requires `funded` + a real `accountId`; calls the mirror node fresh
  (not cached — this is a one-shot confirmation, not a poll) and checks `key !== null` before
  flipping to `active`/`active`. Idempotent if already active. `400 not_funded` /
  `400 not_activated` otherwise.
- `POST /revoke` — idempotent; sets `status`/`onboardingState` to `revoked`.

### Dashboard endpoints — `web/app/api/agents/` (session-authenticated, human lane only)
- `POST /api/agents` — mints an `Agent` + `AgentClaim`, returns the plaintext `claimCode`
  (the only time it's ever returned from this side either). Accepts an optional `scopes`
  array, filtered against `ALL_SCOPES`, defaulting to `DEFAULT_SCOPES`.
- `GET /api/agents` — lists the caller's agents.
- `GET /api/agents/:id` — one agent plus pending-claim **state**/`expiresAt`/redemption
  metadata (IP, client string) if still `waiting` — never the code.
- `POST /api/agents/:id/claim` — regenerates a claim for a still-`waiting` agent, deleting
  any unclaimed prior claim first.
- `DELETE /api/agents/:id` — revoke (idempotent).
- `GET /api/agents/:id/events` — SSE. No cross-request event bus; it re-polls the `Agent`
  document (and calls `refreshAgentWalletState`) every 3s, emits `event: state` only when the
  serialized snapshot changes, `event: expired` if a pending claim's `expiresAt` passes or
  the agent disappears, a `:\n\n` heartbeat every 15s, and terminates the stream (closing the
  controller) on `active`/`revoked`/`expired` or after a 15-minute lifetime cap. Cleans up its
  intervals on `request.signal`'s `abort`.

### Existing routes migrated to `resolvePrincipal`
- `withAuthCheck(request, scope?)` in `controllerUtils.ts` is reimplemented on top of
  `requirePrincipal` — every existing call site (`listings`, `shared-links`) kept working
  unchanged, with an optional second argument added to thread scopes through. `withErrorHandler`
  now recognizes `PrincipalError` first, before its message-substring map.
- Routes calling `getServerSession` directly were switched to `requirePrincipal(request,
  scope)`, per the §4.2 scope map:
  - `items` (`GET`/`:id`/`path` → `items:read`; `POST`/`PUT`/`DELETE` → `items:write`) —
    `rootFolder` now comes from the principal (populated for both lanes) instead of
    `session.user.rootFolder`, fixing the silent-empty-folder failure mode called out in the
    spec.
  - `listings` (`POST`/`PATCH`/`DELETE` → `listings:write` via `withAuthCheck`;
    `purchase-status` → `listings:read`; browse/tags/details stayed public)
  - `shared-links` (`GET`/`POST` → `sharedlinks:read`/`sharedlinks:write` via `withAuthCheck`;
    public link view and details stayed public/optional-auth)
  - `transactions` (`GET` on the list, `:id`, `commissions`, `earnings` → `transactions:read`;
    the `:id` `PATCH` uses an `x-user-id` header for an internal caller and was left alone —
    out of scope)
  - `affiliates` (`GET` → `affiliates:read`; `POST`/`PUT`/`PATCH`/`DELETE` →
    `affiliates:write`; `transactions` → `affiliates:read`; public `code/[code]` lookup
    untouched)
  - `ai/*` (`chat`, `discover`, `generate`, `process-purchased`, `stats` → `ai:invoke`)

**Explicitly not touched, per the spec:** `listings/[id]/purchase` and
`shared-links/[linkId]/purchase` remain session-only — they're `payments:spend`, which is
Stage 4 (x402) territory. `app/api/user/route.ts` wasn't in the scope map and stays
session-only (profile endpoint, not agent-facing in this stage).

## Design decisions worth flagging

- **SSE is poll-driven off the database, not an event bus.** The spec's "emit the SSE event"
  language at each endpoint step doesn't require route handlers to push anything — the SSE
  loop re-reads the `Agent` document every 3s regardless of what triggered the change, which
  also means it's correct across separate serverless instances (no in-memory pub/sub that
  would silently miss events across processes).
- **Mirror-node cache is a single module-level `Map`**, not two separate caches, keyed by
  identifier (`accountId` or `evmAddress`) with different TTLs (5s for funding-state,
  10s for `/me`'s balance) applied per call. Simpler than a job runner, no lifecycle problem
  in the Next.js runtime.
- **`PrincipalError` + `principalErrorToResponse()` is the one error contract** used by every
  migrated route (both the `withErrorHandler`-wrapped ones and the direct try/catch ones), so
  `{ error, code }` is uniform everywhere the SDK needs to branch on `code`.

## Verified

- `npx tsc --noEmit` — zero new type errors. The errors it reports (`AIChunk.ts`,
  `Affiliate.ts`, `Commission.ts`, `SharedLink.ts`, `Transaction.ts` `_id` typing, and a
  handful of missing `@/assets/*.svg` modules) are **pre-existing** and appear in files this
  stage never touches; confirmed by grepping the error output against the diff and against
  `git status`.
- `next build`'s lint step passed on all new/changed files (only 2 pre-existing, unrelated
  React-hooks warnings); the build itself currently fails at the type-check step on
  `app/models/AIChunk.ts`, which is the same pre-existing, unrelated model-typing bug noted
  above — not something introduced here.

## Live verification (2026-07-27) — real Hedera testnet + real MongoDB Atlas

The sandbox had no `.env`, so this was stood up from scratch rather than skipped:

- **MongoDB**: a temporary, time-limited (`--deleteAfter` 6h) Atlas database user
  (`stage1_test_user`) was created via `atlas dbusers create`, scoped to `readWrite` on a
  brand-new database (`cashdrive_stage1_test`) on the existing `cachedrive-dev` replica-set
  cluster — never the app's real database. Both the user and every collection in that test
  database were deleted at the end of the session (`atlas dbusers delete`,
  `db.<collection>.drop()` for each).
- **Hedera**: the already-configured `hcli` testnet operator (`0.0.6493119`, ~187 HBAR) funded
  two hollow accounts on real testnet.
- **App**: ran via `next dev` against a `.env.local` with the real Mongo URI and real Hedera
  operator/mirror config; GCS/KMS/Mistral/treasury were placeholder strings (config.ts only
  checks truthiness at boot, and none of the code paths exercised here call GCS, KMS, Mistral,
  or the app's own Hedera client — the agent lane's only Hedera dependency is the mirror node,
  a plain HTTP fetch). `.env.local` and all temp scripts were deleted afterward; nothing
  Stage-1-test-related is tracked in git.
- **Human lane**: since NextAuth signup itself calls `createHederaAccount()` → real GCP KMS
  (unrelated to this stage and unavailable here), a test `User`+root `Item` were seeded
  directly via Mongoose, and a session was obtained by minting a real NextAuth JWT with
  `next-auth/jwt`'s `encode()` under the app's own `NEXTAUTH_SECRET` — i.e. a real, validly
  signed session cookie, just without going through the KMS-dependent signup screen.

**Results — all matched the spec exactly:**

- `POST /api/agents` (session) → minted agent, `status: pending`, `onboardingState: waiting`,
  default scopes correctly exclude `payments:spend`, one-time `claimCode` returned.
- `POST /api/v1/agent/claim` → redeemed, returned `apiKey` matching
  `/^cdk_test_[0-9A-Za-z]{43}$/`, `onboardingState → claimed`. Replaying the **same** code and
  submitting a malformed one both returned the identical `400 claim_invalid`.
- `GET /api/v1/agent/me` allowed for a `claimed` (non-active) agent; `GET /api/items` on the
  same key returned `403 agent_not_active` — onboarding-path carve-out confirmed both ways.
  An unknown/bogus Bearer token → `401 unauthenticated`.
- `POST /api/v1/agent/wallet`: a `privateKey` field at the top level *and* nested inside a
  sub-object both → `400 private_key_rejected`. Valid EVM address → registered,
  `onboardingState → wallet`, `accountId` stayed `null`. Re-registering the same address → the
  same `200` (idempotent).
- Funded the registered alias via `hcli hbar transfer -t <evmAddress> -a 5`. Confirmed on the
  real mirror node: **hollow account** at `0.0.9793606`, `"key": null`. `GET /me` (lazy,
  5s-cached check) picked this up on its own and advanced `onboardingState → funded`, storing
  the real `accountId` and a correct `balanceTinybars` — no code outside the spec'd lazy check
  was needed.
- `POST /api/v1/agent/activate` before the account was complete → `400 not_activated`.
  Generated a second, raw ECDSA keypair directly with `@hashgraph/sdk` (the private key never
  touched the server — this is exactly what the SDK does), funded its alias
  (hollow account `0.0.9793616`, `key: null` confirmed), then submitted the account's own
  **self-paid** `TransferTransaction` signed with that same key. Mirror node then showed a
  non-null `key`. `POST /activate` → `200`, `status`/`onboardingState → active`; calling it
  again was idempotent. The now-active agent successfully called `GET /api/items` and got back
  its **owner's** real root folder (confirms B3 — the agent acts on behalf of its owner).
- Scope enforcement: trimmed the active agent's `scopes` to `["ai:invoke"]` directly in Mongo
  and confirmed `GET /api/items` → `403 insufficient_scope` with
  `{"requiredScope":"items:read"}`, while `GET /api/ai/stats` (in-scope) → `200`.
- `POST /api/v1/agent/revoke` → `200 {"revoked":true}`; calling it again → the same `200`
  (idempotent). After revocation, **every other** route (including `/me`) → `401 key_revoked`.
- `GET /api/agents/:id/events` (SSE): connected mid-flow and immediately received a correctly
  shaped `event: state` frame reflecting live `funded` data (address, real accountId, real
  balance) — confirms the poll-on-connect + diff-on-change design.
- Dashboard: `GET /api/agents` listed both agents with correct state; `POST
  /api/agents/:id/claim` on an already-claimed agent → `400 already_claimed`; `DELETE
  /api/agents/:id` → idempotent revoke, mirroring the Bearer-lane behavior.
- **Human-lane regression**: with the same real session JWT, `GET /api/items`, `GET
  /api/listings` (public), and `GET /api/transactions` all returned `200` exactly as before
  Stage 1 — the migration to `resolvePrincipal` didn't change human-lane behavior.
- **DB hygiene**: `db.agentclaims.getIndexes()` showed the unique `codeHash_1` index and the
  `expiresAt_1` TTL index (`expireAfterSeconds: 3600`) exactly as specced; `db.agents.getIndexes()`
  showed `owner_1`, `status_1`, `keyPrefix_1`, `evmAddress_1`, `onboardingState_1`, and the
  compound `owner_1_createdAt_-1`. Every stored document held only `codeHash`/`keyHash`/
  `keyPrefix` — never a plaintext code or key.
- **The `privateKey` schema guard, tested directly** (not just through the API): constructing
  `new Agent({ ...valid fields, privateKey: 'x' })` confirmed Mongoose strict mode silently
  drops the field (`agent.get('privateKey') === undefined`, as intended). Forcing a write past
  strict mode with `.set('privateKey', 'x', { strict: false })` confirmed the `pre('validate')`
  hook still throws `"privateKey must never be stored on Agent"` — the second layer works
  independently of the first.

**Not covered by this pass:** no automated unit/integration test suite exists in this repo yet
(only Playwright e2e specs under `web/tests/e2e`; no Jest/Vitest configured) — the §8.1 test
list is exercised above via a real, live manual run rather than codified as an automated
suite. A browser-driven regression of the human lane (sign-in UI, file upload, purchase flow)
also wasn't done — only the API layer was exercised via curl with a minted session JWT.

## Out of scope (unchanged)

No rate limiting, no spend limits, no MCP, no KMS for agent keys, no treasury auto-funding,
no mainnet, no UI work — all per the stage's locked decisions.
