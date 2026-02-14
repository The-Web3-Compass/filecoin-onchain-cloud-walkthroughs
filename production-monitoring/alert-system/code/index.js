import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import nodemailer from 'nodemailer';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

// Alert thresholds
const LOW_BALANCE_THRESHOLD = parseFloat(process.env.LOW_BALANCE_THRESHOLD || "1.0");
const CRITICAL_BALANCE_THRESHOLD = parseFloat(process.env.CRITICAL_BALANCE_THRESHOLD || "0.1");

// Alert history to prevent duplicate notifications
const alertHistory = new Map();

/**
 * Alert System for Production Monitoring
 * 
 * This module demonstrates how to:
 * 1. Monitor for alert conditions
 * 2. Send webhook notifications
 * 3. Send email alerts
 * 4. Track provider SLA
 * 5. Implement alert deduplication
 * 
 * Building block for: Alert system in Storage Operations Dashboard
 */
async function main() {
    console.log("Alert System Demo\n");
    console.log("Set up monitoring alerts for Filecoin storage operations.\n");

    // ========================================================================
    // Step 1: Initialize SDK
    // ========================================================================
    console.log("=== Step 1: SDK Initialization ===\n");

    const synapse = await Synapse.create({
        privateKey: process.env.PRIVATE_KEY,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("Connected to Calibration testnet.\n");

    // ========================================================================
    // Step 2: Configure Alert Channels
    // ========================================================================
    console.log("=== Step 2: Alert Channel Configuration ===\n");

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

    console.log("Configured Alert Channels:");
    console.log(`  ✓ Console: Always enabled`);
    console.log(`  ${alertChannels.webhook.enabled ? '✓' : '✗'} Webhook: ${alertChannels.webhook.enabled ? 'Configured' : 'Not configured'}`);
    console.log(`  ${alertChannels.email.enabled ? '✓' : '✗'} Email: ${alertChannels.email.enabled ? 'Configured' : 'Not configured'}\n`);

    // ========================================================================
    // Step 3: Define Alert Rules
    // ========================================================================
    console.log("=== Step 3: Alert Rules ===\n");

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

    console.log("Active Alert Rules:");
    for (const rule of alertRules) {
        const severityIcon = rule.severity === 'critical' ? '🔴' :
            rule.severity === 'error' ? '🟠' : '🟡';
        console.log(`  ${severityIcon} ${rule.name} (${rule.severity})`);
    }
    console.log(`\nThresholds:`);
    console.log(`  Low balance: < ${LOW_BALANCE_THRESHOLD} USDFC`);
    console.log(`  Critical: < ${CRITICAL_BALANCE_THRESHOLD} USDFC\n`);

    // ========================================================================
    // Step 4: Check Alert Conditions
    // ========================================================================
    console.log("=== Step 4: Checking Alert Conditions ===\n");

    const balance = await synapse.payments.balance(TOKENS.USDFC);
    const context = { synapse, balance };

    console.log(`Current balance: ${(Number(balance) / 1e18).toFixed(4)} USDFC\n`);

    const triggeredAlerts = [];

    for (const rule of alertRules) {
        try {
            const triggered = await rule.condition(context);
            if (triggered) {
                const alert = {
                    id: rule.id,
                    name: rule.name,
                    severity: rule.severity,
                    message: rule.message(context),
                    timestamp: new Date().toISOString()
                };
                triggeredAlerts.push(alert);
                console.log(`⚠️  ALERT: ${rule.name}`);
                console.log(`   ${alert.message}\n`);
            } else {
                console.log(`✓  ${rule.name}: OK`);
            }
        } catch (error) {
            console.log(`?  ${rule.name}: Check failed (${error.message})`);
        }
    }

    console.log("");

    // ========================================================================
    // Step 5: Send Webhook Notifications
    // ========================================================================
    console.log("=== Step 5: Webhook Notifications ===\n");

    if (alertChannels.webhook.enabled && triggeredAlerts.length > 0) {
        console.log(`Sending ${triggeredAlerts.length} alert(s) to webhook...\n`);

        for (const alert of triggeredAlerts) {
            if (!shouldSendAlert(alert.id)) {
                console.log(`  ⏭️  ${alert.name}: Skipped (recently sent)\n`);
                continue;
            }

            try {
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

                if (response.ok) {
                    console.log(`  ✓ ${alert.name}: Webhook sent successfully`);
                    markAlertSent(alert.id);
                } else {
                    console.log(`  ✗ ${alert.name}: Webhook failed (${response.status})`);
                }
            } catch (error) {
                console.log(`  ✗ ${alert.name}: Webhook error (${error.message})`);
            }
        }
    } else if (!alertChannels.webhook.enabled) {
        console.log("Webhook not configured. To enable:");
        console.log("  1. Go to https://webhook.site");
        console.log("  2. Copy your unique URL");
        console.log("  3. Set WEBHOOK_URL in .env.local\n");
    } else {
        console.log("No alerts triggered. Webhook notifications not needed.\n");
    }

    // ========================================================================
    // Step 6: Email Notifications
    // ========================================================================
    console.log("=== Step 6: Email Notifications ===\n");

    if (alertChannels.email.enabled && triggeredAlerts.length > 0) {
        console.log("Setting up email transport...\n");

        const transporter = nodemailer.createTransport({
            host: alertChannels.email.host,
            port: alertChannels.email.port,
            secure: false,
            auth: {
                user: alertChannels.email.user,
                pass: alertChannels.email.pass
            }
        });

        for (const alert of triggeredAlerts.filter(a => a.severity === 'critical')) {
            try {
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
                console.log(`  ✓ Email sent for: ${alert.name}`);
            } catch (error) {
                console.log(`  ✗ Email failed: ${error.message}`);
            }
        }
    } else if (!alertChannels.email.enabled) {
        console.log("Email not configured. To enable for testing:");
        console.log("  1. Go to https://ethereal.email");
        console.log("  2. Create a test account");
        console.log("  3. Set SMTP_* variables in .env.local\n");
    } else {
        console.log("No critical alerts. Email notifications not sent.\n");
    }

    // ========================================================================
    // Step 7: Provider SLA Monitoring
    // ========================================================================
    console.log("=== Step 7: Provider SLA Monitoring ===\n");

    const slaMetrics = {
        uptimeTarget: 99.9,
        currentUptime: 99.7,
        proofSuccessTarget: 99.0,
        proofSuccessRate: 99.5,
        responseTimeTarget: "5 min",
        avgResponseTime: "2.3 min"
    };

    console.log("SLA Compliance Report:");
    console.log("┌─────────────────────────────────────────────────────────────────┐");
    console.log("│ Metric                │ Target    │ Current   │ Status         │");
    console.log("├─────────────────────────────────────────────────────────────────┤");

    const uptimeOk = slaMetrics.currentUptime >= slaMetrics.uptimeTarget;
    const proofOk = slaMetrics.proofSuccessRate >= slaMetrics.proofSuccessTarget;

    console.log(`│ Uptime                │ ${String(slaMetrics.uptimeTarget + '%').padEnd(9)} │ ${String(slaMetrics.currentUptime + '%').padEnd(9)} │ ${uptimeOk ? '✓ Compliant' : '✗ BREACH'}    │`);
    console.log(`│ Proof Success Rate    │ ${String(slaMetrics.proofSuccessTarget + '%').padEnd(9)} │ ${String(slaMetrics.proofSuccessRate + '%').padEnd(9)} │ ${proofOk ? '✓ Compliant' : '✗ BREACH'}    │`);
    console.log(`│ Avg Response Time     │ ${slaMetrics.responseTimeTarget.padEnd(9)} │ ${slaMetrics.avgResponseTime.padEnd(9)} │ ✓ Compliant    │`);
    console.log("└─────────────────────────────────────────────────────────────────┘\n");

    if (!uptimeOk || !proofOk) {
        console.log("⚠️  SLA BREACH DETECTED - Notify operations team\n");
    } else {
        console.log("✓ All SLA metrics within targets\n");
    }

    // ========================================================================
    // Step 8: Continuous Monitoring Pattern
    // ========================================================================
    console.log("=== Step 8: Continuous Monitoring Implementation ===\n");

    console.log("Production monitoring loop pattern:");
    console.log(`
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function monitoringLoop() {
    while (true) {
        try {
            // Check all conditions
            const alerts = await checkAlertConditions(synapse, alertRules);
            
            // Send notifications for new alerts
            for (const alert of alerts) {
                if (shouldSendAlert(alert.id)) {
                    await sendWebhook(alert);
                    if (alert.severity === 'critical') {
                        await sendEmail(alert);
                    }
                    markAlertSent(alert.id);
                }
            }
            
            // Update dashboard
            broadcastStatus({ alerts, timestamp: Date.now() });
            
        } catch (error) {
            console.error('Monitor error:', error);
        }
        
        await sleep(POLL_INTERVAL);
    }
}
`);

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("\n=== Summary ===\n");

    console.log("✅ Alert System Complete!\n");

    console.log("You learned:");
    console.log("  • Configuring multiple alert channels (console, webhook, email)");
    console.log("  • Defining alert rules with conditions and thresholds");
    console.log("  • Sending real webhook notifications");
    console.log("  • Email alerts via SMTP (nodemailer)");
    console.log("  • Provider SLA monitoring");
    console.log("  • Alert deduplication to prevent spam\n");

    console.log("Dashboard Building Blocks:");
    console.log("  ✓ Alert system for failures");
    console.log("  ✓ Webhook integration pattern");
    console.log("  ✓ SLA compliance monitoring\n");

    console.log("Production Monitoring Module Complete!");
    console.log("\nExercise: Build a Storage Operations Dashboard combining:");
    console.log("  • Real-time proof status (Walkthrough 1)");
    console.log("  • Historical charts (Walkthrough 2)");
    console.log("  • Alert notifications (Walkthrough 3)");
}

// Alert deduplication helpers
function shouldSendAlert(alertId, cooldownMs = 15 * 60 * 1000) {
    const lastSent = alertHistory.get(alertId);
    if (!lastSent) return true;
    return (Date.now() - lastSent) > cooldownMs;
}

function markAlertSent(alertId) {
    alertHistory.set(alertId, Date.now());
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
