# Trustless Agent Infrastructure Prerequisites

This module teaches you how to build autonomous agent infrastructure on Filecoin. You will learn to create verifiable agent identities, build append-only memory systems, and implement autonomous payment management.

**Goal**: After completing these walkthroughs, you can build a **Trustless Autonomous Agent** with:
- Verifiable identity stored on Filecoin (Agent Card)
- Immutable decision logs (Agent Memory via Data Sets)
- Self-managing payment infrastructure (autonomous top-up and monitoring)
- A comprehensive health dashboard for agent operations

## Required: Filecoin Testnet Setup

All three walkthroughs require a funded Filecoin payment account with an approved storage operator.

### Step 1: Complete Storage Basics First

If you haven't already, complete the `storage-basics` module:

```bash
cd storage-basics/payment-management/code
npm install
cp .env.example .env.local
# Edit .env.local with your private key
npm start
```

This ensures you have:
- Payment account funded with USDFC
- Storage operator approved
- Understanding of PieceCID and upload mechanics

### Step 2: Verify Your Setup

```bash
# You should have:
# - USDFC balance > 0 in the payment account
# - Operator approved = true
# - tFIL in your wallet for gas fees
```

## Walkthrough Dependencies

| Walkthrough | Dependencies |
|-------------|--------------|
| 1. Create & Store Agent Card | storage-basics/payment-management complete |
| 2. Build Agent Memory System | Walkthrough 1 (builds on upload concepts) |
| 3. Payment Setup for Agents | Walkthroughs 1 & 2 (combines all patterns) |

## Environment Variables

Each walkthrough uses a `.env.local` file with the same core variables:

```bash
# Required for all walkthroughs
PRIVATE_KEY=your_backend_wallet_private_key

# RPC endpoint (default: Calibration testnet)
RPC_URL=https://api.calibration.node.glif.io/rpc/v1
```

## Quick Start

After completing prerequisites:

```bash
# Walkthrough 1: Create & Store Agent Card
cd trustless-agent-infrastructure/agent-card/code
npm install && cp .env.example .env.local && npm start

# Walkthrough 2: Build Agent Memory System
cd trustless-agent-infrastructure/agent-memory/code
npm install && cp .env.example .env.local && npm start

# Walkthrough 3: Payment Setup for Agents
cd trustless-agent-infrastructure/payment-setup/code
npm install && cp .env.example .env.local && npm start
```

## Troubleshooting

**"Payment account has no balance"**
Run `storage-basics/payment-management` first to deposit USDFC into the payment account.

**"Storage operator is not approved"**
Run `storage-basics/payment-management` first to approve the storage operator.

**"insufficient funds for gas"**
Your wallet needs tFIL for transaction fees. Get tFIL from the [Calibration Faucet](https://faucet.calibration.fildev.network/).

**"Missing PRIVATE_KEY in .env.local"**
Copy `.env.example` to `.env.local` and add your private key exported from MetaMask.

## What You'll Learn

| Walkthrough | Skills |
|-------------|--------|
| Agent Card | ERC-8004 metadata, Synapse SDK upload, content verification, on-chain registration |
| Agent Memory | Data Sets, storage contexts, structured logging, append-only audit trails |
| Payment Setup | Balance monitoring, autonomous deposits, operator approvals, health dashboards |

These skills combine to build production-ready autonomous agents on Filecoin.

## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
