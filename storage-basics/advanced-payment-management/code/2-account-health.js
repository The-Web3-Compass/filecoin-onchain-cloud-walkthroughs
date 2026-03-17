import 'dotenv/config';
import { Synapse, TIME_CONSTANTS, formatUnits } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
    console.log("Account Health Monitoring\n");

    // Initialize the SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

    const synapse = Synapse.create({
        account: privateKeyToAccount(formattedPrivateKey),
        source: 'account-health'
    });

    console.log("✓ SDK initialized\n");

    // Get detailed account information (USDFC is the default token)
    const accountInfo = await synapse.payments.accountInfo();

    console.log("Account Details:");
    console.log(`  Total Funds: ${formatUnits(accountInfo.funds)} USDFC`);
    console.log(`    → All tokens deposited in payment account\n`);

    console.log(`  Current Lockup: ${formatUnits(accountInfo.lockupCurrent)} USDFC`);
    console.log(`    → Funds currently locked for active storage deals`);
    console.log(`    → This is your safety buffer for providers\n`);

    console.log(`  Lockup Rate: ${formatUnits(accountInfo.lockupRate)} USDFC/epoch`);
    console.log(`    → How much gets locked per epoch for your storage`);
    console.log(`    → 1 epoch ≈ 30 seconds\n`);

    console.log(`  Available Funds: ${formatUnits(accountInfo.availableFunds)} USDFC`);
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
