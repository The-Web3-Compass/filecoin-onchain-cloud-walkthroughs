# Downloading and Verifying Data from Filecoin

The previous tutorial demonstrated uploading data to Filecoin's decentralized storage network. You sent bytes into the network and received a PieceCID in return—a cryptographic identifier that serves as your data's permanent address. That identifier is not merely a reference number assigned by a centralized service. It is a mathematical proof derived from your exact bytes, and it enables something that traditional cloud storage cannot provide: verifiable retrieval.

This walkthrough completes the storage cycle. You will use your PieceCID to download data from the network and perform cryptographic verification that proves the bytes you receive are identical to what you uploaded. This is not trust-based verification where you assume a provider maintained your data correctly. This is mathematical certainty achieved through byte-for-byte comparison.

Traditional cloud storage requires trust. When you download a file from AWS S3, you trust that Amazon gave you the correct bytes. You have no independent way to verify they did not modify, corrupt, or substitute your data. Filecoin eliminates this trust requirement. The PieceCID you received during upload is a cryptographic commitment. Any provider claiming to store your data must be able to produce bytes that generate that exact identifier. If even a single bit differs, the verification fails.

## Prerequisites

You need three things from the previous tutorials:

**Environment Setup and Token Acquisition**: The Synapse SDK installed and configured
**Payment Account Funding**: USDFC in your payment account (downloads cost less than uploads)
**First Upload**: A PieceCID from the upload tutorial

Without a PieceCID from the previous tutorial, go back and complete that module first. This walkthrough assumes you have data stored on Filecoin.

## What This Walkthrough Covers

Three operations demonstrate the complete download and verification workflow:

**Download Execution**: Retrieving data from the network using a PieceCID
**Binary Data Handling**: Working with `Uint8Array` responses and converting to usable formats
**Cryptographic Verification**: Proving the downloaded data matches the original file exactly

Each step shows how Filecoin's content-addressable architecture enables verifiable storage that centralized infrastructure cannot replicate.

## Understanding PieceCID in the Context of Retrieval

The upload walkthrough explained how PieceCID gets generated, but understanding its role in retrieval clarifies why this architecture matters.

When you upload data, the SDK computes a PieceCID by constructing a Merkle tree from your padded bytes and taking the root hash. This identifier has several properties that become critical during download:

**Content-Derived Identity**: The PieceCID is not assigned by a server or generated randomly. It is mathematically derived from your exact bytes. This means anyone who has your data can independently compute the same PieceCID. And conversely, anyone who claims to have your data must be able to produce bytes that generate your PieceCID.

**Universal Addressing**: Your PieceCID works across all providers. You do not need to remember which specific provider you uploaded to. Any provider storing data for that PieceCID can serve it to you. This provider independence eliminates vendor lock-in at the protocol level.

**Automatic Verification**: When you request data by PieceCID, the SDK automatically verifies that the received bytes match the identifier. If a provider sends corrupted data or attempts to substitute different content, the PieceCID will not match and the download fails. This verification happens cryptographically, not through trust.

**Immutable Reference**: PieceCIDs never change. The identifier you received during upload will work forever, as long as at least one provider maintains the data. There are no expiring URLs, no access tokens that need renewal, no accounts that might get deleted. The PieceCID is a permanent address for your content.

This architecture inverts the traditional model. With centralized storage, you ask a specific provider for a specific file and trust they give you the right bytes. With Filecoin, you ask the network for a specific cryptographic identifier and the mathematics guarantees you receive the correct bytes.

## How Retrieval Works

Retrieval in Filecoin differs from traditional web downloads. When you request data by PieceCID:

**Discovery**: The SDK queries the network to find which storage providers hold the sector containing your PieceCID.
**Negotiation**: The SDK contacts a provider and requests the data.
**Transfer**: The provider streams the data to your client.
**Verification**: The SDK verifies that the received data matches the requested PieceCID.

This content-addressable approach means you ask *what* you want, not *where* to get it. You do not need to know the provider's IP address or the specific server implementation details.

## Step 1: Create the Download Script

Create a new file `code/index.js`. This script assumes you have completed the previous upload tutorial and have your `PieceCID` ready.

```javascript
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
```

## Understanding the Code

### 1. Configuration Constants
```javascript
const PIECE_CID = "PASTE_YOUR_PIECE_CID_HERE";
const ORIGINAL_FILE_PATH = "PASTE_YOUR_ORIGINAL_FILE_PATH_HERE";
```
We require these two inputs. The `PIECE_CID` tells the network exactly which data block we want. The `ORIGINAL_FILE_PATH` points to the local "source of truth"—the file you originally uploaded. This allows us to perform a strict A/B comparison.

For example, if you uploaded `sample.txt` from the first-upload tutorial, you might set:
```javascript
const ORIGINAL_FILE_PATH = "../../first-upload/data/sample.txt";
```

### 2. The Download Operation
```javascript
const downloadedData = await synapse.storage.download(PIECE_CID);
```
This is the core SDK method. You provide the identifier, and the SDK handles:

Querying miners
Establishing payment/retrieval channels
Validating the incoming data stream
Returning the result as a `Uint8Array`

### 3. Handling Binary Data
The SDK returns a `Uint8Array` because Filecoin stores raw bytes. It does not know if your data is text, an image, or a PDF.

To save it to a file: Pass the raw buffer directly to `writeFileSync`.
To print it as text: Use `new TextDecoder().decode(data)` to interpret the bytes as a UTF-8 string.

### 4. Verification Logic
```javascript
const matches = Buffer.compare(originalData, downloadedData) === 0;
```
This is the moment of truth. `Buffer.compare` performs a byte-by-byte check. If even a single bit differs between your local file and what came from the network, this check will fail. This provides cryptographic certainty that the file retrieval was perfect.

## Running the Script

**Paste your PieceCID**: Edit line 16 of `index.js` to include your actual PieceCID from the previous tutorial.
**Verify File Path**: Ensure `ORIGINAL_FILE_PATH` points to your `first-upload/data/sample.txt`.
**Run the script**:

```bash
node index.js
```

**Expected Output:**

```
Downloading and Verifying Filecoin Data...

✓ SDK initialized

=== Step 1: Download from Filecoin ===
Requesting data for PieceCID: bafkzcib...
(This retrieves your data from the storage provider network)

✓ Download complete! Received 459 bytes.
Saved to: .../downloaded_file.txt

=== Step 2: Verify Integrity ===
Original file: .../first-upload/data/sample.txt
Original size: 459 bytes
Downloaded size: 459 bytes

✅ VERIFICATION SUCCESSFUL
The downloaded bytes strictly match the original file.
This cryptographically proves you received exactly what you stored.

--- File Content ---
🚀 Filecoin Onchain Cloud - Sample Upload File 🌍
...
--------------------
```

## Troubleshooting

### "Error: Please update the PIECE_CID..."

You forgot to replace the placeholder string `"PASTE_YOUR_PIECE_CID_HERE"` in the code. Open `index.js` and paste your actual PieceCID from the upload tutorial on line 16.

The PieceCID should look like: `bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq` (64-65 characters starting with `bafkzcib`).

### "Could not find original file for verification"

The path specified in `ORIGINAL_FILE_PATH` does not point to a valid file. This happens if:

You deleted or moved the original file after uploading
The relative path is incorrect for your directory structure
You are running the script from a different location than expected

**Solution**: Update `ORIGINAL_FILE_PATH` on line 20 to point to wherever your original file actually lives. You can use an absolute path if the relative path is causing issues:

```javascript
const ORIGINAL_FILE_PATH = "/absolute/path/to/your/original/file.txt";
```

### "Download failed" / Timeout Errors

Retrieval can stall if the provider storing your data is temporarily unreachable. Unlike centralized storage where a single server failure means total unavailability, Filecoin's decentralized architecture means your data might be stored by multiple providers.

**What's happening**: The SDK queries the network for providers holding your PieceCID. If the primary provider is offline or experiencing network issues, the download request times out.

**Solutions**:

**Wait and retry**: Provider connectivity issues are usually temporary. Wait 2-3 minutes and run the script again.
**Check network status**: Visit the [Calibration testnet status page](https://calibration.filfox.info/) to see if there are known network issues.
**Verify your PieceCID**: Paste your PieceCID into [https://calibration.filfox.info/](https://calibration.filfox.info/) to confirm the storage deal still exists and is active.

### "VERIFICATION FAILED"

If the byte comparison fails, it means the downloaded data does not match your original file. This is rare but can happen in specific scenarios:

**Incorrect PieceCID**: You pasted the wrong identifier. Double-check that the PieceCID in your script matches exactly what the upload operation returned.

**Wrong Original File**: You are comparing against a different file than what you actually uploaded. Ensure `ORIGINAL_FILE_PATH` points to the exact file you used in the upload tutorial.

**Modified Original File**: You edited the local file after uploading. Even adding a single character or changing line endings will cause verification to fail. The original file must be byte-for-byte identical to what you uploaded.

**Actual Data Corruption** (extremely rare): If you are certain the PieceCID and original file are correct, this could indicate genuine data corruption. This would be a serious issue. Document the PieceCID, provider information, and exact error, then report it to the Filecoin community.

### SDK Initialization Errors

If you see errors during `Synapse.create()`, verify:

Your `.env` file exists and contains a valid `PRIVATE_KEY`
The private key format is correct (64-character hexadecimal string without `0x` prefix)
You have network connectivity to `https://api.calibration.node.glif.io/rpc/v1`

## What You Have Accomplished

You have completed the full storage cycle on Filecoin's decentralized network. You uploaded data in the previous tutorial and received a PieceCID. In this tutorial, you used that PieceCID to retrieve the data from the network and performed cryptographic verification that the bytes are identical to what you stored.

This verification is not ceremonial. It represents a fundamental difference from centralized storage:

**Cryptographic Proof vs. Trust**: With traditional cloud storage, you trust the provider maintained your data correctly. With Filecoin, you have mathematical proof. The byte-for-byte comparison demonstrates that the network preserved your exact bits.

**Provider Independence**: You did not need to remember which specific provider you uploaded to. The PieceCID worked universally. Any provider storing that identifier could serve your data. This eliminates vendor lock-in at the protocol level.

**Immutable Addressing**: Your PieceCID is a permanent address. As long as at least one provider maintains the data (and the blockchain enforces that they must, via cryptographic proofs and economic penalties), you can retrieve your content using the same identifier forever.

**Automatic Verification**: The SDK verified the downloaded data matched the PieceCID automatically. If a provider had sent corrupted or substituted data, the download would have failed before reaching your verification code. The content-addressable architecture makes data tampering mathematically detectable.

## Production Considerations

When building applications on Filecoin mainnet, several additional factors become relevant:

**Retrieval Costs**: Downloads consume bandwidth and provider resources. Providers may charge for retrieval, though costs are typically lower than storage costs. The SDK handles payment channel negotiations automatically.

**Redundancy**: For critical data, upload to multiple providers. If one provider goes offline, others can still serve your data. The dataset feature in the SDK helps manage replicas.

**Caching**: Frequently accessed data benefits from caching layers. You might download from Filecoin once and serve subsequent requests from a CDN or local cache. The PieceCID makes cache invalidation trivial—if the identifier changes, you know the content changed.

**Metadata Management**: The PieceCID identifies raw bytes, not filenames or application-specific metadata. Your application needs a separate index mapping user-friendly names to PieceCIDs. Consider storing this index on-chain or in a database.

**Large Files**: The current SDK supports files up to 200 MiB. Larger datasets require chunking. Each chunk uploads separately with its own PieceCID. Your application must track which PieceCIDs compose the complete file and reassemble chunks after download.

## Next Steps

You now understand the complete storage workflow: funding payment accounts, uploading data, and retrieving it with verification. The [Synapse SDK documentation](https://docs.filecoin.cloud/developer-guides/synapse/) covers advanced topics:

**Datasets**: Grouping related pieces for easier management
**Metadata**: Attaching application-specific tags to pieces and datasets
**Provider Selection**: Choosing specific providers based on reputation, geography, or cost
**Deal Renewal**: Extending storage duration before deals expire
**Aggregate PieceCIDs**: Combining multiple chunks into a single identifier for large files

The foundational concepts from this tutorial series—payment accounts, operator allowances, PieceCID mechanics, upload workflows, and verification—apply directly when building production applications on Filecoin mainnet. The primary differences are network configurations (mainnet RPC URLs instead of testnet) and the use of real FIL and USDC instead of test tokens.

Filecoin provides infrastructure that centralized cloud storage cannot replicate: cryptographic proof of storage, economic guarantees enforced by blockchain consensus, and genuine decentralization where no single entity controls your data. The complexity you navigated in these tutorials—understanding PieceCIDs, managing payment channels, verifying downloads—buys you properties that matter for applications requiring censorship resistance, long-term archival guarantees, or provable data integrity.
