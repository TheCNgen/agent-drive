# Stage 4 — x402 Payments — Summary

Implements end-to-end x402 purchasing described in the Stage 4 spec: an activated agent buys
a marketplace listing or a monetized shared link over Hedera testnet's real Blocky402
facilitator, paying gas via the facilitator's fee-payer model rather than its own balance.
Work spans both packages: `web/` (resource server, migrated off `@hashgraph/sdk`) and `sdk/`
(x402 client, payment journal, CLI).

## What was built

### Web: migration off `@hashgraph/sdk`
- `web/package.json`: `@hashgraph/sdk` removed, `@hiero-ledger/sdk` added pinned exactly to
  `2.85.0` (no caret) — the version `@x402/hedera@2.19.0` requires. `pnpm ls` confirms exactly
  one `@hiero-ledger/sdk` and zero `@hashgraph/sdk` across the whole tree.
- Every import site updated (`app/lib/hedera.ts`, both legacy purchase routes, `actions/actions.ts`,
  `scripts/{bootstrap-hedera,create-treasury,test-kms}.ts`) — a straight import-path swap; the
  Hiero SDK is API-compatible with the Hashgraph SDK it's the successor to.

### Web: shared purchase logic
- **`web/app/lib/backend/fulfillPurchase.ts`** — the post-payment side effects extracted
  verbatim from the two legacy session-signed purchase routes: writes the main `Transaction`
  (idempotent on `transactionId`'s unique index — a duplicate-key error looks up and returns
  the existing row instead of throwing or re-running any side effect), copies the item into
  `marketplace` and queues AI processing (listings only), adds the buyer to `paidUsers`
  (shared links only, nothing copied — §1.3's asymmetry), writes the affiliate/seller ledger
  rows, and submits the HCS record. Both legacy routes were refactored to call it instead of
  duplicating the logic (~120 lines each removed); their validation/transfer-signing code
  above that point is untouched, per "invest nothing" — only the part where duplicated fee
  logic could drift was touched, and it was made to stop duplicating.
- **Two real, previously-undetected defects fixed in this extraction**, both silently
  breaking every affiliate commission ever created by *any* purchase route, legacy included:
  1. `Commission.create()` was called with `commissionAmountTinybars` — a field that doesn't
     exist on the `Commission` schema (`amountTinybars` does — the exact defect Stage 3
     flagged in its summary, §"A second, undocumented defect"). Mongoose strict mode
     silently dropped it, so the schema's `required: true` `amountTinybars` always failed
     validation first. Fixed to send `amountTinybars`.
  2. Fixing (1) exposed a second bug behind it: the same call passed `status: 'completed'`,
     which isn't in `Commission`'s enum (`pending | paid | failed`) — always would have
     thrown too, just never got the chance to before. Fixed to `'pending'`, which is also
     the semantically correct value: a commission is a ledger entry awaiting off-chain
     payout, not something actually paid.
  3. `Transaction.paymentFlow` was written by every purchase route (`'direct'`/`'admin'`)
     but absent from the `Transaction` schema — silently dropped by strict mode, so
     `GET /api/transactions?paymentFlow=admin` has always matched zero documents. Added the
     field (`'direct' | 'x402' | 'admin'`) to the schema, additive and backward-compatible.
  4. `SharedLink`'s schema-level `pre(['find','findOne'])` hook re-populates `owner` with a
     fixed field list (`'name email wallet'`) that runs *after* any caller's own
     `.populate('owner', ...)` call, silently overriding it. The purchase flow's explicit
     `.populate('owner', '... accountId')` was therefore always losing `accountId`, making
     every shared-link purchase (legacy and new) fail with "Seller Hedera account not found"
     — 100% reproducible, caught by live-testing the new route against a real seller.
     Fixed by adding `accountId` to the hook's own select list.
- **`web/app/lib/backend/purchaseQuote.ts`** — phase-1/phase-2 validation (existence,
  `active`/not-expired, buyer ≠ seller, not already purchased/paid, seller has an
  `accountId`) and fee-breakdown + affiliate-resolution, one function each for listings and
  shared links, sharing a private `percentOfTinybars` mirroring the SDK's (separate package,
  same integer-floor formula, cannot literally share code). Affiliate resolution checks every
  condition from §1.2.3 explicitly and returns a structured `{applied, code, rate}` summary
  regardless of outcome — this is what phase 1's `extra.agentdrive.affiliate` is built from,
  fixing the silent-failure defect at the SDK/agent boundary without touching backend
  attribution behavior itself.

### Web: facilitator client and x402 routes
- **`web/app/lib/backend/x402Facilitator.ts`** — `getSupported()` (5 min cache, asserts
  `hedera:testnet` is still advertised on every real fetch and logs the current fee payer),
  `getFeePayer()`, `verify()` (10s timeout, retried up to 3× on genuine network/timeout
  failure only — a facilitator HTTP error response is not retried), `settle()` (30s timeout,
  **never retried, no exceptions**). `FacilitatorError` distinguishes "unreachable" (no
  `.status`) from "responded with an error" (`.status` set), which the route handler uses to
  pick `503 facilitator_unavailable` vs. a `402` quote-retry.
- **`web/app/lib/backend/x402PurchaseHandler.ts`** — the shared two-phase protocol handler
  both purchase routes call: phase 1 (no `X-PAYMENT`) re-quotes and returns `402` with
  `PaymentRequirements`; phase 2 re-validates everything from scratch (the listing may have
  been deactivated since the quote), asserts the payload's `accepted` block matches what was
  quoted, calls `verify()` then `settle()`, and on success runs `fulfillPurchase()` and
  returns `201` with `X-PAYMENT-RESPONSE` (and the settlement echoed in the JSON body too,
  since the SDK needs it and a header-only channel would mean re-implementing header parsing
  for no reason).
- **`web/app/api/v1/agent/purchase/listing/[id]/route.ts`** and
  **`.../link/[linkId]/route.ts`** — thin route files, Bearer + `payments:spend`, delegating
  to the shared handler with a listing- or shared-link-specific quote builder.
- Built on **`@x402/core`**'s real wire types (`PaymentRequirements`, `PaymentPayload`,
  `VerifyResponse`, `SettleResponse`, `SupportedResponse`) and its `/http` subpath's
  `decodePaymentSignatureHeader`/`encodePaymentResponseHeader` for the `X-PAYMENT`/
  `X-PAYMENT-RESPONSE` headers — not the full `x402HTTPResourceServer` class, which does
  paywall HTML, multi-scheme extension hooks, and dynamic `payTo`/price resolution none of
  which this stage needs; hand-rolling the two-phase handler against the wire types directly
  matches the spec's exact JSON shape (`extra.agentdrive`) more simply than bending that class
  to fit.

### SDK: x402 client
- **`sdk/src/agent/paymentSigner.ts`** (Node-only) — `LocalKeySigner`, built on
  `createClientHederaSigner`/`ExactHederaScheme` from `@x402/hedera/exact/client`. Reads the
  profile's private key fresh from disk inside `signPaymentPayload()` on every call and never
  stores it as an instance field — only the `accountId`/`evmAddress` are retained between
  calls, per §4.2's exact instruction.
- **`sdk/src/agent/paymentJournal.ts`** — `~/.agent-drive/pending/<quoteId>.json`, atomic
  writes (temp file + `fsync` + `rename`, mirroring `configStore.ts`'s existing pattern),
  written before phase 2 and deleted only after a confirmed `201`.
- **`sdk/src/resources/payments.ts`** — `PaymentsResource` (`quote`/`balance`/
  `recoverPending`) plus the standalone `executePurchase()` orchestration
  (quote → pre-flight `maxPriceTinybars`/balance checks → `onQuote` → re-quote-once-if-expired
  → sign → journal → submit → clear journal) shared by `listings.purchase()` and
  `sharedLinks.purchase()`. **Isomorphic at the module level** — its only Node-only
  dependencies (`paymentSigner.js`, `paymentJournal.js`, `configStore.js`) are loaded via
  dynamic `import()` gated on `isNodeRuntime()`, the same pattern Stage 2 established for
  on-disk profile reads. Verified by inspecting the built output: `dist/index.js`'s entire
  static import closure (`chunk-VZ6R7XDN.js`, `chunk-Q6VG4BDG.js`) contains zero references to
  `@hiero-ledger/sdk`, `@x402/*`, or any `node:` builtin — those only appear as separately
  chunked dynamic imports (`paymentSigner-*.js`, `paymentJournal-*.js`, `configStore-*.js`).
  `PaymentsResource`/`LocalKeySigner`/payment error classes/types are exported only from
  `agent-drive/agent`, never `agent-drive` (root) — satisfied at the export-surface level, since
  the underlying `AgentDrive` class and its `.payments` property are necessarily shared code
  (re-exported identically by both entries), exactly like `client.agent.me()`'s lazy
  config-file read already was.
- **Retry discipline (§4.4)**: phase 2 (`X-PAYMENT` submission) passes `retry: false`
  explicitly and is a `POST`, which `core/http.ts`'s method-based policy already excludes from
  retry. Added a second, independent layer: `core/retry.ts`'s new `isRetryablePath()` blocks
  any path containing `/purchase` regardless of method or the `retry` option, so a future
  loosening of the method policy can't silently re-enable retrying a purchase submission.
  Phase 1 (the quote) is a `POST` too, so it structurally cannot use `HttpClient`'s own
  retry — `resources/payments.ts` runs its own manual outer retry around phase-1 calls
  specifically (network/5xx failures only; a `402` quote response is the success path, not a
  failure), which the `/purchase` deny-list above doesn't affect since it isn't going through
  `HttpClient`'s internal retry loop at all.
- **New errors** (`sdk/src/errors.ts`, all exported only from `agent-drive/agent`):
  `AgentNotActivatedError`, `InsufficientBalanceError`, `PriceChangedError`,
  `FacilitatorUnavailableError`, `PaymentVerificationError`, `SettlementFailedError` — the
  last three map 1:1 to the backend's `facilitator_unavailable`/`payment_verification_failed`/
  `settlement_failed` `code`s, which the backend was extended to emit explicitly for exactly
  this purpose.
- **`listings.purchase()`** and **`sharedLinks.purchase()`/`purchaseAndClaim()`** wired onto
  the existing resource classes (which gained `logger`/`profileName` constructor params for
  this). `purchaseAndClaim()` catches `ConflictError` from the purchase leg specifically (the
  backend's phase-1 "already paid" check now returns `409 conflict`, not a bare `400`) and
  skips straight to `claim()`, per §5.5.
- **CLI**: `agent-drive payments recover` (`sdk/src/cli/commands/payments.ts`), exit `1` if any
  entry still `needs_investigation` after recovery, `0` otherwise. `whoami` reads the journal
  and warns (with the exact recovery command) whenever it's non-empty.

## Live verification (2026-07-27) — real Hedera testnet, real Blocky402 facilitator, real MongoDB Atlas

Same throwaway-infrastructure discipline as Stages 1–3, all torn down afterward:

- **MongoDB**: temporary Atlas user `stage4_test_user` (6h auto-`deleteAfter` safety net),
  `readWrite` on a fresh `agentdrive_stage4_test` database on the existing `cachedrive-dev`
  cluster. Seeded directly via `tsx` scripts (bypassing onboarding, which Stage 2 already
  verified end-to-end): a seller `User`, an agent-owner `User`, an affiliate `User`, several
  `Item`/`Listing`/`SharedLink`/`Affiliate` documents, and an `Agent` with every scope
  (including `payments:spend`, off by default on real agents) and a real, working Bearer key.
- **Hedera**: the same long-lived, already-funded testnet operator used by Stages 1–3
  (`0.0.6493119`, found via its key file in `~/credentials/`, confirmed by mirror-node lookup
  before use) funded a freshly SDK-generated agent wallet with 10 HBAR. The account showed as
  hollow (`key: null`) on the real mirror node before activation; a real self-paid net-zero
  `TransferTransaction` (same construction as Stage 2's `activateAccount()`) completed it,
  confirmed non-null key on the mirror node afterward. The platform treasury
  (`0.0.9742456`, `~/credentials/.hedera_platform_fee_*`) was used as `PLATFORM_TREASURY_ACCOUNT_ID`.
- **App**: `web/` via `next dev` against a throwaway `.env.local` (real Mongo URI, fresh
  `NEXTAUTH_SECRET`, real Hedera operator/treasury/mirror node, real
  `X402_FACILITATOR_URL` pointed at the actual `https://api.testnet.blocky402.com`; GCS/KMS/
  Mistral placeholder strings — no code path this stage touches calls them, confirmed
  live: `processFileForAI`'s GCS-download failure on a placeholder URL is caught inside
  `fulfillPurchase`'s existing try/catch and does not fail the purchase). `.env.local` and all
  scratch seed scripts deleted afterward.
- **SDK**: built (`npm run build`) and exercised via `dist/agent.js` directly (no mocks) with
  `AGENTDRIVE_CONFIG_DIR` pointed at a hand-written profile matching the activated agent above.

**Results:**

- **`GET https://api.testnet.blocky402.com/supported`** confirmed live: advertises
  `hedera:testnet`/`exact`/v2 with `extra.feePayer: "0.0.7162784"` — matches the spec's
  example exactly. `x402Facilitator.getSupported()`'s startup assertion passed against the
  real response.
- **`client.payments.quote({type:"listing", id})`** returned a real `402`-derived quote:
  `priceTinybars: "100000000"`, `breakdown: {platformFeeTinybars:"5000000",
  affiliateFeeTinybars:"0", sellerAmountTinybars:"95000000"}`, `feePayer: "0.0.7162784"`,
  `network: "hedera:testnet"`, `payTo: "0.0.9742456"`.
- **`client.listings.purchase(listingId, {onQuote})`** — full round trip on real testnet:
  `onQuote` fired before signing, `LocalKeySigner` built and submitted a real Hedera
  `TransferTransaction`, Blocky402 verified and settled it, backend returned `201` with a real
  transaction id (`0.0.7162784@1785185648.741749201` — the *facilitator's* account as fee
  payer, confirming the fee-payer model), `fulfillPurchase` ran (`paymentFlow: "x402"`,
  `copiedItem` present in `marketplace`). **Confirmed on the real Hedera mirror node** by
  fetching the settled transaction directly: `0.0.9795985` (the agent) `-100000000` tinybars,
  `0.0.9742456` (treasury) `+100000000` tinybars, `0.0.7162784` (Blocky402's fee payer)
  `-290527` tinybars network fee — the agent's own balance moved **only** the payment amount,
  never touched by gas, exactly as X1–X5 specify.
- **`client.sharedLinks.purchaseAndClaim(linkId)`** — real settlement (`transaction:
  "0.0.7162784@1785185809.487731260"`), `copiedItem: null` on the purchase leg (§1.3's
  asymmetry confirmed live), then a real `claim()` call copied the item into the buyer's
  `shared` folder.
- **Idempotency (DoD item)**: called `fulfillPurchase()` directly, twice, with the identical
  `transactionId`. First call: `idempotent: false`, created the `Transaction` and copied the
  item. Second call: `idempotent: true`, returned the **same** `Transaction._id`.
  `Transaction.countDocuments({transactionId})` stayed at `1` — the unique-index duplicate-key
  path works exactly as specced, not merely typed.
- **Crash-recovery (DoD item, "green")**: journaled two fabricated pending entries — one
  pointing at the listing purchase that had genuinely already landed, one at a nonexistent
  link. `client.payments.recoverPending()` reported the first `recovered` (and deleted its
  journal file) and the second `needs_investigation` (left in place, no re-payment attempted).
  `agent-drive whoami` correctly warned about the pending entry beforehand; `agent-drive
  payments recover` reported it and exited `1`; after manual cleanup, both `whoami` and
  `payments recover` reported clean state and exit `0`.
- **`InsufficientBalanceError`**: purchasing a listing priced at 100 HBAR against the agent's
  real ~8.5 HBAR balance threw client-side, before any facilitator contact, before any
  journal entry was written (confirmed via `payments recover` immediately after — nothing
  pending).
- **`InsufficientScopeError`**: removed `payments:spend` from the live agent's scopes in
  Mongo; `payments.quote()` threw with `.message === "This agent lacks the \`payments:spend\`
  scope."` and `.requiredScope === "payments:spend"`. Scope restored afterward.
- **`AgentNotActivatedError`**: a profile with `agent.onboardingState: "funded"` threw the
  exact spec'd message ("...Run \`agent-drive onboard --resume\`.") before any network call.
- **Affiliate transparency (§4.3, the stage's most-emphasized fix), both directions live**:
  - Valid code: quote's `affiliate` was `{applied: true, code, rate: 10}`; the purchase
    produced a **real** `Commission` document for the first time in this system's history
    (`amountTinybars: "2000000"`, `status: "pending"`) plus real `paymentFlow: "admin"`
    commission/seller `Transaction` rows — proving both defects fixed in `fulfillPurchase`
    above.
  - Invalid/unmatched code: the purchase still succeeded, `affiliateApplied: false`, and
    exactly one `logger.warn` fired naming the rejected code — the silent failure is now
    visible without any change to backend attribution behavior.
- **Build/type verification**: `web`'s `tsc --noEmit` clean except the five pre-existing,
  unrelated `_id`/`Document` typing errors noted in every prior stage's summary (`AIChunk`,
  `Affiliate`, `Commission`, `SharedLink`, `Transaction` models); `next build`'s lint step is
  clean (only the same two pre-existing React-hooks warnings from Stage 1), and the build
  fails at the same pre-existing `AIChunk.ts` type-check blocker noted in every prior stage —
  not a regression. `sdk`'s `tsc --noEmit`, `npm run build`, `npm run smoke` (ESM+CJS), and
  `npm run lint:pack` all pass; `attw`'s `node10` resolution failures for `agent-drive/agent`
  and `agent-drive/node` are the same pre-existing, expected pattern Stage 3 already noted for
  subpath exports (`agent-drive/node`) — not new. No SDK unit-test suite exists yet (same as
  every prior stage); this stage's own §6 explicitly calls for direct, live verification
  instead, which is what the above is.

All temporary infrastructure was torn down afterward: dev server stopped, `.env.local` and
scratch seed scripts deleted, all Mongo collections in `agentdrive_stage4_test` dropped, and
the Atlas database user deleted (in addition to its 6h auto-expiry safety net). The real
testnet transactions themselves are of course immutable and left in place, as in every prior
stage.

## Deviations / judgment calls worth flagging

- **Two real bugs fixed inside `fulfillPurchase`** (Commission field name + status enum) that
  predate this stage and affected the legacy routes identically — not something the spec
  explicitly asked for, but unavoidable once the shared extraction actually exercised the
  code path for the first time; leaving them in would have meant the new x402 path inherited
  a "commission creation always throws" bug on day one. See §"Web: shared purchase logic"
  above for the exact history (Stage 3 flagged the first one as a known, undocumented defect).
- **`SharedLink`'s populate-hook bug fixed** (owner `accountId` silently dropped) — found by
  live-testing the new shared-link route (100% reproducible, not a flake), fixed with a
  single-field additive change to the schema's existing hook.
- **`Transaction.paymentFlow` added to the schema** — previously accepted by every
  `Transaction.create()` call across the codebase but silently dropped by Mongoose strict
  mode, making `paymentFlow`-filtered queries permanently empty. Purely additive.
- **Settlement result echoed in the `201` JSON body, not only the `X-PAYMENT-RESPONSE`
  header** — the spec's protocol description only mandates the header, but the SDK needs the
  settlement `transactionId` for its own return value and journal-clearing logic; parsing it
  back out of a header when it's already in hand server-side added nothing but a second code
  path for the same data.
- **Idempotency's `copiedItem` recovery is best-effort** (`null` on a duplicate-key hit) —
  the `Item` model has no lineage field back to its purchase source, so a duplicate-key
  recovery can't reliably relocate the already-copied item. Documented directly in
  `fulfillPurchase`'s JSDoc rather than silently guessed at.

## Out of scope (unchanged)

HTS token payments, running our own facilitator, spend limits (the `PaymentSigner` seam and
`maxPriceTinybars` are the attachment points, per spec), mainnet, migrating the human lane to
x402 — all per the stage's locked decisions. The legacy purchase routes remain
session-only and now call the same shared `fulfillPurchase`, but were not otherwise touched.
