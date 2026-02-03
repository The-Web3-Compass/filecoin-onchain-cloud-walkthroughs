import 'dotenv/config';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Alert System for Beam CDN
 * 
 * This script checks collected metrics and costs against defined thresholds:
 * - Monitors egress usage (daily/monthly limits)
 * - Tracks cost thresholds
 * - Checks performance health (TTFB, success rate, throughput)
 * - Triggers alerts via console (and potentially other channels)
 */

const CONFIG_FILE = join(__dirname, 'alert-config.json');
const METRICS_FILE = join(__dirname, 'data', 'metrics.json');
const COST_FILE = join(__dirname, 'data', 'costs.json');
const ALERTS_HISTORY_FILE = join(__dirname, 'data', 'alerts-history.json');

// Load configuration
function loadConfig() {
    try {
        const data = readFileSync(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ Could not load alert config, using defaults');
        return {
            egressThresholds: { daily: { critical: 10 } },
            costThresholds: { daily: { critical: 0.5 } },
            performanceThresholds: { ttfb: { critical: 5000 } }
        };
    }
}

// Load metrics
function loadMetrics() {
    if (existsSync(METRICS_FILE)) {
        return JSON.parse(readFileSync(METRICS_FILE, 'utf-8'));
    }
    return null;
}

// Load cost data
function loadCosts() {
    if (existsSync(COST_FILE)) {
        return JSON.parse(readFileSync(COST_FILE, 'utf-8'));
    }
    return null;
}

// Save alert history
function saveAlertHistory(alerts) {
    const history = existsSync(ALERTS_HISTORY_FILE)
        ? JSON.parse(readFileSync(ALERTS_HISTORY_FILE, 'utf-8'))
        : [];

    history.push(...alerts);

    // Keep only last 100 alerts
    const trimmedHistory = history.slice(-100);
    writeFileSync(ALERTS_HISTORY_FILE, JSON.stringify(trimmedHistory, null, 2));
}

function checkThresholds(config, metrics, costs) {
    const alerts = [];
    const now = new Date().toISOString();

    if (!metrics || !metrics.summary) {
        console.log('⚠️  No metrics available for threshold check.');
        return [];
    }

    // 1. Check Egress Thresholds
    const dailyEgress = metrics.summary.totalEgressGB; // This is total, in a real system you'd calculate daily
    if (dailyEgress > config.egressThresholds.daily.critical) {
        alerts.push({
            timestamp: now,
            type: 'CRITICAL',
            category: 'Egress',
            message: `Daily egress (${dailyEgress.toFixed(4)} GB) exceeds critical threshold (${config.egressThresholds.daily.critical} GB)`
        });
    } else if (dailyEgress > config.egressThresholds.daily.warning) {
        alerts.push({
            timestamp: now,
            type: 'WARNING',
            category: 'Egress',
            message: `Daily egress (${dailyEgress.toFixed(4)} GB) exceeds warning threshold (${config.egressThresholds.daily.warning} GB)`
        });
    }

    // 2. Check Cost Thresholds
    if (costs && costs.analysis) {
        const dailySpend = costs.analysis.dailySpendingRate;
        if (dailySpend > config.costThresholds.daily.critical) {
            alerts.push({
                timestamp: now,
                type: 'CRITICAL',
                category: 'Cost',
                message: `Daily cost (${dailySpend.toFixed(6)} USDFC) exceeds critical threshold (${config.costThresholds.daily.critical} USDFC)`
            });
        }
    }

    // 3. Check Performance
    if (metrics.summary.avgTTFB > config.performanceThresholds.ttfb.critical) {
        alerts.push({
            timestamp: now,
            type: 'CRITICAL',
            category: 'Performance',
            message: `Average TTFB (${metrics.summary.avgTTFB.toFixed(2)}ms) exceeds critical threshold (${config.performanceThresholds.ttfb.critical}ms)`
        });
    }

    if (metrics.summary.successRate < config.performanceThresholds.successRate.critical) {
        alerts.push({
            timestamp: now,
            type: 'CRITICAL',
            category: 'Performance',
            message: `Success rate (${metrics.summary.successRate.toFixed(2)}%) below critical threshold (${config.performanceThresholds.successRate.critical}%)`
        });
    }

    return alerts;
}

async function main() {
    console.log('='.repeat(70));
    console.log('  Filecoin Beam CDN: Alert System');
    console.log('='.repeat(70));
    console.log();

    const config = loadConfig();
    const metrics = loadMetrics();
    const costs = loadCosts();

    const alerts = checkThresholds(config, metrics, costs);

    if (alerts.length === 0) {
        console.log('✅ All systems within normal operating thresholds.');
        console.log('   No alerts triggered.');
    } else {
        console.log(`⚠️  ${alerts.length} alert(s) triggered:\\n`);

        alerts.forEach(alert => {
            const color = alert.type === 'CRITICAL' ? '\\x1b[31m' : '\\x1b[33m'; // Red or Yellow
            const reset = '\\x1b[0m';
            console.log(`${color}[${alert.type}] ${alert.category}:${reset} ${alert.message}`);
        });

        // Save to history
        saveAlertHistory(alerts);
        console.log(`\\n✓ Alerts recorded in history.`);
    }

    console.log();
    console.log('Alert Configuration Summary:');
    console.log(`  • Daily Egress Limit: ${config.egressThresholds.daily.critical} GB`);
    console.log(`  • Daily Cost Limit: ${config.costThresholds.daily.critical} USDFC`);
    console.log(`  • Max TTFB: ${config.performanceThresholds.ttfb.critical} ms`);
    console.log(`  • Min Success Rate: ${config.performanceThresholds.successRate.critical} %`);
    console.log();
}

main().catch(console.error);
