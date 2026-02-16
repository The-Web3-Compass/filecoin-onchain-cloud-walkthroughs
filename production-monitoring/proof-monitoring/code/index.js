import dotenv from 'dotenv';
import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

/**
 * Real-Time Proof Monitoring
 * 
 * This module demonstrates how to monitor:
 * 1. Core contract addresses and network status
 * 2. Storage service parameters
 * 3. Payment account health with days-remaining calculation
 * 4. Operator approval status
 * 5. Filecoin proving period concepts
 * 
 * Building block for: Storage Operations Dashboard
 */
async function main() {
    console.log("Real-Time Proof Monitoring Demo\n");
    console.log("Monitor your Filecoin storage proofs and provider status.\n");

    // ========================================================================
    // Step 1: Initialize SDK
    // ========================================================================
    console.log("=== Step 1: SDK Initialization ===\n");

    const synapse = await Synapse.create({
        privateKey: process.env.PRIVATE_KEY,
        rpcURL: process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("✓ SDK initialized successfully");
    console.log(`  Connected to: Filecoin Calibration Testnet\n`);

    // ========================================================================
    // Step 2: Get Core Contract Addresses
    // ========================================================================
    console.log("=== Step 2: Core Contract Addresses ===\n");

    const warmStorageAddress = synapse.getWarmStorageAddress();

    console.log("Key Infrastructure Contracts:");
    console.log(`  Warm Storage Operator: ${warmStorageAddress}`);
    console.log("\nThis is the storage operator that manages uploads and proofs.");
    console.log("You can look up this address on https://calibration.filfox.info/ to see activity.\n");

    // ========================================================================
    // Step 3: Storage Service Information
    // ========================================================================
    console.log("=== Step 3: Storage Service Parameters ===\n");

    try {
        const storageInfo = await synapse.storage.getStorageInfo();

        console.log("Current Storage Service Configuration:");

        if (storageInfo.providerAddress) {
            console.log(`  Provider Address: ${storageInfo.providerAddress}`);
        }

        if (storageInfo.pricePerBytePerEpoch) {
            const pricePerGB = Number(storageInfo.pricePerBytePerEpoch) * 1024 * 1024 * 1024;
            console.log(`  Price per GB/epoch: ${pricePerGB.toExponential(4)} USDFC`);
        }

        if (storageInfo.minPieceSizeBytes) {
            console.log(`  Min Piece Size: ${storageInfo.minPieceSizeBytes} bytes`);
        }

        if (storageInfo.maxPieceSizeBytes) {
            console.log(`  Max Piece Size: ${formatBytes(Number(storageInfo.maxPieceSizeBytes))}`);
        }

        console.log();
    } catch (error) {
        console.log("Storage info retrieval note: Some fields may not be available on testnet.");
        console.log("  Known constraints:");
        console.log("  Min Piece Size: 127 bytes");
        console.log("  Max Piece Size: 200 MiB\n");
    }

    // ========================================================================
    // Step 4: Operator Approval Status
    // ========================================================================
    console.log("=== Step 4: Operator Approval Status ===\n");

    try {
        const operatorAddress = warmStorageAddress;
        const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

        console.log("Storage Operator Approval:");
        console.log(`  Operator: ${operatorAddress}`);
        console.log(`  Approved: ${approval.isApproved ? '✓ Yes' : '✗ No'}`);

        if (approval.rateAllowance !== undefined) {
            console.log(`  Rate Allowance: ${ethers.formatUnits(approval.rateAllowance, 18)} USDFC/epoch`);
        }

        if (approval.lockupAllowance !== undefined) {
            console.log(`  Lockup Allowance: ${ethers.formatUnits(approval.lockupAllowance, 18)} USDFC`);
        }

        if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
            console.log("\n  ⚠️  WARNING: Operator is not fully approved.");
            console.log("  Storage operations will fail without proper approval.");
            console.log("  Re-run the payment-management tutorial to fix this.");
        } else {
            console.log("\n  ✓ Operator is fully approved for storage operations.");
        }

        console.log();
    } catch (error) {
        console.log("Approval check failed:", error.message);
        console.log();
    }

    // ========================================================================
    // Step 5: Payment Account Health
    // ========================================================================
    console.log("=== Step 5: Payment Account Health ===\n");

    try {
        const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
        const walletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
        const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);

        console.log("Account Status:");
        console.log(`  Wallet Balance (USDFC):  ${ethers.formatUnits(walletBalance, 18)} USDFC`);
        console.log(`  Payment Account (USDFC): ${ethers.formatUnits(paymentBalance, 18)} USDFC`);
        console.log();

        console.log("Payment Account Details:");
        console.log(`  Total Funds:     ${ethers.formatUnits(accountInfo.funds, 18)} USDFC`);
        console.log(`  Current Lockup:  ${ethers.formatUnits(accountInfo.lockupCurrent, 18)} USDFC`);
        console.log(`  Lockup Rate:     ${ethers.formatUnits(accountInfo.lockupRate, 18)} USDFC/epoch`);
        console.log(`  Available Funds: ${ethers.formatUnits(accountInfo.availableFunds, 18)} USDFC`);
        console.log(`  Last Settled:    Epoch ${accountInfo.lockupLastSettledAt}`);
        console.log();

        // Calculate days remaining
        if (accountInfo.lockupRate > 0n) {
            const epochsRemaining = accountInfo.availableFunds / accountInfo.lockupRate;
            const daysRemaining = Number(epochsRemaining) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);

            console.log(`  📊 Estimated Days Remaining: ~${daysRemaining.toFixed(1)} days`);

            if (daysRemaining < 7) {
                console.log("  🔴 CRITICAL: Less than 7 days of storage remaining!");
            } else if (daysRemaining < 14) {
                console.log("  🟡 WARNING: Less than 14 days remaining. Monitor closely.");
            } else {
                console.log("  🟢 Healthy: Sufficient balance for continued storage.");
            }
        } else {
            console.log("  → No active storage deals (lockup rate is 0)");
        }

        // Simple health indicator based on payment balance
        const balanceNumber = Number(paymentBalance) / 1e18;
        let healthStatus = "🟢 Healthy";
        if (balanceNumber < 1) {
            healthStatus = "🟡 Low Balance";
        }
        if (balanceNumber < 0.1) {
            healthStatus = "🔴 Critical - Fund immediately";
        }

        console.log(`\n  Overall Health: ${healthStatus}`);
        console.log();
    } catch (error) {
        console.log("Account health check failed:", error.message);
        console.log();
    }

    // ========================================================================
    // Step 6: Understanding Proving Periods
    // ========================================================================
    console.log("=== Step 6: Understanding Proving Periods ===\n");

    console.log("Filecoin Proof Schedule:");
    console.log("┌─────────────────────────────────────────────────────────────────┐");
    console.log("│  Proof Type          │ Frequency        │ Purpose              │");
    console.log("├─────────────────────────────────────────────────────────────────┤");
    console.log("│  WindowPoSt          │ Every 24 hours   │ Verify data storage  │");
    console.log("│  WinningPoSt         │ Per epoch (30s)  │ Block production     │");
    console.log("│  PDP (Hot Storage)   │ Configurable     │ Fast retrieval proof │");
    console.log("└─────────────────────────────────────────────────────────────────┘");
    console.log("\nKey Concepts:");
    console.log("  • Proving Period: 24-hour window for WindowPoSt submissions");
    console.log("  • Deadline: 30-minute window within proving period");
    console.log("  • Fault: Missing a proof deadline (triggers penalties)");
    console.log("  • Recovery: Provider can restore faulted sectors\n");

    // ========================================================================
    // Step 7: Build Monitor Status Object
    // ========================================================================
    console.log("=== Step 7: Monitor Status Object ===\n");

    console.log("Building status object for dashboard integration...\n");

    const currentBalance = await synapse.payments.balance(TOKENS.USDFC).catch(() => 0n);

    const monitorStatus = {
        timestamp: new Date().toISOString(),
        network: {
            name: 'Calibration Testnet',
            rpc: process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"
        },
        contracts: {
            warmStorage: warmStorageAddress
        },
        account: {
            healthy: Number(currentBalance) / 1e18 > 0.1,
            paymentBalance: (Number(currentBalance) / 1e18).toFixed(4)
        },
        proofSchedule: {
            windowPoStPeriod: "24 hours",
            deadlineWindow: "30 minutes",
            pdpEnabled: true
        }
    };

    console.log("Status Object (JSON):");
    console.log(JSON.stringify(monitorStatus, null, 2));
    console.log("\n");

    // ========================================================================
    // Step 8: Continuous Monitoring Pattern
    // ========================================================================
    console.log("=== Step 8: Continuous Monitoring Pattern ===\n");

    console.log("For production dashboards, implement polling:");
    console.log(`
async function monitorLoop(intervalMs = 60000) {
    while (true) {
        const balance = await synapse.payments.balance(TOKENS.USDFC);
        const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);
        
        // Check for alerts
        if (Number(balance) / 1e18 < 0.5) {
            await sendAlert('Low balance warning');
        }
        
        // Calculate days remaining
        if (accountInfo.lockupRate > 0n) {
            const epochsLeft = accountInfo.availableFunds / accountInfo.lockupRate;
            const daysLeft = Number(epochsLeft) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);
            if (daysLeft < 7) await sendAlert('Critical: < 7 days remaining');
        }
        
        await new Promise(r => setTimeout(r, intervalMs));
    }
}
`);

    console.log("Recommended polling intervals:");
    console.log("  • Balance checks: Every 5 minutes");
    console.log("  • Provider status: Every 15 minutes");
    console.log("  • Proof monitoring: Every 30 minutes (match deadline window)\n");

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("=== Summary ===\n");

    console.log("✅ Proof Monitoring Complete!\n");

    console.log("You learned:");
    console.log("  • How to query contract addresses");
    console.log("  • How to check storage service parameters");
    console.log("  • How to verify operator approval status");
    console.log("  • How to monitor payment account health");
    console.log("  • How to calculate days of storage remaining");
    console.log("  • Understanding proving periods and deadlines");
    console.log("  • Building status objects for dashboards\n");

    console.log("Dashboard Building Blocks:");
    console.log("  ✓ Real-time account health monitoring");
    console.log("  ✓ Days-remaining calculation");
    console.log("  ✓ Operator approval verification");
    console.log("  ✓ Polling patterns for live updates\n");

    console.log("Next: Historical Analysis with Subgraph (walkthrough 2)");
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
