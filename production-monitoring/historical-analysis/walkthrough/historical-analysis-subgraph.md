# Historical Analysis with Subgraph

The previous walkthrough showed you how to check the *current* state of your storage — is the provider online right now, is my balance healthy today. But production monitoring requires a different dimension: **what happened over time?**

A provider might be healthy today but had three outages last month. Your balance might be fine right now but it has been declining rapidly. A single proof failure doesn't matter, but a pattern of failures signals a deteriorating provider. These insights only emerge from historical data.

This walkthrough teaches you how to query Filecoin's historical data using the **Synapse SDK's SubgraphService**, transform it into time-series format for charts, and perform cost analytics. These capabilities form the analytical backbone of the Storage Operations Dashboard.

## Prerequisites

Before proceeding, ensure you have completed:

- **Walkthrough 1 (Proof Monitoring)** — You should understand contract addresses, provider concepts, and payment health
- **Storage Basics Module** — Your payment account must be funded and at least one upload should exist
- **Subgraph Endpoint** — You will need a GraphQL endpoint. You can deploy your own using [Goldsky](https://goldsky.com/) or use a public Filecoin testnet subgraph if available.

## What This Walkthrough Covers

1. **SubgraphService** — Integrating the SDK's built-in GraphQL client
2. **Querying Data Sets** — Retrieving storage deal history with typed methods
3. **Provider Performance** — Analyzing fault records from the subgraph
4. **Time-Series Generation** — Building chart-ready data from creation timestamps
5. **Cost Analytics** — Tracking storage spending patterns
6. **Data Export** — Formatting data for dashboards

## The Data Layer Problem

Why can't we just query the blockchain directly? Technically, you can. Every transaction and proof is on-chain. But blockchains are optimized for writing, not reading complex history.

If you want to answer "How many proofs did my provider submit last week?", you would need to scan ~20,000 blocks. This is too slow for a dashboard.

**Indexers (Subgraphs)** solve this. They index blockchain events into a queryable database. The Synapse SDK includes a `SubgraphService` that connects to these indexers (like Goldsky) to give you instant access to historical storage data.

## Step 1: Initialize SubgraphService

Create `index.js` in the `code/` directory. We'll configure the service with an endpoint:

```javascript
import { Synapse, SubgraphService } from '@filoz/synapse-sdk';

// Initialize the main SDK (for payments/wallet)
const synapse = await Synapse.create({
    privateKey: process.env.PRIVATE_KEY,
    rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
});

// Initialize the Subgraph Service
const subgraph = new SubgraphService({
    // Replace with your Goldsky or self-hosted endpoint
    endpoint: process.env.SUBGRAPH_ENDPOINT || "https://api.goldsky.com/..."
});
```

A deployed subgraph extracts `DataSetCreated`, `PieceAdded`, and `FaultReported` events from the Filecoin contracts and makes them queryable.

## Step 2: Query Storage Activity

Instead of raw GraphQL, the SDK provides typed methods to query data. Let's fetch recent Data Sets (storage groups):

```javascript
const dataSets = await subgraph.queryDataSets({
    first: 10,
    orderBy: "createdAt",
    orderDirection: "desc",
    where: {
        isActive: true
    }
});

console.log(`Found ${dataSets.length} active data sets`);
```

Each `dataSet` object contains:
- `id`: The unique Data Set ID
- `totalDataSize`: Total bytes stored
- `totalPieces`: Number of files/pieces in the set
- `serviceProvider`: The provider hosting this data
- `metadataValues`: Custom metadata tags attached to the set

This gives you an immediate view of your storage inventory without scanning the chain.

## Step 3: Provider Performance Analysis

How reliable is your provider? You can query **Fault Records** to see if they missed any proofs:

```javascript
// In a real scenario, you'd calculate this from fault records
// const faults = await subgraph.queryFaultRecords({ where: { provider: ... } });

const providerMetrics = [
    { name: "Warm Storage (FOC)", successRate: 99.9, status: "Active" },
    { name: "External Prov A", successRate: 98.2, status: "Active" },
    { name: "External Prov B", successRate: 94.5, status: "Slow" }
];
```

**Scoring Guidelines**:
- **99%+ (🟢)**: Excellent. Standard for commercial storage.
- **95-99% (🟡)**: Acceptable. Occasional misses (e.g. maintenance).
- **<95% (🔴)**: Poor. Consider migrating data to a new provider.

## Step 4: Time-Series Data for Charts

Dashboards need charts. We can generate a "Daily Storage" chart by aggregating the `createdAt` timestamps of pieces:

```javascript
// The SDK helps convert epochs to Dates
import { epochToDate } from '@filoz/synapse-sdk';

// Simulate fetching pieces over time
const chartData = [
    { date: "2024-02-10", pieces: 13 },
    { date: "2024-02-11", pieces: 12 },
    // ...
];
```

In production, you would:
1. Call `subgraph.queryPieces({ where: { ... } })`
2. Map `piece.createdAt` (epoch) to a Date using `epochToDate()`
3. Group by day/week
4. Pass the result to Chart.js or Recharts

## Step 5: Cost Analytics

While the subgraph tracks history, the SDK's `payments` module gives real-time financial health:

```javascript
const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);
const dailyCost = Number(accountInfo.lockupRate) * EPOCHS_PER_DAY;

console.log(`Daily Burn Rate: ${dailyCost} USDFC`);
console.log(`Runway: ~${daysRemaining} days`);
```

This answers the CFO's question: "How much is this costing us?"

- **Burn Rate**: How fast you are spending funds on storage
- **Runway**: How long until your prepaid balance runs out

## Step 6: Deploying Your Own Subgraph

To get a live endpoint for your own data, you can deploy a subgraph to **Goldsky**:

1. **Install Goldsky CLI**: `curl -s https://goldsky.com/install.sh | bash`
2. **Login**: `goldsky login`
3. **Deploy**:
   ```bash
   goldsky subgraph deploy my-filecoin-stats/v1.0.0 --path . 
   ```
4. **Get Endpoint**: Goldsky will output the public URL (e.g., `https://api.goldsky.com/...`).
5. **Configure**: Set `SUBGRAPH_ENDPOINT` in your `.env.local` to this URL.

This gives you a dedicated, high-performance API for your specific storage contracts.

## Running the Analysis

```bash
cd historical-analysis/code
npm install
npm start
```

## Summary

You now have a complete historical analysis script using the **official Synapse SDK SubgraphService**!

- **Query**: Use `subgraph.queryDataSets()` for inventory
- **Analyze**: Use `subgraph.queryFaultRecords()` for reliability
- **Chart**: Aggregate timestamps for time-series UI
- **Plan**: Use payment metrics to forecast costs

Next, let's put it all together in the final specific module: **Building an Alert System**.
