import 'dotenv/config';
import { Synapse } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';

// Simulated application database
const APPLICATION_DB = {
    users: {
        "user_alice": { email: "alice@example.com", uploads: [] },
        "user_bob": { email: "bob@example.com", uploads: [] }
    }
};

/**
 * dApp-Pays Architecture Demo
 *
 * In this model, the application treasury pays for all storage.
 * Users never interact with wallets or tokens.
 */
async function main() {
    console.log("dApp-Pays Architecture Demo\n");
    console.log("In this model, the application treasury pays for all storage.");
    console.log("Users never interact with wallets or tokens.\n");

    // Step 1: Initialize Treasury Connection
    const treasuryKey = process.env.PRIVATE_KEY;
    if (!treasuryKey) {
        throw new Error("Missing PRIVATE_KEY (Treasury wallet key)");
    }

    const formattedKey = treasuryKey.startsWith('0x')
        ? treasuryKey
        : `0x${treasuryKey}`;

    const treasury = Synapse.create({
        account: privateKeyToAccount(formattedKey),
        source: 'dapp-pays-demo'
    });

    console.log("=== Step 1: Treasury Initialized ===");
    console.log("SDK connected with treasury wallet credentials.");
    console.log("This wallet is controlled by your application, not users.\n");

    // Step 2: Verify Treasury Solvency
    console.log("=== Step 2: Treasury Solvency Check ===");

    const balance = await treasury.payments.balance();
    const balanceFormatted = Number(balance) / 1e18;

    console.log(`Treasury Balance: ${balance.toString()} (raw units)`);
    console.log(`Formatted: ${balanceFormatted.toFixed(4)} USDFC`);

    if (balance === 0n) {
        console.log("\nTreasury is empty. Your application cannot sponsor uploads.");
        console.log("Fund the treasury's payment account before accepting user uploads.");
        process.exit(1);
    }

    // Check account info for ongoing obligations
    const health = await treasury.payments.accountInfo();
    console.log(`\nTreasury Info:`);
    console.log(`  Available: ${(Number(health.availableFunds) / 1e18).toFixed(4)} USDFC`);
    console.log(`  Locked: ${(Number(health.lockupCurrent) / 1e18).toFixed(4)} USDFC`);
    console.log("Treasury is solvent.\n");

    // Step 3: Simulate User Request
    console.log("=== Step 3: Simulated User Request ===");

    const userId = "user_alice";
    const user = APPLICATION_DB.users[userId];

    console.log(`Authenticated user: ${userId}`);
    console.log(`Email: ${user.email}`);
    console.log("User authenticated via traditional OAuth/session - no wallet involved.\n");

    const userData = Buffer.from(
        `Document created by ${userId}\n` +
        `Email: ${user.email}\n` +
        `Created: ${new Date().toISOString()}\n` +
        `This file is stored by the application treasury, not the user.\n` +
        `The application sponsors all storage costs on behalf of users.\n` +
        `Minimum upload size is 127 bytes.`
    );

    console.log(`User submitted ${userData.length} bytes for upload.`);

    // Step 4: Verify Treasury is Ready to Sponsor
    console.log("\n=== Step 4: Treasury Payment Readiness ===");

    const prep = await treasury.storage.prepare({
        dataSize: BigInt(userData.length)
    });

    if (!prep.costs.ready && prep.transaction) {
        console.log("Setting up treasury payment and approval (one-time setup)...");
        const { hash } = await prep.transaction.execute();
        await treasury.client.waitForTransactionReceipt({ hash });
        console.log("Treasury payment setup confirmed.\n");
    } else if (!prep.costs.ready) {
        console.log("\nTreasury payment account is not ready.");
        console.log("Please run the payment-management tutorial to fund the treasury.");
        process.exit(1);
    } else {
        console.log("Treasury is ready to sponsor uploads.\n");
    }

    // Step 5: Sponsored Upload
    console.log("=== Step 5: Sponsored Upload ===");
    console.log("Application treasury is signing and paying for this upload.");
    console.log("User will not see any transaction or pay any fees.\n");

    console.log("Uploading to Filecoin network...");
    console.log("(This may take 30-60 seconds)\n");

    let uploadResult;
    try {
        uploadResult = await treasury.storage.upload(userData);

        console.log("Upload successful.");
        console.log(`PieceCID: ${uploadResult.pieceCid}`);
        console.log(`Copies stored: ${uploadResult.copies.length}`);
        console.log(`Sponsor: Application Treasury`);
    } catch (error) {
        console.error("Sponsored upload failed:", error.message);
        process.exit(1);
    }

    // Step 6: Update Application Database
    console.log("\n=== Step 6: Database Update ===");

    user.uploads.push({
        pieceCid: uploadResult.pieceCid,
        uploadedAt: new Date().toISOString(),
        sponsoredBy: "treasury"
    });

    console.log(`Recorded upload for ${userId}:`);
    console.log(`  PieceCID: ${uploadResult.pieceCid}`);
    console.log(`  Database now tracks this PieceCID belongs to ${userId}`);
    console.log("  This mapping only exists in your app - not on-chain.\n");

    console.log("User's storage inventory:");
    user.uploads.forEach((upload, index) => {
        console.log(`  ${index + 1}. ${upload.pieceCid.toString().substring(0, 30)}...`);
        console.log(`     Uploaded: ${upload.uploadedAt}`);
    });

    // Step 7: Verify Economic Relationship
    console.log("\n=== Step 7: Economic Verification ===");

    const rails = await treasury.payments.getRailsAsPayer({});
    const activeRails = rails.filter(r => !r.isTerminated);

    console.log(`Treasury has ${activeRails.length} active payment rails.`);
    console.log("Treasury is the payer on all rails.");
    console.log("Users have no on-chain payment relationship with providers.\n");

    // Step 8: Treasury Health After Operation
    console.log("=== Step 8: Post-Operation Treasury Health ===");

    const newHealth = await treasury.payments.accountInfo();
    console.log(`Updated Treasury Info:`);
    console.log(`  Available: ${(Number(newHealth.availableFunds) / 1e18).toFixed(4)} USDFC`);
    console.log(`  Locked: ${(Number(newHealth.lockupCurrent) / 1e18).toFixed(4)} USDFC`);

    const lockupIncrease = Number(newHealth.lockupCurrent) - Number(health.lockupCurrent);
    if (lockupIncrease > 0) {
        console.log(`  New lockup from this upload: ${(lockupIncrease / 1e18).toFixed(6)} USDFC`);
    }

    console.log("\n=== Summary ===");
    console.log("dApp-Pays architecture complete.");
    console.log("- Treasury funded and managed by application");
    console.log("- User authenticated via traditional means (no wallet)");
    console.log("- Upload executed and paid by treasury");
    console.log("- PieceCID mapped to user in application database");
    console.log("- User experience: upload file, done. No crypto complexity.");
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
