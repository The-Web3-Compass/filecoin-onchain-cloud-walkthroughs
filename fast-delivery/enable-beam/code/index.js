import 'dotenv/config';
import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    console.log("=".repeat(70));
    console.log("  Filecoin Beam CDN: Performance Comparison");
    console.log("=".repeat(70));
    console.log();

    // ========================================================================
    // STEP 1: Initialize SDK
    // ========================================================================
    console.log("📡 Step 1: Initializing Filecoin SDK...\n");

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const synapse = await Synapse.create({
        privateKey: privateKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("✓ SDK initialized successfully\n");

    // ========================================================================
    // STEP 2: Verify Payment Account
    // ========================================================================
    console.log("💰 Step 2: Verifying Payment Account...\n");

    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    console.log(`Payment Account Balance: ${ethers.formatUnits(paymentBalance, 18)} USDFC`);

    if (paymentBalance === 0n) {
        console.log("\n⚠️  Warning: Payment account has no balance!");
        console.log("Please fund your account first:");
        console.log("1. Get USDFC from: https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc");
        console.log("2. Deposit to payment account (see walkthrough for details)");
        process.exit(1);
    }

    // Verify operator allowances
    const operatorAddress = synapse.getWarmStorageAddress();
    const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
        console.log("\n⚠️  Warning: Operator allowances not set!");
        console.log("Please approve the storage operator:");
        console.log("See the walkthrough for deposit and approval instructions.");
        process.exit(1);
    }

    console.log("✓ Payment account funded and operator approved\n");

    // ========================================================================
    // STEP 3: Load Sample Data
    // ========================================================================
    console.log("📄 Step 3: Loading Sample Data...\n");

    const sampleFilePath = join(__dirname, './data/sample.txt');
    const fileContent = readFileSync(sampleFilePath);
    const fileSize = fileContent.length;

    console.log(`File: ${sampleFilePath}`);
    console.log(`Size: ${fileSize} bytes`);
    console.log(`Preview: ${fileContent.toString().substring(0, 80)}...`);
    console.log();

    // ========================================================================
    // STEP 4: Upload WITHOUT Beam CDN (Baseline)
    // ========================================================================
    console.log("=".repeat(70));
    console.log("🔄 Step 4: Upload WITHOUT Beam CDN (Baseline)");
    console.log("=".repeat(70));
    console.log();

    console.log("Creating storage context without CDN...");
    const contextNoCDN = await synapse.storage.createContext({
        withCDN: false,
        metadata: {
            test: "beam-comparison",
            cdn: "disabled",
            timestamp: new Date().toISOString()
        }
    });

    console.log("Uploading file (this may take 30-60 seconds)...");
    const uploadStartNoCDN = Date.now();
    const resultNoCDN = await contextNoCDN.upload(fileContent);
    const uploadTimeNoCDN = Date.now() - uploadStartNoCDN;

    console.log(`✓ Upload complete (no CDN)`);
    console.log(`  PieceCID: ${resultNoCDN.pieceCid}`);
    console.log(`  Upload Time: ${(uploadTimeNoCDN / 1000).toFixed(2)}s`);
    console.log();

    // Download without CDN
    console.log("Downloading file without CDN...");
    const downloadStartNoCDN = Date.now();
    const downloadedNoCDN = await contextNoCDN.download(String(resultNoCDN.pieceCid));
    const downloadTimeNoCDN = Date.now() - downloadStartNoCDN;

    console.log(`✓ Download complete (no CDN)`);
    console.log(`  Download Time: ${(downloadTimeNoCDN / 1000).toFixed(2)}s`);
    console.log(`  Data Size: ${downloadedNoCDN.length} bytes`);
    console.log(`  Verified: ${downloadedNoCDN.length === fileSize ? '✓' : '✗'}`);
    console.log();

    // ========================================================================
    // STEP 5: Upload WITH Beam CDN
    // ========================================================================
    console.log("=".repeat(70));
    console.log("⚡ Step 5: Upload WITH Beam CDN");
    console.log("=".repeat(70));
    console.log();

    console.log("Creating storage context with Beam CDN enabled...");
    const contextWithCDN = await synapse.storage.createContext({
        withCDN: true,  // 🔥 Enable Beam CDN
        metadata: {
            test: "beam-comparison",
            cdn: "enabled",
            timestamp: new Date().toISOString()
        }
    });

    console.log("Uploading file with Beam CDN (this may take 30-60 seconds)...");
    const uploadStartCDN = Date.now();
    const resultCDN = await contextWithCDN.upload(fileContent);
    const uploadTimeCDN = Date.now() - uploadStartCDN;

    console.log(`✓ Upload complete (with CDN)`);
    console.log(`  PieceCID: ${resultCDN.pieceCid}`);
    console.log(`  Upload Time: ${(uploadTimeCDN / 1000).toFixed(2)}s`);
    console.log();

    // Download with CDN
    console.log("Downloading file with Beam CDN...");
    const downloadStartCDN = Date.now();
    const downloadedCDN = await contextWithCDN.download(String(resultCDN.pieceCid));
    const downloadTimeCDN = Date.now() - downloadStartCDN;

    console.log(`✓ Download complete (with CDN)`);
    console.log(`  Download Time: ${(downloadTimeCDN / 1000).toFixed(2)}s`);
    console.log(`  Data Size: ${downloadedCDN.length} bytes`);
    console.log(`  Verified: ${downloadedCDN.length === fileSize ? '✓' : '✗'}`);
    console.log();

    // ========================================================================
    // STEP 6: Performance Comparison
    // ========================================================================
    console.log("=".repeat(70));
    console.log("📊 Step 6: Performance Analysis");
    console.log("=".repeat(70));
    console.log();

    const downloadSpeedup = ((downloadTimeNoCDN - downloadTimeCDN) / downloadTimeNoCDN * 100);
    const uploadSpeedup = ((uploadTimeNoCDN - uploadTimeCDN) / uploadTimeNoCDN * 100);

    console.log("Upload Performance:");
    console.log(`  Without CDN: ${(uploadTimeNoCDN / 1000).toFixed(2)}s`);
    console.log(`  With CDN:    ${(uploadTimeCDN / 1000).toFixed(2)}s`);
    console.log(`  Difference:  ${uploadSpeedup >= 0 ? '+' : ''}${uploadSpeedup.toFixed(1)}%`);
    console.log();

    console.log("Download Performance:");
    console.log(`  Without CDN: ${(downloadTimeNoCDN / 1000).toFixed(2)}s`);
    console.log(`  With CDN:    ${(downloadTimeCDN / 1000).toFixed(2)}s`);
    console.log(`  Speedup:     ${downloadSpeedup >= 0 ? '+' : ''}${downloadSpeedup.toFixed(1)}%`);
    console.log();

    if (downloadSpeedup > 0) {
        console.log(`🚀 Beam CDN improved download speed by ${downloadSpeedup.toFixed(1)}%!`);
    } else {
        console.log("ℹ️  Note: Performance varies by network conditions and file size.");
        console.log("   Beam CDN typically shows greater benefits with:");
        console.log("   - Larger files (>1MB)");
        console.log("   - Repeated downloads");
        console.log("   - Geographically distributed users");
    }
    console.log();

    // ========================================================================
    // STEP 7: Cost Implications
    // ========================================================================
    console.log("=".repeat(70));
    console.log("💵 Step 7: Cost Implications");
    console.log("=".repeat(70));
    console.log();

    console.log("Beam CDN Cost Model:");
    console.log("  - Paid-per-byte retrieval model");
    console.log("  - Providers compete on price and performance");
    console.log("  - Costs are transparent and on-chain");
    console.log();

    console.log("When to Use Beam CDN:");
    console.log("  ✓ Frequently accessed content");
    console.log("  ✓ Time-sensitive applications");
    console.log("  ✓ Global user base");
    console.log("  ✓ High-performance requirements");
    console.log();

    console.log("When Standard Retrieval is Sufficient:");
    console.log("  • Archival data (infrequent access)");
    console.log("  • Cost-sensitive applications");
    console.log("  • Small files with low latency requirements");
    console.log();

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("=".repeat(70));
    console.log("✅ Comparison Complete!");
    console.log("=".repeat(70));
    console.log();

    console.log("Key Takeaways:");
    console.log(`  • Beam CDN provides ${downloadSpeedup > 0 ? 'faster' : 'competitive'} retrieval performance`);
    console.log("  • Enable with `withCDN: true` in storage context");
    console.log("  • Best for frequently accessed, performance-critical content");
    console.log("  • Costs scale with usage (paid-per-byte model)");
    console.log();

    console.log("Your PieceCIDs:");
    console.log(`  Without CDN: ${resultNoCDN.pieceCid}`);
    console.log(`  With CDN:    ${resultCDN.pieceCid}`);
    console.log();

    console.log("Next Steps:");
    console.log("  1. Review the walkthrough for production best practices");
    console.log("  2. Test with larger files to see greater CDN benefits");
    console.log("  3. Monitor costs and performance in your application");
    console.log();
}

main().catch((err) => {
    console.error("\n❌ Error during comparison:");
    console.error(err);
    process.exit(1);
});
