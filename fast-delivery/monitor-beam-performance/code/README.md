# Beam CDN Monitoring Demo

This project demonstrates how to monitor Filecoin Beam CDN performance, track egress costs, and set up an automated alerting system.

## Components

1.  **`metrics-collector.js`**: Probes the network to collect TTFB, throughput, and success rate data.
2.  **`cost-tracker.js`**: Monitors your payment account balance and projects monthly spending.
3.  **`alert-system.js`**: Validates collected data against thresholds defined in `alert-config.json`.
4.  **`dashboard.js`**: Serves a web-based monitoring dashboard.
5.  **`monitor-all.js`**: Runs the full metrics/cost/alert pipeline in one command.

## Setup

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Configure environment**:
    Copy `.env.example` to `.env` and add your `PRIVATE_KEY`.
    ```bash
    cp .env.example .env
    ```

3.  **Optional: Configure alerts**:
    Edit `alert-config.json` to change thresholds for your specific needs.

## Usage

### 1. Run the Monitoring Pipeline
To collect fresh metrics and check for alerts:
```bash
npm run monitor
```

### 2. View the Dashboard
To start the web dashboard:
```bash
npm run dashboard
```
Then open `http://localhost:3000` in your browser.

### 3. Individual Commands
- `npm run collect`: Only collect performance metrics.
- `npm run costs`: Only analyze costs and projections.
- `npm run alerts`: Only perform a manual alert check.

## Automated Monitoring (Recommended)
In a production environment, you would run the monitor script via a cron job:
```cron
# Run monitoring every 15 minutes
*/15 * * * * cd /path/to/monitor-beam-performance/code && npm run monitor >> monitor.log 2>&1
```

## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
