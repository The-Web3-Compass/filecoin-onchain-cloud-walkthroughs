import dotenv from 'dotenv';
import { Synapse, TOKENS, TIME_CONSTANTS, calibration } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { http, formatUnits } from 'viem';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

/**
 * Historical Analysis
 *
 * This module demonstrates how to:
 * 1. Query your on-chain data sets using the SDK
 * 2. Inspect provider information from the storage service
 * 3. Analyze provider performance metrics
 * 4. Generate time-series metrics
 * 5. Track storage costs and lockups
 *
 * Note: The SDK no longer bundles a SubgraphService. For deep historical
 * event queries, deploy your own subgraph (e.g. via Goldsky) and query it
 * directly with fetch(). This walkthrough covers what's available natively
 * through the SDK.
 *
 * Building block for: Historical charts in Storage Operations Dashboard
 */
async function main() {
    console.log("Historical Analysis Demo\n");
    console.log("Query and analyze your Filecoin storage state on-chain.\n");

    // ========================================================================
    // Step 1: Initialize SDK
    // ========================================================================
    console.log("=== Step 1: Initialization ===\n");

    const account = privateKeyToAccount(process.env.PRIVATE_KEY);
    const synapse = Synapse.create({
        chain: calibration,
        transport: http(process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"),
        account,
        source: null
    });

    console.log("✓ SDK initialized");
    console.log(`  Network: ${synapse.chain.name} (chain ID: ${synapse.chain.id})\n`);

    // ========================================================================
    // Step 2: Query Your Data Sets On-Chain
    // ========================================================================
    console.log("=== Step 2: Querying Your Data Sets (On-Chain) ===\n");

    // synapse.storage.findDataSets() queries the FWSS contract directly for
    // all data sets associated with your wallet address. No subgraph needed.
    try {
        const dataSets = await synapse.storage.findDataSets();

        console.log(`Found ${dataSets.length} data set(s) associated with your wallet:\n`);
        console.log("┌──────────────────────────────────────────────────────────────────────┐");
        console.log("│ Dataset ID │ Provider ID │ Active │ CDN │ Rail ID                    │");
        console.log("├──────────────────────────────────────────────────────────────────────┤");

        if (dataSets.length > 0) {
            for (const ds of dataSets) {
                const id = String(ds.dataSetId).padEnd(10);
                const provider = String(ds.providerId).padEnd(11);
                const active = (ds.isLive ? 'Yes' : 'No').padEnd(6);
                const cdn = (ds.withCDN ? 'Yes' : 'No').padEnd(3);
                const rail = String(ds.pdpRailId).padEnd(26);
                console.log(`│ ${id} │ ${provider} │ ${active} │ ${cdn} │ ${rail} │`);
            }
        } else {
            console.log("│ No data sets found for this wallet.                                  │");
            console.log("│ Upload some data first using storage-basics/first-upload.             │");
        }
        console.log("└──────────────────────────────────────────────────────────────────────┘\n");

        if (dataSets.length > 0) {
            const activeSets = dataSets.filter(ds => ds.isLive);
            console.log(`Active data sets: ${activeSets.length} of ${dataSets.length}`);
            console.log(`CDN-enabled sets: ${dataSets.filter(ds => ds.withCDN).length}\n`);
        }

    } catch (error) {
        console.log("Data set query failed:", error.message);
        console.log("Ensure your wallet has at least one upload.\n");
    }

    // ========================================================================
    // Step 3: Provider Performance Analysis
    // ========================================================================
    console.log("=== Step 3: Provider Performance Analysis ===\n");

    console.log("Querying approved providers from storage service info...\n");

    try {
        const storageInfo = await synapse.storage.getStorageInfo();
        const providers = storageInfo.providers;

        console.log(`Approved Storage Providers: ${providers.length}\n`);
        console.log("Provider List:");
        console.log("┌──────────────────────────────────────────────────────────────┐");
        console.log("│ Provider ID │ Address                                        │");
        console.log("├──────────────────────────────────────────────────────────────┤");

        for (const provider of providers) {
            const id = String(provider.providerId).padEnd(11);
            const addr = truncateAddress(provider.serviceProvider).padEnd(46);
            console.log(`│ ${id} │ ${addr} │`);
        }

        if (providers.length === 0) {
            console.log("│ No approved providers found on this network.                 │");
        }
        console.log("└──────────────────────────────────────────────────────────────┘\n");

        console.log("Note: For fault counts, proof success rates, and historical reliability");
        console.log("data, you need an off-chain indexer (subgraph). See Step 4 below.\n");

    } catch (err) {
        console.log("Provider query error:", err.message);
    }

    // ========================================================================
    // Step 4: Historical Data via Subgraph (External)
    // ========================================================================
    console.log("=== Step 4: Historical Data (Subgraph Pattern) ===\n");

    // The SDK no longer bundles a SubgraphService. For time-series queries
    // (proof history, fault events, piece creation timestamps), deploy a
    // subgraph using Goldsky and query it with a standard fetch() call.
    //
    // Example using a deployed Goldsky endpoint:
    //
    //   const SUBGRAPH_ENDPOINT = process.env.SUBGRAPH_ENDPOINT;
    //   const response = await fetch(SUBGRAPH_ENDPOINT, {
    //       method: 'POST',
    //       headers: { 'Content-Type': 'application/json' },
    //       body: JSON.stringify({ query: `{ dataSets(first: 5) { id totalPieces } }` })
    //   });
    //   const { data } = await response.json();
    //
    // Until you have a subgraph, use demo data to prototype your dashboard:

    console.log("Daily Storage Activity (Demo — replace with subgraph query):");
    console.log("┌────────────────────────────────────────────────────────────────┐");

    const chartData = generateDemoTimeSeries();

    for (const day of chartData) {
        const bar = "█".repeat(Math.floor(day.pieces / 2));
        console.log(`│ ${day.date} │ ${String(day.pieces).padStart(4)} pieces │ ${bar.padEnd(20)} │`);
    }

    console.log("└────────────────────────────────────────────────────────────────┘");
    console.log("\nTo use real data: deploy a Filecoin subgraph to Goldsky and set");
    console.log("SUBGRAPH_ENDPOINT in your .env.local. See walkthrough for details.\n");

    // ========================================================================
    // Step 5: Cost & Lockup Analysis (Real-time)
    // ========================================================================
    console.log("=== Step 5: Cost & Lockup Analysis ===\n");

    try {
        const accountInfo = await synapse.payments.accountInfo({ token: TOKENS.USDFC });
        const paymentBalance = await synapse.payments.balance({ token: TOKENS.USDFC });

        console.log("Financial Metrics (Real-time from Chain):");
        console.log(`  Current Balance: ${formatUnits(paymentBalance, 18)} USDFC`);

        if (accountInfo.lockupRate > 0n) {
            const dailyCost = Number(accountInfo.lockupRate) * Number(TIME_CONSTANTS.EPOCHS_PER_DAY) / 1e18;
            const monthlyCost = dailyCost * 30;

            console.log(`  Daily Burn Rate: ${dailyCost.toFixed(6)} USDFC`);
            console.log(`  Monthly Est.:    ${monthlyCost.toFixed(6)} USDFC`);

            const daysRemaining = Number(accountInfo.availableFunds / accountInfo.lockupRate) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);
            console.log(`  Runway:          ~${daysRemaining.toFixed(1)} days`);
        } else {
            console.log("  No active cost (no locked funds for storage).");
        }
        console.log();

    } catch (error) {
        console.log("Cost analysis failed:", error.message);
    }

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("=== Summary ===\n");

    console.log("✅ Historical Analysis Complete!\n");

    console.log("You learned:");
    console.log("  • Querying your on-chain data sets with synapse.storage.findDataSets()");
    console.log("  • Getting provider info from synapse.storage.getStorageInfo()");
    console.log("  • Prototyping time-series charts with demo data");
    console.log("  • The subgraph pattern for deep historical event queries");
    console.log("  • Integrating financial metrics from the payment channel\n");

    console.log("Dashboard Building Blocks:");
    console.log("  ✓ On-chain data set inventory");
    console.log("  ✓ Provider list from storage service");
    console.log("  ✓ Storage activity charts (demo → connect to subgraph)");
    console.log("  ✓ Financial runway calculator");
}

// Helpers

function truncateAddress(address) {
    if (!address) return "unknown";
    if (address.length <= 12) return address;
    return address.substring(0, 6) + "..." + address.substring(address.length - 4);
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function generateDemoTimeSeries() {
    const data = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        data.push({
            date: date.toISOString().split('T')[0],
            pieces: 12 + Math.floor(Math.random() * 20)
        });
    }
    return data;
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
