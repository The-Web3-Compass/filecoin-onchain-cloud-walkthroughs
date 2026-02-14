# Historical Analysis with Subgraph

The previous walkthrough showed you how to check the *current* state of your storage — is the provider online right now, is my balance healthy today. But production monitoring requires a different dimension: **what happened over time?**

A provider might be healthy today but had three outages last month. Your balance might be fine right now but it has been declining rapidly. A single proof failure doesn't matter, but a pattern of failures signals a deteriorating provider. These insights only emerge from historical data.

This walkthrough teaches you how to query Filecoin's historical blockchain data, transform it into time-series format for charts, calculate provider reliability scores, and perform cost analytics. These capabilities form the analytical backbone of the Storage Operations Dashboard.

## Prerequisites

Before proceeding, ensure you have completed:

- **Walkthrough 1 (Proof Monitoring)** — You should understand contract addresses, provider concepts, and payment health
- **Storage Basics Module** — Your payment account must be funded and at least one upload should exist

## What This Walkthrough Covers

1. **Transaction History** — Querying past messages via the Filfox API
2. **Provider Performance** — Calculating reliability scores from proof data
3. **Time-Series Generation** — Building chart-ready data structures
4. **Cost Analytics** — Tracking storage spending patterns
5. **Data Export** — Formatting data for dashboards
6. **GraphQL Patterns** — Subgraph query templates for advanced usage

## The Data Layer Problem

Why can't we just query the blockchain directly? Technically, you can. Every transaction, every proof submission, every balance change is recorded on the Filecoin blockchain. But blockchains are append-only ledgers optimized for writing, not reading.

If you want to answer "How many proofs did my provider submit last week?", you would need to:

1. Calculate the epoch range (current epoch minus ~20,160 epochs for 7 days)
2. Scan every block in that range for messages to/from the PDP Verifier contract
3. Filter for your specific provider
4. Count successes and failures
5. Wait minutes to hours for the query to complete

This is impractical for a dashboard that needs to load in seconds.

**Indexers** solve this problem. They continuously scan the blockchain and organize data into queryable databases. Filfox is one such indexer for Filecoin — it processes every block and exposes the data through a REST API. The Graph protocol takes this further with **subgraphs** — custom indexers you deploy to extract exactly the data you need, queryable via GraphQL.

This walkthrough uses the Filfox REST API for transaction history (real data) and demonstrates GraphQL query patterns for when you deploy your own subgraph.

## Understanding the Filfox API

Filfox is the primary block explorer for Filecoin. Beyond the web interface at [filfox.info](https://filfox.info), it provides a public REST API that returns JSON data about addresses, messages, deals, and more.

For the Calibration testnet, the API base URL is:
```
https://calibration.filfox.info/api/v1
```

Key endpoints relevant to monitoring:

| Endpoint | Returns |
|----------|---------|
| `/address/{addr}/messages` | Transaction history for an address |
| `/address/{addr}/balance-change` | Historical balance changes |
| `/deal/{dealId}` | Storage deal details |
| `/message/{cid}` | Individual message details |

No API key is required for basic queries, though rate limits apply. For production dashboards, consider self-hosting an indexer or using a paid API plan.

## Step 1: Create the Analysis Script

Create `index.js` in the `code/` directory:

```javascript
import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

dotenv.config({ path: '.env.local' });
dotenv.config();

const FILFOX_API = process.env.FILFOX_API_URL || 'https://calibration.filfox.info/api/v1';
```

The Filfox API URL is configurable via environment variables. This lets you switch between testnet and mainnet (`https://filfox.info/api/v1`) without code changes.

### Querying Transaction History

```javascript
const walletAddress = process.env.WALLET_ADDRESS || synapse.getPaymentsAddress();
const messagesUrl = `${FILFOX_API}/address/${walletAddress}/messages?pageSize=10`;
const response = await fetch(messagesUrl);
const data = await response.json();
```

We query the Filfox API for the 10 most recent messages associated with our address. The `walletAddress` defaults to the Payments contract address, which captures all storage payment activity. You can override this with `WALLET_ADDRESS` in your `.env.local` to track a specific wallet instead.

The API returns messages as an array of objects, each containing:

- `height`: The block number (epoch) when the message was included
- `method`: The contract method called (e.g., `PublishStorageDeals`, `SubmitWindowPoSt`, `AddBalance`)
- `from` / `to`: Sender and recipient addresses
- `value`: FIL amount transferred (if any)
- `cid`: The unique message identifier

For a dashboard, the `method` field is particularly valuable. It tells you what type of operation occurred:

| Method | Meaning |
|--------|---------|
| `PublishStorageDeals` | New storage deals were created |
| `SubmitWindowPoSt` | Provider submitted a proof of storage |
| `AddBalance` | Funds were deposited to a payment account |
| `ProveReplicaUpdates` | Provider sealed new data sectors |
| `WithdrawBalance` | Funds were withdrawn from a payment account |

### Fallback Data

```javascript
function showDemoTransactions() {
    console.log("Demonstration Transaction Data:");
    console.log("│ Block 2847291  │ PublishStorageDeals │ f1abc... → f02345...         │");
    // ...
}
```

The code includes a fallback that displays demonstration data when the API is unreachable. This is a pattern worth adopting in production monitoring: always show *something* rather than crashing when a data source fails. Stale data with a "last updated" timestamp is more useful than an error screen.

## Step 2: Provider Performance Metrics

```javascript
async function calculateProviderMetrics() {
    return [
        { name: "Warm Storage (FOC)", successRate: 99.7, avgResponse: "< 1 min", status: "Active" },
        { name: "Provider f02345", successRate: 98.2, avgResponse: "2-5 min", status: "Active" },
        { name: "Provider f06789", successRate: 94.5, avgResponse: "5-10 min", status: "Slow" }
    ];
}
```

In production, you would calculate these metrics by querying proof submission events for each provider over a period of time. The formula is:

```
Reliability = (Successful Proofs / Total Expected Proofs) × 100
```

**Why "expected" proofs?** Because a provider might have zero failures but simply be new (few proofs submitted). You want to know: *of all the proofs they should have submitted, how many actually arrived?*

For WindowPoSt, the expected count is one proof per sector per day. A provider with 100 sectors should submit approximately 100 proofs per day. If they submitted 98, their daily reliability is 98%.

**Scoring Guidelines for Dashboards**:

| Score | Status | Recommended Action |
|-------|--------|-------------------|
| 99%+ | 🟢 Excellent | No action needed |
| 97-99% | 🟡 Acceptable | Monitor closely |
| 95-97% | 🟠 Degraded | Investigate, consider alternatives |
| <95% | 🔴 Poor | Migrate data to a different provider |

The status icons (🟢 🟡 🔴) provide instant visual feedback in a dashboard without requiring users to read numbers.

## Step 3: Time-Series Data for Charts

```javascript
function generateTimeSeriesData() {
    const data = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        const baseProofs = 48 + Math.floor(Math.random() * 20);

        data.push({
            date: date.toISOString().split('T')[0],
            proofs: baseProofs,
            successful: baseProofs - Math.floor(Math.random() * 2),
            failures: Math.floor(Math.random() * 2)
        });
    }

    return data;
}
```

This function generates a 7-day time-series array. In production, you would replace the random generation with actual data from your indexer database.

The output format is designed for charting libraries like **Chart.js**, **Recharts**, or **D3.js**:

```json
{
    "date": "2024-01-25",
    "proofs": 52,
    "successful": 51,
    "failures": 1
}
```

Each object represents one day. A line chart would plot `proofs` over `date`. A stacked bar chart could show `successful` vs `failures`. An area chart could visualize the gap between expected and actual proofs.

**Base proof count**: The code uses `48 + random(0-20)` which simulates a provider managing 2-3 sectors with WindowPoSt once per day per sector, plus PDP proofs. Real numbers vary dramatically based on provider size — a large provider might submit thousands of proofs daily.

## Step 4: Cost Analytics

```javascript
async function analyzeCosts(synapse) {
    const balance = await synapse.payments.balance(TOKENS.USDFC);
    const currentBalance = (Number(balance) / 1e18).toFixed(4);

    const estimatedDeposited = (parseFloat(currentBalance) + 0.5).toFixed(4);
    const totalSpent = (parseFloat(estimatedDeposited) - parseFloat(currentBalance)).toFixed(4);

    return {
        totalDeposited: estimatedDeposited,
        currentBalance: currentBalance,
        totalSpent: totalSpent,
        avgCostPerUpload: "0.001"
    };
}
```

Cost analytics answer the business question: "How much is this costing us and where is the money going?"

The code calculates:

- **Total Deposited**: Sum of all `AddBalance` transactions. In production, query the Filfox API for `AddBalance` messages targeting your payment account.
- **Current Balance**: Live query from the SDK.
- **Total Spent**: The difference. If you deposited 5 USDFC and have 4.5 remaining, you have spent 0.5 USDFC.
- **Average Cost Per Upload**: Total spent divided by number of uploads. Track upload count in your application database.

**Cost Breakdown**: Storage costs on Filecoin break down into three components:

1. **Storage fees** (~70%): The actual payment to the provider for storing your data over time
2. **Gas costs** (~20%): Transaction fees for blockchain operations (creating deals, submitting proofs)
3. **Platform fees** (~10%): Service charges from the Filecoin Onchain Cloud platform

These percentages are approximate and vary by network conditions and data volume.

## Step 5: Exporting Dashboard Data

```javascript
const exportData = {
    timestamp: new Date().toISOString(),
    providerMetrics: providerMetrics,
    timeSeriesData: chartData,
    costAnalytics: costAnalytics
};
```

The export object aggregates all analytics into a single JSON payload. This is what an API endpoint like `GET /api/analytics/overview` would return.

The walkthrough demonstrates three export formats:

| Format | Use Case |
|--------|----------|
| **JSON** | REST API responses for web dashboards |
| **CSV** | Spreadsheet analysis and reporting |
| **Prometheus** | Metrics collection for Grafana/alerting |

For Prometheus format, you would expose metrics as:
```
filecoin_provider_reliability{provider="WarmStorage"} 99.7
filecoin_account_balance{token="USDFC"} 4.5231
filecoin_proof_failures_total{provider="WarmStorage"} 3
```

This allows integration with existing DevOps monitoring stacks.

## Step 6: GraphQL Subgraph Patterns

The walkthrough includes example GraphQL queries for subgraph integration:

```graphql
query StorageDeals($address: String!, $after: Int!) {
  storageDeals(
    where: { client: $address, startEpoch_gt: $after }
    orderBy: startEpoch
    orderDirection: desc
    first: 100
  ) {
    dealId
    pieceCid
    pieceSize
    provider
    startEpoch
    endEpoch
    pricePerEpoch
  }
}
```

This query retrieves storage deals for a specific client address after a given epoch. The `first: 100` pagination ensures manageable response sizes.

**Deploying a Subgraph**: For custom monitoring, you would:

1. Define a subgraph schema targeting the Filecoin contracts you care about
2. Write mappings that transform on-chain events into your schema
3. Deploy to **Goldsky** or a self-hosted **Graph Node**
4. Query via the provided GraphQL endpoint

This is more work upfront but gives you exactly the data shapes you need, with millisecond query performance regardless of how much historical data exists.

## Running the Analysis

```bash
cd historical-analysis/code
npm install
npm start
```

Expected output:

```
Historical Analysis Demo

Query and analyze Filecoin storage history for dashboards.

=== Step 1: SDK Initialization ===

Connected. Balance: 4.5231 USDFC

=== Step 2: Query Transaction History ===

Querying history for: 0x8c91...

Recent Transactions:
┌──────────────────────────────────────────────────────────────────────┐
│ Block 2847291  │ PublishStorageDeals │ f1abc... → f02345...         │
│ Block 2847188  │ SubmitWindowPoSt    │ f02345... → f05...           │
└──────────────────────────────────────────────────────────────────────┘

=== Step 3: Provider Performance Metrics ===

Provider Reliability Analysis:
┌─────────────────────────────────────────────────────────────────────┐
│ Provider                │ Success Rate │ Avg Response │ Status      │
│ Warm Storage (FOC)      │ 99.7%        │ < 1 min      │ 🟢 Active   │
│ Provider f02345         │ 98.2%        │ 2-5 min      │ 🟢 Active   │
│ Provider f06789         │ 94.5%        │ 5-10 min     │ 🔴 Slow     │
└─────────────────────────────────────────────────────────────────────┘

=== Step 4: Time-Series Data for Charts ===

Proof Submissions (Last 7 Days):
┌────────────────────────────────────────────────────────────────┐
│ 2024-01-19 │   52 proofs │ ██████████                       │
│ 2024-01-20 │   48 proofs │ █████████                        │
│ ...        │             │                                  │
└────────────────────────────────────────────────────────────────┘

✅ Historical Analysis Complete!
```

## Production Considerations

### Background Indexing

Do not run historical queries synchronously when a user loads your dashboard. Instead:

1. Run a background "indexer" script on a cron schedule (every 15-60 minutes)
2. Store aggregated results in your own database (PostgreSQL, Redis, or SQLite)
3. Serve the dashboard from your database for sub-second load times

This architecture decouples data collection from presentation, making both more reliable.

### Data Retention

Not all historical data has equal value. Consider tiered retention:

| Period | Granularity | Storage |
|--------|-------------|---------|
| Last 24 hours | Per-epoch (30s) | Hot cache (Redis) |
| Last 7 days | Per-hour | Database |
| Last 30 days | Per-day | Database |
| Older | Per-week | Archive/delete |

This prevents your monitoring database from growing unbounded while keeping recent data at high resolution.

### Rate Limiting

Public APIs like Filfox have rate limits. Batch your queries and cache responses. If you need real-time data, consider running your own Lotus node or subscribing to a WebSocket provider for live block events.

## Troubleshooting

**"Filfox API query failed"**

The public API may be temporarily unavailable or rate-limited. The script falls back to demonstration data automatically. Wait a few minutes and retry. For production, implement retry with exponential backoff.

**"No recent messages found"**

If your payment account is new or has no recent activity, the API correctly returns empty results. Upload more files or perform payment operations to generate transaction history.

**Balance shows as 0**

Re-fund your payment account via the `payment-management` module in `storage-basics`.

## Conclusion

You now have the tools to build the analytical layer of a Storage Operations Dashboard. Transaction history provides an activity feed. Provider metrics quantify reliability. Time-series data powers charts. Cost analytics track spending.

Combined with the real-time queries from Walkthrough 1, you can build a dashboard that answers both "what's happening now?" and "how are things trending?" The final walkthrough adds the third dimension: "what should I be worried about?" — by building an alert system that proactively notifies you when metrics cross dangerous thresholds.
