import 'dotenv/config';
import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';

async function main() {
    console.log("Account Health Monitoring\n");

    // Initialize the SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const synapse = await Synapse.create({
        privateKey: privateKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("✓ SDK initialized\n");

    // Get detailed account information
    const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);

    console.log("Account Details:");
    console.log(`  Total Funds: ${ethers.formatUnits(accountInfo.funds, 18)} USDFC`);
    console.log(`    → All tokens deposited in payment account\n`);

    console.log(`  Current Lockup: ${ethers.formatUnits(accountInfo.lockupCurrent, 18)} USDFC`);
    console.log(`    → Funds currently locked for active storage deals`);
    console.log(`    → This is your safety buffer for providers\n`);

    console.log(`  Lockup Rate: ${ethers.formatUnits(accountInfo.lockupRate, 18)} USDFC/epoch`);
    console.log(`    → How much gets locked per epoch for your storage`);
    console.log(`    → 1 epoch ≈ 30 seconds\n`);

    console.log(`  Available Funds: ${ethers.formatUnits(accountInfo.availableFunds, 18)} USDFC`);
    console.log(`    → Funds you can withdraw right now`);
    console.log(`    → Formula: Total Funds - Lockup Requirement\n`);

    // Calculate days remaining
    if (accountInfo.lockupRate > 0n) {
        const epochsRemaining = accountInfo.availableFunds / accountInfo.lockupRate;
        const daysRemaining = Number(epochsRemaining) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);

        console.log(`  Days Remaining: ~${daysRemaining.toFixed(1)} days`);
        console.log(`    → How long your current balance will last`);
        console.log(`    → Based on current storage usage\n`);

        if (daysRemaining < 7) {
            console.log("  ⚠️  WARNING: Low balance! Consider depositing more funds.\n");
        } else if (daysRemaining < 14) {
            console.log("  ⚡ NOTICE: Balance getting low. Monitor closely.\n");
        } else {
            console.log("  ✓ Balance is healthy\n");
        }
    } else {
        console.log(`  → No active storage deals (lockup rate is 0)\n`);
    }

    console.log(`  Last Settled At: Epoch ${accountInfo.lockupLastSettledAt}`);
    console.log(`    → Last time payments were processed\n`);

    console.log("✅ Account health check complete!");
}

main().catch((err) => {
    console.error("Error checking account health:");
    console.error(err);
    process.exit(1);
});
