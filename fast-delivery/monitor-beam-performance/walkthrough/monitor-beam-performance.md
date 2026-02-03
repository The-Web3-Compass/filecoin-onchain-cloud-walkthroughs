# Monitor Beam Performance: Metrics, Egress, and Alerts

In decentralized content delivery, visibility is power. When you enable **Beam CDN** on Filecoin, you're not just moving data; you're entering an incentivized market where performance correlates directly with reliability and cost-efficiency.

This guide explores the vital work of monitoring your Beam CDN deployments. You will learn how to track delivery health, manage egress costs, and set up an automated alerting system to ensure your decentralized infrastructure remains robust and budget-friendly.

---

## What You Will Learn

1. **The KPIs of Beam CDN**: Understanding TTFB, Throughput, and Success Rates in a decentralized context.
2. **Egress Tracking**: How to monitor data transfer and prevent "bill shock."
3. **Provider Performance**: Identifying high-performing storage providers in your delivery network.
4. **Automated Alerting**: Setting up thresholds for usage and performance degradation.
5. **Real-time Dashboarding**: Building a monitoring center for your Filecoin storage operations.

---

## Prerequisites

Before starting, ensure you have completed the following:
- [Enable Beam CDN](file:///home/sethuraman/Documents/Projects/Web3-Compass/filecoin-onchain-cloud-walkthroughs/fast-delivery/enable-beam/walkthrough/enable-beam.md) walkthrough.
- A Filecoin wallet with **USDFC** tokens on the Calibration Testnet.
- Node.js (v18+) installed.

---

## Understanding the Monitoring Stack

Unlike traditional centralized CDNs that provide black-box metrics, Filecoin Beam operates on a **Paid-per-Byte** model with cryptographic attestations. Monitoring this requires three distinct layers:

### 1. The Performance Layer (Metrics)
Tracks the Quality of Service (QoS). The primary metrics are:
- **Time to First Byte (TTFB)**: The delay between a request and the first bit of data arriving. Critical for user experience.
- **Throughput**: The speed of data transfer (MB/s).
- **Success Rate**: The percentage of retrieval requests that complete without error.

### 2. The Economic Layer (Costs)
Tracks your implementation's financial health.
- **Egress Usage**: Total GB transferred out of the network.
- **Spend Rate**: How quickly your USDFC balance is depleting.
- **Cost per GB**: The effective rate you are paying for retrieval.

### 3. The Defensive Layer (Alerts)
The "safety net" that monitors the other two layers and triggers notifications when behavior deviates from the norm.

---

## Step 1: Project Setup

Create a new directory for your monitoring project and initialize it.

```bash
mkdir monitor-beam && cd monitor-beam
npm init -y
```

### Dependencies

We need the Synapse SDK for interacting with Filecoin, `ethers` for unit conversions, and `express` for our dashboard.

```bash
npm install @filoz/synapse-sdk ethers dotenv express cors node-cron
```

Update your `package.json` to use ES Modules by adding `"type": "module"`.

---

## Step 2: Metrics Collection

The heart of monitoring is data collection. Since the SDK performs the operations, we wrap our storage calls with measurement logic to capture real-time performance.

### `metrics-collector.js` breakdown

This script performs a "prober" or "heartbeat" operation—a common pattern in SRE (Site Reliability Engineering) where you periodically perform a real operation to verify system health.

```javascript
// measuring TTFB and Throughput
const downloadStart = Date.now();
const downloadedData = await context.download(pieceCid);
const downloadEnd = Date.now();

const durationSeconds = (downloadEnd - downloadStart) / 1000;
const throughput = (downloadedData.length / 1024 / 1024) / durationSeconds;
```

> [!TIP]
> In production, you should record metrics for *every* user request, not just periodic probes. Use a middleware pattern to log egress and latency for all downloads.

---

## Step 3: Tracking Costs and Egress

On Filecoin Beam, you pay for data as it flows. Tracking your `Payment Account` balance over time allows you to calculate the **Burn Rate**.

### Cost Analysis Logic
In `cost-tracker.js`, we compare consecutive balance snapshots:
1. **Delta Balance**: `Previous Balance - Current Balance` = Amount spent in interval.
2. **Usage Correlation**: Divide the delta by the bytes transferred in that same interval to get your **Actual Cost per GB**.

```javascript
const dailySpendingRate = totalSpent / daysDiff;
const monthlyProjection = dailySpendingRate * 30;
```

---

## Step 4: Setting Up the Alert System

Monitoring is useless if nobody reacts to it. An automated alert system monitors your JSON data files and triggers warnings when thresholds are crossed.

### Configuring Thresholds
In `alert-config.json`, we define our "Service Level Objectives" (SLOs):

```json
{
  "egressThresholds": {
    "daily": { "critical": 10, "unit": "GB" }
  },
  "performanceThresholds": {
    "ttfb": { "warning": 2000, "critical": 5000, "unit": "ms" }
  }
}
```

If your average TTFB spikes above 5 seconds, it might indicate that the storage providers currently serving your data are under heavy load or that your geographic coverage needs optimization.

---

## Step 5: Building the Dashboard

The web dashboard provides a "Single Pane of Glass" view of your decentralized delivery network.

### Real-time Visualization
Using **Chart.js**, we plot:
- **Throughput Trends**: Allows you to see if performance degrades over time.
- **Latency Spikes**: Helps correlate performance drops with specific network events.
- **Alert Ticker**: A chronological log of system warnings.

To start the dashboard:
```bash
npm run dashboard
```
Visit `http://localhost:3000` to see your metrics in action.

---

## Production Considerations

### 1. Persistence
For this tutorial, we use JSON files. In a production environment, use a **Time-Series Database (TSDB)** like **Prometheus**, **InfluxDB**, or **TimescaleDB**. These are optimized for handling millions of timestamped data points.

### 2. Geometric Monitoring
Beam CDN performance varies by region. If your users are global, run metrics probes from multiple geographic regions (e.g., using AWS Lambda or GitHub Actions in different zones) to ensure high performance for all users.

### 3. Automated Re-balancing
If your monitoring detects a consistently failing provider or high latency for a specific PieceCID, you can trigger an automated **Re-upload** or **Self-Selection** of a different provider to maintain your SLOs.

---

## Troubleshooting

### "Payment account balance not decreasing"
Beam CDN uses optimistic delivery. There might be a slight delay between a download and the payment being settled on-chain. Wait a few minutes or perform a larger transfer (10MB+) to see the balance change clearly.

### "Metrics showing 0ms TTFB"
If you are downloading the same file repeatedly, it may be cached in the Beam CDN node or locally. For accurate monitoring, use different PieceCIDs or disable local caching during tests.

### "Dashboard charts are empty"
Ensure you have run `npm run collect` at least once to generate the initial `metrics.json` file. The charts require data points to render.

---

## Next Steps

Now that you can monitor your performance, you might want to explore:
- **Multi-Cloud Failover**: Using monitoring to switch between Filecoin and traditional S3 based on availability.
- **Governance via Alerts**: Automatically restricting user egress if they exceed specific cost quotas.
- **Historical Analysis**: Comparing Beam CDN performance against standard Filecoin retrieval over long periods.
