import 'dotenv/config';
import { Synapse } from '@filoz/synapse-sdk';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================
// 1. Paste in the PieceCID you got from the "first-upload" tutorial.
//    Example: "bafkzcib..."
const PIECE_CID = "PASTE_YOUR_PIECE_CID_HERE";

// 2. Set the path to the original file you uploaded.
//    We use this to verify the download is identical.
const ORIGINAL_FILE_PATH = "PASTE_YOUR_ORIGINAL_FILE_PATH_HERE";
// ============================================================================

async function main() {
    console.log("Downloading and Verifying Filecoin Data...\n");

    // Check if user has updated the configuration
    if (PIECE_CID === "PASTE_YOUR_PIECE_CID_HERE") {
        throw new Error("Please update the PIECE_CID constant in index.js with your Filecoin PieceCID.");
    }

    if (ORIGINAL_FILE_PATH === "PASTE_YOUR_ORIGINAL_FILE_PATH_HERE") {
        throw new Error("Please update the ORIGINAL_FILE_PATH constant in index.js with the path to your original file.");
    }

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

    // Step 1: Download the Data
    console.log("=== Step 1: Download from Filecoin ===");
    console.log(`Requesting data for PieceCID: ${PIECE_CID}...`);
    console.log("(This retrieves your data from the storage provider network)\n");

    // The download method searches the network for providers hosting this PieceCID
    // and retrieves the content securely.
    const downloadedData = await synapse.storage.download(PIECE_CID);

    console.log(`✓ Download complete! Received ${downloadedData.length} bytes.`);

    // Save the downloaded file
    const downloadPath = join(__dirname, 'downloaded_file.txt');
    writeFileSync(downloadPath, downloadedData);
    console.log(`Saved to: ${downloadPath}\n`);


    // Step 2: Verification
    console.log("=== Step 2: Verify Integrity ===");

    try {
        const originalData = readFileSync(ORIGINAL_FILE_PATH);
        console.log(`Original file: ${ORIGINAL_FILE_PATH}`);
        console.log(`Original size: ${originalData.length} bytes`);
        console.log(`Downloaded size: ${downloadedData.length} bytes`);

        // Strict verification: Byte-by-byte comparison
        // In Node.js, Buffer.compare returns 0 if buffers are identical
        const matches = Buffer.compare(originalData, downloadedData) === 0;

        if (matches) {
            console.log("\n✅ VERIFICATION SUCCESSFUL");
            console.log("The downloaded bytes strictly match the original file.");
            console.log("This cryptographically proves you received exactly what you stored.");
        } else {
            console.error("\n❌ VERIFICATION FAILED");
            console.error("The downloaded data does not match the original file.");
            console.error("This suggests data corruption or an incorrect PieceCID.");
            process.exit(1);
        }

        // Display Content (since we know it's a text file)
        console.log("\n--- File Content ---");
        const decoder = new TextDecoder();
        console.log(decoder.decode(downloadedData));
        console.log("--------------------\n");

    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error("\n⚠️  Could not find original file for verification.");
            console.error(`Checked path: ${ORIGINAL_FILE_PATH}`);
            console.error("Please update ORIGINAL_FILE_PATH in index.js to point to your original file.");
        } else {
            throw err;
        }
    }
}

main().catch((err) => {
    console.error("Error during download:");
    console.error(err);
    process.exit(1);
});
