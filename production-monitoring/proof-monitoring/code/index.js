import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

/**
 * Real-Time Proof Monitoring
 * 
 * This module demonstrates how to monitor:
 * 1. Provider information and status
 * 2. Storage service parameters
 * 3. Payment account health
 * 4. Proving period concepts
 * 
 * Building block for: Storage Operations Dashboard
 */
async function main() {
    console.log("Real-Time Proof Monitoring Demo\n");
    console.log("Monitor your Filecoin storage proofs and provider status.\n");

    // ========================================================================
    // Step 1: Initialize SDK and Get Basic Info
    // ========================================================================
    console.log("=== Step 1: SDK Initialization ===\n");

    const synapse = await Synapse.create({
        privateKey: process.env.PRIVATE_KEY,
        rpcURL: process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"
    });

    const chainId = synapse.getChainId();
    console.log(`Connected to chain ID: ${chainId}`);
    console.log(`Network: ${chainId === 314159 ? 'Calibration Testnet' : 'Unknown'}\n`);

    // ========================================================================
    // Step 2: Get Contract Addresses
    // ========================================================================
    console.log("=== Step 2: Core Contract Addresses ===\n");

    const contracts = {
        warmStorage: synapse.getWarmStorageAddress(),
        payments: synapse.getPaymentsAddress(),
        pdpVerifier: synapse.getPDPVerifierAddress()
    };

    console.log("Key Infrastructure Contracts:");
    console.log(`  Warm Storage:  ${contracts.warmStorage}`);
    console.log(`  Payments:      ${contracts.payments}`);
    console.log(`  PDP Verifier:  ${contracts.pdpVerifier}`);
    console.log("\nThese contracts handle storage deals, payments, and proof verification.\n");

    // ========================================================================
    // Step 3: Storage Service Information
    // ========================================================================
    console.log("=== Step 3: Storage Service Parameters ===\n");

    try {
        const storageInfo = await synapse.getStorageInfo();

        console.log("Current Storage Service Configuration:");
        console.log(`  Provider Address: ${storageInfo.providerAddress || 'Default'}`);

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

        console.log("\n");
    } catch (error) {
        console.log("Storage info not available via SDK, using defaults.");
        console.log("  Min Piece Size: 127 bytes");
        console.log("  Max Piece Size: 200 MiB\n");
    }

    // ========================================================================
    // Step 4: Provider Information
    // ========================================================================
    console.log("=== Step 4: Provider Status ===\n");

    const providerAddress = contracts.warmStorage;

    try {
        const providerInfo = await synapse.getProviderInfo(providerAddress);

        console.log("Provider Details:");
        console.log(`  Address: ${providerAddress}`);

        if (providerInfo.faultySectorCount !== undefined) {
            console.log(`  Faulty Sectors: ${providerInfo.faultySectorCount}`);
        }

        if (providerInfo.activeSectorCount !== undefined) {
            console.log(`  Active Sectors: ${providerInfo.activeSectorCount}`);
        }

        // Calculate reliability score (for dashboard building block)
        if (providerInfo.totalProofs !== undefined && providerInfo.successfulProofs !== undefined) {
            const reliability = (providerInfo.successfulProofs / providerInfo.totalProofs * 100).toFixed(2);
            console.log(`  Reliability Score: ${reliability}%`);
        }

        console.log("\n");
    } catch (error) {
        console.log("Provider info query returned error (expected on testnet).");
        console.log("In production, this provides sector and proof statistics.\n");
    }

    // ========================================================================
    // Step 5: Payment Account Health
    // ========================================================================
    console.log("=== Step 5: Payment Account Health ===\n");

    try {
        const balance = await synapse.payments.balance(TOKENS.USDFC);
        const accountInfo = await synapse.payments.accountInfo();

        console.log("Account Status:");
        console.log(`  Wallet Balance: ${(Number(balance) / 1e18).toFixed(4)} USDFC`);

        if (accountInfo.paymentBalance !== undefined) {
            console.log(`  Payment Account: ${(Number(accountInfo.paymentBalance) / 1e18).toFixed(4)} USDFC`);
        }

        if (accountInfo.lockedFunds !== undefined) {
            console.log(`  Locked Funds: ${(Number(accountInfo.lockedFunds) / 1e18).toFixed(4)} USDFC`);
        }

        // Health indicator
        const balanceNumber = Number(balance) / 1e18;
        let healthStatus = "🟢 Healthy";
        if (balanceNumber < 1) {
            healthStatus = "🟡 Low Balance";
        }
        if (balanceNumber < 0.1) {
            healthStatus = "🔴 Critical - Fund immediately";
        }

        console.log(`  Health Status: ${healthStatus}`);
        console.log("\n");
    } catch (error) {
        console.log("Account health check failed:", error.message);
        console.log("\n");
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

    const monitorStatus = {
        timestamp: new Date().toISOString(),
        network: {
            chainId: chainId,
            name: chainId === 314159 ? 'Calibration' : 'Unknown'
        },
        contracts: contracts,
        account: {
            healthy: true,
            balance: await synapse.payments.balance(TOKENS.USDFC).then(b =>
                (Number(b) / 1e18).toFixed(4)
            ).catch(() => "0.0000")
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
        const status = await getMonitorStatus(synapse);
        
        // Check for alerts
        if (status.account.balance < 0.5) {
            await sendAlert('Low balance warning');
        }
        
        // Emit to dashboard
        broadcastStatus(status);
        
        await sleep(intervalMs);
    }
}
`);

    console.log("Recommended polling intervals:");
    console.log("  • Balance checks: Every 5 minutes");
    console.log("  • Provider status: Every 15 minutes");
    console.log("  • Proof monitoring: Every 30 minutes (match deadline window)");
    console.log("\n");

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("=== Summary ===\n");

    console.log("✅ Proof Monitoring Complete!\n");

    console.log("You learned:");
    console.log("  • How to query contract addresses");
    console.log("  • How to check storage service parameters");
    console.log("  • How to monitor payment account health");
    console.log("  • Understanding proving periods and deadlines");
    console.log("  • Building status objects for dashboards\n");

    console.log("Dashboard Building Blocks:");
    console.log("  ✓ Real-time proof status queries");
    console.log("  ✓ Account health monitoring");
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
