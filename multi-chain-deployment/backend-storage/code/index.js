import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

// Load .env.local first (if it exists), then .env
dotenv.config({ path: '.env.local' });
dotenv.config();

/**
 * Backend Storage Setup for Multi-Chain Applications
 * 
 * This module demonstrates how to set up a backend storage service
 * that can serve multiple L2 chains (Base, Arbitrum, Polygon, etc.)
 * using Filecoin as the underlying storage layer.
 */
async function main() {
    console.log("Backend Storage Setup for Multi-Chain Applications\n");
    console.log("This service handles Filecoin storage for any L2 chain.");
    console.log("Users pay on their preferred chain; storage happens on Filecoin.\n");

    // Step 1: Initialize Backend Wallet
    console.log("=== Step 1: Backend Wallet Initialization ===\n");

    const backendKey = process.env.PRIVATE_KEY;
    if (!backendKey) {
        throw new Error("Missing PRIVATE_KEY in environment");
    }

    const synapse = await Synapse.create({
        privateKey: backendKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("Backend SDK initialized successfully.");
    console.log("This wallet handles all Filecoin operations for your multi-chain app.\n");

    // Step 2: Check Wallet Balance (Gas)
    console.log("=== Step 2: Wallet Balance Check ===\n");

    const walletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
    const walletBalanceFormatted = Number(walletBalance) / 1e18;

    console.log(`Wallet USDFC Balance: ${walletBalanceFormatted.toFixed(4)} USDFC`);

    if (walletBalance === 0n) {
        console.log("\nWallet has no USDFC.");
        console.log("Get USDFC from: https://faucet.circle.com/ (select Filecoin Calibration)");
        console.log("Also ensure you have tFIL for gas from: https://faucet.calibration.fildev.network/");
    }

    // Step 3: Check Payment Account Balance
    console.log("\n=== Step 3: Payment Account Balance ===\n");

    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    const paymentBalanceFormatted = Number(paymentBalance) / 1e18;

    console.log(`Payment Account Balance: ${paymentBalanceFormatted.toFixed(4)} USDFC`);

    if (paymentBalance === 0n) {
        console.log("\nPayment account is empty.");
        console.log("You must deposit USDFC from wallet to payment account.");
        console.log("Run the storage-basics/payment-management tutorial first.");
        process.exit(1);
    }

    console.log("Payment account is funded and ready for storage operations.");

    // Step 4: Verify Operator Approval
    console.log("\n=== Step 4: Operator Approval ===\n");

    const operatorAddress = synapse.getWarmStorageAddress();
    const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    console.log(`Storage Operator: ${operatorAddress}`);
    console.log(`Approved: ${approval.isApproved}`);
    console.log(`Rate Allowance: ${(Number(approval.rateAllowance) / 1e18).toFixed(6)} USDFC/epoch`);
    console.log(`Lockup Allowance: ${(Number(approval.lockupAllowance) / 1e18).toFixed(4)} USDFC`);

    if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
        console.log("\nStorage operator not approved.");
        console.log("Run the storage-basics/payment-management tutorial to approve.");
        process.exit(1);
    }

    console.log("\nOperator approved. Backend is ready for storage operations.");

    // Step 5: Demo Upload
    console.log("\n=== Step 5: Demo Upload ===\n");

    const demoData = Buffer.from(
        `Multi-chain storage demo\n` +
        `Timestamp: ${new Date().toISOString()}\n` +
        `This data is stored on Filecoin but serves any L2 chain.\n` +
        `Backend wallet handles all storage payments.\n` +
        `Users on Base, Arbitrum, or Polygon can access this data.\n` +
        `Minimum upload size is 127 bytes - this message exceeds that.`
    );

    console.log(`Uploading ${demoData.length} bytes to Filecoin...`);
    console.log("(This may take 30-60 seconds)\n");

    let uploadResult;
    try {
        uploadResult = await synapse.storage.upload(demoData);

        console.log("Upload successful.");
        console.log(`PieceCID: ${uploadResult.pieceCid}`);
        console.log(`Size: ${uploadResult.size} bytes`);
        if (uploadResult.provider) {
            console.log(`Provider: ${uploadResult.provider}`);
        }
    } catch (error) {
        console.error("Upload failed:", error.message);
        process.exit(1);
    }

    // Step 6: Demo Download
    console.log("\n=== Step 6: Demo Download ===\n");

    console.log(`Downloading data for PieceCID: ${uploadResult.pieceCid}...`);

    try {
        const downloadedData = await synapse.storage.download(uploadResult.pieceCid);

        console.log("Download successful.");
        console.log(`Retrieved ${downloadedData.length} bytes`);
        console.log("\nContent:");
        const decoder = new TextDecoder();
        console.log(decoder.decode(downloadedData));

        // Verify integrity
        const matches = Buffer.compare(
            Buffer.from(demoData),
            Buffer.from(downloadedData)
        ) === 0;

        if (matches) {
            console.log("Integrity verified: Downloaded data matches original.");
        } else {
            console.log("Warning: Data mismatch detected.");
        }
    } catch (error) {
        console.error("Download failed:", error.message);
    }

    // Step 7: Account Health
    console.log("\n=== Step 7: Account Health ===\n");

    const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);

    console.log("Current Account Status:");
    console.log(`  Available: ${(Number(accountInfo.availableFunds) / 1e18).toFixed(4)} USDFC`);
    console.log(`  Locked: ${(Number(accountInfo.lockupCurrent) / 1e18).toFixed(4)} USDFC`);

    // Step 8: Integration Patterns
    console.log("\n=== Step 8: Integration Patterns ===\n");

    console.log("Your backend is ready to serve multi-chain applications:");
    console.log("");
    console.log("1. Express/Fastify API Pattern:");
    console.log("   POST /api/upload - Accept data, store on Filecoin, return PieceCID");
    console.log("   GET /api/download/:pieceCid - Retrieve data by PieceCID");
    console.log("");
    console.log("2. Multi-Chain Payment Flow:");
    console.log("   - User pays on Base/Arbitrum/Polygon");
    console.log("   - Your backend verifies payment via L2 RPC");
    console.log("   - Backend uploads to Filecoin using this SDK");
    console.log("   - User receives PieceCID for their data");
    console.log("");
    console.log("3. Quota Management:");
    console.log("   - Track user payments in database");
    console.log("   - Convert USD payments to storage quota (bytes)");
    console.log("   - Enforce quotas before allowing uploads");
    console.log("");

    console.log("=== Summary ===\n");
    console.log("Backend storage service configured successfully.");
    console.log(`- Payment account: ${paymentBalanceFormatted.toFixed(4)} USDFC available`);
    console.log(`- Operator approved: ${approval.isApproved}`);
    console.log(`- Demo upload/download: Complete`);
    console.log("\nNext: Implement payment tracking (walkthrough 2) or NFT metadata (walkthrough 3).");
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
