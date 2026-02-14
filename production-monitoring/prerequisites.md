# Production Monitoring Prerequisites

This module teaches you how to build monitoring infrastructure for Filecoin storage operations. You will learn to query proof status, analyze historical data, and set up alert systems.

**Goal**: After completing these walkthroughs, you can build a **Storage Operations Dashboard** with:
- Real-time proof status for all files
- Provider reliability scores (successful proofs %)
- Historical charts
- Alert system for failures
- Cost analytics

## Required: Filecoin Testnet Setup

All three walkthroughs require a funded Filecoin payment account.

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
- Data uploaded (needed for monitoring)

### Step 2: Verify Your Setup

```bash
# You should have:
# - USDFC balance > 0
# - Operator approved = true
# - At least one PieceCID from previous uploads
```

## Walkthrough Dependencies

| Walkthrough | Dependencies |
|-------------|--------------|
| 1. Proof Monitoring | payment-management complete |
| 2. Historical Analysis | Walkthrough 1 (builds on concepts) |
| 3. Alert System | Walkthroughs 1 & 2 (combines patterns) |

## External Services (Optional)

For full functionality of the alert system:

### Webhook Testing
1. Visit [webhook.site](https://webhook.site)
2. Copy your unique URL
3. Set `WEBHOOK_URL` in `.env.local`

### Email Testing
1. Visit [ethereal.email](https://ethereal.email)
2. Create a test account
3. Set `SMTP_*` variables in `.env.local`

## Environment Variables

Each walkthrough uses a `.env.local` file:

```bash
# Required for all walkthroughs
PRIVATE_KEY=your_backend_wallet_private_key

# For historical-analysis
FILFOX_API_URL=https://calibration.filfox.info/api/v1
WALLET_ADDRESS=your_wallet_address  # Optional

# For alert-system
WEBHOOK_URL=https://webhook.site/your-unique-id
LOW_BALANCE_THRESHOLD=1.0
CRITICAL_BALANCE_THRESHOLD=0.1

# Optional: Email alerts
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your_ethereal_user
SMTP_PASS=your_ethereal_pass
ALERT_EMAIL=alerts@example.com
```

## Quick Start

After completing prerequisites:

```bash
# Walkthrough 1: Proof Monitoring
cd production-monitoring/proof-monitoring/code
npm install && cp .env.example .env.local && npm start

# Walkthrough 2: Historical Analysis
cd production-monitoring/historical-analysis/code
npm install && cp .env.example .env.local && npm start

# Walkthrough 3: Alert System
cd production-monitoring/alert-system/code
npm install && cp .env.example .env.local && npm start
```

## Troubleshooting

**"Payment account is empty"**
→ Run `storage-basics/payment-management` first

**"No transaction history found"**
→ Upload some data first using `storage-basics/first-upload`

**"Webhook failed"**
→ Check that your `WEBHOOK_URL` is correct and webhook.site is accessible

**"Email not configured"**
→ Email is optional; alerts will still show in console

## What You'll Learn

| Walkthrough | Skills |
|-------------|--------|
| Proof Monitoring | SDK queries, contract addresses, proving periods |
| Historical Analysis | API queries, time-series data, chart generation |
| Alert System | Webhooks, email, SLA monitoring, deduplication |

These skills combine to build production-ready monitoring dashboards.
