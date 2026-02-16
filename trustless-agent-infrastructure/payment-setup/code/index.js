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
