import dotenv from 'dotenv';
import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';
import nodemailer from 'nodemailer';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

// Configurable thresholds
const LOW_BALANCE_THRESHOLD = parseFloat(process.env.LOW_BALANCE_THRESHOLD || "1.0");
const CRITICAL_BALANCE_THRESHOLD = parseFloat(process.env.CRITICAL_BALANCE_THRESHOLD || "0.1");

// Alert deduplication
const alertHistory = new Map();

/**
 * Alert System for Filecoin Storage
 * 
 * This module demonstrates how to:
 * 1. Configure alert channels (console, webhook, email)
 * 2. Define alert rules with conditions and severity
 * 3. Evaluate rules against live blockchain data
 * 4. Send webhook notifications
 * 5. Set up email alerts (optional)
 * 6. Monitor SLA compliance
 * 7. Implement alert deduplication
 * 
 * Building block for: Alert panel in Storage Operations Dashboard
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
        rpcURL: process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("✓ SDK initialized\n");

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
    console.log(`  ${alertChannels.console.enabled ? '✓' : '✗'} Console: Always enabled`);
    console.log(`  ${alertChannels.webhook.enabled ? '✓' : '✗'} Webhook: ${alertChannels.webhook.enabled ? 'Configured' : 'Not configured (set WEBHOOK_URL)'}`);
    console.log(`  ${alertChannels.email.enabled ? '✓' : '✗'} Email: ${alertChannels.email.enabled ? 'Configured' : 'Not configured (set SMTP_HOST, SMTP_USER)'}\n`);

    console.log(`Alert Thresholds:`);
    console.log(`  Low Balance:      < ${LOW_BALANCE_THRESHOLD} USDFC (warning)`);
    console.log(`  Critical Balance: < ${CRITICAL_BALANCE_THRESHOLD} USDFC (critical)\n`);

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
                const bal = Number(ctx.paymentBalance) / 1e18;
                return bal < LOW_BALANCE_THRESHOLD && bal >= CRITICAL_BALANCE_THRESHOLD;
            },
            message: (ctx) => `Balance is low: ${ethers.formatUnits(ctx.paymentBalance, 18)} USDFC (threshold: ${LOW_BALANCE_THRESHOLD})`
        },
        {
            id: 'critical_balance',
            name: 'Critical Balance Alert',
            severity: 'critical',
            condition: async (ctx) => {
                const bal = Number(ctx.paymentBalance) / 1e18;
                return bal < CRITICAL_BALANCE_THRESHOLD;
            },
            message: (ctx) => `CRITICAL: Balance below ${CRITICAL_BALANCE_THRESHOLD} USDFC! Current: ${ethers.formatUnits(ctx.paymentBalance, 18)} USDFC`
        },
        {
            id: 'operator_not_approved',
            name: 'Operator Not Approved',
            severity: 'error',
            condition: async (ctx) => {
                const operatorAddress = ctx.synapse.getWarmStorageAddress();
                const approval = await ctx.synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);
                return !approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n;
            },
            message: () => 'Storage operator is not approved. Storage operations will fail.'
        },
        {
            id: 'low_days_remaining',
            name: 'Storage Duration Warning',
            severity: 'warning',
            condition: async (ctx) => {
                const accountInfo = await ctx.synapse.payments.accountInfo(TOKENS.USDFC);
                if (accountInfo.lockupRate === 0n) return false;
                const epochsRemaining = accountInfo.availableFunds / accountInfo.lockupRate;
                const daysRemaining = Number(epochsRemaining) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);
                return daysRemaining < 14 && daysRemaining > 0;
            },
            message: async (ctx) => {
                const accountInfo = await ctx.synapse.payments.accountInfo(TOKENS.USDFC);
                if (accountInfo.lockupRate === 0n) return 'No active deals';
                const epochsRemaining = accountInfo.availableFunds / accountInfo.lockupRate;
                const daysRemaining = Number(epochsRemaining) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);
                return `Storage duration warning: ~${daysRemaining.toFixed(1)} days remaining at current rate`;
            }
        }
    ];

    console.log("Registered Alert Rules:");
    for (const rule of alertRules) {
        console.log(`  • [${rule.severity.toUpperCase().padEnd(8)}] ${rule.name}`);
    }
    console.log();

    // ========================================================================
    // Step 4: Evaluate Alert Conditions
    // ========================================================================
    console.log("=== Step 4: Checking Alert Conditions ===\n");

    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    console.log(`Current payment balance: ${ethers.formatUnits(paymentBalance, 18)} USDFC\n`);

    const context = { synapse, paymentBalance };

    const triggeredAlerts = [];

    for (const rule of alertRules) {
        try {
            const triggered = await rule.condition(context);
            let message;
            if (typeof rule.message === 'function') {
                const result = rule.message(context);
                message = result instanceof Promise ? await result : result;
            }

            if (triggered) {
                triggeredAlerts.push({
                    id: rule.id,
                    name: rule.name,
                    severity: rule.severity,
                    message: message,
                    timestamp: new Date().toISOString()
                });
                console.log(`⚠️  ${rule.name}: TRIGGERED`);
                console.log(`   → ${message}`);
            } else {
                console.log(`✓  ${rule.name}: OK`);
            }
        } catch (error) {
            console.log(`?  ${rule.name}: Check failed (${error.message})`);
        }
    }

    console.log(`\nTotal alerts triggered: ${triggeredAlerts.length}\n`);

    // ========================================================================
    // Step 5: Send Webhook Notifications
    // ========================================================================
    console.log("=== Step 5: Webhook Notifications ===\n");

    if (alertChannels.webhook.enabled && triggeredAlerts.length > 0) {
        for (const alert of triggeredAlerts) {
            if (!shouldSendAlert(alert.id)) {
                console.log(`  ⏭️  Skipped (cooldown): ${alert.name}`);
                continue;
            }

            try {
                const response = await fetch(alertChannels.webhook.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: 'filecoin-monitor',
                        alert: {
                            name: alert.name,
                            severity: alert.severity,
                            message: alert.message,
                            timestamp: alert.timestamp
                        },
                        metadata: {
                            network: 'calibration'
                        }
                    })
                });

                if (response.ok) {
                    markAlertSent(alert.id);
                    console.log(`  ✓ Webhook sent: ${alert.name}`);
                } else {
                    console.log(`  ✗ Webhook failed (${response.status}): ${alert.name}`);
                }
            } catch (error) {
                console.log(`  ✗ Webhook error: ${error.message}`);
            }
        }
    } else if (triggeredAlerts.length > 0) {
        console.log("Webhook not configured. Set WEBHOOK_URL in .env.local to enable.");
        console.log("Get a test URL at: https://webhook.site\n");
    } else {
        console.log("No alerts triggered. Webhook notifications not needed.\n");
    }

    // ========================================================================
    // Step 6: Email Notifications (Critical Only)
    // ========================================================================
    console.log("=== Step 6: Email Notifications ===\n");

    const criticalAlerts = triggeredAlerts.filter(a => a.severity === 'critical');

    if (alertChannels.email.enabled && criticalAlerts.length > 0) {
        try {
            const transporter = nodemailer.createTransport({
                host: alertChannels.email.host,
                port: alertChannels.email.port,
                secure: false,
                auth: {
                    user: alertChannels.email.user,
                    pass: alertChannels.email.pass
                }
            });

            for (const alert of criticalAlerts) {
                const info = await transporter.sendMail({
                    from: '"Filecoin Monitor" <monitor@filecoin.local>',
                    to: alertChannels.email.recipient || alertChannels.email.user,
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

                console.log(`  ✓ Email sent: ${alert.name}`);
                if (info.messageId) {
                    console.log(`    Message ID: ${info.messageId}`);
                }
            }
        } catch (error) {
            console.log(`  ✗ Email failed: ${error.message}`);
        }
    } else if (criticalAlerts.length > 0) {
        console.log("Email not configured. Critical alerts would be sent via email in production.");
        console.log("Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local to enable.\n");
    } else {
        console.log("No critical alerts. Email notifications only fire for critical severity.\n");
    }

    // ========================================================================
    // Step 7: Provider SLA Monitoring
    // ========================================================================
    console.log("=== Step 7: Provider SLA Monitoring ===\n");

    // SLA targets (in production, these would come from your provider agreement)
    const slaMetrics = {
        uptimeTarget: 99.9,
        currentUptime: 99.7,
        proofSuccessTarget: 99.0,
        proofSuccessRate: 99.5,
        responseTimeTarget: "5 min",
        avgResponseTime: "2.3 min"
    };

    console.log("SLA Compliance Report:");
    console.log("┌──────────────────────────────────────────────────────────────────┐");
    console.log("│ Metric                │ Target    │ Current   │ Status           │");
    console.log("├──────────────────────────────────────────────────────────────────┤");

    const uptimeOk = slaMetrics.currentUptime >= slaMetrics.uptimeTarget;
    const proofOk = slaMetrics.proofSuccessRate >= slaMetrics.proofSuccessTarget;

    console.log(`│ Uptime                │ ${String(slaMetrics.uptimeTarget + '%').padEnd(9)} │ ${String(slaMetrics.currentUptime + '%').padEnd(9)} │ ${uptimeOk ? '✓ Compliant  ' : '✗ BREACH     '} │`);
    console.log(`│ Proof Success Rate    │ ${String(slaMetrics.proofSuccessTarget + '%').padEnd(9)} │ ${String(slaMetrics.proofSuccessRate + '%').padEnd(9)} │ ${proofOk ? '✓ Compliant  ' : '✗ BREACH     '} │`);
    console.log(`│ Response Time         │ ${slaMetrics.responseTimeTarget.padEnd(9)} │ ${slaMetrics.avgResponseTime.padEnd(9)} │ ✓ Compliant   │`);

    console.log("└──────────────────────────────────────────────────────────────────┘\n");

    if (!uptimeOk || !proofOk) {
        console.log("⚠️  SLA BREACH DETECTED - Notify operations team\n");
    } else {
        console.log("✓ All SLA targets met\n");
    }

    console.log("Note: In production, these metrics would be calculated from actual");
    console.log("on-chain proof events rather than demonstration values.\n");

    // ========================================================================
    // Step 8: Alert Deduplication Demo
    // ========================================================================
    console.log("=== Step 8: Alert Deduplication ===\n");

    console.log("Deduplication prevents alert fatigue (repeated identical alerts).");
    console.log("Testing cooldown mechanism:\n");

    // Simulate sending same alert twice
    const testAlertId = "test_dedup";

    const first = shouldSendAlert(testAlertId);
    console.log(`  First check:  Should send? ${first}`);
    if (first) markAlertSent(testAlertId);

    const second = shouldSendAlert(testAlertId);
    console.log(`  Second check: Should send? ${second} (blocked by 15-min cooldown)`);

    console.log(`\n  Cooldown period: 15 minutes`);
    console.log("  After cooldown expires, the same alert can fire again.\n");

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("=== Summary ===\n");

    console.log("✅ Alert System Complete!\n");

    console.log("You learned:");
    console.log("  • Configuring multi-channel alert delivery");
    console.log("  • Defining rules with conditions and severity levels");
    console.log("  • Evaluating conditions against live blockchain data");
    console.log("  • Sending webhook notifications");
    console.log("  • Email alerts for critical issues");
    console.log("  • SLA compliance monitoring");
    console.log("  • Alert deduplication to prevent notification spam\n");

    console.log("Dashboard Building Blocks:");
    console.log("  ✓ Alert panel with severity indicators");
    console.log("  ✓ SLA compliance tracking widget");
    console.log("  ✓ Multi-channel notification system");
    console.log("  ✓ Webhook integration for Slack/Discord\n");

    console.log("All three walkthroughs are complete! You now have all the building");
    console.log("blocks needed to create a Storage Operations Dashboard.");
}

// Deduplication helpers

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
