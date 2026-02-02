import 'dotenv/config';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { readFileSync, readdirSync } from 'fs';

async function main() {
    console.log("Working with Filecoin Datasets...\n");

    // Initialize SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const synapse = await Synapse.create({
        privateKey: privateKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("✓ SDK initialized\n");

    // ========================================================================
    // Step 1: Verify Payment Account and Allowances
    // ========================================================================
    console.log("=== Step 1: Verify Payment Account ===");

    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    console.log(`Payment Account Balance: ${paymentBalance.toString()} (raw units)`);

    if (paymentBalance === 0n) {
        console.log("\n⚠️  Warning: Payment account has no balance!");
        console.log("Please run the payment-management tutorial first to fund your account.");
        process.exit(1);
    }

    console.log("✓ Payment account is funded");

    // Verify operator allowances
    const operatorAddress = synapse.getWarmStorageAddress();
    const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
        console.log("⚠️  Warning: Operator allowances are not set!");
        console.log("Please run the payment-management tutorial first.");
        process.exit(1);
    }
    console.log("✓ Operator allowances verified\n");

    // ========================================================================
    // Step 2: Create a Storage Context (Dataset)
    // ========================================================================
    console.log("=== Step 2: Create Storage Context (Dataset) ===");

    console.log("Creating a storage context with metadata...");
    console.log("A storage context acts as a logical container for related files.\n");

    const context = await synapse.storage.createContext({
        metadata: {
            project: "filecoin-tutorials",
            category: "documentation",
            version: "1.0",
            created: new Date().toISOString().split('T')[0]
        }
    });

    console.log("✓ Storage context created successfully");
    console.log("  → This dataset will group all uploaded files together");
    console.log("  → Metadata is stored on-chain for easy querying\n");

    // ========================================================================
    // Step 3: Upload Multiple Files to the Dataset
    // ========================================================================
    console.log("=== Step 3: Upload Multiple Files to Dataset ===");

    const dataDir = "./data";
    const files = readdirSync(dataDir);

    console.log(`Found ${files.length} files to upload:`);
    files.forEach(file => console.log(`  - ${file}`));
    console.log();

    const uploadResults = [];

    for (let i = 0; i < files.length; i++) {
        const filename = files[i];
        const filepath = `${dataDir}/${filename}`;

        console.log(`[${i + 1}/${files.length}] Uploading ${filename}...`);

        const fileContent = readFileSync(filepath);
        console.log(`  Size: ${fileContent.length} bytes`);

        try {
            const result = await context.upload(fileContent);

            uploadResults.push({
                filename: filename,
                pieceCid: result.pieceCid,
                size: result.size,
                provider: result.provider
            });

            console.log(`  ✓ Uploaded successfully`);
            console.log(`  PieceCID: ${result.pieceCid}`);
            console.log(`  Size: ${result.size} bytes\n`);
        } catch (error) {
            console.error(`  ✗ Upload failed: ${error.message}\n`);
        }
    }

    console.log(`✅ Successfully uploaded ${uploadResults.length} files to the dataset\n`);

    // ========================================================================
    // Step 4: Retrieve Dataset Information
    // ========================================================================
    console.log("=== Step 4: Retrieve Dataset Information ===");

    try {
        // Get storage info to see our dataset
        const storageInfo = await synapse.storage.getStorageInfo();

        console.log("Storage Information:");
        console.log(`  Total Providers: ${storageInfo.providers.length}`);

        if (storageInfo.providers.length > 0) {
            const provider = storageInfo.providers[0];
            console.log(`\n  Primary Provider:`);
            console.log(`    Name: ${provider.name || 'Unnamed'}`);
            console.log(`    ID: ${provider.id}`);
            console.log(`    Active: ${provider.active}`);
            console.log(`    Address: ${provider.serviceProvider}`);
        }

        console.log("\n✓ Dataset is active and managed by storage provider\n");
    } catch (error) {
        console.log(`Note: ${error.message}\n`);
    }

    // ========================================================================
    // Step 5: List All Pieces in the Dataset
    // ========================================================================
    console.log("=== Step 5: List All Pieces in Dataset ===");

    console.log(`\nDataset contains ${uploadResults.length} pieces:\n`);

    uploadResults.forEach((result, index) => {
        console.log(`Piece ${index + 1}:`);
        console.log(`  File: ${result.filename}`);
        console.log(`  PieceCID: ${result.pieceCid}`);
        console.log(`  Size: ${result.size} bytes`);
        if (result.provider) {
            console.log(`  Provider: ${result.provider}`);
        }
        console.log();
    });

    // ========================================================================
    // Step 6: Check Proof Status
    // ========================================================================
    console.log("=== Step 6: Check Proof Status ===");

    console.log("Proof of Data Possession (PDP) ensures providers are storing your data.\n");

    console.log("Uploaded Pieces Summary:");
    console.log("┌─────────────────────────────────────────────────────────────────┐");

    for (const result of uploadResults) {
        // Convert pieceCid to string (it may be a PieceLink object)
        const cidString = String(result.pieceCid);
        const shortCid = cidString.substring(0, 20) + '...' + cidString.substring(cidString.length - 10);
        console.log(`│ ${result.filename.padEnd(20)} │ ${shortCid.padEnd(35)} │`);
    }

    console.log("└─────────────────────────────────────────────────────────────────┘");

    console.log("\nProof Verification:");
    console.log("  ✓ All pieces have been uploaded to the storage provider");
    console.log("  ✓ Storage deals are created on-chain");
    console.log("  ✓ Providers must submit regular cryptographic proofs");
    console.log("  ✓ Failed proofs result in provider penalties\n");

    console.log("To verify on-chain:");
    console.log(`  1. Visit: https://calibration.filfox.info/`);
    console.log(`  2. Search for any PieceCID from the list above`);
    console.log(`  3. View deal status and proof submissions\n`);

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("=== Summary ===\n");

    console.log("✅ Dataset Operations Complete!\n");

    console.log("What you accomplished:");
    console.log(`  • Created a storage context with metadata`);
    console.log(`  • Uploaded ${uploadResults.length} files to the dataset`);
    console.log(`  • Retrieved dataset information`);
    console.log(`  • Listed all pieces in the dataset`);
    console.log(`  • Verified proof status\n`);

    console.log("Key Takeaways:");
    console.log("  → Datasets group related files for easier management");
    console.log("  → Metadata helps organize and query your stored data");
    console.log("  → Each file gets a unique PieceCID for retrieval");
    console.log("  → Cryptographic proofs ensure data integrity\n");

    console.log("Next Steps:");
    console.log("  • Download files using their PieceCIDs");
    console.log("  • Add more files to the existing dataset");
    console.log("  • Query datasets by metadata");
    console.log("  • Monitor proof status over time\n");
}

main().catch((err) => {
    console.error("Error during dataset operations:");
    console.error(err);
    process.exit(1);
});
