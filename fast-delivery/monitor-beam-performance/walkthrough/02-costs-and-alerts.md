# Part 2: Costs, Egress, and Automated Alerts

## The Financial Firewall

In traditional cloud storage (AWS/GCP), you are often flying blind. You deploy a service, and 30 days later, you get a PDF invoice. If you made a mistake—like leaving a high-throughput lambda open—you don't find out until you owe Amazon $5,000. This is the **Latency Loop of Death**.

Filecoin Beam deletes this loop. Because you pay for data packet-by-packet in real-time, you have a superpower that Web2 architects can only dream of: **Micro-Auditing**.

You can know your burn rate *to the second*. You can stop a financial leak *the millisecond* it starts.

In **Part 1**, we built the eyes (Monitoring). In **Part 2**, we will build the shield. We are going to construct a **Financial Firewall** that makes it mathematically impossible to blow your budget.

---

## Prerequisites

- Completed [Part 1: Performance Monitoring](./01-performance-monitoring.md)
- A funded payment account (from Part 1)
- Accumulated metrics data (run `npm run collect` several times to generate a baseline)

---

## Step 1: Implementing Cost Tracking

We need a script that acts as your CFO. It must answer the question: **"Are we sustainable?"**

To answer this, we cannot just look at the wallet balance. We need to correlate **Value Out** (USDFC Spent) with **Value In** (GB Delivered).

### The Code

```javascript
// From cost-tracker.js

function analyzeCosts(snapshots, metrics) {
    if (snapshots.length < 2) return { /* defaults */ };

    // 1. Calculate Total Spent
    const firstSnapshot = snapshots[0];
    const lastSnapshot = snapshots[snapshots.length - 1];
    const totalSpent = firstSnapshot.balance - lastSnapshot.balance;

    // 2. Calculate Cost Per GB
    let costPerGB = 0;
    if (metrics && metrics.summary.totalEgressGB > 0) {
        costPerGB = totalSpent / metrics.summary.totalEgressGB;
    }

    // 3. Calculate Spending Rate
    const firstDate = new Date(firstSnapshot.timestamp);
    const lastDate = new Date(lastSnapshot.timestamp);
    const daysDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
    
    const dailySpendingRate = daysDiff > 0 ? totalSpent / daysDiff : 0;
    const monthlyProjection = dailySpendingRate * 30;

    return {
        totalSpent,
        costPerGB,
        dailySpendingRate,
        monthlyProjection,
        daysCovered: daysDiff
    };
}
```

### Under the Hood

**1. The Electric Meter Method**
Notice that we don't try to calculate costs by summing up every single file download in real-time. That would be like trying to calculate your electric bill by writing down every time you flip a light switch. You'll miss something, and your math will drift.
Instead, we use the **Differential Snapshot** method. We check the balance at `T1`, and again at `T2`. The difference is the *absolute truth* of what left your wallet. It captures everything—storage deals, retrieval fees, and even the tiny gas fees you paid for the transactions.

**2. The Efficiency Metric (Cost Per GB)**
This is the most important number for your business model.
$$ \text{Cost per GB} = \frac{\text{Total Spent}}{\text{Total GB Delivered}} $$
If this line starts trending up, it’s a warning. It means either the network gas fees are spiking (external), or your retrieving data inefficiently (internal)—perhaps fetching 1GB files when users only need the first 10KB.

**3. The Runway**
The `monthlyProjection` isn't just a number; it's a countdown. It answers the one question your boss cares about: *"How long until the lights go out?"* We extrapolate your current 24h burn rate to a 30-day window.

### Production Considerations

**Persistence**: The example script stores snapshots in a JSON file (`costs.json`). In a production environment, you should write these snapshots to a reliable database (Postgres or TimescaleDB) to prevent data loss if the server restarts.

**Currency Volatility**: While USDFC is a stablecoin, you also pay gas fees in tFIL/FIL. A robust cost tracker should track both currencies separately to give a complete picture of operational overhead.

---

## Step 2: The Alert Logic

Manual monitoring is insufficient for production systems. You cannot stare at a terminal 24/7. We need an automated watchdog.

We will implement a **Tripwire System** that monitors your metrics against a set of Service Level Objectives (SLOs).

### 1. Defining the Rules (`alert-config.json`)

We define our "Red Lines" in a simple configuration file. This decouples our policy from our code.

```json
{
  "egressThresholds": {
    "daily": { 
      "warning": 5,    // Alert if > 5GB/day (Notification)
      "critical": 10   // Alert if > 10GB/day (Wake up engineer)
    }
  },
  "costThresholds": {
    "daily": { 
      "critical": 0.5  // Stop operations if > 0.5 USDFC/day
    }
  },
  "performanceThresholds": {
    "ttfb": { 
      "critical": 2000 // If latency > 2s, experience is degraded
    }
  }
}
```

### 2. The Watchdog Logic (`alert-system.js`)

The alerting script acts as a stateless function. It reads the config, reads logs, and checks for violations.

### The Code

```javascript
// From alert-system.js

function checkThresholds(config, metrics, costs) {
    const alerts = [];
    const now = new Date().toISOString();

    // 1. Check Egress (Viral Video Protection)
    const dailyEgress = metrics.summary.totalEgressGB;
    if (dailyEgress > config.egressThresholds.daily.critical) {
        alerts.push({
            timestamp: now,
            type: 'CRITICAL',
            category: 'Egress',
            message: `Daily egress (${dailyEgress.toFixed(2)} GB) exceeds critical threshold`
        });
    }

    // 2. Check Costs (Runway Protection)
    if (costs && costs.analysis) {
        const dailySpend = costs.analysis.dailySpendingRate;
        if (dailySpend > config.costThresholds.daily.critical) {
            alerts.push({
                timestamp: now,
                type: 'CRITICAL',
                category: 'Cost',
                message: `Daily cost (${dailySpend.toFixed(2)} USDFC) exceeds limit`
            });
        }
    }

    // 3. Check Performance (UX Protection)
    if (metrics.summary.avgTTFB > config.performanceThresholds.ttfb.critical) {
        alerts.push({
            timestamp: now,
            type: 'CRITICAL',
            category: 'Performance',
            message: `High Latency Detected: ${metrics.summary.avgTTFB}ms`
        });
    }
    
    return alerts;
}
```

### Under the Hood

**1. Statelessness is Resilience**
Notice that our alert function doesn't remember anything. It takes `snapshot` and `config` and outputs `alerts`. This is intentional. If your monitoring server crashes and restarts, it instantly picks up exactly where it left off. It doesn't need to "replay" history.

**2. The "Viral Video" Protection (Egress)**
This check isn't about money; it's about architecture. If a 1GB file suddenly gets downloaded 10,000 times, you haven't just spent money—you're likely saturating your bandwidth limits. This alert buys you time to spin up more CDN nodes or cache the content at the edge before your service degrades.

**3. The "User Trust" Protection (TTFB)**
We alert on TTFB because latency is the silent killer of churn. A user will forgive a generic error page, but they will *not* forgive a video that buffers for 10 seconds. If this triggers, it means your storage providers are too slow or too far away. You need to re-upload your content to a new region/provider explicitly.

### Production Considerations

**Alert Fatigue**: If you set thresholds too low, you will get spammed with alerts and start ignoring them. Tune your `warning` levels to be informative and `critical` levels to be actionable.

**Integration**: In a real setup, pushing an object to an array isn't enough. You would hook this into:
- **Slack/Discord**: For team visibility.
- **PagerDuty/OpsGenie**: For waking up on-call engineers.
- **Email**: For weekly summaries.

### 3. Verify Defenses

Run the alert system:

```bash
npm run alerts
```

**Healthy Output:**
```
✅ All systems within normal operating thresholds.
```

**Simulate a Violation:**
Edit `alert-config.json` and set `ttfb.critical` to `10` ms (an impossible standard). Run it again.

```
⚠️  1 alert(s) triggered:

[CRITICAL] Performance: High Latency Detected: 145ms
```

---

## Architecture Deep Dive: The Circuit Breaker

In this tutorial, a "CRITICAL" alert just prints text to the screen. In a real-world financial application, this is insufficient.

If your cost alert triggers (e.g., "Daily Spend > 50 USDFC"), your system needs to stop the bleeding **immediately**. This is known as the **Circuit Breaker Pattern**.

### How it works on Filecoin
Because Filecoin permissions are programmable smart contracts, you can revoke spending authority programmatically.

**The Code**

```javascript
async function triggerCircuitBreaker(operatorAddress) {
    console.log("🚨 EMERGENCY: TRIGGERING CIRCUIT BREAKER");
    
    // We set the allowance to ZERO.
    // This transaction effectively freezes the operator's ability to charge you.
    const tx = await synapse.payments.setAllowance(
        operatorAddress,
        TOKENS.USDFC,
        0, // Rate Allowance = 0
        0, // Lockup Allowance = 0
        0  // Expiration = Now
    );
    
    await tx.wait();
    console.log("✅ Circuit Breaker Active. No further charges possible.");
}
```

**What's Happening**

1.  **Instant Freeze**: `setAllowance(0, 0, 0)` is the nuclear option. It tells the Filecoin Payment channel "This operator can spend 0 tokens starting now."
2.  **On-Chain Enforcement**: This isn't a request; it's a cryptographic command. Even if the storage provider continues sending data, the Payment Contract will reject their claims.
3.  **No Human in the Loop**: This function runs automatically. By the time a DevOps engineer wakes up, the financial leak has already been plugged.

**Why this is powerful:**
In AWS, if you get DDoS'd, you might rely on "Budget Alerts" which are often delayed by hours. By the time you get the email, you've lost thousands of dollars. On Filecoin, you can run this check every minute. The moment a threshold is crossed, the wallet clamps shut.

This capability transforms "Budgeting" from a passive administrative task into an active cybersecurity defense.

---

## Next Steps

We have established visibility (Metrics) and control (Costs/Alerts). But we are still operating via CLI.

In **[Part 3: Real-Time Visualization](./03-realtime-dashboard.md)**, we will aggregate all this data into a **"Mission Control" Dashboard**. We will also discuss how to scale this architecture from a single laptop to a global fleet of geometric probes.

## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
