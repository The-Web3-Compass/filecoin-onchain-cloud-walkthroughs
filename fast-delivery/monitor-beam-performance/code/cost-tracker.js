import 'dotenv/config';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Cost Tracker for Beam CDN Operations
 * 
 * This script monitors spending on Beam CDN operations:
 * - Tracks payment account balance changes
 * - Calculates cost per GB of egress
 * - Monitors spending rate (daily/monthly)
 * - Projects future costs based on usage patterns
 * - Generates cost reports
 */

const COST_FILE = join(__dirname, 'data', 'costs.json');
const METRICS_FILE = join(__dirname, 'data', 'metrics.json');

// Load existing cost data
function loadCosts() {
    if (existsSync(COST_FILE)) {
        try {
            const data = readFileSync(COST_FILE, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.log('⚠️  Could not load existing costs, starting fresh');
            return { snapshots: [], analysis: {} };
        }
    }
    return { snapshots: [], analysis: {} };
}

// Load metrics data
function loadMetrics() {
    if (existsSync(METRICS_FILE)) {
        try {
            const data = readFileSync(METRICS_FILE, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }
    return null;
}

// Save cost data
function saveCosts(costs) {
    writeFileSync(COST_FILE, JSON.stringify(costs, null, 2));
}

// Calculate cost analysis
function analyzeCosts(snapshots, metrics) {
    if (snapshots.length < 2) {
        return {
            totalSpent: 0,
            costPerGB: 0,
            dailySpendingRate: 0,
            monthlyProjection: 0,
            daysCovered: 0,
            lastUpdated: new Date().toISOString()
        };
    }

    // Calculate total spent (difference between first and last snapshot)
    const firstSnapshot = snapshots[0];
    const lastSnapshot = snapshots[snapshots.length - 1];

    const totalSpent = firstSnapshot.balance - lastSnapshot.balance;

    // Calculate cost per GB if we have metrics
    let costPerGB = 0;
    if (metrics && metrics.summary && metrics.summary.totalEgressGB > 0) {
        costPerGB = totalSpent / metrics.summary.totalEgressGB;
    }

    // Calculate time span in days
    const firstDate = new Date(firstSnapshot.timestamp);
    const lastDate = new Date(lastSnapshot.timestamp);
    const daysDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24);

    // Calculate daily spending rate
    const dailySpendingRate = daysDiff > 0 ? totalSpent / daysDiff : 0;

    // Project monthly costs
    const monthlyProjection = dailySpendingRate * 30;

    return {
        totalSpent,
        costPerGB,
        dailySpendingRate,
        monthlyProjection,
        daysCovered: daysDiff,
        lastUpdated: new Date().toISOString()
    };
}

async function main() {
    console.log('='.repeat(70));
    console.log('  Filecoin Beam CDN: Cost Tracker');
    console.log('='.repeat(70));
    console.log();
    console.log('This script monitors spending on Beam CDN operations:');
    console.log('  • Payment account balance tracking');
    console.log('  • Cost per GB calculation');
    console.log('  • Daily/monthly spending rates');
    console.log('  • Future cost projections');
    console.log();

    // Initialize SDK
    console.log('📡 Step 1: Initializing Filecoin SDK...\\n');

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('Missing PRIVATE_KEY in .env file');
    }

    const synapse = await Synapse.create({
        privateKey: privateKey,
        rpcURL: 'https://api.calibration.node.glif.io/rpc/v1'
    });

    console.log('✓ SDK initialized successfully\\n');

    // Get current balance
    console.log('💰 Step 2: Checking Payment Account Balance...\\n');

    const currentBalance = await synapse.payments.balance(TOKENS.USDFC);
    const balanceFormatted = parseFloat(ethers.formatUnits(currentBalance, 18));

    console.log(`Current Balance: ${balanceFormatted.toFixed(6)} USDFC`);
    console.log();

    // Record balance snapshot
    const snapshot = {
        timestamp: new Date().toISOString(),
        balance: balanceFormatted,
        balanceRaw: currentBalance.toString()
    };

    // Load existing cost data
    const costData = loadCosts();
    costData.snapshots.push(snapshot);

    // Load metrics for cost analysis
    const metrics = loadMetrics();

    // Analyze costs
    costData.analysis = analyzeCosts(costData.snapshots, metrics);

    // Save cost data
    saveCosts(costData);

    // Display cost analysis
    console.log('='.repeat(70));
    console.log('  Cost Analysis');
    console.log('='.repeat(70));
    console.log();

    if (costData.snapshots.length < 2) {
        console.log('⚠️  Not enough data for cost analysis yet.');
        console.log('   Run this script again after some operations to see cost trends.');
        console.log();
    } else {
        console.log(`Total Snapshots: ${costData.snapshots.length}`);
        console.log(`Days Covered: ${costData.analysis.daysCovered.toFixed(2)}`);
        console.log();
        console.log(`Total Spent: ${costData.analysis.totalSpent.toFixed(6)} USDFC`);

        if (metrics && metrics.summary && metrics.summary.totalEgressGB > 0) {
            console.log(`Total Egress: ${metrics.summary.totalEgressGB.toFixed(4)} GB`);
            console.log(`Cost per GB: ${costData.analysis.costPerGB.toFixed(6)} USDFC/GB`);
        }

        console.log();
        console.log('Spending Rate:');
        console.log(`  Daily: ${costData.analysis.dailySpendingRate.toFixed(6)} USDFC/day`);
        console.log(`  Monthly (projected): ${costData.analysis.monthlyProjection.toFixed(6)} USDFC/month`);
        console.log();

        // Budget warnings
        const dailyThreshold = parseFloat(process.env.COST_THRESHOLD_USDFC_DAY || 0.5);
        const monthlyThreshold = parseFloat(process.env.COST_THRESHOLD_USDFC_MONTH || 15);

        if (costData.analysis.dailySpendingRate > dailyThreshold) {
            console.log(`⚠️  WARNING: Daily spending rate (${costData.analysis.dailySpendingRate.toFixed(6)} USDFC) exceeds threshold (${dailyThreshold} USDFC)`);
        }

        if (costData.analysis.monthlyProjection > monthlyThreshold) {
            console.log(`⚠️  WARNING: Monthly projection (${costData.analysis.monthlyProjection.toFixed(6)} USDFC) exceeds threshold (${monthlyThreshold} USDFC)`);
        }
    }

    console.log();
    console.log(`✓ Cost data saved to: ${COST_FILE}`);
    console.log();
    console.log('Balance History:');

    // Show last 5 snapshots
    const recentSnapshots = costData.snapshots.slice(-5);
    recentSnapshots.forEach((snap, index) => {
        const date = new Date(snap.timestamp).toLocaleString();
        console.log(`  ${index + 1}. ${date}: ${snap.balance.toFixed(6)} USDFC`);
    });

    console.log();
    console.log('Next Steps:');
    console.log('  1. Run "npm run alerts" to check if thresholds are exceeded');
    console.log('  2. Run "npm run dashboard" to visualize costs over time');
    console.log('  3. Run "npm run collect" to gather more metrics');
    console.log();
}

main().catch((err) => {
    console.error('\\n❌ Error during cost tracking:');
    console.error(err);
    process.exit(1);
});
