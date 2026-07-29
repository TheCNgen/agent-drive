# Stage 2 — SDK: Onboarding & Client Core — Summary

Implements the `cash-drive` TypeScript SDK + CLI described in the Stage 2 spec: claim
redemption, non-custodial ECDSA wallet generation, backend wallet registration, funding
wait, hollow-account self-activation, and persistence to `~/.cash-drive/config.json` —
end to end via `cash-drive onboard --claim <hex>`. All work is in the new `sdk/` package,
a sibling of `web/` at the repo root (not part of `web`'s pnpm workspace; a standalone npm
package per the spec's own `package.json`/scripts).

## What was built

### Package shape
- `package.json`, `tsconfig.json` (strict, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`), `tsup.config.ts` (three entries: `index`, `agent`, `cli`;
  dual ESM/CJS, `node20` target), `vitest.config.ts`, `.npmrc` (`engine-strict=true`),
  `.env.example`, `README.md` — all exactly as specced in §5.
- `@hiero-ledger/sdk` pinned to `2.85.0` with no caret, as the sole runtime dependency.
  `npm ls @hiero-ledger/sdk @hashgraph/sdk` resolves to exactly one
  `@hiero-ledger/sdk@2.85.0` and no `@hashgraph/sdk` — verified after install and again
  after the final build.
- Two public entry points only: `cash-drive` (`src/index.ts`) and `cash-drive/agent`
  (`src/agent.ts`). No `/mcp` entry anywhere in `package.json#exports`.

### Isomorphic core (`src/core`, `src/auth`, `src/client.ts`, `src/config.ts`)
- `core/http.ts` — `HttpClient` wrapping an injectable `fetch`: URL joining that
  normalizes slashes on both sides, `Accept`/`Content-Type` handling, `AbortController`
  timeouts (`TimeoutError`, never retried), and retry restricted to GET/HEAD (3 attempts,
  exponential backoff with full jitter, honoring `Retry-After`) via `core/retry.ts`. A
  non-JSON error body (Next.js crash page) falls back to `res.statusText` with the first
  500 chars of the raw text on `error.body`, instead of throwing on `JSON.parse`.
- `errors.ts` — `CashDriveError` and every subclass in the spec's §7 table, plus
  `errorFromApiResponse()`, which branches on the backend's `code` field first (never on
  `error`) and only falls back to `status` for codes it doesn't recognize — so
  backend-specific codes like `wallet_already_registered` or `not_activated` still surface
  as a typed `CashDriveError` with that exact code intact for callers to switch on.
- `auth/claim.ts` — `redeemClaim()`: validates the 32-hex-char shape client-side before any
  network call, strips pasted whitespace and a `--claim=`/`claim=` artefact, and **never
  retries**, on any status or network error — it does not go through `HttpClient` at all,
  by design, so there is no retry path to accidentally enable.
- `auth/apiKey.ts` — `ApiKeyAuth.prepare()` sets the Bearer header and, only when
  `process.versions.node` is present, a `User-Agent`; omitted entirely in a browser.
- `config.ts` — isomorphic credential resolution (`options` → env → on-disk profile, each
  field independently, first hit wins). The on-disk tier is reached via a **dynamic**
  `import("./agent/configStore.js")` gated behind a Node-runtime check, which tsup's ESM
  output actually splits into its own chunk (`configStore-*.js`) — so the root `index.js`
  bundle doesn't eagerly pull in `node:fs`. `CashDrive`'s constructor does zero I/O; the
  `HttpClient` (and therefore any file/env read) is built lazily and cached on first
  `client.agent.*` call, confirmed by the no-network/no-config-file smoke tests.

### Node-only agent module (`src/agent/*`, entry `src/agent.ts`)
- `paths.ts` — `CASHDRIVE_CONFIG_DIR` → `$XDG_CONFIG_HOME/cash-drive` → `~/.cash-drive`,
  one path shape on every platform, per spec.
- `configStore.ts` — atomic writes only (temp file in the same directory → `fsync` →
  `rename`), `mkdir` at `0700`, file written at `0600`, a post-write `stat` that warns
  (never throws) if the mode didn't stick. A present-but-unparseable file throws
  `ConfigCorruptError` naming the path and is **never deleted or overwritten**. An unknown
  `version` throws with an upgrade message. `patchProfile` merges the `agent`/`wallet`
  sub-objects one level deep rather than replacing them wholesale.
- `wallet.ts` — `generateWallet()` uses `PrivateKey.generateECDSA()` specifically (never
  `.generate()`/`.generateED25519()`, which have no EVM address), normalizes the address to
  lowercase/`0x`-prefixed once and for all. `loadWallet()` re-derives public
  key/address from the stored private key rather than trusting whatever was last written,
  so a hand-edited config can't silently drift.
- `activate.ts` — `activateAccount()` builds the net-zero self-transfer exactly as specced:
  the hollow account as both fee payer (`client.setOperator`) and sole signer, closes the
  `Client` in a `finally`, and on a non-`SUCCESS` receipt throws `ActivationError` with the
  account id/transaction id and the exact "run `--resume`" message — no retry loop.
- `onboard.ts` — the orchestrator. Deliberately **state-driven, not resume-flag-driven**:
  every step is gated on what's actually persisted in the profile (`!profile.wallet` →
  generate; `wallet.accountId === null` → register + poll; `!activated` → activate), so
  `--resume` is just "skip claim redemption, load the profile, and let the same gates decide
  what's left" rather than a parallel code path that could drift from the fresh-onboarding
  logic. Each step persists before the next one touches the result (claim → partial profile
  before wallet gen; wallet keys → disk before registration; `accountId` → disk before
  activation), matching the spec's crash-safety requirement. A funding timeout returns the
  profile normally (not an error); `--no-wait` returns right after registration.

### CLI (`src/cli.ts`, `src/cli/*`)
- Hand-rolled ~80-line arg parser (`--flag value`, `--flag=value`, bare boolean `--flag`) —
  no `commander`/`yargs`.
- `onboard`, `whoami`, `logout`, `version`/`help`, all supporting `--json` as one JSON
  object per line per state transition (JSONL to stdout), with human-readable progress on
  stderr in the default mode (funding instructions included, per spec, so `--json`'s stdout
  stays clean).
- `logout` fetches the live balance via `client.agent.me()` before deleting a profile;
  refuses without `--force` if the balance is nonzero **or unreachable** (fail closed, not
  open) and requires `--yes` when stdout isn't a TTY.
- Exit codes exactly per §8.3 (0/1/2/3/4/5/6), driven by `CashDriveError.code` →
  `exitCodeForError()`.
- `mock/server.ts` — a dependency-free `node:http` stand-in for the backend's agent lane
  (`claim`/`wallet`/`me`/`activate`/`revoke`), useful for local SDK development without the
  full Next.js app; it genuinely polls the public Hedera testnet mirror node for
  funding/activation state, so `hcli` funding against the address it prints drives a real
  end-to-end run. **Built but not exercised in this pass** — live verification below ran
  against the real `web/` backend and real Hedera testnet instead, which is the more
  meaningful test.

## A bug the live run caught (and fixed)

`redactObject()`'s key list includes `code` — correct, per spec, for the literal claim-code
field agents might paste into a logged request body. But the CLI's own JSON error envelope
(`{ok, error, code}`) also uses `code` for the `CashDriveError` discriminant (`"claim_invalid"`,
etc.) that §4's contract explicitly says callers must branch on. Running `redactObject()` over
that envelope truncated the discriminant itself — a real, live-caught instance of `cdk_test_IwY…`-style
redaction firing on the wrong field. Fixed by having `reportError()` construct that specific,
fully-controlled envelope directly rather than passing it through the generic redactor;
`writeJsonLine()` (used for `OnboardState` events and the final profile, neither of which has
a `code` key) is unaffected. This wouldn't have surfaced without an actual failing claim
redemption round-tripping through the real backend.

## Live verification (2026-07-27) — real Hedera testnet + real MongoDB Atlas + real backend

Stood up from scratch, same pattern as Stage 1:

- **MongoDB**: a temporary, 6-hour-lived Atlas database user (`stage2_test_user`) scoped to
  `readWrite` on a fresh `cashdrive_stage2_test` database on the existing `cachedrive-dev`
  cluster. Both the user and every collection were deleted at the end of the session.
- **Hedera**: the already-configured `hcli` testnet operator (`0.0.9706416`, 50 HBAR) funded
  the SDK-generated wallet directly with `hcli hbar transfer`.
- **App**: `web/` run via `next dev` against a throwaway `.env.local` (real Mongo URI, a
  fresh `NEXTAUTH_SECRET`; Hedera operator/treasury/GCS/KMS/Mistral all placeholder strings —
  `config.ts` only checks truthiness at boot, and the agent lane's only Hedera dependency is
  the mirror node, a plain fetch, exactly as Stage 1 found). A test `User`+root `Item` were
  seeded directly via `mongosh`, and a real NextAuth session cookie was minted with
  `next-auth/jwt`'s `encode()` under the app's own `NEXTAUTH_SECRET` — same technique Stage 1
  used to get a session without the KMS-dependent signup flow. `.env.local` and all scratch
  scripts were deleted afterward.

**Results:**

- `POST /api/agents` (session) minted an agent + one-time 32-hex `claimCode`.
- `npm pack` → `npx --package=<tarball> cash-drive onboard --claim <code> --base-url
  http://localhost:3000 --no-wait --json` against the **real** running app: redeemed the
  claim, generated an ECDSA wallet, registered it, and stopped after registration exactly as
  `--no-wait` specifies. `~/.cash-drive/config.json` (via `CASHDRIVE_CONFIG_DIR`) was written
  with mode `0600`, containing the full profile with a real, unredacted private key on disk
  (as required — only the CLI's own console output redacts it).
- Confirmed the config **directory** is created at `0700` when the CLI creates it fresh
  (verified separately with a directory that didn't already exist; the very first manual run
  used a pre-existing `0755` scratch dir, which correctly demonstrated that `mkdir` only sets
  the mode on creation, not on an already-existing directory — expected Node behavior, not an
  SDK bug).
- **Before funding**, the real mirror node returned 404 for the generated EVM alias (no
  account exists yet — purely local until funded, per §1.1).
- `hcli hbar transfer -t <evmAddress> -a 5` (from the real funded operator) succeeded on
  real testnet.
- **After funding**, the mirror node showed a real hollow account (`0.0.9794480`,
  `"key": null`, balance `500000000` tinybars) — confirmed before running `--resume`.
- `cash-drive onboard --resume --json` (no `--no-wait` this time) picked up exactly where
  the previous process left off: polled `/me`, observed `funded`, self-paid the net-zero
  activation transfer on real testnet, confirmed via `POST /activate`, and reached `active`.
  Full state sequence observed: `wallet_registered → funded → activating → active`.
- **After activation**, the same mirror-node account now returns a real
  `"key": {"_type":"ECDSA_SECP256K1","key":"03f7fa11c62b…"}` — the before/after pair
  demonstrating the hollow-account model end to end on real Hedera:
  ```
  before: {"account":"0.0.9794480","balance":{"balance":500000000},"key":null}
  after:  {"key":{"_type":"ECDSA_SECP256K1","key":"03f7fa11c62bf55d1623f4279e0a1986cd6403a61a97d78c65404f5e75505eba92"}}
  ```
- A **second, independent Node process** running `new CashDrive()` with **no arguments**
  (only `CASHDRIVE_CONFIG_DIR` pointing at the same profile directory) called `agent.me()`
  successfully and got back the real `active` agent — confirming config pickup across
  process boundaries with zero constructor-time I/O.
- `cash-drive whoami` reported `Status active`, the real `accountId`, and the real balance
  in both tinybars and ℏ.
- `CASHDRIVE_API_KEY=<bogus>` correctly **overrode** the on-disk (valid) key and produced a
  `401 unauthenticated` from the real backend — confirming the env tier takes precedence.
- Replaying the same claim code against the real `/api/v1/agent/claim` → `400 claim_invalid`
  both directly via `curl` and through `cash-drive onboard --claim <same code>` (exit code
  `4`, JSON error envelope with the correctly-intact `"code":"claim_invalid"` after the fix
  above).
- A malformed `--claim` value failed client-side pre-flight with no network call and exit
  code `2`; running `onboard` with neither `--claim` nor `--resume` also exited `2`;
  `whoami` with no config/credentials exited `3` with the exact §7.4 message.
- `cash-drive logout --yes` on the now-funded, active profile **refused** to delete it
  (balance `4.99852834 ℏ`, no `--force`), left `config.json` in place, and exited `0` — the
  "must not destroy a funded wallet by guessing at a command" requirement, confirmed live.
- `mongosh` against the real database: `db.agents.findOne({}, {privateKey:1, publicKey:1,
  evmAddress:1, accountId:1, status:1})` returned a document with **no `privateKey` field
  at all** — `status: 'active'`, the real `accountId`, the real `evmAddress`, and
  `keyPrefix: 'cdk_test_IwY'` matching the SDK's own redacted display of the same key.

**Not covered by this pass (by the user's explicit request):** the automated unit test
suite (`tests/unit`, `tests/helpers/{fakeFetch,tmpHome}`) and the vitest-based e2e harness
(`tests/e2e`) described in the spec's file tree were not written; verification here is a
real, live manual run against the real backend and real Hedera testnet instead, in the same
spirit as Stage 1's own live-verification pass. `mock/server.ts` was built as specified but
not exercised, since the real backend was available and is strictly more meaningful
evidence.

## Out of scope (unchanged)

No resource endpoints beyond `agent` (items/listings/transactions/AI are Stage 3), no
payments/x402/purchase signing (Stage 4), no MCP, no keychain/encrypted keystore, no
mainnet — all per the stage's locked decisions.
