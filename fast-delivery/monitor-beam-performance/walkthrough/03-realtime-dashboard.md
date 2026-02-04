# Part 3: Real-Time Visualization & Observability

## From Monitoring to Observability

There is a subtle but profound difference between **Monitoring** and **Observability**.

**Monitoring** tells you *if* the system is broken. "Alert: Latency is high."
**Observability** allows you to understand *why* it is broken. "Latency is high because Peer A in Frankfurt is overloaded."

In **Part 1 & 2**, we built the sensor network. We have metrics, costs, and basic alerts. But raw data in JSON files is cognitively expensive. If you are woken up at 3 AM by an incident, you do not want to grep through logs. You want a **Single Pane of Glass**.

In this final walkthrough, we will construct a **Mission Control** interface. We are not just making "charts"—we are building a decision-support system. Every pixel on the screen must answer a specific operational question.

---

## Prerequisites

- Completed [Part 1: Performance Monitoring](./01-performance-monitoring.md) and [Part 2: Costs & Alerts](./02-costs-and-alerts.md)
- Existing `metrics.json` and `costs.json` data generated from previous steps

---

## Step 1: The API Layer

We will build a lightweight, specialized monitoring server. We intentionally avoid heavy frameworks like React or Next.js here. A monitoring tool should be simpler and more robust than the system it monitors.

**The Stack**:
1.  **Backend**: `Express.js`. A stateless API layer that exposes our log files as JSON endpoints.
2.  **Frontend**: `HTML5` + `Chart.js`. A polling client that visualizes the stream.
3.  **Data Flow**: `Prober` → `JSON Logs` → `Express API` → `Dashboard UI`.

### The Code

```javascript
// dashboard.js

const app = express();
const METRICS_FILE = join(__dirname, 'data', 'metrics.json');
const COST_FILE = join(__dirname, 'data', 'costs.json');

// 1. Metrics Endpoint
app.get('/api/metrics', (req, res) => {
    if (existsSync(METRICS_FILE)) {
        // Serve raw file content
        res.json(JSON.parse(readFileSync(METRICS_FILE, 'utf-8')));
    } else {
        res.json({ operations: [], summary: {} });
    }
});

// 2. Costs Endpoint
app.get('/api/costs', (req, res) => {
    if (existsSync(COST_FILE)) {
        res.json(JSON.parse(readFileSync(COST_FILE, 'utf-8')));
    } else {
        res.json({ analysis: {} });
    }
});

app.listen(3000, () => console.log('🚀 Mission Control Online at port 3000'));
```

### Under the Hood

**1. Heavy Backend, Light Frontend? No.**
We intentionally avoided React, Vue, or Next.js here. Why? Because a monitoring tool must be simpler than the system it monitors. If your complex app goes down, you don't want your monitoring dashboard to *also* go down because of a React hydration error. We use vanilla HTML/Express because it is **bulletproof**.

**2. The Air Gap**
By exposing a clean JSON API (`/api/metrics`), we decouple the data from the view. This means you could swap out our simple HTML dashboard for a Grafana instance, a terminal UI, or even a customized Apple Watch app later. The API is the source of truth; the dashboard is just one way to look at it.

**3. Direct-to-Disk (For Now)**
We are reading directly from the filesystem (`readFileSync`). In a massive scale app, this blocks the event loop. For a monitoring tool checking status every 5 seconds? It's perfect. It removes the complexity of managing a database connection pool. Sometimes, "dumb" code is the smartest engineering decision.

### Production Considerations

**Authentication**: The `/api/costs` endpoint exposes your financial data. In production, you MUST protect this route. Basic Auth (`express-basic-auth`) or an internal-only network restriction is essential to prevent leaking your financial runway to the public.

**Caching**: For scaling, you wouldn't read from disk on every request. You would cache the JSON in memory for 60 seconds (using `node-cache` or similar) to protect the file system from read contention.

---

## Step 2: Visualization Philosophy

We don't just want "charts". We want answers. We will design three specific views to address three specific anxieties of a DevOps engineer.

### View 1: The Pulse (Performance)
**The Anxiety**: "Is the network slow right now?"
**The Visualization**: A live line chart of **Time to First Byte (TTFB)** over the last hour.
- **Why**: An average number (e.g., "Avg TTFB: 200ms") hides outliers. A line chart reveals instability. If you see a "sawtooth" pattern, it means a provider is struggling under load. If you see a flat line, the system is stable.

### View 2: The Runway (Economics)
**The Anxiety**: "Are we about to go broke?"
**The Visualization**: A "Days Remaining" countdown timer next to a daily spend bar chart.
- **Why**: "You have 10 USDFC" is abstract. "You have 4 days of runway" is actionable urgency. If this number drops below 7 days, the dashboard UI should physically turn red to command attention.

### View 3: The Ticker (History)
**The Anxiety**: "What happened while I was asleep?"
**The Visualization**: A scrolling log of historical alerts.
- **Why**: Transient errors are ghosts. A 5-second outage might vanish from the live chart before you blink. The ticker relies on the "Black Box" principle: it records the event forever so you can analyze it later.

### The Code

While we are using a standard HTML/JS frontend, the logic mapping is critical:

```javascript
// dashboard.html snippet (conceptual)

// Mapping "Pulse"
const timeLabels = metrics.operations.map(op => formatTime(op.timestamp));
const ttfbData = metrics.operations.map(op => op.ttfb);

// Mapping "Runway"
const dailyBurn = costs.analysis.dailySpendingRate;
const daysLeft = costs.analysis.daysCovered;
if (daysLeft < 7) {
    document.getElementById('runway-display').classList.add('critical-alert');
}
```

This simple mapping ensures that our data strictly serves the answer we are looking for.

---

## Step 3: Launching Mission Control

Initialize the dashboard:

```bash
npm run dashboard
```

**Console Output:**
```
======================================================================
  Filecoin Beam: Mission Control
======================================================================
🚀 Dashboard active at http://localhost:3000
   Press Ctrl+C to terminate.
```

Open `http://localhost:3000` in your browser.

> **Interactive Experiment**: Key to understanding observability is seeing cause and effect.
> 1. Keep the dashboard open on one monitor.
> 2. Open a terminal on another.
> 3. Run `npm run collect`.
> 4. **Watch the chart update.** Seeing your manual action reflected instantly in the visualization closes the feedback loop in your mind.

---

## Production Strategy: Scaling Up

You now have a functional monitoring stack on your local machine. But Beam CDN is a global network. How do we take this architecture from "Localhost" to "Global Scale"?

### 1. Geometric Monitoring (The "Observer Effect")

**The Problem**: If you monitor from New York, the network looks fast to you. But your users in Tokyo might be suffering 2-second latency. Your local dashboard is lying to you by omission.

**The Solution**: Distributed Probing.
You should deploy the `metrics-collector.js` script as a lightweight function (AWS Lambda / Cloudflare Worker) in multiple regions:
- `us-east` (N. Virginia)
- `eu-central` (Frankfurt)
- `ap-northeast` (Tokyo)
- `sa-east` (São Paulo)

These probes should all report back to a central database. Your dashboard then evolves from a single line chart to a **Global Heatmap**, showing green in Europe and potentially red in Asia.

### 2. Time-Series Databases

**The Problem**: JSON files (like `metrics.json`) are not databases. As you pile up months of data, reading the file will become slow and eventually crash the server.

**The Solution**: InfluxDB or Prometheus.
These are specialized databases designed for "Time Series" data. They can ingest millions of metrics per second and calculate averages (p95, p99) instantly.
In your `metrics-collector.js`, replace `fs.writeFileSync` with a database push:

```javascript
// Production Monitoring Pattern
influx.writePoints([{
  measurement: 'ttfb',
  tags: { region: 'us-east-1', providerId: '0x123...' },
  fields: { value_ms: 145 },
}]);
```

### 3. Automated Failover (Self-Healing)

**The Holy Grail**: The best dashboard is one you never have to look at because the system fixes itself.

We can link our **Alerts** (Part 2) to our **Configuration**.

1.  **Detect**: The Prober in Tokyo reports high latency for Provider A.
2.  **verify**: The Alert System confirms this is a sustained issue, not a blip.
3.  **Act**: The system automatically updates the Beam Config to **ban** Provider A from the routing table.
4.  **Recover**: Traffic shifts to Provider B.
5.  **Restore**: The Prober continues checking Provider A in the background. When it recovers, it is automatically unbanned.

This is **Antifragile** infrastructure. It doesn't just resist failure; it adapts to it.

---

## Conclusion

You have completed the **Monitor Beam Performance** series.

You started with a black box. You built a **Sensor** (Part 1). You built a **Brain** (Part 2). And now you have built a **Face** (Part 3).

This observability stack gives you the confidence to run decentralized infrastructure in production. You are no longer guessing; you are operating.

**Where to next?**
Now that you can see the performance, put it to the test. Check out the **[Streaming Large Files](../../streaming-large-files/walkthrough/streaming-large-files.md)** module to stress-test your new monitoring system with high-bandwidth video traffic.
