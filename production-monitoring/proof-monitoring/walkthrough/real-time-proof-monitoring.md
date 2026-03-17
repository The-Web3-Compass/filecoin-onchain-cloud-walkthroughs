# Real-Time Proof Monitoring

Previous modules taught you how to upload, download, and pay for storage. But once your data lives on the Filecoin network, a critical question remains: **how do you know it's still there?**

Filecoin answers this question through cryptographic proofs. Storage providers do not simply promise to keep your data; they must periodically prove they still hold it by submitting mathematical evidence to the blockchain. If they fail to prove storage, they face economic penalties. This mechanism makes Filecoin fundamentally different from traditional cloud providers where you trust a company's reputation rather than cryptographic guarantees.

This walkthrough teaches you how to monitor these proofs in real-time. You will learn to query the smart contracts that manage storage, inspect provider status, check your payment account health, and build the data structures needed for a monitoring dashboard. These are the building blocks for the **Storage Operations Dashboard** exercise at the end of this module.

## Prerequisites

Before proceeding, you must have completed the `storage-basics` module:

- **Payment Management** — Your payment account must be funded with USDFC and the storage operator must be approved
- **First Upload** — You should have at least one file uploaded so there is data to monitor

If either prerequisite is missing, return to those modules first. This walkthrough queries live blockchain state that only exists after you have interacted with the storage system.

## What This Walkthrough Covers

We will walk through eight operations that build toward production monitoring:

1. **SDK Initialization** — Connecting to the Filecoin network
2. **Contract Discovery** — Finding the addresses of key infrastructure contracts
3. **Storage Parameters** — Querying current pricing and size limits
4. **Provider Status** — Inspecting the provider storing your data
5. **Payment Health** — Monitoring account balances and lockups
6. **Proving Periods** — Understanding how Filecoin's proof schedule works
7. **Status Object** — Building a JSON structure for dashboard integration
8. **Monitoring Patterns** — Polling strategies for live dashboards

Each step produces data that feeds into the Storage Operations Dashboard you will build as an exercise after completing all three walkthroughs.

## How Filecoin Proves Storage

Before looking at code, understanding the proof mechanism clarifies why monitoring matters.

Traditional cloud providers run periodic internal audits, but you cannot independently verify those audits occurred or passed. You are trusting their word. Filecoin replaces trust with mathematics.

**Proof of Data Possession (PDP)** is the mechanism used by Filecoin Onchain Cloud for "warm" (immediately retrievable) storage. The provider must demonstrate they can access your data at any time. The PDP Verifier contract on-chain validates these proofs.

**Window Proof of Spacetime (WindowPoSt)** covers the broader Filecoin network. Every 24 hours, every stored sector must be proven. Within that 24-hour window, providers have specific 30-minute "deadlines" to submit each proof. Miss a deadline, and the sector is marked "faulty." Remain faulty too long, and the provider loses their collateral.

**Winning Proof of Spacetime (WinningPoSt)** operates every epoch (30 seconds). A randomly selected provider must prove storage to win the right to produce a block and earn rewards. This doesn't directly affect your data but indicates overall provider activity.

For monitoring purposes, you care about two things: (1) is my provider healthy and submitting proofs on time, and (2) does my payment account have enough funds to keep storage active.

## Step 1: Create the Monitoring Script

Create a file named `index.js` in the `code/` directory:

```javascript
import dotenv from 'dotenv';
import { Synapse, TOKENS, calibration } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { http, formatUnits } from 'viem';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();
```

We load environment variables with the same pattern used across all modules. The `.env.local` file contains your `PRIVATE_KEY` and is excluded from version control by `.gitignore`.

### SDK Initialization

The SDK now uses [viem](https://viem.sh/) for wallet management instead of a raw `privateKey` string. `privateKeyToAccount` converts your private key into a typed account object that viem's transaction machinery understands.

```javascript
const account = privateKeyToAccount(process.env.PRIVATE_KEY);

// Synapse.create() is now synchronous — no await needed.
const synapse = Synapse.create({
    chain: calibration,
    transport: http(process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"),
    account,
    source: null
});

const chainId = synapse.chain.id;
const chainName = synapse.chain.name;
```

`synapse.chain.id` returns the numeric chain identifier — `314159` for Calibration testnet, `314` for mainnet. The `source` parameter scopes dataset namespacing; pass `null` to opt out of application isolation for this walkthrough.

## Step 2: Discovering Infrastructure Contracts

```javascript
const contracts = {
    warmStorage: synapse.chain.contracts.fwss.address,
    payments: synapse.chain.contracts.filecoinPay.address,
    pdpVerifier: synapse.chain.contracts.pdpVerifier.address
};
```

Contract addresses are now read directly from `synapse.chain.contracts` — the chain configuration object baked into the SDK. There are no longer separate getter methods like `getWarmStorageAddress()`.

**Warm Storage Contract** (`fwss`): The FilecoinWarmStorageService contract. When you upload data, the SDK interacts with this contract. For monitoring, this address lets you track storage-related transactions in a block explorer.

**Payments Contract** (`filecoinPay`): Manages USDFC deposits, withdrawals, and settlement between clients and providers. Monitoring transactions to this contract shows you payment flows — deposits, charges, and refunds.

**PDP Verifier Contract** (`pdpVerifier`): Validates Proof of Data Possession submissions. When a provider proves they hold your data, the proof goes through this contract. Monitoring events from it gives direct visibility into proof submission frequency and success rates.

In a production dashboard, you would link each address to a block explorer so operators can click through to see raw on-chain data.

## Step 3: Querying Storage Parameters

```javascript
try {
    // getStorageInfo() is now on synapse.storage, not on synapse directly.
    const storageInfo = await synapse.storage.getStorageInfo();

    if (storageInfo.pricing?.noCDN?.perTiBPerMonth) {
        // Pricing is now per TiB per month, not per byte per epoch
        console.log(`Price per TiB/month: ${formatUnits(storageInfo.pricing.noCDN.perTiBPerMonth, 18)} USDFC`);
    }

    if (storageInfo.serviceParameters?.minUploadSize !== undefined) {
        console.log(`Min Upload Size: ${storageInfo.serviceParameters.minUploadSize} bytes`);
    }

    if (storageInfo.serviceParameters?.maxUploadSize !== undefined) {
        console.log(`Max Upload Size: ${storageInfo.serviceParameters.maxUploadSize} bytes`);
    }
} catch (error) {
    console.log("Storage info not available, using defaults.");
}
```

`getStorageInfo()` is now a method on `synapse.storage` (the `StorageManager`), not on the `Synapse` instance directly. The response structure has also changed significantly:

**Pricing**: Previously expressed as `pricePerBytePerEpoch`, pricing is now `pricing.noCDN.perTiBPerMonth` — per tebibyte per month. This is more readable and directly comparable to cloud storage pricing. The `pricing.withCDN` fields cover CDN-enabled storage (CDN egress charges are usage-based on top of base storage).

**Size Constraints**: `serviceParameters.minUploadSize` and `serviceParameters.maxUploadSize` replace the former `minPieceSizeBytes` / `maxPieceSizeBytes`. Minimum is 127 bytes; maximum is typically around 200 MiB.

Note the `try/catch` — on testnet, some API methods may not return all fields. Defensive coding prevents your monitor from crashing when optional data is missing.

## Step 4: Provider Status

```javascript
// List providers from the storage service info
const storageInfo = await synapse.storage.getStorageInfo();

for (const provider of storageInfo.providers) {
    console.log(`Provider ID: ${provider.providerId}`);
    console.log(`  Address:  ${provider.serviceProvider}`);
    console.log(`  PDP URL:  ${provider.pdpUrl}`);
}
```

`getStorageInfo()` returns a `providers` array of approved storage providers. Each `PDPProvider` object includes the provider's on-chain address and their PDP (Proof of Data Possession) endpoint URL.

For deeper provider analytics — fault counts, sector history, proof success rates — you need an off-chain indexer (subgraph). The SDK no longer bundles a `SubgraphService`, but Walkthrough 2 explains your options for historical data.

**Reliability Score Calculation**: A provider with 99.5%+ proof success rate is considered healthy; below 95% warrants investigation. In the absence of a subgraph, you can approximate health by checking whether `storageInfo.allowances.isApproved` is true and monitoring your own payment drain rate over time.

## Step 5: Payment Account Health

```javascript
// All payment methods now take an options object { token } instead of a positional arg.
const balance = await synapse.payments.balance({ token: TOKENS.USDFC });
const accountInfo = await synapse.payments.accountInfo({ token: TOKENS.USDFC });

const balanceNumber = Number(balance) / 1e18;
let healthStatus = "🟢 Healthy";
if (balanceNumber < 1) {
    healthStatus = "🟡 Low Balance";
}
if (balanceNumber < 0.1) {
    healthStatus = "🔴 Critical - Fund immediately";
}
```

Payment health monitoring prevents the most common production failure: **running out of funds**. When your USDFC balance drops to zero, the provider can no longer charge for storage, and your data becomes at risk.

The `balance()` method returns a BigInt in wei-equivalent units (18 decimal places). We divide by `1e18` to get a human-readable USDFC amount. The `accountInfo()` method provides additional detail about locked funds and payment streams.

**Health Thresholds**: The code implements a simple traffic-light system:
- 🟢 **Healthy**: Balance above 1 USDFC. Multiple uploads remain possible.
- 🟡 **Low**: Between 0.1 and 1 USDFC. Time to top up.
- 🔴 **Critical**: Below 0.1 USDFC. Storage could stop working soon.

In production, you would calculate these thresholds dynamically based on your storage volume and daily burn rate, not as static numbers.

## Step 6: Understanding Proving Periods

The code outputs a reference table of Filecoin's proof types:

| Proof Type | Frequency | Purpose |
|------------|-----------|---------|
| WindowPoSt | Every 24 hours | Verify data storage |
| WinningPoSt | Per epoch (30s) | Block production |
| PDP (Hot Storage) | Configurable | Fast retrieval proof |

**Why This Matters for Monitoring**: Each proof type has different implications for your data:

- **WindowPoSt failures** mean your provider failed to prove they are storing *any* of their committed data. This is the most critical failure mode. If a provider misses WindowPoSt, all sectors they are responsible for get marked faulty.

- **PDP failures** specifically affect warm storage retrieval guarantees. If PDP proofs fail, your data might still exist on-chain but may not be immediately retrievable.

- **WinningPoSt** does not directly affect your data, but a provider consistently failing WinningPoSt is likely experiencing infrastructure problems.

## Step 7: Building the Status Object

```javascript
const monitorStatus = {
    timestamp: new Date().toISOString(),
    network: {
        chainId: synapse.chain.id,
        name: synapse.chain.name
    },
    contracts: contracts,
    account: {
        healthy: true,
        balance: await synapse.payments.balance({ token: TOKENS.USDFC }).then(b =>
            (Number(b) / 1e18).toFixed(4)
        ).catch(() => "0.0000")
    },
    proofSchedule: {
        windowPoStPeriod: "24 hours",
        deadlineWindow: "30 minutes",
        pdpEnabled: true
    }
};

console.log(JSON.stringify(monitorStatus, null, 2));
```

This step transforms all the queries from previous steps into a single JSON object. This is the primary output that a dashboard frontend would consume.

The structure is intentionally flat and descriptive. Each top-level key maps to a dashboard widget: `network` shows connection status, `contracts` provides explorer links, `account` powers the balance display, and `proofSchedule` documents the verification timeline.

In a production application, this object would be served via an API endpoint (e.g., `GET /api/monitor/status`) and consumed by a React or Vue frontend rendering charts and status indicators.

## Step 8: Continuous Monitoring Pattern

```javascript
async function monitorLoop(intervalMs = 60000) {
    while (true) {
        const balance = await synapse.payments.balance({ token: TOKENS.USDFC });
        const accountInfo = await synapse.payments.accountInfo({ token: TOKENS.USDFC });

        // Check for alerts
        if (Number(balance) / 1e18 < 0.5) {
            await sendAlert('Low balance warning');
        }

        // Calculate days remaining
        if (accountInfo.lockupRate > 0n) {
            const epochsLeft = accountInfo.availableFunds / accountInfo.lockupRate;
            const daysLeft = Number(epochsLeft) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);
            if (daysLeft < 7) await sendAlert('Critical: < 7 days remaining');
        }

        await new Promise(r => setTimeout(r, intervalMs));
    }
}
```

This pseudocode demonstrates the polling pattern for live dashboards. The recommended intervals for different metrics are:

- **Balance checks**: Every 5 minutes. Balance changes only when uploads occur or payments settle, so frequent polling wastes resources.
- **Provider status**: Every 15 minutes. Provider metrics change slowly.
- **Proof monitoring**: Every 30 minutes. This matches Filecoin's proof deadline window, so you catch failures promptly without over-polling.

**Important**: Do not poll every second. Blockchain state doesn't change that fast, and aggressive polling will get you rate-limited by your RPC provider. Structure your monitoring as a background process with appropriate intervals per metric type.

## Step 2: Run the Monitor

Navigate to the `code` directory and execute:

```bash
cd proof-monitoring/code
npm install
npm start
```

You should see output similar to:

```
Real-Time Proof Monitoring Demo

Monitor your Filecoin storage proofs and provider status.

=== Step 1: SDK Initialization ===

✓ SDK initialized successfully
  Connected to: Filecoin Calibration Testnet (chain ID: 314159)

=== Step 2: Core Contract Addresses ===

Key Infrastructure Contracts:
  Warm Storage (FWSS): 0x6454...
  Payments:            0x8c91...
  PDP Verifier:        0x3b72...

=== Step 5: Payment Account Health ===

Account Status:
  Wallet Balance (USDFC):  4.5231 USDFC
  Payment Account (USDFC): 3.2100 USDFC

  📊 Estimated Days Remaining: ~42.3 days
  🟢 Healthy: Sufficient balance for continued storage.

  Overall Health: 🟢 Healthy

=== Step 7: Monitor Status Object ===

Status Object (JSON):
{
  "timestamp": "2024-01-25T10:00:00.000Z",
  "network": { "chainId": 314159, "name": "Filecoin Calibration Testnet" },
  "contracts": { "warmStorage": "0x...", "payments": "0x...", "pdpVerifier": "0x..." },
  "account": { "healthy": true, "paymentBalance": "3.2100" },
  "proofSchedule": { "windowPoStPeriod": "24 hours", ... }
}

✅ Proof Monitoring Complete!
```

## Production Considerations

### Rate Limiting

Public RPC endpoints like `api.calibration.node.glif.io` have rate limits. For production monitoring that polls frequently, use a dedicated RPC provider (e.g., Infura, Alchemy, or your own node). The cost is typically $50-200/month for moderate usage but prevents your monitor from going blind during spikes.

### State Caching

Not every dashboard request needs a fresh blockchain query. Cache the status object with a TTL matching your polling interval. This prevents overwhelming your RPC provider when multiple users load the dashboard simultaneously.

### Multi-Provider Monitoring

If you use multiple storage providers (for redundancy, as discussed in the first-upload walkthrough), iterate over all provider addresses and build a combined status object. The dashboard should show per-provider reliability alongside an aggregate score.

## Troubleshooting

**"Cannot read properties of undefined" errors**

Some SDK methods return objects with optional fields on testnet. Always check for `undefined` before accessing nested properties. The code uses `if (providerInfo.faultySectorCount !== undefined)` patterns for this reason.

**"`getStorageInfo()` failed"**

This method lives on `synapse.storage`, not on `synapse`. Ensure you are calling `synapse.storage.getStorageInfo()`. The `try/catch` ensures the script continues even if this call fails. The remaining steps still provide useful monitoring data.

**Very small or zero balance shown**

If your balance shows as 0 or very small, you may need to re-fund your payment account. Run the `payment-management` module from `storage-basics` to deposit more USDFC.

## Conclusion

You now have the foundation for real-time storage monitoring. The status object produced by this script contains everything needed to power the "Current Status" widget of a Storage Operations Dashboard: network connectivity, contract addresses for audit trails, provider health indicators, and payment account status.

The next walkthrough builds on this by adding **historical analysis** — querying past proof submissions and transaction history to generate time-series charts and provider reliability scores over time. Where this walkthrough answers "what's happening now?", the next answers "what happened over the last week?"

## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
