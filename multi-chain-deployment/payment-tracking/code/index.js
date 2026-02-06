import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import {
    initDatabase,
    createUser,
    getUser,
    recordPayment,
    recordUpload,
    getUserQuota,
    canUpload,
    getUserUploads
} from './db.js';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

// Pricing: $1 USD = 100 MB of storage quota
const BYTES_PER_USD = 100 * 1024 * 1024;

/**
 * Payment Tracking and Quota Management Demo
 * 
 * This module demonstrates how to:
 * 1. Track user payments from multiple L2 chains
 * 2. Convert payments to storage quotas
 * 3. Enforce quotas before allowing uploads
 */
async function main() {
    console.log("Payment Tracking and Quota Management Demo\n");
    console.log("Track payments from Base, Arbitrum, Polygon and convert to storage quotas.\n");

    // Initialize database
    console.log("=== Step 1: Database Initialization ===\n");

    const db = initDatabase();
    console.log("SQLite database initialized.");
    console.log("Tables: users, payments, uploads\n");

    // Initialize Synapse SDK
    console.log("=== Step 2: SDK Initialization ===\n");

    const backendKey = process.env.PRIVATE_KEY;
    if (!backendKey) {
        throw new Error("Missing PRIVATE_KEY in environment");
    }

    const synapse = await Synapse.create({
        privateKey: backendKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    // Verify backend is ready
    const balance = await synapse.payments.balance(TOKENS.USDFC);
    if (balance === 0n) {
        console.log("Backend payment account is empty. Fund it first.");
        process.exit(1);
    }
    console.log(`Backend ready. Payment account: ${(Number(balance) / 1e18).toFixed(4)} USDFC\n`);

    // Verify operator approval
    const operatorAddress = synapse.getWarmStorageAddress();
    const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);
    if (!approval.isApproved) {
        console.log("Storage operator not approved. Run payment-management tutorial first.");
        process.exit(1);
    }

    // Scenario 1: New user from Base
    console.log("=== Step 3: Simulate User Registration ===\n");

    const userAddress = "0x" + "a".repeat(40);
    let user = getUser(db, userAddress);

    if (!user) {
        user = createUser(db, userAddress, "base", "alice@example.com");
        console.log("New user registered:");
    } else {
        console.log("Existing user found:");
    }
    console.log(`  Address: ${user.address}`);
    console.log(`  Chain: ${user.chain}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Quota: ${formatBytes(user.quota_bytes)}`);
    console.log(`  Used: ${formatBytes(user.used_bytes)}\n`);

    // Scenario 2: Simulate payment received on Base
    console.log("=== Step 4: Simulate L2 Payment ===\n");

    const paymentAmount = 5.00;
    const txHash = "0x" + Date.now().toString(16) + "abc123";
    const quotaGranted = Math.floor(paymentAmount * BYTES_PER_USD);

    console.log("Payment received on Base:");
    console.log(`  TX Hash: ${txHash}`);
    console.log(`  Amount: $${paymentAmount.toFixed(2)} USD`);
    console.log(`  Quota Granted: ${formatBytes(quotaGranted)}`);

    // In production, you would verify this payment on-chain:
    // const verified = await verifyPaymentOnChain(txHash, 'base');
    // For demo, we skip verification

    try {
        recordPayment(db, user.id, "base", txHash, paymentAmount, quotaGranted);
        console.log("Payment recorded in database.\n");
    } catch (error) {
        if (error.message.includes('UNIQUE constraint')) {
            console.log("Payment already processed (duplicate tx_hash).\n");
        } else {
            throw error;
        }
    }

    // Refresh user data
    user = getUser(db, userAddress);
    const quota = getUserQuota(db, user.id);

    console.log("Updated user quota:");
    console.log(`  Total Quota: ${formatBytes(quota.quotaBytes)}`);
    console.log(`  Used: ${formatBytes(quota.usedBytes)}`);
    console.log(`  Remaining: ${formatBytes(quota.remainingBytes)}\n`);

    // Scenario 3: Check quota before upload
    console.log("=== Step 5: Quota Enforcement ===\n");

    const uploadData = Buffer.from(
        `User data from ${user.address}\n` +
        `Chain: ${user.chain}\n` +
        `Timestamp: ${new Date().toISOString()}\n` +
        `This data is stored on Filecoin via multi-chain architecture.\n` +
        `User paid on Base, storage happens on Filecoin.\n` +
        `Minimum upload size is 127 bytes - this exceeds that requirement.`
    );

    console.log(`Requested upload size: ${formatBytes(uploadData.length)}`);
    console.log(`Available quota: ${formatBytes(quota.remainingBytes)}`);

    if (!canUpload(db, user.id, uploadData.length)) {
        console.log("\nUpload BLOCKED: Insufficient quota.");
        console.log("User must purchase more storage.\n");
        process.exit(0);
    }

    console.log("Quota check PASSED. Proceeding with upload.\n");

    // Scenario 4: Perform upload
    console.log("=== Step 6: Upload with Quota Deduction ===\n");

    console.log("Uploading to Filecoin...");
    console.log("(This may take 30-60 seconds)\n");

    try {
        const result = await synapse.storage.upload(uploadData);

        console.log("Upload successful.");
        console.log(`PieceCID: ${result.pieceCid}`);
        console.log(`Size: ${result.size} bytes`);

        // Record upload and deduct from quota
        recordUpload(db, user.id, result.pieceCid.toString(), result.size);
        console.log("Upload recorded. Quota updated.\n");

    } catch (error) {
        console.error("Upload failed:", error.message);
        process.exit(1);
    }

    // Scenario 5: Show updated quota
    console.log("=== Step 7: Post-Upload Status ===\n");

    const updatedQuota = getUserQuota(db, user.id);
    console.log("Updated quota status:");
    console.log(`  Total Quota: ${formatBytes(updatedQuota.quotaBytes)}`);
    console.log(`  Used: ${formatBytes(updatedQuota.usedBytes)}`);
    console.log(`  Remaining: ${formatBytes(updatedQuota.remainingBytes)}\n`);

    // Show upload history
    const uploads = getUserUploads(db, user.id);
    console.log(`User upload history (${uploads.length} uploads):`);
    uploads.slice(0, 5).forEach((upload, i) => {
        console.log(`  ${i + 1}. ${upload.piece_cid.substring(0, 30)}... (${formatBytes(upload.size_bytes)})`);
    });

    // Scenario 6: Multi-chain support
    console.log("\n=== Step 8: Multi-Chain Pattern ===\n");

    console.log("This system supports payments from any L2:");
    console.log("");
    console.log("  Base:     User pays with USDC on Base");
    console.log("  Arbitrum: User pays with ETH on Arbitrum");
    console.log("  Polygon:  User pays with MATIC on Polygon");
    console.log("");
    console.log("All payments convert to storage quota using:");
    console.log(`  Rate: $1 USD = ${formatBytes(BYTES_PER_USD)}`);
    console.log("");
    console.log("Production implementation would:");
    console.log("  1. Monitor payment addresses on each chain");
    console.log("  2. Verify transactions using chain-specific RPCs");
    console.log("  3. Convert payment amount to USD");
    console.log("  4. Grant quota based on USD value");

    console.log("\n=== Summary ===\n");
    console.log("Payment tracking system operational.");
    console.log(`- User registered on: ${user.chain}`);
    console.log(`- Payments processed: $${paymentAmount.toFixed(2)} USD`);
    console.log(`- Quota granted: ${formatBytes(quotaGranted)}`);
    console.log(`- Upload completed: Yes`);
    console.log("\nNext: NFT metadata storage (walkthrough 3).");

    db.close();
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
