# Payment Setup for Agents

The previous walkthroughs established your agent's identity and memory. The Agent Card defines who the agent is. The memory system records what the agent does. But both of these capabilities depend on a resource that depletes over time: USDFC in the payment account. Every upload consumes funds. Every storage deal locks funds. When the payment account runs dry, the agent cannot store data — it cannot update its identity, record new memories, or perform any storage operation. The agent effectively stops functioning.

Human-managed systems handle this through dashboards and manual intervention. An operator notices the balance is low, logs into a wallet, and transfers funds. This works for applications with human oversight, but autonomous agents operate without constant supervision. An agent running a scheduled task at 3 AM cannot wait for a human to wake up and fund its account. It needs the ability to monitor its own financial health and take corrective action independently.

This walkthrough builds that autonomous payment management system. You will check the agent's gas balance (FIL for transactions), inspect USDFC distribution across wallet and payment account, examine payment account details including lockup rates and days remaining, implement conditional top-up logic that deposits funds when the balance drops below a threshold, verify and auto-fix operator approvals, monitor active payment rails, and build a comprehensive health dashboard that summarizes the agent's financial status.

The result is a script that can run on a schedule — hourly, daily, or triggered by events — ensuring the agent always has sufficient funds and permissions to continue operating.

## Prerequisites

Before proceeding, you must have completed the following:

- **Environment Setup and Token Acquisition** — Your environment should be configured with the Synapse SDK installed, and your wallet should contain tFIL for gas
- **Payment Account Funding** — Your payment account should hold USDFC (from the storage-basics module)
- **Operator Approval** — The storage operator should be approved (from the storage-basics module)
- **Walkthrough 1 (Agent Card)** — Understanding of Filecoin storage and PieceCID
- **Walkthrough 2 (Agent Memory)** — Understanding of data sets and storage contexts

If any prerequisite is missing, return to the `storage-basics` module or complete the earlier walkthroughs first. This walkthrough assumes familiarity with payment accounts, operator approvals, and the distinction between wallet balance and payment account balance.

## What This Walkthrough Covers

We will walk through eight operations that demonstrate autonomous payment management:

1. **SDK Initialization** — Connecting to the Filecoin network with agent credentials
2. **Gas Balance Check** — Verifying the agent has FIL for transaction fees
3. **USDFC Balance Check** — Inspecting funds across wallet and payment account
4. **Payment Account Details** — Examining lockup rates, available funds, and days remaining
5. **Autonomous Top-Up** — Conditional deposit logic triggered by balance thresholds
6. **Operator Approval Verification** — Checking and auto-fixing storage permissions
7. **Payment Rail Monitoring** — Tracking active storage payment streams
8. **Health Dashboard** — Building a comprehensive status object for monitoring

Each step reveals how agents manage their finances without human intervention and what safeguards prevent common failure modes.

## Understanding Agent Payment Architecture

Before writing code, understanding the financial architecture clarifies why autonomous payment management requires multiple checks and why a single balance number is insufficient.

### The Three-Layer Financial Model

An agent's finances operate across three layers:

- **Wallet (FIL)** — Gas for all blockchain transactions. If FIL runs out, the agent cannot submit any transaction, even to fix other problems. This is the most critical failure mode.
- **Wallet (USDFC)** — Reserve funds available for deposit into the payment account but not yet committed to storage.
- **Payment Account (USDFC)** — Funds that storage operators can charge. Split into available funds (for new deals) and locked funds (committed to existing deals).

The flow is: FIL pays for gas to move USDFC from wallet to payment account, and operators charge the payment account for storage. If any layer is depleted, the chain breaks.

## Step 1: Create the Payment Manager Script

Create a file named `index.js` in the `code/` directory:

```javascript
import dotenv from 'dotenv';
import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

// Agent financial thresholds
const MIN_PAYMENT_BALANCE = 1.0;  // USDFC - trigger top-up below this
const TOP_UP_AMOUNT = 5.0;        // USDFC - amount to deposit when low
const MIN_GAS_BALANCE = 0.1;      // FIL - minimum gas for transactions

/**
 * Payment Setup for Agents
 *
 * This script demonstrates:
 * 1. Checking wallet balance (FIL for gas)
 * 2. Checking wallet USDFC balance (available for deposit)
 * 3. Checking payment account balance (funds for storage)
 * 4. Autonomous top-up logic (conditional deposit)
 * 5. Operator approval verification and auto-fix
 * 6. Payment rail monitoring (active storage streams)
 * 7. Building a comprehensive health dashboard
 */
async function main() {
    console.log("Payment Setup for Agents\n");

    // ========================================================================
    // Step 1: Initialize SDK
    // ========================================================================
    console.log("=== Step 1: Initialize SDK ===\n");

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env.local");
    }

    const synapse = await Synapse.create({
        privateKey: privateKey,
        rpcURL: process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"
    });

    const provider = new ethers.JsonRpcProvider(
        process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"
    );
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log("SDK initialized successfully.");
    console.log(`Agent Wallet: ${wallet.address}\n`);

    // ========================================================================
    // Step 2: Check Gas Balance (FIL)
    // ========================================================================
    console.log("=== Step 2: Check Gas Balance (FIL) ===\n");

    const gasBalance = await provider.getBalance(wallet.address);
    const gasFormatted = Number(ethers.formatEther(gasBalance));

    console.log(`Wallet FIL Balance: ${gasBalance.toString()} (raw units)`);
    console.log(`Formatted: ${gasFormatted.toFixed(4)} FIL`);

    if (gasFormatted < MIN_GAS_BALANCE) {
        console.log(`\nWARNING: Gas balance is below ${MIN_GAS_BALANCE} FIL.`);
        console.log("The agent cannot submit transactions without gas.");
        console.log("Fund the wallet with tFIL from: https://faucet.calibration.fildev.network/");
    } else {
        console.log("Gas balance is sufficient for transactions.");
    }
    console.log();

    // ========================================================================
    // Step 3: Check USDFC Balances (Wallet and Payment Account)
    // ========================================================================
    console.log("=== Step 3: Check USDFC Balances ===\n");

    const walletUSDFC = await synapse.payments.walletBalance(TOKENS.USDFC);
    const walletUSDFCFormatted = Number(walletUSDFC) / 1e18;

    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    const paymentFormatted = Number(paymentBalance) / 1e18;

    console.log("USDFC Distribution:");
    console.log(`  Wallet Balance:          ${walletUSDFCFormatted.toFixed(4)} USDFC`);
    console.log(`  Payment Account Balance: ${paymentFormatted.toFixed(4)} USDFC`);
    console.log(`  Total USDFC:             ${(walletUSDFCFormatted + paymentFormatted).toFixed(4)} USDFC`);
    console.log();

    console.log("The wallet holds USDFC available for deposit into the payment account.");
    console.log("The payment account holds USDFC that storage operators can charge.\n");

    // ========================================================================
    // Step 4: Payment Account Details
    // ========================================================================
    console.log("=== Step 4: Payment Account Details ===\n");

    const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);

    console.log("Payment Account Breakdown:");
    console.log(`  Total Funds:     ${ethers.formatUnits(accountInfo.funds, 18)} USDFC`);
    console.log(`  Current Lockup:  ${ethers.formatUnits(accountInfo.lockupCurrent, 18)} USDFC`);
    console.log(`  Lockup Rate:     ${ethers.formatUnits(accountInfo.lockupRate, 18)} USDFC/epoch`);
    console.log(`  Available Funds: ${ethers.formatUnits(accountInfo.availableFunds, 18)} USDFC`);
    console.log(`  Last Settled:    Epoch ${accountInfo.lockupLastSettledAt}`);
    console.log();

    if (accountInfo.lockupRate > 0n) {
        const epochsRemaining = accountInfo.availableFunds / accountInfo.lockupRate;
        const daysRemaining = Number(epochsRemaining) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);

        console.log(`  Estimated Days Remaining: ~${daysRemaining.toFixed(1)} days`);

        if (daysRemaining < 7) {
            console.log("  CRITICAL: Less than 7 days of storage remaining.");
        } else if (daysRemaining < 14) {
            console.log("  WARNING: Less than 14 days remaining. Monitor closely.");
        } else {
            console.log("  Healthy: Sufficient balance for continued storage.");
        }
    } else {
        console.log("  No active storage deals (lockup rate is 0).");
    }
    console.log();

    // ========================================================================
    // Step 5: Autonomous Top-Up Logic
    // ========================================================================
    console.log("=== Step 5: Autonomous Top-Up Logic ===\n");

    console.log(`Minimum balance threshold: ${MIN_PAYMENT_BALANCE} USDFC`);
    console.log(`Current payment balance:   ${paymentFormatted.toFixed(4)} USDFC`);
    console.log();

    if (paymentFormatted < MIN_PAYMENT_BALANCE) {
        console.log(`Payment balance is below threshold (${MIN_PAYMENT_BALANCE} USDFC).`);
        console.log(`Checking if wallet has sufficient USDFC for top-up...\n`);

        if (walletUSDFCFormatted >= TOP_UP_AMOUNT) {
            console.log(`Wallet has ${walletUSDFCFormatted.toFixed(4)} USDFC available.`);
            console.log(`Depositing ${TOP_UP_AMOUNT} USDFC into payment account...\n`);

            try {
                const depositAmount = ethers.parseUnits(String(TOP_UP_AMOUNT), 18);
                const receipt = await synapse.payments.depositWithPermit({ amount: depositAmount });

                console.log("Deposit successful.");
                console.log(`  Amount: ${TOP_UP_AMOUNT} USDFC`);
                if (receipt && receipt.transactionHash) {
                    console.log(`  Transaction: ${receipt.transactionHash}`);
                }

                // Verify new balance
                const newBalance = await synapse.payments.balance(TOKENS.USDFC);
                const newFormatted = Number(newBalance) / 1e18;
                console.log(`  New payment balance: ${newFormatted.toFixed(4)} USDFC`);
            } catch (error) {
                console.log("Deposit failed:", error.message);
                console.log("Ensure wallet has sufficient USDFC and gas for the transaction.");
            }
        } else {
            console.log(`Wallet has only ${walletUSDFCFormatted.toFixed(4)} USDFC.`);
            console.log(`Need ${TOP_UP_AMOUNT} USDFC for top-up. Insufficient funds.`);
            console.log("Fund the wallet with USDFC before the agent can top up.");
        }
    } else {
        console.log("Payment balance is above threshold. No top-up needed.");
        console.log("In production, this check runs on a schedule (e.g., every hour).");
    }
    console.log();

    // ========================================================================
    // Step 6: Operator Approval Verification
    // ========================================================================
    console.log("=== Step 6: Operator Approval Verification ===\n");

    const operatorAddress = synapse.getWarmStorageAddress();

    console.log(`Storage Operator: ${operatorAddress}`);

    const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    console.log(`Approved: ${approval.isApproved}`);
    console.log(`Rate Allowance: ${ethers.formatUnits(approval.rateAllowance, 18)} USDFC/epoch`);
    console.log(`Lockup Allowance: ${ethers.formatUnits(approval.lockupAllowance, 18)} USDFC`);
    console.log();

    if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
        console.log("Operator is not fully approved. Attempting to fix...\n");

        try {
            const receipt = await synapse.payments.approveService(operatorAddress, TOKENS.USDFC);

            console.log("Approval granted successfully.");
            if (receipt && receipt.transactionHash) {
                console.log(`  Transaction: ${receipt.transactionHash}`);
            }

            // Verify new approval
            const newApproval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);
            console.log(`  New approval status: ${newApproval.isApproved}`);
        } catch (error) {
            console.log("Approval failed:", error.message);
            console.log("Ensure wallet has sufficient gas for the approval transaction.");
        }
    } else {
        console.log("Operator is fully approved. Storage operations are authorized.");
    }
    console.log();

    // ========================================================================
    // Step 7: Payment Rail Monitoring
    // ========================================================================
    console.log("=== Step 7: Payment Rail Monitoring ===\n");

    const rails = await synapse.payments.getRailsAsPayer(TOKENS.USDFC);
    const activeRails = rails.filter(r => !r.isTerminated);

    console.log(`Total payment rails: ${rails.length}`);
    console.log(`Active rails: ${activeRails.length}`);
    console.log(`Terminated rails: ${rails.length - activeRails.length}`);
    console.log();

    if (activeRails.length > 0) {
        console.log("Active Payment Rails:\n");
        for (let i = 0; i < Math.min(activeRails.length, 5); i++) {
            const rail = activeRails[i];
            console.log(`  Rail ${i + 1}:`);
            console.log(`    Rail ID: ${rail.railId}`);
            if (rail.payee) {
                console.log(`    Payee: ${rail.payee}`);
            }
            console.log(`    Terminated: ${rail.isTerminated}`);
            console.log();
        }
        if (activeRails.length > 5) {
            console.log(`  ... and ${activeRails.length - 5} more active rails.\n`);
        }
    } else {
        console.log("No active payment rails found.");
        console.log("Rails are created when storage operations are initiated.\n");
    }

    // ========================================================================
    // Step 8: Build Health Dashboard
    // ========================================================================
    console.log("=== Step 8: Agent Financial Health Dashboard ===\n");

    // Determine health status
    let gasStatus = "HEALTHY";
    if (gasFormatted < MIN_GAS_BALANCE) gasStatus = "CRITICAL";
    else if (gasFormatted < MIN_GAS_BALANCE * 5) gasStatus = "LOW";

    let paymentStatus = "HEALTHY";
    if (paymentFormatted < 0.1) paymentStatus = "CRITICAL";
    else if (paymentFormatted < MIN_PAYMENT_BALANCE) paymentStatus = "LOW";

    let approvalStatus = "APPROVED";
    if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
        approvalStatus = "NOT_APPROVED";
    }

    const healthDashboard = {
        timestamp: new Date().toISOString(),
        agent: wallet.address,
        network: "Filecoin Calibration Testnet",
        gas: {
            balance: gasFormatted.toFixed(4) + " FIL",
            status: gasStatus
        },
        wallet: {
            usdfc: walletUSDFCFormatted.toFixed(4) + " USDFC",
            available_for_deposit: walletUSDFCFormatted >= TOP_UP_AMOUNT
        },
        paymentAccount: {
            balance: paymentFormatted.toFixed(4) + " USDFC",
            status: paymentStatus,
            threshold: MIN_PAYMENT_BALANCE + " USDFC"
        },
        operator: {
            address: operatorAddress,
            status: approvalStatus
        },
        rails: {
            total: rails.length,
            active: activeRails.length
        },
        overall: gasStatus === "CRITICAL" || paymentStatus === "CRITICAL" || approvalStatus === "NOT_APPROVED"
            ? "CRITICAL"
            : gasStatus === "LOW" || paymentStatus === "LOW"
                ? "WARNING"
                : "HEALTHY"
    };

    console.log("Health Dashboard (JSON):");
    console.log(JSON.stringify(healthDashboard, null, 2));
    console.log();

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("=== Summary ===\n");

    console.log("Agent payment setup complete.\n");

    console.log("What was accomplished:");
    console.log("  - Checked gas balance (FIL) for transaction capability");
    console.log("  - Checked USDFC distribution across wallet and payment account");
    console.log("  - Inspected payment account details (funds, lockup, available)");
    console.log("  - Evaluated autonomous top-up logic against balance threshold");
    console.log("  - Verified operator approval status for storage operations");
    console.log("  - Monitored active payment rails for ongoing storage deals");
    console.log("  - Built a comprehensive health dashboard for monitoring\n");

    console.log(`Overall Status: ${healthDashboard.overall}`);
    console.log();

    console.log("In production, this script runs on a schedule (cron job or timer).");
    console.log("It ensures the agent always has sufficient funds and approvals");
    console.log("to continue operating without human intervention.\n");

    console.log("This completes the Trustless Agent Infrastructure module.");
    console.log("Your agent now has:");
    console.log("  1. A verifiable identity (Agent Card on Filecoin)");
    console.log("  2. An immutable memory system (Data Set with structured logs)");
    console.log("  3. Autonomous payment management (self-funding and monitoring)");
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
```

This script demonstrates the complete autonomous payment management workflow with detailed logging at each stage.

## Understanding the Code

### Gas Balance Check

```javascript
const gasBalance = await provider.getBalance(wallet.address);
const gasFormatted = Number(ethers.formatEther(gasBalance));

if (gasFormatted < MIN_GAS_BALANCE) {
    console.log("WARNING: Gas balance is below threshold.");
}
```

We use ethers.js directly to check the wallet's FIL balance. The Synapse SDK handles USDFC operations, but native FIL balance requires a direct provider call. The `getBalance()` method returns a BigInt in attoFIL (10^18 units per FIL), and `formatEther()` converts it to a human-readable number.

Gas is the most critical resource because without it, the agent cannot execute any corrective action. If USDFC runs low, the agent can deposit more — but only if it has gas. If the operator approval lapses, the agent can re-approve — but only if it has gas. Gas depletion is the one problem the agent cannot fix on its own.

### Dual USDFC Balance Check

```javascript
const walletUSDFC = await synapse.payments.walletBalance(TOKENS.USDFC);
const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
```

Two separate methods check USDFC in two different locations. `walletBalance()` returns USDFC held in the wallet (available for deposit). `balance()` returns USDFC in the payment account (available for storage operations).

The distinction matters because having USDFC in your wallet does not mean you can pay for storage. Storage operators charge the payment account, not the wallet. The agent must explicitly deposit USDFC from wallet to payment account before it can be used.

### Payment Account Details

```javascript
const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);

if (accountInfo.lockupRate > 0n) {
    const epochsRemaining = accountInfo.availableFunds / accountInfo.lockupRate;
    const daysRemaining = Number(epochsRemaining) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);
}
```

The `accountInfo()` method returns the complete state of the payment account:

- **funds**: Total USDFC in the account (available + locked)
- **lockupCurrent**: USDFC currently locked in active storage deals
- **lockupRate**: USDFC consumed per epoch (approximately 30 seconds) by all active deals
- **availableFunds**: USDFC available for new deals (funds minus lockup)
- **lockupLastSettledAt**: The epoch when lockup was last calculated

From `availableFunds` and `lockupRate`, we calculate how many epochs (and therefore days) remain before the available funds are exhausted. This is the most important metric for autonomous agents — it tells you when the agent will stop functioning if no action is taken.

### Conditional Deposit Logic

```javascript
if (paymentFormatted < MIN_PAYMENT_BALANCE) {
    if (walletUSDFCFormatted >= TOP_UP_AMOUNT) {
        const depositAmount = ethers.parseUnits(String(TOP_UP_AMOUNT), 18);
        const receipt = await synapse.payments.depositWithPermit({ amount: depositAmount });
    }
}
```

The top-up logic follows a two-gate pattern:

1. **Is the payment balance below threshold?** If yes, proceed. If no, do nothing.
2. **Does the wallet have enough USDFC for the deposit?** If yes, deposit. If no, alert.

The deposit amount is converted from a human-readable number (5.0) to a BigInt using `ethers.parseUnits()`, which handles the 18-decimal conversion precisely. We use `depositWithPermit()` rather than the two-step `approve()` + `deposit()` pattern — this executes the deposit in a single transaction using EIP-2612 permit signatures, saving gas.

After depositing, we verify the new balance to confirm the transaction succeeded. This verification step catches edge cases where the transaction was submitted but failed silently.

### Operator Approval Auto-Fix

```javascript
const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
    const receipt = await synapse.payments.approveService(operatorAddress, TOKENS.USDFC);
}
```

We check three conditions: the approval exists (`isApproved`), the rate allowance is nonzero, and the lockup allowance is nonzero. All three must be valid for storage operations to succeed.

If any condition fails, we call `approveService()` to re-establish the approval. This is a write operation that costs gas, so it only executes when needed. The approval grants the storage operator permission to charge the payment account at the default rate and lockup limits.

### Payment Rail Monitoring

```javascript
const rails = await synapse.payments.getRailsAsPayer(TOKENS.USDFC);
const activeRails = rails.filter(r => !r.isTerminated);
```

Payment rails are on-chain streams that transfer USDFC from the agent's payment account to storage providers over time. Each storage deal creates a rail. By querying rails where the agent is the payer, we see all active and historical storage relationships.

Active rails indicate ongoing storage deals that are consuming funds. Terminated rails indicate completed or cancelled deals. The ratio of active to terminated rails gives insight into the agent's storage activity level.

### Health Dashboard Construction

```javascript
const healthDashboard = {
    timestamp: new Date().toISOString(),
    agent: wallet.address,
    gas: { balance: "...", status: gasStatus },
    paymentAccount: { balance: "...", status: paymentStatus },
    operator: { address: "...", status: approvalStatus },
    overall: "HEALTHY" | "WARNING" | "CRITICAL"
};
```

The health dashboard aggregates all checks into a single JSON object suitable for monitoring systems, dashboards, or alerting pipelines. The `overall` status follows a traffic-light pattern:

- **HEALTHY**: All systems operational, balances above thresholds
- **WARNING**: One or more balances are low but not critical
- **CRITICAL**: A balance is depleted or the operator is not approved

In production, this JSON object would be sent to a monitoring service (Datadog, Grafana, PagerDuty) that triggers alerts based on the status values.

## Step 2: Run the Script

Navigate to the `code` directory and execute:

```bash
cd payment-setup/code
npm install
cp .env.example .env.local
```

Edit `.env.local` with your private key, then run:

```bash
node index.js
```

**Scenario A: Healthy Agent**

```
Payment Setup for Agents

=== Step 1: Initialize SDK ===

SDK initialized successfully.
Agent Wallet: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1

=== Step 2: Check Gas Balance (FIL) ===

Wallet FIL Balance: 4500000000000000000 (raw units)
Formatted: 4.5000 FIL
Gas balance is sufficient for transactions.

=== Step 3: Check USDFC Balances ===

USDFC Distribution:
  Wallet Balance:          93.5000 USDFC
  Payment Account Balance: 4.8120 USDFC
  Total USDFC:             98.3120 USDFC

The wallet holds USDFC available for deposit into the payment account.
The payment account holds USDFC that storage operators can charge.

=== Step 4: Payment Account Details ===

Payment Account Breakdown:
  Total Funds:     4.812 USDFC
  Current Lockup:  0.003 USDFC
  Lockup Rate:     0.000001 USDFC/epoch
  Available Funds: 4.809 USDFC
  Last Settled:    Epoch 1234567

  Estimated Days Remaining: ~166.3 days
  Healthy: Sufficient balance for continued storage.

=== Step 5: Autonomous Top-Up Logic ===

Minimum balance threshold: 1 USDFC
Current payment balance:   4.8120 USDFC

Payment balance is above threshold. No top-up needed.
In production, this check runs on a schedule (e.g., every hour).

=== Step 6: Operator Approval Verification ===

Storage Operator: 0x6454...
Approved: true
Rate Allowance: 115792089237316195423570985008687907853269984665640564039457.584007913129639935 USDFC/epoch
Lockup Allowance: 115792089237316195423570985008687907853269984665640564039457.584007913129639935 USDFC

Operator is fully approved. Storage operations are authorized.

=== Step 7: Payment Rail Monitoring ===

Total payment rails: 5
Active rails: 2
Terminated rails: 3

Active Payment Rails:

  Rail 1:
    Rail ID: 42
    Payee: 0x9876543210fedcba...
    Terminated: false

  Rail 2:
    Rail ID: 43
    Payee: 0x9876543210fedcba...
    Terminated: false

=== Step 8: Agent Financial Health Dashboard ===

Health Dashboard (JSON):
{
  "timestamp": "2026-02-16T12:57:00.000Z",
  "agent": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
  "network": "Filecoin Calibration Testnet",
  "gas": {
    "balance": "4.5000 FIL",
    "status": "HEALTHY"
  },
  "wallet": {
    "usdfc": "93.5000 USDFC",
    "available_for_deposit": true
  },
  "paymentAccount": {
    "balance": "4.8120 USDFC",
    "status": "HEALTHY",
    "threshold": "1 USDFC"
  },
  "operator": {
    "address": "0x6454...",
    "status": "APPROVED"
  },
  "rails": {
    "total": 5,
    "active": 2
  },
  "overall": "HEALTHY"
}

=== Summary ===

Agent payment setup complete.

What was accomplished:
  - Checked gas balance (FIL) for transaction capability
  - Checked USDFC distribution across wallet and payment account
  - Inspected payment account details (funds, lockup, available)
  - Evaluated autonomous top-up logic against balance threshold
  - Verified operator approval status for storage operations
  - Monitored active payment rails for ongoing storage deals
  - Built a comprehensive health dashboard for monitoring

Overall Status: HEALTHY

In production, this script runs on a schedule (cron job or timer).
It ensures the agent always has sufficient funds and approvals
to continue operating without human intervention.

This completes the Trustless Agent Infrastructure module.
Your agent now has:
  1. A verifiable identity (Agent Card on Filecoin)
  2. An immutable memory system (Data Set with structured logs)
  3. Autonomous payment management (self-funding and monitoring)
```

**Scenario B: Low Balance Agent**

If the payment balance is below the threshold, the output for Step 5 changes:

```
=== Step 5: Autonomous Top-Up Logic ===

Minimum balance threshold: 1 USDFC
Current payment balance:   0.2000 USDFC

Payment balance is below threshold (1 USDFC).
Checking if wallet has sufficient USDFC for top-up...

Wallet has 93.5000 USDFC available.
Depositing 5 USDFC into payment account...

Deposit successful.
  Amount: 5 USDFC
  Transaction: 0xabc123...
  New payment balance: 5.2000 USDFC
```

## Production Considerations

### Hot Wallet Security

This script requires the agent's private key to be accessible as an environment variable. This creates a "hot wallet" — a wallet whose key is stored on a server connected to the internet. Hot wallets are vulnerable to server compromises, malware, and insider threats.

Mitigate this risk:

- Keep only operational funds in the agent's wallet (enough for 1-2 weeks of operations)
- Use a separate cold wallet (hardware wallet, multi-sig) to hold the agent's reserves
- Periodically transfer funds from cold wallet to hot wallet through a manual or semi-automated process
- Set up alerts for unexpected withdrawals from the agent's wallet
- Rotate the agent's private key periodically by creating a new wallet and transferring ownership

### Monitoring the Monitor

The payment manager itself can fail. If the script crashes, the cron job fails to execute, or the server goes down, the agent stops monitoring its finances. Implement external monitoring:

- Use an external service (Uptime Robot, PagerDuty) to verify the payment manager runs on schedule
- Set up blockchain-level alerts that trigger when the payment account balance drops below a threshold, independent of the agent's own monitoring
- Implement a heartbeat pattern: the payment manager writes a timestamp to a monitoring endpoint each time it runs, and the external service alerts if the heartbeat stops

### Cron Job Patterns

For production deployment, run the payment manager on a schedule:

```bash
# Run every hour
0 * * * * cd /path/to/payment-setup/code && node index.js >> /var/log/agent-finance.log 2>&1

# Run every 15 minutes (for high-activity agents)
*/15 * * * * cd /path/to/payment-setup/code && node index.js >> /var/log/agent-finance.log 2>&1
```

The frequency depends on the agent's activity level. An agent uploading data every few minutes needs more frequent checks than one that uploads daily.

## Troubleshooting

**"insufficient funds for gas" or "gas required exceeds allowance"**

The wallet lacks FIL for transaction gas. This is separate from USDFC. Fund the wallet with tFIL from the [Calibration Faucet](https://faucet.calibration.fildev.network/). Even small amounts (0.1 FIL) are sufficient for many transactions.

**"transfer amount exceeds balance"**

The deposit amount exceeds the USDFC available in the wallet. Either reduce `TOP_UP_AMOUNT` or fund the wallet with more USDFC. The script checks for this condition before attempting the deposit, but the error can occur if the balance changes between the check and the deposit.

**"Operator is not fully approved" persists after auto-fix**

The approval transaction may have failed silently. Check that the wallet has sufficient gas. If the problem persists, run the `storage-basics/payment-management` tutorial to manually set up approvals with explicit rate and lockup allowances.

**Payment rails show 0 active but storage operations succeed**

Rails are created asynchronously. There may be a delay between initiating a storage operation and the rail appearing in the query results. Wait a few minutes and re-run the script.

**"Cannot read properties of undefined" on accountInfo fields**

The `accountInfo()` method may return different field names depending on the SDK version. Verify you are using `@filoz/synapse-sdk` version 0.36.1 or later. Check the [SDK documentation](https://docs.filecoin.cloud/developer-guides/synapse/) for the current field names.

**Health dashboard shows CRITICAL but everything seems fine**

The threshold values (`MIN_PAYMENT_BALANCE`, `MIN_GAS_BALANCE`) may be set too high for your use case. Adjust them based on your agent's actual consumption rate. The defaults (1.0 USDFC, 0.1 FIL) are conservative starting points.

## Conclusion

You have built an autonomous payment management system for a Filecoin agent. The script monitors gas balance, USDFC distribution, payment account health, operator approvals, and active payment rails. When the payment balance drops below a threshold, it automatically deposits funds from the wallet. When operator approvals lapse, it re-establishes them. The health dashboard provides a single JSON object that summarizes the agent's complete financial status.

This completes the Trustless Agent Infrastructure module. Across three walkthroughs, you have built the three pillars of autonomous agent operation on Filecoin:

**Identity (Walkthrough 1)**: The Agent Card stored on Filecoin provides a verifiable, censorship-resistant profile. The PieceCID serves as a permanent identifier, and the on-chain registry links identity to ownership. Anyone can discover, verify, and trust the agent based on its Filecoin-backed identity.

**Memory (Walkthrough 2)**: The Data Set-based memory system creates an append-only, tamper-evident audit trail. Every decision, observation, and error is stored with its own PieceCID and protected by cryptographic proofs. Auditors can independently verify any claim about the agent's behavior.

**Finance (Walkthrough 3)**: The autonomous payment manager ensures the agent can fund its own operations. Balance monitoring, conditional deposits, approval management, and health dashboards keep the agent operational without human intervention.

Together, these three capabilities transform a simple script into a trustless autonomous agent — one that can prove who it is, demonstrate what it has done, and sustain its own operations on the Filecoin network.
