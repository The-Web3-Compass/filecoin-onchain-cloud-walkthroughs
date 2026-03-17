import 'dotenv/config';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { privateKeyToAccount } from 'viem/accounts';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
    console.log("Uploading Your First File to Filecoin...\n");

    // Initialize SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

    const synapse = Synapse.create({
        account: privateKeyToAccount(formattedPrivateKey),
        source: 'first-upload-tutorial'
    });

    console.log("✓ SDK initialized\n");

    // Step 1: Read the sample file
    console.log("=== Step 1: Load Upload Data ===");

    const sampleFilePath = join(__dirname, './data/sample.txt');
    const fileContent = readFileSync(sampleFilePath);
    const fileSize = fileContent.length;

    console.log(`File Path: ${sampleFilePath}`);
    console.log(`File Size: ${fileSize} bytes`);
    console.log(`First 100 characters: ${fileContent.toString().substring(0, 100)}...`);
    console.log();

    // Step 2: Prepare storage & verify payment capabilities
    console.log("=== Step 2: Prepare Storage & Verify Payments ===");

    const prep = await synapse.storage.prepare({
        dataSize: BigInt(fileSize)
    });

    if (!prep.costs.ready) {
        if (prep.transaction) {
            console.log("Submitting required payment and approval transaction...");
            const { hash } = await prep.transaction.execute();
            await synapse.client.waitForTransactionReceipt({ hash });
            console.log(`✓ Payment setup confirmed\n`);
        } else {
            console.log("\n⚠️  Warning: Payment account is not ready and no transactions could be generated.");
            console.log("Please run the payment-management tutorial first to fund your wallet.");
            process.exit(1);
        }
    } else {
        console.log("✓ Payment account is funded and ready\n");
    }

    // Step 3: Upload to Filecoin
    console.log("=== Step 3: Upload to Filecoin Network ===");
    console.log("Uploading file...");
    console.log("(This may take 30-60 seconds as the data is processed and stored)\n");

    const uploadResult = await synapse.storage.upload(fileContent);

    console.log("✓ Upload successful!\n");

    // Step 4: Examine Upload Response
    console.log("=== Step 4: Upload Response Details ===");

    console.log(`PieceCID: ${uploadResult.pieceCid}`);
    console.log(`  → This is your data's unique identifier on Filecoin`);
    console.log(`  → Format: Starts with 'bafkzcib' (64-65 characters)`);
    console.log(`  → Use this to retrieve your data from any provider`);
    console.log();

    console.log(`Copies stored: ${uploadResult.copies.length}`);
    console.log(`Upload Complete: ${uploadResult.complete ? '✓' : '✗'}`);
    console.log();

    if (uploadResult.failedAttempts.length > 0) {
        console.log(`Note: There were ${uploadResult.failedAttempts.length} failed attempts during upload.`);
    }

    // Step 5: Verify data on-chain
    console.log("=== Step 5: On-Chain Verification ===");
    console.log("Your data is now stored on Filecoin!");
    console.log();
    console.log("To verify on-chain:");
    console.log(`1. Visit: https://calibration.filfox.info/`);
    console.log(`2. Search for your PieceCID: ${uploadResult.pieceCid}`);
    console.log();
    console.log("Note: It may take a few minutes for storage deals to appear in the explorer.");
    console.log("The data is stored immediately, but deal records propagate gradually.\n");

    console.log("\n✅ Upload complete! Your file is now stored on decentralized infrastructure.");
    console.log(`\nSave your PieceCID: ${uploadResult.pieceCid}`);
    console.log("\nYou can now use this PieceCID to retrieve your data anytime!");
}

main().catch((err) => {
    console.error("Error during upload:");
    console.error(err);
    process.exit(1);
});
