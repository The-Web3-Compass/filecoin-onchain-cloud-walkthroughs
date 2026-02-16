# Building an Alert System

A dashboard tells you what is happening. An alert system tells you what went wrong — often before you even open the dashboard. In production infrastructure, the difference between "we noticed the outage after 3 hours" and "we received an alert within 5 minutes" often determines whether an incident is a minor blip or a major failure.

This walkthrough teaches you to build a monitoring alert system for Filecoin storage. You will define alert rules with severity levels, send real webhook notifications (to Discord, Slack, or any HTTP endpoint), configure email alerts, implement SLA monitoring, and prevent "alert fatigue" through deduplication. Combined with the real-time queries from Walkthrough 1 and the historical analysis from Walkthrough 2, this completes the building blocks for a production-grade Storage Operations Dashboard.

## Prerequisites

Before proceeding, ensure you have completed:

- **Walkthrough 1 (Proof Monitoring)** — Understanding of SDK queries for balance, contracts, and provider status
- **Walkthrough 2 (Historical Analysis)** — Understanding of provider reliability scores and cost tracking
- **External Service (Optional but Recommended)**: A webhook URL from [webhook.site](https://webhook.site) for testing notifications

## What This Walkthrough Covers

1. **Alert Configuration** — Setting up notification channels (console, webhook, email)
2. **Alert Rules** — Defining conditions, thresholds, and severity levels
3. **Condition Checking** — Evaluating rules against live data
4. **Webhook Integration** — Sending real HTTP POST notifications
5. **Email Alerts** — SMTP integration with nodemailer
6. **SLA Monitoring** — Tracking provider compliance against targets
7. **Alert Deduplication** — Preventing notification spam
8. **Continuous Monitoring** — Polling loop patterns for production

## Why Alerts Matter

Consider three scenarios:

**Scenario 1: No monitoring.** Your payment account runs out of USDFC on a Saturday night. By Monday morning, the provider has dropped your storage deals because no payment arrived during settlement. You discover the issue when users report missing data. Recovery requires re-uploading everything — if you still have the original files.

**Scenario 2: Dashboard only.** You built a beautiful dashboard showing balance and provider status. But nobody was watching at 2 AM when the balance hit zero. Same outcome as Scenario 1, just with better post-mortem data.

**Scenario 3: Alert system.** At 3 PM Friday, a webhook fires to your Slack channel: "⚠️ Low balance warning: 0.42 USDFC remaining." You top up the account before leaving for the weekend. Nothing breaks. Nobody notices. That is the point.

Alerts convert monitoring data into actionable notifications. The key is tuning them correctly: too sensitive and you get alert fatigue (ignoring all alerts); too conservative and you miss real problems.

## Alert Severity Levels

The system uses three severity levels, each mapped to different notification channels:

| Severity | Meaning | Notification |
|----------|---------|--------------|
| **warning** | Attention needed soon, not urgent | Console + Webhook |
| **error** | Something is broken, needs fixing | Console + Webhook |
| **critical** | Immediate action required | Console + Webhook + Email |

Only critical alerts trigger email notifications. This ensures your inbox isn't flooded with minor warnings while genuine emergencies always reach you.

## Step 1: Create the Alert Script

Create `index.js` in the `code/` directory:

```javascript
import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import nodemailer from 'nodemailer';

dotenv.config({ path: '.env.local' });
dotenv.config();

const LOW_BALANCE_THRESHOLD = parseFloat(process.env.LOW_BALANCE_THRESHOLD || "1.0");
const CRITICAL_BALANCE_THRESHOLD = parseFloat(process.env.CRITICAL_BALANCE_THRESHOLD || "0.1");
```

The thresholds are configurable via environment variables. This matters because different applications have different cost profiles: a system uploading 100 files per day needs more buffer than one uploading weekly. Setting thresholds in environment allows operators to tune alerting without code changes.

### Alert History for Deduplication

```javascript
const alertHistory = new Map();
```

This in-memory Map tracks when each alert was last sent. When an alert condition persists (like a consistently low balance), you don't want a notification every 5 minutes for hours on end. The history enables "cooldown" periods where the same alert is suppressed after initial delivery.

In production, you would store this in Redis or a database so it persists across process restarts.

## Step 2: Configuring Alert Channels

```javascript
const alertChannels = {
    webhook: {
        enabled: !!process.env.WEBHOOK_URL,
        url: process.env.WEBHOOK_URL
    },
    email: {
        enabled: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        recipient: process.env.ALERT_EMAIL
    },
    console: {
        enabled: true
    }
};
```

Each channel is independently enabled based on which environment variables are present. This "feature flag" pattern means:

- **Console** always works — even without any external services configured
- **Webhook** activates when `WEBHOOK_URL` is set
- **Email** activates when SMTP credentials are provided

This progressive enhancement approach means the script runs successfully with zero configuration (console only) but gains capabilities as you add credentials.

### Setting Up Webhook Testing

To test webhook notifications with real HTTP requests:

1. Visit [webhook.site](https://webhook.site)
2. You will receive a unique URL (e.g., `https://webhook.site/abc-123-def`)
3. Copy this URL into your `.env.local` as `WEBHOOK_URL`
4. When the alert triggers, you will see the JSON payload appear in real-time on webhook.site

For production, replace with your Slack, Discord, or PagerDuty webhook URL. Most notification services accept JSON via webhook.

### Setting Up Email Testing

For email testing without a real mail server:

1. Visit [ethereal.email](https://ethereal.email)
2. Click "Create Ethereal Account"
3. Copy the SMTP credentials into your `.env.local`
4. Sent emails appear in the Ethereal inbox without actually being delivered

This prevents accidentally sending alerts to real addresses during development.

## Step 3: Defining Alert Rules

```javascript
const alertRules = [
    {
        id: 'low_balance',
        name: 'Low Balance Warning',
        severity: 'warning',
        condition: async (ctx) => {
            const balance = Number(ctx.balance) / 1e18;
            return balance < LOW_BALANCE_THRESHOLD && balance >= CRITICAL_BALANCE_THRESHOLD;
        },
        message: (ctx) => `Balance is low: ${(Number(ctx.balance) / 1e18).toFixed(4)} USDFC`
    },
    {
        id: 'critical_balance',
        name: 'Critical Balance Alert',
        severity: 'critical',
        condition: async (ctx) => {
            const balance = Number(ctx.balance) / 1e18;
            return balance < CRITICAL_BALANCE_THRESHOLD;
        },
        message: (ctx) => `CRITICAL: Balance below ${CRITICAL_BALANCE_THRESHOLD} USDFC! Current: ${(Number(ctx.balance) / 1e18).toFixed(4)} USDFC`
    },
    {
        id: 'operator_not_approved',
        name: 'Operator Not Approved',
        severity: 'error',
        condition: async (ctx) => {
            const approval = await ctx.synapse.payments.serviceApproval(
                ctx.synapse.getWarmStorageAddress(),
                TOKENS.USDFC
            );
            return !approval.isApproved;
        },
        message: () => 'Storage operator is not approved. Storage operations will fail.'
    }
];
```

Each alert rule is an object with five fields:

**id**: Unique identifier used for deduplication. Two alerts with the same ID are treated as the same condition.

**name**: Human-readable name displayed in notifications.

**severity**: Controls which notification channels fire (warning → webhook only, critical → webhook + email).

**condition**: An async function that returns `true` when the alert should trigger. It receives a context object containing the current SDK instance and balance data. Conditions can perform additional SDK queries — the `operator_not_approved` rule calls `serviceApproval()` to check allowances.

**message**: A function that generates human-readable alert text. It also receives the context, allowing dynamic values like current balance.

### Designing Good Alert Rules

The three rules in this walkthrough cover the most critical production scenarios:

1. **Low Balance** (warning): Your account is declining but not empty. You have time to act.
2. **Critical Balance** (critical): Your account is nearly empty. Immediate action required or storage stops.
3. **Operator Not Approved** (error): A configuration issue prevents the system from functioning at all.

In production, you might add rules for:
- Provider reliability dropping below 97%
- No proof submissions in the last 2 hours
- Storage costs exceeding budget thresholds
- Unusual transaction patterns (potential compromised key)

## Step 4: Evaluating Conditions

```javascript
const balance = await synapse.payments.balance(TOKENS.USDFC);
const context = { synapse, balance };

const triggeredAlerts = [];

for (const rule of alertRules) {
    try {
        const triggered = await rule.condition(context);
        if (triggered) {
            triggeredAlerts.push({
                id: rule.id,
                name: rule.name,
                severity: rule.severity,
                message: rule.message(context),
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.log(`? ${rule.name}: Check failed (${error.message})`);
    }
}
```

The evaluation loop iterates through all rules, calling each condition with the current context. Each condition is wrapped in `try/catch` because a failed check should not prevent other rules from being evaluated. A network timeout checking provider status should not block the balance check.

Triggered alerts are collected into an array with a timestamp. This timestamp is critical for dashboards — it tells operators exactly when the condition was detected.

## Step 5: Sending Webhook Notifications

```javascript
const response = await fetch(alertChannels.webhook.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        source: 'filecoin-monitor',
        alert: alert,
        metadata: {
            network: 'calibration',
            chainId: 314159
        }
    })
});
```

Webhook notifications use a standard HTTP POST with a JSON payload. The payload structure includes:

- **source**: Identifies this as a Filecoin monitor (useful when you have multiple alerting systems)
- **alert**: The full alert object with name, severity, message, and timestamp
- **metadata**: Network context (testnet vs mainnet)

For **Slack integration**, change the payload format to Slack's Block Kit format:
```javascript
body: JSON.stringify({
    text: `${alert.severity.toUpperCase()}: ${alert.message}`,
    blocks: [
        { type: "header", text: { type: "plain_text", text: alert.name } },
        { type: "section", text: { type: "mrkdwn", text: alert.message } }
    ]
})
```

For **Discord integration**, use Discord's webhook format:
```javascript
body: JSON.stringify({
    content: `**[${alert.severity.toUpperCase()}]** ${alert.message}`
})
```

The code checks `shouldSendAlert(alert.id)` before sending, which implements cooldown-based deduplication (covered in Step 7).

## Step 6: Email Notifications

```javascript
const transporter = nodemailer.createTransport({
    host: alertChannels.email.host,
    port: alertChannels.email.port,
    secure: false,
    auth: {
        user: alertChannels.email.user,
        pass: alertChannels.email.pass
    }
});

await transporter.sendMail({
    from: '"Filecoin Monitor" <monitor@filecoin.local>',
    to: alertChannels.email.recipient,
    subject: `[${alert.severity.toUpperCase()}] ${alert.name}`,
    text: alert.message,
    html: `
        <h2>Filecoin Storage Alert</h2>
        <p><strong>Alert:</strong> ${alert.name}</p>
        <p><strong>Severity:</strong> ${alert.severity}</p>
        <p><strong>Message:</strong> ${alert.message}</p>
        <p><strong>Time:</strong> ${alert.timestamp}</p>
    `
});
```

Email alerts are reserved for **critical** severity only. The code filters: `triggeredAlerts.filter(a => a.severity === 'critical')`.

The email includes both plain text and HTML versions. Email clients that support HTML render the formatted version; those that don't fall back to plain text. The subject line includes the severity in brackets (e.g., `[CRITICAL] Balance below 0.1 USDFC`) for easy filtering.

**Nodemailer** is the standard Node.js email library. It supports SMTP, SendGrid, AWS SES, and other transport methods. For production, use a service like SendGrid or AWS SES that handles deliverability, rather than direct SMTP which can trigger spam filters.

## Step 7: Alert Deduplication

```javascript
function shouldSendAlert(alertId, cooldownMs = 15 * 60 * 1000) {
    const lastSent = alertHistory.get(alertId);
    if (!lastSent) return true;
    return (Date.now() - lastSent) > cooldownMs;
}

function markAlertSent(alertId) {
    alertHistory.set(alertId, Date.now());
}
```

Without deduplication, a low balance alert would fire every time the monitoring loop runs (every 5 minutes). Over an 8-hour workday, that is 96 identical notifications. By the tenth one, you have muted the channel. By the fiftieth, you have unsubscribed from alerts entirely. This is **alert fatigue** — the most dangerous failure mode of monitoring systems.

The cooldown approach works as follows:

1. First occurrence: Alert fires normally and is recorded in `alertHistory`
2. Subsequent occurrences within 15 minutes: Suppressed (skipped)
3. After 15 minutes: Alert fires again (in case you missed the first one)

**15 minutes** is the default cooldown. For critical alerts, you might reduce this to 5 minutes. For informational alerts, you might increase to 1 hour.

In a production system, you would also implement:
- **Escalation**: If an alert is not acknowledged within 30 minutes, escalate to a different channel (e.g., phone call)
- **Resolution**: When the condition clears (balance is topped up), send a "resolved" notification
- **Grouping**: Combine related alerts (e.g., "3 providers degraded" instead of 3 separate alerts)

## Step 8: SLA Monitoring

```javascript
const slaMetrics = {
    uptimeTarget: 99.9,
    currentUptime: 99.7,
    proofSuccessTarget: 99.0,
    proofSuccessRate: 99.5,
    responseTimeTarget: "5 min",
    avgResponseTime: "2.3 min"
};
```

Service Level Agreements (SLAs) define the minimum acceptable performance from your storage provider. Monitoring SLA compliance is about tracking whether your provider is meeting contractual obligations.

The code displays a compliance table:

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Uptime | 99.9% | 99.7% | ✗ BREACH |
| Proof Success | 99.0% | 99.5% | ✓ Compliant |
| Response Time | 5 min | 2.3 min | ✓ Compliant |

When an SLA breach is detected, it triggers a notification. In production, SLA breaches often carry financial implications — the provider may owe credits or penalty payments. Your dashboard should track breach history for contract negotiations and renewal decisions.

## Running the Alert System

1. Set up your environment:
   ```bash
   cd alert-system/code
   cp .env.example .env.local
   ```

2. Edit `.env.local`:
   ```bash
   PRIVATE_KEY=your_private_key_here
   WEBHOOK_URL=https://webhook.site/your-unique-id  # Get from webhook.site
   ```

3. Install and run:
   ```bash
   npm install
   npm start
   ```

Expected output:

```
Alert System Demo

Set up monitoring alerts for Filecoin storage operations.

=== Step 2: Alert Channel Configuration ===

Configured Alert Channels:
  ✓ Console: Always enabled
  ✓ Webhook: Configured
  ✗ Email: Not configured

=== Step 4: Checking Alert Conditions ===

Current balance: 4.5231 USDFC

✓  Low Balance Warning: OK
✓  Critical Balance Alert: OK
✓  Operator Not Approved: OK

=== Step 5: Webhook Notifications ===

No alerts triggered. Webhook notifications not needed.

=== Step 7: Provider SLA Monitoring ===

SLA Compliance Report:
│ Uptime                │ 99.9%     │ 99.7%     │ ✗ BREACH     │
│ Proof Success Rate    │ 99%       │ 99.5%     │ ✓ Compliant  │

⚠️  SLA BREACH DETECTED - Notify operations team

✅ Alert System Complete!
```

If you configured a `WEBHOOK_URL` and your balance is below the threshold, check your webhook.site dashboard to see the received notification payload.

## Production Considerations

### Process Management

The monitoring script should run as a persistent background process. Use:

- **PM2**: `pm2 start index.js --name filecoin-monitor` — Automatic restart on crash, log management
- **systemd**: For Linux servers, create a service unit
- **Docker**: Containerize with a health check endpoint

### Multi-Environment Alerting

In production, you likely have separate payment accounts for development, staging, and production. Run separate monitor instances with different thresholds:

```bash
# Development: relaxed thresholds
LOW_BALANCE_THRESHOLD=0.1
CRITICAL_BALANCE_THRESHOLD=0.01

# Production: strict thresholds
LOW_BALANCE_THRESHOLD=10.0
CRITICAL_BALANCE_THRESHOLD=2.0
```

### Alert Channel Routing

Different severity levels should route to different channels:

| Severity | Dev Environment | Production |
|----------|----------------|------------|
| warning | Console only | Slack channel |
| error | Console + Slack | Slack + PagerDuty |
| critical | Console + email | Slack + PagerDuty + Phone call |

### Heartbeat Monitoring

Monitor the monitor itself. If the monitoring process crashes, nobody gets alerts. Implement a heartbeat: send a "monitor alive" webhook every hour. Use an external service like [Cronitor](https://cronitor.io) or [Better Uptime](https://betteruptime.com) to detect when heartbeats stop arriving.

## Troubleshooting

**"Webhook failed (404)" or "Webhook error: fetch failed"**

Verify your `WEBHOOK_URL` is correct. Webhook.site URLs expire after some time — generate a new one. Ensure the URL includes the full path including the unique ID.

**"Email failed: connect ECONNREFUSED"**

SMTP credentials are incorrect or the mail server is unreachable. For testing, use [ethereal.email](https://ethereal.email) which is freely accessible.

**"Check failed: Cannot read properties" for operator approval**

The operator approval check may fail if the SDK cannot reach the RPC. This is handled gracefully — the error is logged and other rules continue evaluating.

**All alerts show "OK" but you expected something to trigger**

Check your thresholds. If your balance is 4.5 USDFC and `LOW_BALANCE_THRESHOLD` is 1.0, no alert fires because 4.5 > 1.0. Lower the threshold to test: `LOW_BALANCE_THRESHOLD=5.0`.

## The Storage Operations Dashboard Exercise

You have now completed all three walkthroughs. Combined, they provide every building block needed for a production monitoring dashboard:

| Component | Source | Data |
|-----------|--------|------|
| Status Panel | Walkthrough 1 | Contract addresses, network info |
| Balance Widget | Walkthrough 1 | Current balance, health status |
| Activity Feed | Walkthrough 2 | Recent transactions |
| Reliability Chart | Walkthrough 2 | Provider scores over time |
| Cost Chart | Walkthrough 2 | Spending analytics |
| Proof Timeline | Walkthrough 2 | Proof submissions per day |
| Alert Panel | Walkthrough 3 | Active alerts with severity |
| SLA Report | Walkthrough 3 | Compliance tracking |

**Exercise**: Build a web application that combines these components into a single dashboard. Use Express.js for the backend API, serve the monitoring data from Walkthroughs 1-3, and build a frontend using your preferred framework (React, Vue, or even vanilla HTML/CSS). The data structures are already JSON-formatted and ready for API consumption.

## Testing Your Alert System

You don't need to wait for a disaster to verify your system works. You can force alerts by overriding thresholds or using test tools.

### 1. Force a "Low Balance" Alert

By default, the system warns when balance is < 1.0 USDFC. If you have 5.0 USDFC, it stays silent. To force a warning:

1.  **Override the Threshold**: Run the script with a higher threshold environment variable:
    ```bash
    LOW_BALANCE_THRESHOLD=100 npm start
    ```
2.  **Verify Output**: You should see:
    ```
    ⚠️  Low Balance Warning: TRIGGERED
       → Balance is low: 5.0000 USDFC (threshold: 100)
    ```

### 2. Verify Data Accuracy (Read-Only Check)

These monitoring scripts perform **read-only** operations on the blockchain. They don't create transaction hashes, but you can prove they are reading real data:

1.  Note the **"Current payment balance"** value in the script output (e.g., `4.9184 USDFC`).
2.  Copy your wallet address from `.env.local`.
3.  Search for your address on [calibration.filfox.info](https://calibration.filfox.info/).
4.  **Compare**: The balance on the explorer should match the script output exactly.

### 3. See a Real Notification

To see a JSON payload fly across the internet:

1.  Go to [webhook.site](https://webhook.site).
2.  Copy your unique URL.
3.  Run the alert system with this URL:
    ```bash
    WEBHOOK_URL="https://webhook.site/..." LOW_BALANCE_THRESHOLD=100 npm start
    ```
4.  Check the webhook.site dashboard—you will see the alert payload appear instantly!

## Conclusion

Alert systems are the difference between proactive and reactive infrastructure management. By combining real-time queries, historical analysis, and automated notifications, you have built a monitoring pipeline that catches problems before they affect users.

The three walkthroughs in this module — proof monitoring, historical analysis, and alert systems — represent the observability layer of production Filecoin applications. Every serious storage deployment needs these capabilities, whether monitoring a single application or managing storage infrastructure for thousands of users.

## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
