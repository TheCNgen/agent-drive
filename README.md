# AgentDrive (HashDrive / CashDrive) Monorepo

**AgentDrive** is a decentralized "Google Drive for AI Agents" built on the Hedera network. It enables AI agents to autonomously buy, host, trade, and monetized files using HTTP `x402` micropayments on Hedera. 

The platform provides spending controls for agents, logs audit trails to Hedera Consensus Service (HCS), and features dynamic payment routing: direct peer-to-peer payments for simple purchases and smart-contract treasury routing when affiliate commissions need to be split.

---

### Key Features

- 🤖 **Agent Onboarding & CLI SDK**: Non-custodial wallet generation (ECDSA keypair), interactive funding setup, spending controls, and CLI commands (`agent-drive`) for autonomous trading.
- ⚡ **x402 Micropayments on Hedera**: Standardized two-phase HTTP 402 payment flow using `@x402/core` and `@x402/hedera`.
- 🔀 **Hybrid Payment Routing**:
  - **Direct Payments**: Purchases without affiliates route funds directly to the seller's Hedera wallet.
  - **Affiliate & Smart Contract Treasury**: Purchases with affiliate codes route funds through the [`AgentDriveTreasury.sol`](file:///home/mac/hedera-402/hash-drive/cashdrive/contracts/AgentDriveTreasury.sol) smart contract, allocating percentages to the seller and affiliate, claimable on-chain.
- 🛡 **Agent Spending Controls**: Granular guardrails configured per agent:
  - Per-order spending limits
  - Daily & monthly cumulative spending caps
  - High-value transaction approval thresholds
- 📜 **Hedera Consensus Service (HCS) Audit Logging**: All major events (`LISTING_UPDATED`, `LISTING_DELETED`, `TRANSACTION_COMPLETED`) are submitted to a dedicated HCS topic for transparent auditability.

---

## 📁 Repository Structure

```
.
├── cli/                # AgentDrive TypeScript SDK & CLI tool (`agent-drive`)
├── contracts/          # Solidity smart contracts for treasury allocation
└── web/                # Next.js web application, dashboard, and backend APIs
```

### 1. `cli/` - Agent SDK & CLI Tool
Provides both programmatic Node/ESM SDK exports and the `agent-drive` CLI command-line interface.

- **SDK Entrypoints**: `agent-drive` (HTTP Client), `agent-drive/agent` (Wallet generation & config management).
- **CLI Commands**:
  - `agent-drive onboard --claim <HEX>`: Redeems claim codes, generates non-custodial wallet, and activates account.
  - `agent-drive purchase <listing|link> <ID> [--affiliate <code>]`: Autonomous purchasing using x402 header exchange.
  - `agent-drive whoami`, `items`, `listings`, `transactions`, `affiliates`, `logout`.

### 2. `contracts/` - Smart Contracts
Contains the EVM-compatible Solidity contracts deployed on Hedera Testnet/Mainnet.

- [`AgentDriveTreasury.sol`](file:///home/mac/hedera-402/hash-drive/cashdrive/contracts/AgentDriveTreasury.sol): Receives HBAR transfers, allocates balances to sellers and affiliates upon backend authorization, and handles on-chain claims.

### 3. `web/` - Web Application & Backend API
Built with Next.js 15, React 19, MongoDB, and `@hiero-ledger/sdk`.

- **Web Dashboard**: Human interface for user profiles, agent monitoring, file uploads, listing management, and audit logs.
- **x402 Purchase Protocol**: [`web/app/lib/backend/x402PurchaseHandler.ts`](file:///home/mac/hedera-402/hash-drive/cashdrive/web/app/lib/backend/x402PurchaseHandler.ts) & [`fulfillPurchase.ts`](file:///home/mac/hedera-402/hash-drive/cashdrive/web/app/lib/backend/fulfillPurchase.ts) handle x402 quotes, payment verification, settlement, and file transfer.
- **HCS Logging**: [`web/app/lib/hedera.ts`](file:///home/mac/hedera-402/hash-drive/cashdrive/web/app/lib/hedera.ts) submits cryptographic event proofs to the Hedera Topic.

---

## 🚀 Quick Start & Development

### Prerequisites
- **Node.js**: `>=20.11.0`
- **MongoDB**: Running instance or database connection string
- **Hedera Testnet Account**: Operator ID & Private Key

### Installation

Install dependencies across the monorepo:

```bash
# In the repository root
npm install
```

---

### Running the Web Platform (`web/`)

1. Set up environment variables in `web/.env`:
   ```env
   MONGODB_URI=mongodb://localhost:27017/agentdrive
   HEDERA_OPERATOR_ID=0.0.xxxxx
   HEDERA_OPERATOR_KEY=302e...
   HEDERA_PROVENANCE_TOPIC_ID=0.0.yyyyy
   TREASURY_CONTRACT_ID=0.0.zzzzz
   ```

2. Start the development server:
   ```bash
   cd web
   npm run dev
   ```
   Open `http://localhost:3000` to view the web dashboard.

---

### Building and Using the CLI (`cli/`)

1. Build the package:
   ```bash
   cd cli
   npm run build
   ```

2. Run the CLI tool:
   ```bash
   # Onboard a new agent using a claim code
   ./dist/cli.js onboard --claim <YOUR_CLAIM_CODE>

   # Purchase a file listing via x402 payment
   ./dist/cli.js purchase listing <LISTING_ID>
   ```

---

### Smart Contracts (`contracts/`)

To inspect or deploy the contract:
- Contract file: [`contracts/AgentDriveTreasury.sol`](file:///home/mac/hedera-402/hash-drive/cashdrive/contracts/AgentDriveTreasury.sol)
- Deployment script: `web/deploy-contract.ts` (run via `npx tsx deploy-contract.ts` inside `web/`).

