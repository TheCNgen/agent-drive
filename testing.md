# CacheDrive v2 Local Testing Guide

Welcome to CacheDrive v2! This guide will walk you through setting up the application on your local machine and showcase its core features, including the new Hedera integrations and Mistral OCR.

---

## 1. Local Setup Instructions

### Prerequisites
- **Node.js**: v18.17.0 or higher.
- **Git**: To clone the repository.
- **MongoDB Atlas & Cloud Accounts**: A configured `.env` file is necessary for the external integrations to work (Hedera, Google Cloud Storage, Mistral AI, MongoDB Atlas).

### Installation Steps

1. **Clone the Repository**
   Pull down the project to your local machine:
   ```bash
   git clone <your-repo-url>
   cd cashdrive
   ```

2. **Install Dependencies**
   Install the required NPM packages:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root of the project. Since you are testing locally, you will need to copy the contents of the `.env` file from this remote VM into your local `.env`. Ensure the following key values are populated:
   - `MONGODB_URI`
   - `NEXTAUTH_SECRET` & `NEXTAUTH_URL=http://localhost:3000`
   - `HEDERA_OPERATOR_ID` & `HEDERA_OPERATOR_KEY`
   - `HEDERA_PLATFORM_FEE_ACCOUNT`
   - `HEDERA_HCS_TOPIC_ID`
   - `GCP_PROJECT_ID`, `GCS_BUCKET_NAME`, `GOOGLE_APPLICATION_CREDENTIALS` (or raw JSON credentials if properly structured)
   - `MISTRAL_API_KEY`

4. **Start the Development Server**
   Start the Next.js development server:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:3000`.

---

## 2. Basic Features Walkthrough

To fully experience the application's capabilities, you'll need to simulate an interaction between two different users (e.g., a Seller and a Buyer).

### A. Account Creation & Hedera Wallet Auto-Provisioning
1. Click **Sign Up** to create your first account (the "Seller"). 
2. Upon registration, the backend automatically generates a new **Hedera testnet ECDSA account** and securely attaches the `accountId` and `privateKey` to your User profile. 

### B. File Upload & Mistral AI OCR
1. Navigate to the **Dashboard** or **My Files**.
2. **Upload a PDF document**. 
3. Behind the scenes, the file is securely uploaded to a private **Google Cloud Storage (GCS)** bucket.
4. The system automatically fetches a pre-signed URL and passes it to **Mistral OCR**, which asynchronously extracts the text content in markdown format. 
5. An event is also dispatched to the **Hedera Consensus Service (HCS)** permanently logging the `ITEM_CREATED` action.

### C. Monetizing Content (Marketplace)
1. Select the file you just uploaded and choose to **Create a Listing**.
2. Set a price in **HBAR** (the native cryptocurrency for the Hedera network).
3. (Optional) Enable affiliate links to allow others to market your content for a commission.
4. An HCS message (`LISTING_CREATED`) is automatically logged on-chain.

### D. Purchasing Content via Hedera (Direct Transfer)
1. Open an incognito window or log out, and create a **second account** (the "Buyer").
2. Ensure the Buyer's new auto-generated Hedera wallet has some testnet HBAR (the VM setup handles this for the E2E tests, but for manual testing you may need to use the Hedera Testnet Faucet if purchasing expensive items).
3. Navigate to the **Marketplace** and find the Seller's listing.
4. Click **Purchase**. 
5. What happens under the hood:
   - The backend constructs a **Hedera TransferTransaction** signed by the Buyer's private key.
   - HBAR is atomically deducted from the Buyer and distributed to:
     - The Platform Fee Wallet (5%)
     - The Affiliate Wallet (if an affiliate link was used)
     - The Seller's Wallet (Remaining Balance)
   - The purchased file is automatically duplicated into the Buyer's root folder (`/marketplace/`) for their permanent access.
   - A `TRANSACTION_COMPLETED` event is permanently logged to the Hedera Consensus Service.

### E. Verifying HCS Provenance
Whenever items are uploaded, updated, or purchased, the system logs an immutable message to the Hedera Consensus Service. You can trace these events by checking the `HEDERA_HCS_TOPIC_ID` on a Hedera testnet block explorer (like Hashscan) to see the real-time stream of application events!
