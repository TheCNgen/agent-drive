# AgentDrive Purchasing System

This report details how the purchasing flow works across the AgentDrive platform, covering both the Next.js backend and the agent CLI. The system employs a two-phase x402 (L402) protocol to handle quotes and signed payment settlement over the Hedera network.

## 1. Backend Implementation

The backend purchase logic is centered around API routes that handle the x402 protocol and side effects (copying files, recording ledger entries).

### API Routes
- **Listing Purchase**: `POST /api/v1/agent/purchase/listing/[id]`
- **Shared Link Purchase**: `POST /api/v1/agent/purchase/link/[linkId]`

Both routes delegate to the shared `handleX402Purchase` function.

### Two-Phase Protocol (`handleX402Purchase`)
The system distinguishes between phase 1 (quote) and phase 2 (payment) based on the presence of the `X-PAYMENT` header.

**Phase 1: Quote (No `X-PAYMENT` header)**
1. **Validation & Pricing**: The backend uses `quoteListingPurchase` or `quoteSharedLinkPurchase` to validate the item (exists, active, not owned by buyer) and calculate fees.
2. **Fee Breakdown**: The total price is split into:
   - **Platform Fee**: A flat 5% cut.
   - **Affiliate Fee**: (Optional) Based on the affiliate's configured commission rate.
   - **Seller Amount**: The remaining balance.
3. **Response**: It returns a `402 Payment Required` response containing the payment requirements (`accepts` array). The `payTo` address is always the **platform treasury**, meaning all on-chain funds go to the platform first.

**Phase 2: Payment (With `X-PAYMENT` header)**
1. **Signature Verification**: The signed `X-PAYMENT` header is decoded and checked to ensure it matches the original quote requirements.
2. **Settlement**: `x402Facilitator.settle()` processes the on-chain transfer to the treasury.
3. **Fulfillment**: On successful settlement, `fulfillPurchase` is called to execute the side effects.

### Fulfillment (`fulfillPurchase`)
The fulfillment step handles everything that happens after the platform treasury receives the funds:
1. **Main Ledger Entry**: A main `Transaction` record is created in the database marking the buyer's payment. It is idempotent based on `transactionId`.
2. **Item Handling**:
   - For **Listings**: The actual file/folder is duplicated into the buyer's `marketplace` folder via `copyItemWithBFS`.
   - For **Shared Links**: The buyer's ID is simply added to the link's `paidUsers` array (the CLI claims/copies the file in a separate step).
3. **Affiliate & Seller Payouts**: 
   - The backend records ledger-only `Transaction` rows for the affiliate `commission` and the seller `sale`.
   - **Important**: These are off-chain accounting records. The platform holds the funds and pays out the seller and affiliate later in a separate process.
4. **HCS Record**: A `TRANSACTION_COMPLETED` record is submitted to the Hedera Consensus Service.
5. **Response**: Returns a `201 Created` with transaction and copied item details.

---

## 2. CLI Implementation

The CLI provides commands to initiate purchases, abstracting the two-phase protocol for agents.

### Commands
- `agent-drive purchase <listing|link> <id> [--affiliate <code>]`

### Orchestration (`executePurchase`)
The core flow is managed by `executePurchase` in `cli/src/resources/payments.ts`.

1. **Pre-flight & Phase 1 (Quote)**: 
   - The CLI sends a POST request without the `X-PAYMENT` header.
   - Since quotes are idempotent, this step is wrapped in `fetchRequirementsWithRetry` to automatically retry on transient network errors.
   - It asserts that the agent has enough balance in its wallet to cover the quoted `priceTinybars` and triggers an `onQuote` callback (which prints the price to the terminal).
2. **Signing**: 
   - Uses the local `PaymentSigner` to sign the `XPaymentRequirements` quote.
3. **Journaling**:
   - Before submitting the actual payment, a `PendingPaymentEntry` is written to a local journal on disk (`~/.agent-drive/pending/`).
   - This ensures that if the process crashes or the network fails during submission, the agent won't silently lose track of a signed, potentially submitted payment.
4. **Phase 2 (Payment Submit)**:
   - The CLI sends the POST request with the `X-PAYMENT` header.
   - **Crucially, this step is never retried.** If it fails, it bubbles up the error and leaves the pending journal entry intact.
5. **Cleanup**:
   - If the server responds with a `201 Created`, the pending journal entry is deleted, and success messages are printed.

### Recovery (`recoverPending`)
Because Phase 2 network errors can leave the client unsure if a transaction settled on-chain, the CLI provides a recovery mechanism (`client.payments.recoverPending()` / `agent-drive payments recover`). 
It checks the backend state (`GET /listings/:id/purchase-status` or `/shared-links/:id`) to see if the pending transactions actually landed, safely clearing the journal or flagging them for investigation without automatically double-paying.
