# Historical Analysis

The previous walkthrough showed you how to check the *current* state of your storage — is the provider online right now, is my balance healthy today. But production monitoring requires a different dimension: **what happened over time?**

A provider might be healthy today but had three outages last month. Your balance might be fine right now but it has been declining rapidly. A single proof failure doesn't matter, but a pattern of failures signals a deteriorating provider. These insights only emerge from historical data.

This walkthrough covers the two-layer approach to storage analytics: **on-chain queries** (what the SDK provides natively) and **off-chain indexing** (what you need for deep historical event data).

## Prerequisites

Before proceeding, ensure you have completed:

- **Walkthrough 1 (Proof Monitoring)** — You should understand contract addresses, provider concepts, and payment health
- **Storage Basics Module** — Your payment account must be funded and at least one upload should exist

## What This Walkthrough Covers

1. **SDK Initialization** — Connecting with the new viem-based API
2. **On-Chain Data Sets** — Querying your data sets with `findDataSets()`
3. **Provider Information** — Fetching approved providers from `getStorageInfo()`
4. **Time-Series Generation** — Building chart-ready data (demo + subgraph path)
5. **Cost Analytics** — Tracking storage spending patterns from the payments module

## The Data Layer Reality

Filecoin stores every transaction and proof on-chain, but blockchains are optimized for *writing*, not *reading complex history*. Answering "How many proofs did my provider submit last week?" requires scanning ~20,000 blocks — too slow for a dashboard.

The Synapse SDK addresses this in two ways:

**On-chain (SDK native)**: `synapse.storage.findDataSets()` queries the FWSS contract for all data sets associated with your wallet. This is instant but limited to current state — it tells you what exists now, not what happened over time.

**Off-chain indexer (bring your own)**: As of SDK v0.39, the `SubgraphService` is no longer bundled. For event history — proof submissions, fault records, piece creation timestamps — you deploy a subgraph using [Goldsky](https://goldsky.com/) and query it directly with `fetch()`. This walkthrough shows both approaches.

## Step 1: Initialize the SDK

```javascript
import { Synapse, TOKENS, TIME_CONSTANTS, calibration } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { http } from 'viem';

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const synapse = Synapse.create({
    chain: calibration,
    transport: http(process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"),
    account,
    source: null
});
```

The initialization pattern is the same as Walkthrough 1 — viem-based, synchronous, no `await` on `Synapse.create()`.

## Step 2: Query Your Data Sets (On-Chain)

`findDataSets()` queries the FWSS contract directly. No subgraph needed.

```javascript
const dataSets = await synapse.storage.findDataSets();

for (const ds of dataSets) {
    console.log(`Dataset ID: ${ds.dataSetId}`);
    console.log(`  Provider ID:  ${ds.providerId}`);
    console.log(`  Live:         ${ds.isLive}`);
    console.log(`  CDN-enabled:  ${ds.withCDN}`);
    console.log(`  PDP Rail ID:  ${ds.pdpRailId}`);
    console.log(`  Metadata:     ${JSON.stringify(ds.metadata)}`);
}
```

Each `EnhancedDataSetInfo` object contains:
- `dataSetId`: Contract-level ID for the data set
- `providerId`: The ID of the storage provider holding this data
- `isLive`: Whether the data set is currently active on-chain
- `pdpRailId`: The payment rail ID for storage charges
- `withCDN`: Whether CDN delivery is enabled
- `metadata`: Custom key-value pairs you attached at upload time

This gives you an immediate inventory of your storage without scanning blocks. The limitation is that `findDataSets()` returns *current* state — it won't show you data sets that have been terminated.

## Step 3: Provider Performance Analysis

The SDK can list approved providers from the FWSS contract:

```javascript
const storageInfo = await synapse.storage.getStorageInfo();

for (const provider of storageInfo.providers) {
    console.log(`Provider ${provider.providerId}: ${provider.serviceProvider}`);
    console.log(`  PDP URL: ${provider.pdpUrl}`);
}
```

For **reliability scores** (proof success rates, fault history), you need an off-chain indexer. Until then, a practical proxy is monitoring your own payment drain — if you are being charged steadily, the provider is actively serving proofs.

**Scoring Guidelines**:
- **99%+ proof success (🟢)**: Excellent. Standard for commercial storage.
- **95–99% (🟡)**: Acceptable. Occasional misses, e.g. maintenance windows.
- **<95% (🔴)**: Poor. Consider migrating data to a different provider.

## Step 4: Historical Data via Subgraph

For time-series charts and event history, deploy a subgraph and query it directly with `fetch()`. The SDK no longer wraps this, giving you full control over the GraphQL shape.

```javascript
const SUBGRAPH_ENDPOINT = process.env.SUBGRAPH_ENDPOINT;

if (SUBGRAPH_ENDPOINT) {
    const response = await fetch(SUBGRAPH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `{
                dataSets(first: 10, orderBy: createdAt, orderDirection: desc) {
                    id
                    totalPieces
                    totalDataSize
                    createdAt
                }
            }`
        })
    });
    const { data } = await response.json();
    console.log(`Subgraph returned ${data.dataSets.length} data sets`);
} else {
    console.log("Set SUBGRAPH_ENDPOINT in .env.local to enable historical queries.");
}
```

Until you have a subgraph, prototype your charts using demo data (as the code file does).

### Deploying Your Own Subgraph

1. **Install Goldsky CLI**: `curl -s https://goldsky.com/install.sh | bash`
2. **Login**: `goldsky login`
3. **Deploy**: `goldsky subgraph deploy my-filecoin-stats/v1.0.0 --path .`
4. **Set endpoint**: Add `SUBGRAPH_ENDPOINT=https://api.goldsky.com/...` to `.env.local`

## Step 5: Cost Analytics

The `payments` module gives real-time financial metrics:

```javascript
const accountInfo = await synapse.payments.accountInfo({ token: TOKENS.USDFC });

if (accountInfo.lockupRate > 0n) {
    const dailyCost = Number(accountInfo.lockupRate) * Number(TIME_CONSTANTS.EPOCHS_PER_DAY) / 1e18;
    const monthlyCost = dailyCost * 30;
    const daysRemaining = Number(accountInfo.availableFunds / accountInfo.lockupRate)
                          / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);

    console.log(`Daily Burn Rate: ${dailyCost.toFixed(6)} USDFC`);
    console.log(`Monthly Est.:    ${monthlyCost.toFixed(4)} USDFC`);
    console.log(`Runway:          ~${daysRemaining.toFixed(1)} days`);
}
```

Note that `accountInfo()` now takes an options object `{ token: TOKENS.USDFC }` — the signature changed from a positional argument in earlier SDK versions.

This answers the CFO's question: "How much is this costing us and when do we need to top up?"

## Running the Analysis

```bash
cd historical-analysis/code
npm install
npm start
```

## Summary

You now understand the two-layer approach to Filecoin storage analytics:

| Layer | Source | What it answers |
|-------|--------|-----------------|
| On-chain | `findDataSets()`, `getStorageInfo()` | Current inventory, provider list, pricing |
| Off-chain | Your subgraph + `fetch()` | Event history, proof counts, time-series |

- **Inventory**: Use `synapse.storage.findDataSets()` for your active data sets
- **Providers**: Use `synapse.storage.getStorageInfo().providers` for the approved provider list
- **History**: Deploy a Goldsky subgraph and query via `fetch()`
- **Cost tracking**: Use `synapse.payments.accountInfo({ token: TOKENS.USDFC })` for burn rate

Next: **Building an Alert System** (Walkthrough 3).

## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
