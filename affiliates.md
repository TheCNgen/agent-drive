# Affiliate Commission Split and Ledger Architecture

This report details how the AgentDrive platform calculates, splits, and records affiliate commissions when a monetized listing or shared link is purchased.

## 1. Fee Calculation and Split

When a purchase is requested, the total purchase price (`priceTinybars`) is divided into three components. The calculation relies on integer-floor arithmetic to ensure precision with tinybars.

- **Platform Fee**: The platform takes a flat 5% cut (`PLATFORM_FEE_PERCENT = 5`) of the total purchase price.
  - *Calculation*: `(priceTinybars * 5) / 100`
- **Affiliate Fee**: If an eligible, active affiliate code is provided and the target content has affiliates enabled, the affiliate earns a commission. The rate is defined by the affiliate record's `commissionRate`.
  - *Calculation*: `(priceTinybars * commissionRate) / 100`
- **Seller Amount**: The seller receives whatever remains after both the platform fee and the affiliate fee are deducted.
  - *Calculation*: `priceTinybars - platformFee - affiliateFee`

*(Note: The affiliate fee is calculated against the **total purchase price**, not the seller's post-platform-fee cut. Effectively, the seller absorbs the cost of the affiliate commission out of their earnings.)*

## 2. On-Chain Settlement (Treasury Model)

The platform operates on a treasury model for the initial payment. 
- The buyer transfers the **full purchase amount** (`priceTinybars`) directly to the platform's treasury account in a single on-chain Hedera transaction.
- The seller and the affiliate **do not** receive their funds immediately on-chain. Instead, their respective cuts (`sellerAmount` and `affiliateFee`) are credited as internal ledger balances awaiting periodic off-chain payout/settlement from the treasury.

## 3. Internal Ledger and Database Records

Once the buyer's payment to the treasury is verified, the backend (`fulfillPurchase.ts`) runs a post-payment side effect to distribute the ledger rows. The system records the following MongoDB documents to balance the accounting:

1. **Main Purchase Transaction (Buyer)**:
   - The primary transaction is recorded for the buyer.
   - It contains an `affiliateInfo` subdocument that logs the `originalAmountTinybars` (full price), `netAmountTinybars` (seller's cut), and a `commissionDistribution` array listing the affiliate ID and the exact fee distributed.

2. **Sale Transaction (Seller)**:
   - A `Transaction` of type `'sale'` is created for the original seller.
   - The `amountTinybars` is set to the net `sellerAmount`.
   - It is marked with `paymentFlow: 'admin'` and its metadata explicitly notes the `commissionDeducted` to explain why the sale amount is lower than the listing price.

3. **Commission Transaction (Affiliate)**:
   - A `Transaction` of type `'commission'` is created for the affiliate user.
   - The `amountTinybars` is set to the `affiliateFee`.
   - The `buyer` field on this transaction is set to the *seller's ID*, reflecting the accounting reality that the seller is the one paying the affiliate.

4. **Commission Record**:
   - A `Commission` document is generated to track the payout state.
   - It links the affiliate, the original transaction, and the commission transaction.
   - Its status defaults to `'pending'`, representing a ledger entry that is awaiting off-chain settlement.

5. **Affiliate Analytics Update**:
   - The system increments the specific `Affiliate` record's `totalSales` counter by 1.
   - It adds the `feeTinybars` to the affiliate's cumulative `totalEarnings`.
