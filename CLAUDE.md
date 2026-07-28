# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CashDrive: a Next.js (App Router) file-storage-and-marketplace app where users can upload files, monetize them via one-off listings or shared links, and pay for content using crypto (x402 protocol over Base Sepolia) with USDC. It also has an AI layer (embeddings/RAG over uploaded content, AI-generated listings) and an affiliate/commission system.

## Commands

```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build
npm run start    # run production build
npm run lint     # next lint (eslint-config-next)
```

There is no test suite configured in this repo.

`mcp.mjs` is a standalone MCP server (stdio transport) that exposes the marketplace as MCP tools by calling this app's HTTP API (`BASE_URL`, defaults to `http://localhost:3000`). Run it directly with `node mcp.mjs` for MCP client testing; it requires the Next app to be running.

## Architecture

### Request flow / payment gating

`middleware.ts` is the central gate for protected routes (matcher: `/dashboard`, `/profile`, `/api/listings`, `/api/shared-links`, `/protected`). It does two distinct things depending on the route:

- **Auth-only routes** (`/dashboard/*`): NextAuth `withAuth`, redirects to `/auth/signin`.
- **Payment-protected routes** (`/api/listings/*/purchase`, `/api/shared-links/*/purchase`): fetches the listing/shared-link's price and seller wallet *before* the request reaches the route handler, then wraps the request in `x402-next`'s `paymentMiddleware`, which enforces an on-chain USDC payment (network hardcoded to `base-sepolia`, facilitator `https://x402.org/facilitator`) to the seller (or a hardcoded affiliate payout wallet if `?affiliateProvided=true`) before letting it through.

Because middleware runs before the DB connection in the route handler, listing/shared-link lookups for payment config go through `app/utils/listingDetailFetcher.ts` (a separate lightweight fetch path), not the model directly.

### Data layer

- Mongoose + MongoDB, single cached connection via `app/lib/mongodb.ts` (global-cached `conn`/`promise`, standard Next.js dev-hot-reload-safe pattern). Requires `MONGODB_URI`.
- Models live in `app/models/*.ts`. **Always import models via `app/lib/models.ts`**, not directly from `app/models/*`, when the code path needs multiple related models (e.g. any API route touching `Item`/`Listing`/`Transaction`/`SharedLink`/`AIChunk` together) — this file exists specifically to force registration order and avoid Mongoose "MissingSchemaError"/duplicate-registration issues from populate() chains.
- Core entities and how they relate:
  - `User` — has a `wallet` (EVM address, created via Coinbase CDP on registration) and a `rootFolder` (an `Item`).
  - `Item` — file or folder, tree structure via `parentId`, `owner` -> `User`. Files are stored in S3 (`app/lib/s3.ts`); `Item` holds metadata only.
  - `Listing` — marketplace listing wrapping one `Item`, owned by a `User` (seller), has a `price`.
  - `SharedLink` — a shareable link to an `Item`, either `public` or `monetized` (has its own price, independent of `Listing`).
  - `Transaction` — records purchases; `transactionType` is `purchase`/`sale`/`commission`, `paymentFlow` is `direct`/`admin`; carries `affiliateInfo` with a commission distribution breakdown when an affiliate sale.
  - `Affiliate` / `Commission` — affiliate program: an `Affiliate` links a referring user to a `Listing` or `SharedLink` with a `commissionRate`; `Commission` records the payout tied back to the original `Transaction`.
  - `AIChunk` — text chunks + embeddings for an `Item`, used for RAG/search over purchased or owned content.

### Auth

NextAuth with a Credentials provider only (`app/lib/backend/authConfig.ts`), email/password via bcrypt. On registration, a Mongoose transaction atomically creates the `User`, provisions an EVM wallet via `@coinbase/cdp-sdk` (`CdpClient`), and creates the user's root `Item` folder — these three must stay atomic since a `User` requires both `wallet` and `rootFolder`.

### Payments (x402 / crypto)

- Server actions in `actions/` (`"use server"`) drive purchases: `purchaseFromMarketplace` builds a CDP account reference for the buyer's wallet and calls the purchase endpoint through `x402-axios`'s `withPaymentInterceptor`, which transparently handles the 402 challenge/response and signs payment.
- `actions/fundWallet.ts` requests testnet USDC from the CDP faucet (`base-sepolia` only) — dev/test convenience, not for mainnet.
- CDP credentials (`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`) are required for both wallet creation and payment signing. Note: `app/lib/config.ts`'s `secrets` object has a typo'd key (`CDP_Wallet_Secret` reading `process.env.CDP_Wallet_Secret`) that doesn't match the `CDP_WALLET_SECRET` env var used directly elsewhere (e.g. `actions/actions.ts`, `actions/fundWallet.ts`) — those call sites read `process.env` directly rather than through `secrets`, so this mismatch is currently latent but worth knowing before refactoring config usage.

### AI layer (`app/lib/ai/`)

- `aiService.ts` orchestrates: extracts text from processable files (`text/plain`, PDF, DOCX — see `PROCESSABLE_MIME_TYPES`), chunks it (`textProcessor.ts`), embeds via OpenAI (`openaiClient.ts`), and stores chunks in `AIChunk` for later similarity search (cosine, threshold in `THRESHOLDS.SIMILARITY_THRESHOLD`).
- Files get AI-processed both on user upload and after a marketplace/shared-link purchase (`CONTENT_SOURCES`), so purchased content becomes searchable/chattable for the buyer too.
- `pdfGenerator.ts` supports AI-generated content being turned into downloadable PDFs and saved as new `Item`s under an "AI Generated" folder.

### Frontend data-access convention

`app/lib/frontend/*Functions.ts` are the client-side API wrapper modules (one per domain: marketplace, transactions, shared links, users, etc.) — components call these rather than calling `axios`/`fetch` directly. They share a `handleApiError` pattern that normalizes Axios errors into thrown `Error`s. When adding a new API route, add a matching wrapper function here rather than inlining fetch calls in components.

### API route convention

Routes under `app/api/**/route.ts` follow Next.js App Router conventions (dynamic segments as `[id]`/`[linkId]`). Shared pagination/auth/query logic lives in `app/lib/utils/controllerUtils.ts` (`handlePaginatedRequest`, session lookup via `getServerSession(authOptions)`) — reuse it instead of hand-rolling pagination in new routes.

## Environment variables

Key vars (see `app/lib/config.ts` for the validated subset): `MONGODB_URI`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AWS_S3_ACCESS_KEY_ID`/`AWS_S3_SECRET_ACCESS_KEY`/`AWS_S3_REGION`/`AWS_S3_BUCKET_NAME`, `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET`/`CDP_WALLET_SECRET`, `NEXT_PUBLIC_HOST_NAME`, plus an OpenAI key for `app/lib/ai/openaiClient.ts`. `.env*` is gitignored.
