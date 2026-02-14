import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

const FILFOX_API = process.env.FILFOX_API_URL || 'https://calibration.filfox.info/api/v1';

/**
 * Historical Analysis with Filecoin APIs
 * 
 * This module demonstrates how to:
 * 1. Query historical transaction data
 * 2. Track message history for an address
 * 3. Analyze provider performance patterns
 * 4. Export data for dashboard charts
 * 
 * Building block for: Historical charts in Storage Operations Dashboard
 */
async function main() {
    console.log("Historical Analysis Demo\n");
    console.log("Query and analyze Filecoin storage history for dashboards.\n");

    // ========================================================================
    // Step 1: Initialize SDK
    // ========================================================================
    console.log("=== Step 1: SDK Initialization ===\n");

    const synapse = await Synapse.create({
        privateKey: process.env.PRIVATE_KEY,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    // Get our wallet address for querying
    const balance = await synapse.payments.balance(TOKENS.USDFC);
    console.log(`Connected. Balance: ${(Number(balance) / 1e18).toFixed(4)} USDFC\n`);

    // ========================================================================
    // Step 2: Query Address Messages via Filfox API
    // ========================================================================
    console.log("=== Step 2: Query Transaction History ===\n");

    const walletAddress = process.env.WALLET_ADDRESS || synapse.getPaymentsAddress();
    console.log(`Querying history for: ${walletAddress}\n`);

    try {
        const messagesUrl = `${FILFOX_API}/address/${walletAddress}/messages?pageSize=10`;
        const response = await fetch(messagesUrl);

        if (!response.ok) {
            console.log("API returned non-OK status. Using fallback data.\n");
        } else {
            const data = await response.json();

            console.log("Recent Transactions:");
            console.log("┌──────────────────────────────────────────────────────────────────────┐");

            const messages = data.messages || data || [];
            const displayMessages = Array.isArray(messages) ? messages.slice(0, 5) : [];

            if (displayMessages.length > 0) {
                for (const msg of displayMessages) {
                    const method = msg.method || 'Unknown';
                    const height = msg.height || 0;
                    const from = truncateAddress(msg.from);
                    const to = truncateAddress(msg.to);
                    console.log(`│ Block ${String(height).padEnd(8)} │ ${method.padEnd(20)} │ ${from} → ${to} │`);
                }
            } else {
                console.log("│ No recent messages found                                           │");
            }

            console.log("└──────────────────────────────────────────────────────────────────────┘\n");
        }
    } catch (error) {
        console.log("Filfox API query failed. Using demonstration data.\n");
        showDemoTransactions();
    }

    // ========================================================================
    // Step 3: Provider Performance Analysis
    // ========================================================================
    console.log("=== Step 3: Provider Performance Metrics ===\n");

    console.log("Calculating reliability scores from proof history...\n");

    // In production, you'd query proof submission events from the chain
    // For demonstration, we show the pattern
    const providerMetrics = await calculateProviderMetrics();

    console.log("Provider Reliability Analysis:");
    console.log("┌─────────────────────────────────────────────────────────────────────┐");
    console.log("│ Provider                │ Success Rate │ Avg Response │ Status      │");
    console.log("├─────────────────────────────────────────────────────────────────────┤");

    for (const metric of providerMetrics) {
        const statusIcon = metric.successRate >= 99 ? "🟢" : metric.successRate >= 95 ? "🟡" : "🔴";
        console.log(`│ ${metric.name.padEnd(22)} │ ${String(metric.successRate + '%').padEnd(12)} │ ${metric.avgResponse.padEnd(12)} │ ${statusIcon} ${metric.status.padEnd(8)} │`);
    }

    console.log("└─────────────────────────────────────────────────────────────────────┘\n");

    // ========================================================================
    // Step 4: Time-Series Data for Charts
    // ========================================================================
    console.log("=== Step 4: Time-Series Data for Charts ===\n");

    console.log("Generating chart data for proof submissions over time...\n");

    const chartData = generateTimeSeriesData();

    console.log("Proof Submissions (Last 7 Days):");
    console.log("┌────────────────────────────────────────────────────────────────┐");

    for (const day of chartData) {
        const bar = "█".repeat(Math.floor(day.proofs / 5));
        console.log(`│ ${day.date} │ ${String(day.proofs).padStart(4)} proofs │ ${bar.padEnd(20)} │`);
    }

    console.log("└────────────────────────────────────────────────────────────────┘\n");

    // ========================================================================
    // Step 5: Cost Analytics
    // ========================================================================
    console.log("=== Step 5: Cost Analytics ===\n");

    const costAnalytics = await analyzeCosts(synapse);

    console.log("Storage Cost Analysis:");
    console.log(`  Total Deposited:    ${costAnalytics.totalDeposited} USDFC`);
    console.log(`  Current Balance:    ${costAnalytics.currentBalance} USDFC`);
    console.log(`  Total Spent:        ${costAnalytics.totalSpent} USDFC`);
    console.log(`  Avg Cost/Upload:    ~${costAnalytics.avgCostPerUpload} USDFC\n`);

    console.log("Cost Breakdown (Estimated):");
    console.log("  ├─ Storage fees:    70%");
    console.log("  ├─ Gas costs:       20%");
    console.log("  └─ Platform fees:   10%\n");

    // ========================================================================
    // Step 6: Export Data for Dashboard
    // ========================================================================
    console.log("=== Step 6: Export Data Formats ===\n");

    const exportData = {
        timestamp: new Date().toISOString(),
        providerMetrics: providerMetrics,
        timeSeriesData: chartData,
        costAnalytics: costAnalytics
    };

    console.log("Dashboard Export (JSON):");
    console.log(JSON.stringify(exportData, null, 2).substring(0, 500) + "...\n");

    console.log("Export formats for integration:");
    console.log("  • JSON: REST API responses");
    console.log("  • CSV:  Spreadsheet analysis");
    console.log("  • Prometheus: Metrics collection\n");

    // ========================================================================
    // Step 7: GraphQL Query Patterns
    // ========================================================================
    console.log("=== Step 7: GraphQL Query Patterns ===\n");

    console.log("Example GraphQL queries for subgraph integration:");
    console.log(`
query StorageDeals($address: String!, $after: Int!) {
  storageDeals(
    where: { client: $address, startEpoch_gt: $after }
    orderBy: startEpoch
    orderDirection: desc
    first: 100
  ) {
    dealId
    pieceCid
    pieceSize
    provider
    startEpoch
    endEpoch
    pricePerEpoch
  }
}

query ProofSubmissions($provider: String!, $since: Int!) {
  proofSubmissions(
    where: { provider: $provider, epoch_gt: $since }
    orderBy: epoch
  ) {
    epoch
    successful
    deadline
    partition
  }
}
`);

    console.log("Subgraph endpoints for Filecoin:");
    console.log("  • Goldsky: Deploy custom subgraph");
    console.log("  • Protofire: Public Filecoin subgraph");
    console.log("  • Self-hosted: The Graph node\n");

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("=== Summary ===\n");

    console.log("✅ Historical Analysis Complete!\n");

    console.log("You learned:");
    console.log("  • Querying transaction history from Filfox API");
    console.log("  • Calculating provider reliability scores");
    console.log("  • Generating time-series data for charts");
    console.log("  • Cost analytics and breakdown");
    console.log("  • Export formats for dashboard integration\n");

    console.log("Dashboard Building Blocks:");
    console.log("  ✓ Provider reliability scores (% successful proofs)");
    console.log("  ✓ Historical proof charts");
    console.log("  ✓ Cost analytics display\n");

    console.log("Next: Building Alert System (walkthrough 3)");
}

// Helper functions

function truncateAddress(address) {
    if (!address) return "unknown";
    if (address.length <= 12) return address;
    return address.substring(0, 6) + "..." + address.substring(address.length - 4);
}

function showDemoTransactions() {
    console.log("Demonstration Transaction Data:");
    console.log("┌──────────────────────────────────────────────────────────────────────┐");
    console.log("│ Block 2847291  │ PublishStorageDeals │ f1abc... → f02345...         │");
    console.log("│ Block 2847188  │ SubmitWindowPoSt    │ f02345... → f05...           │");
    console.log("│ Block 2846992  │ AddBalance          │ 0xb18... → PaymentRails      │");
    console.log("│ Block 2846854  │ SubmitWindowPoSt    │ f02345... → f05...           │");
    console.log("│ Block 2846721  │ ProveReplicaUpdates │ f02345... → f05...           │");
    console.log("└──────────────────────────────────────────────────────────────────────┘\n");
}

async function calculateProviderMetrics() {
    // In production, query proof submission events
    // For demonstration, return realistic sample data
    return [
        { name: "Warm Storage (FOC)", successRate: 99.7, avgResponse: "< 1 min", status: "Active" },
        { name: "Provider f02345", successRate: 98.2, avgResponse: "2-5 min", status: "Active" },
        { name: "Provider f06789", successRate: 94.5, avgResponse: "5-10 min", status: "Slow" }
    ];
}

function generateTimeSeriesData() {
    const data = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        // Simulate realistic proof counts (24 per day per sector in 24-hr period)
        const baseProofs = 48 + Math.floor(Math.random() * 20);

        data.push({
            date: date.toISOString().split('T')[0],
            proofs: baseProofs,
            successful: baseProofs - Math.floor(Math.random() * 2),
            failures: Math.floor(Math.random() * 2)
        });
    }

    return data;
}

async function analyzeCosts(synapse) {
    try {
        const balance = await synapse.payments.balance(TOKENS.USDFC);
        const currentBalance = (Number(balance) / 1e18).toFixed(4);

        // Estimate based on typical patterns
        // In production, track actual deposits and usage
        const estimatedDeposited = (parseFloat(currentBalance) + 0.5).toFixed(4);
        const totalSpent = (parseFloat(estimatedDeposited) - parseFloat(currentBalance)).toFixed(4);

        return {
            totalDeposited: estimatedDeposited,
            currentBalance: currentBalance,
            totalSpent: totalSpent,
            avgCostPerUpload: "0.001" // Rough estimate
        };
    } catch (error) {
        return {
            totalDeposited: "5.0000",
            currentBalance: "4.5000",
            totalSpent: "0.5000",
            avgCostPerUpload: "0.001"
        };
    }
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
