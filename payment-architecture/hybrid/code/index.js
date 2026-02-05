import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

// Load .env.local first (if it exists), then .env
dotenv.config({ path: '.env.local' });
dotenv.config();

// Simulated user database with quota tracking
const USER_DATABASE = {
    "alice": {
        email: "alice@example.com",
        tier: "free",
        storageUsed: 200 * 1024 * 1024,
        storageLimit: 500 * 1024 * 1024,
        walletConnected: false
    },
    "bob": {
        email: "bob@example.com",
        tier: "free",
        storageUsed: 490 * 1024 * 1024,
        storageLimit: 500 * 1024 * 1024,
        walletConnected: true
    },
    "carol": {
        email: "carol@example.com",
        tier: "pro",
        storageUsed: 10 * 1024 * 1024 * 1024,
        storageLimit: 50 * 1024 * 1024 * 1024,
        walletConnected: true
    }
};

/**
 * Hybrid Payment Architecture Demo
 * 
 * Combines treasury sponsorship with user payments.
 * Free tier users get sponsored. Power users pay directly.
 */
async function main() {
    console.log("Hybrid Payment Architecture Demo\n");
    console.log("This model combines treasury sponsorship with user payments.");
    console.log("Free tier users get sponsored. Power users pay directly.\n");

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY");
    }

    // Treasury context (dApp-Pays)
    const treasury = await Synapse.create({
        privateKey: privateKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    // User context (User-Pays) - in production, comes from browser wallet
    const userWallet = await Synapse.create({
        privateKey: privateKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("=== System Initialization ===");
    console.log("Treasury SDK initialized.");
    console.log("User wallet SDK initialized (demo uses same key).");
    console.log("In production, user wallet comes from browser connection.\n");

    const treasuryBalance = await treasury.payments.balance(TOKENS.USDFC);
    console.log(`Treasury Balance: ${(Number(treasuryBalance) / 1e18).toFixed(4)} USDFC`);

    if (treasuryBalance === 0n) {
        console.log("Treasury empty - free tier unavailable.");
        process.exit(1);
    }

    // Verify operator approval for treasury
    const operatorAddress = treasury.getWarmStorageAddress();
    const approval = await treasury.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    if (!approval.isApproved || approval.rateAllowance === 0n) {
        console.log("Treasury operator not approved. Run payment-management first.");
        process.exit(1);
    }

    console.log("Treasury operator approved.\n");
    console.log("=".repeat(60) + "\n");

    // Scenario 1: Free user within quota (Alice)
    await processUpload(treasury, userWallet, "alice", 50 * 1024 * 1024);

    console.log("\n" + "=".repeat(60) + "\n");

    // Scenario 2: Free user over quota (Bob)
    await processUpload(treasury, userWallet, "bob", 20 * 1024 * 1024);

    console.log("\n" + "=".repeat(60) + "\n");

    // Scenario 3: Pro user (Carol)
    await processUpload(treasury, userWallet, "carol", 100 * 1024 * 1024);
}

async function processUpload(treasury, userWallet, userId, fileSize) {
    console.log(`=== Processing Upload for ${userId} ===\n`);

    const user = USER_DATABASE[userId];
    if (!user) {
        console.log("User not found.");
        return;
    }

    console.log(`User: ${user.email}`);
    console.log(`Tier: ${user.tier}`);
    console.log(`Storage: ${formatBytes(user.storageUsed)} / ${formatBytes(user.storageLimit)}`);
    console.log(`Upload Size: ${formatBytes(fileSize)}`);

    const decision = evaluatePaymentPath(user, fileSize);
    console.log(`\nDecision: ${decision.path}`);
    console.log(`Reason: ${decision.reason}\n`);

    if (decision.path === "SPONSORED") {
        await executeSponsoredUpload(treasury, userId, fileSize);
    } else if (decision.path === "USER_PAID") {
        await executeUserPaidUpload(userWallet, userId, fileSize, decision.reason);
    } else if (decision.path === "BLOCKED") {
        handleBlockedUpload(userId, decision.reason);
    }
}

function evaluatePaymentPath(user, requestedSize) {
    // Rule 1: Pro tier users always pay themselves
    if (user.tier === "pro" || user.tier === "enterprise") {
        return {
            path: "USER_PAID",
            reason: "Pro/Enterprise tier - user pays for all storage"
        };
    }

    // Rule 2: Check if request fits within free quota
    const remainingQuota = user.storageLimit - user.storageUsed;

    if (requestedSize <= remainingQuota) {
        return {
            path: "SPONSORED",
            reason: "Within free tier quota - treasury sponsors"
        };
    }

    // Rule 3: Over quota - check if user can pay
    if (user.walletConnected) {
        return {
            path: "USER_PAID",
            reason: "Over free quota - user wallet available for payment"
        };
    }

    // Rule 4: Over quota, no wallet - blocked
    return {
        path: "BLOCKED",
        reason: "Over free quota and no wallet connected - upgrade required"
    };
}

async function executeSponsoredUpload(treasury, userId, fileSize) {
    console.log("Executing SPONSORED upload (Treasury pays)...");

    const demoData = Buffer.from(
        `Sponsored content for ${userId}\n` +
        `Size: ${fileSize} bytes (simulated)\n` +
        `Sponsored by application treasury\n` +
        `Timestamp: ${new Date().toISOString()}\n` +
        `Free tier user - storage costs covered by treasury.\n` +
        `Minimum upload size is 127 bytes.`
    );

    try {
        const result = await treasury.storage.upload(demoData);

        console.log("Upload successful (Treasury sponsored)");
        console.log(`PieceCID: ${result.pieceCid}`);
        console.log(`Payer: Treasury`);

        USER_DATABASE[userId].storageUsed += fileSize;
        console.log(`Updated usage: ${formatBytes(USER_DATABASE[userId].storageUsed)}`);

    } catch (error) {
        console.error("Sponsored upload failed:", error.message);
    }
}

async function executeUserPaidUpload(userWallet, userId, fileSize, reason) {
    console.log("Executing USER_PAID upload (User pays)...");
    console.log(`Reason: ${reason}\n`);

    const balance = await userWallet.payments.balance(TOKENS.USDFC);

    if (balance === 0n) {
        console.log("User has no funds in payment account.");
        console.log("In production, prompt user to fund their account.");
        return;
    }

    const demoData = Buffer.from(
        `Premium content for ${userId}\n` +
        `Size: ${fileSize} bytes (simulated)\n` +
        `Paid by user wallet\n` +
        `Timestamp: ${new Date().toISOString()}\n` +
        `Pro/Enterprise tier - user paying directly for storage.\n` +
        `Minimum upload size is 127 bytes.`
    );

    try {
        const result = await userWallet.storage.upload(demoData);

        console.log("Upload successful (User paid)");
        console.log(`PieceCID: ${result.pieceCid}`);
        console.log(`Payer: User Wallet`);

        USER_DATABASE[userId].storageUsed += fileSize;
        console.log(`Updated usage: ${formatBytes(USER_DATABASE[userId].storageUsed)}`);

    } catch (error) {
        console.error("User-paid upload failed:", error.message);
    }
}

function handleBlockedUpload(userId, reason) {
    console.log("Upload BLOCKED");
    console.log(`Reason: ${reason}\n`);
    console.log("User action required:");
    console.log("  1. Connect a wallet with USDFC");
    console.log("  2. Fund their payment account");
    console.log("  3. Upgrade to Pro tier for higher limits");
    console.log("\nIn production, display upgrade modal to user.");
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
