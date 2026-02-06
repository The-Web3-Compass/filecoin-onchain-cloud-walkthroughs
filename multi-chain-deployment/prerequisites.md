# Multi-Chain Deployment Prerequisites

This module teaches you how to build applications that accept payments on any L2 chain (Base, Arbitrum, Polygon) while using Filecoin for decentralized storage. Before running any walkthrough in this module, complete the following setup.

## Required: Filecoin Testnet Setup

All three walkthroughs require a funded Filecoin payment account.

### Step 1: Get Testnet Tokens

1. **tFIL (Gas)**: Get from [Calibration Faucet](https://faucet.calibration.fildev.network/)
2. **USDFC (Storage payments)**: Get from [Circle Faucet](https://faucet.circle.com/) - select "Filecoin Calibration"

### Step 2: Fund Your Payment Account

Having tokens in your wallet is not enough. You must deposit into your payment account and approve the storage operator.

**Run this first:**
```bash
cd storage-basics/payment-management/code
npm install
cp .env.example .env.local
# Edit .env.local with your private key
npm start
```

This tutorial:
- Deposits USDFC into your payment account
- Approves the warm storage operator
- Verifies everything is configured

### Step 3: Verify Setup

After running payment-management, you should see:
- Payment account balance > 0
- Operator approved = true
- Rate and lockup allowances set

## Walkthrough Dependencies

| Walkthrough | Dependencies |
|-------------|--------------|
| 1. Backend Storage | payment-management complete |
| 2. Payment Tracking | Walkthrough 1 + SQLite (auto-installs) |
| 3. NFT Metadata | Walkthrough 1 (can skip 2) |

## Environment Variables

Each walkthrough uses a `.env.local` file:

```bash
# Required for all walkthroughs
PRIVATE_KEY=your_backend_wallet_private_key

# Optional for payment-tracking (L2 verification)
BASE_RPC_URL=https://mainnet.base.org
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
POLYGON_RPC_URL=https://polygon-rpc.com

# Optional for nft-metadata server
PORT=3000
```

## Security Notes

1. **Never commit `.env.local`** - It contains your private key
2. **Backend key is infrastructure** - Treat it like a server secret
3. **In production** - Use secret managers (AWS Secrets Manager, Vault)

## Quick Start

After completing prerequisites:

```bash
# Walkthrough 1: Backend Storage
cd multi-chain-deployment/backend-storage/code
npm install && cp .env.example .env.local && npm start

# Walkthrough 2: Payment Tracking
cd multi-chain-deployment/payment-tracking/code
npm install && cp .env.example .env.local && npm start

# Walkthrough 3: NFT Metadata
cd multi-chain-deployment/nft-metadata/code
npm install && cp .env.example .env.local && npm start
```

## Troubleshooting

**"Payment account is empty"**
→ Run `storage-basics/payment-management` first

**"Storage operator not approved"**
→ Run `storage-basics/payment-management` first

**"Upload failed"**
→ Check balance and approval, ensure data size ≥ 127 bytes

**"PieceCID not found on explorer"**
→ Explorers can take 10-60 minutes to index new deals. If your script showed "Upload successful" and download worked, the data is stored. The explorer will catch up.
