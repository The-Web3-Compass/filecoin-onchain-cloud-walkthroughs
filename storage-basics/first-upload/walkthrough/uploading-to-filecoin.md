# Uploading Your First File to Filecoin

The previous modules established your payment infrastructure and demonstrated how Filecoin's architecture enables automated storage payments. Now comes the moment those foundations were built for: actually storing data on the decentralized network.

This walkthrough takes you through your first upload to Filecoin. You will learn what happens when data leaves your local environment and enters the distributed storage network, how to interpret the cryptographic identifiers that prove your data exists, and how to verify that storage providers are actually holding your bytes. This represents the practical payoff for the setup work you completed earlier.

Traditional cloud storage abstracts away details about where your data lives and how it's maintained. That opacity might feel convenient, but it creates dependencies on specific providers and prevents independent verification. Filecoin takes the opposite approach. Every aspect of storage is cryptographically provable and publicly auditable. You can verify exactly where your data lives, confirm it remains intact, and retrieve it from any willing provider. This transparency comes with complexity, but the tradeoff enables genuinely decentralized infrastructure.

## Prerequisites

Before proceeding, you must have completed both previous walkthroughs:

- **Environment Setup and Token Acquisition** - Your environment should be configured with the Synapse SDK installed, and your wallet should contain tFIL for gas
- **Payment Account Funding** - Your payment account must hold USDFC to pay for storage operations

If either prerequisite is missing, return to those modules first. This walkthrough assumes your payment account is funded and ready to handle storage charges.

## What This Walkthrough Covers

We will walk through five operations that demonstrate the upload workflow:

1. **Payment Verification** - Confirming your account can pay for storage
2. **Data Preparation** - Loading a file from your filesystem
3. **Upload Execution** - Sending data to the Filecoin network
4. **Response Interpretation** - Understanding PieceCID, size, and provider information
5. **On-Chain Verification** - Finding your data in the blockchain explorer

Each step reveals aspects of how Filecoin storage actually works underneath the developer-friendly SDK interface. Data retrieval will be covered in the next walkthrough.

## How Filecoin Storage Differs from Traditional Cloud

Before writing code, understanding what distinguishes Filecoin from conventional object storage proves valuable.

Traditional providers like AWS S3 or Google Cloud Storage give you an API and handle everything behind it. You upload bytes, receive an identifier, and trust the provider maintains your data. If you want proof your data exists, you can download it and verify. But you cannot independently confirm the provider is actually storing it versus regenerating it on demand. You cannot inspect which hardware holds your bytes. And if the provider experiences an outage, suffers a security breach, or simply decides to change their service terms, your options are limited.

When you upload data  in Filecoin Onchain Cloud, the network generates a **PieceCID** - a content identifier derived cryptographically from your exact bytes. This identifier is unique to your data. Change a single bit and the PieceCID changes completely. Storage providers prove they hold your data by submitting cryptographic proofs to the blockchain. These proofs cannot be faked without actually storing the bytes. The blockchain validates proofs automatically and penalizes providers who fail to maintain data.

This creates several practical differences. Your data identifier works across all providers - you can upload through one provider and download through another. You can verify storage persistence by checking blockchain records rather than trusting provider dashboards. And the economic mechanism incentivizes providers to maintain your data correctly, since failing to do so costs them money.

The tradeoff is complexity. You need to understand concepts like PieceCID, deal mechanics, and payment channels. But this complexity buys you properties that centralized infrastructure cannot provide: cryptographic proof, economic guarantees, and genuine decentralization.

## Understanding PieceCID Before Upload

The upload process centers around **PieceCID**, so grasping this concept before you see the code makes everything clearer.

PieceCID stands for "Piece Content Identifier" and represents Filecoin's native addressing system for stored data. When you upload a file, the SDK performs specific processing:

1. Your bytes are padded to meet Filecoin's sector alignment requirements
2. A Merkle tree is constructed from the padded data
3. The root hash of that tree becomes your PieceCID

This identifier is derived entirely from your data's content, not from metadata like filenames or timestamps. Upload the exact same bytes twice and you get the identical PieceCID both times. Change even one bit and the PieceCID differs completely.

The format looks like this: `bafkzcibca...` (64-65 characters total). The prefix `bafkzcib` identifies this as a PieceCID v2 format. Earlier Filecoin implementations used a v1 format starting with `baga6ea4seaq`, and you may encounter that in older tools. The Synapse SDK exclusively uses v2.

PieceCID serves multiple critical functions:

**Unique Identification**: No two different files produce the same PieceCID (with cryptographic certainty). This lets you reference data unambiguously.

**Content Verification**: Download data using a PieceCID and you can verify you received exactly what was stored. The SDK performs this verification automatically.

**Provider Independence**: Any provider storing data for a PieceCID can serve it to you. Upload through Provider A, download through Provider B. The PieceCID works universally.

**Size Information**: The PieceCID encodes the size of the padded data. This metadata is embedded in the identifier itself.

Understanding PieceCID clarifies what the upload operation actually returns and why that identifier matters for everything that comes after.

## Sample File

This tutorial includes a sample file (`sample.txt`) located in the `data/` folder. You can find it in the repository at:

[https://github.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/tree/main/storage-basics/first-upload/data/sample.txt](https://github.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/tree/main/storage-basics/first-upload/data/sample.txt)

The sample file is 459 bytes of text about Filecoin storage, which meets the minimum size requirement of 127 bytes. Feel free to replace it with your own small files to experiment - just ensure they're between 127 bytes and 200 MiB.

## Step 1: Create the Upload Script

Create a file named `index.js` in your directory:

```javascript
import 'dotenv/config';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

    const synapse = await Synapse.create({
        privateKey: privateKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("✓ SDK initialized\n");

    // Step 1: Verify payment account balance
    console.log("=== Step 1: Verify Payment Account Balance ===");
    
    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    console.log(`Payment Account (USDFC): ${paymentBalance.toString()} (raw units)`);
    
    if (paymentBalance === 0n) {
        console.log("\n⚠️  Warning: Payment account has no balance!");
        console.log("Please run the payment-management tutorial first to fund your account.");
        process.exit(1);
    }
    
    console.log("✓ Payment account is funded\n");

    // Step 2: Read the sample file
    console.log("=== Step 2: Load Upload Data ===");
    
    const sampleFilePath = join(__dirname, './data/sample.txt');
    const fileContent = readFileSync(sampleFilePath);
    const fileSize = fileContent.length;
    
    console.log(`File Path: ${sampleFilePath}`);
    console.log(`File Size: ${fileSize} bytes`);
    console.log(`First 100 characters: ${fileContent.toString().substring(0, 100)}...`);
    console.log();

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
    
    console.log(`Size: ${uploadResult.size} bytes`);
    console.log(`  → Verified size of your uploaded data`);
    console.log(`  → Matches original file: ${uploadResult.size === fileSize ? '✓' : '✗'}`);
    console.log();

    if (uploadResult.provider) {
        console.log(`Provider: ${uploadResult.provider}`);
        console.log(`  → Storage provider address storing your data`);
        console.log(`  → SDK automatically selected this provider for you`);
    }
    console.log();

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
```

This script demonstrates the complete upload workflow with detailed logging at each stage.

## Understanding the Code

### ES Module Path Handling

```javascript
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

ES modules do not provide `__dirname` and `__filename` globals that CommonJS offers. These lines reconstruct them using `import.meta.url`. This lets us build file paths relative to the script location, which matters for loading the sample file reliably regardless of where you run the command from.

### Payment Balance Verification

```javascript
const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);

if (paymentBalance === 0n) {
    console.log("\n⚠️  Warning: Payment account has no balance!");
    process.exit(1);
}
```

Before attempting an upload, we verify the payment account holds funds. The `balance()` method returns a BigInt representing your payment account balance in the smallest USDFC units (wei-equivalent).

Checking balance proactively prevents confusing errors later. If you attempt an upload with an unfunded account, the storage provider would reject the operation, but the error message might not clearly indicate the payment account issue. Explicit verification provides clarity.

### File Loading

```javascript
const sampleFilePath = join(__dirname, '../data/sample.txt');
const fileContent = readFileSync(sampleFilePath);
const fileSize = fileContent.length;
```

We load a sample text file from the `data/` directory. Using `readFileSync` returns a Buffer, which the SDK accepts directly. For production applications handling user uploads, you would typically stream data instead of loading it entirely into memory, especially for larger files.

The SDK enforces size constraints: minimum 127 bytes, maximum 200 MiB. Files below 127 bytes cannot generate valid PieceCIDs. Files above 200 MiB require chunking, which the current SDK version does not support automatically. Our sample file falls comfortably within these bounds.

### The Upload Operation

```javascript
const uploadResult = await synapse.storage.upload(fileContent);
```

This single line performs substantial work behind the scenes:

1. **Data Processing**: The SDK pads your data to meet sector alignment requirements and computes the PieceCID
2. **Provider Selection**: The SDK queries available providers and selects one that can accept your data
3. **Transfer**: Your data is sent to the chosen provider's storage infrastructure
4. **Deal Creation**: A storage deal is created on-chain, locking payment account funds for the storage duration
5. **Confirmation**: The provider confirms receipt and the upload completes

For small files on Calibration testnet, this typically takes 30-60 seconds. Mainnet performance varies based on provider response times and network conditions.

The beauty of the SDK is that this complexity gets abstracted into one method call. You do not need to manage provider selection, deal negotiation, or payment authorization separately.

### Upload Result Structure

```javascript
console.log(`PieceCID: ${uploadResult.pieceCid}`);
console.log(`Size: ${uploadResult.size} bytes`);
if (uploadResult.provider) {
    console.log(`Provider: ${uploadResult.provider}`);
}
```

The upload result contains three critical fields:

**pieceCid**: Your data's unique content identifier. This is what you will use to retrieve the data later. It is a string in the format `bafkzcib...` (64-65 characters). Store this somewhere permanent if the data matters beyond this tutorial.

**size**: The size of your uploaded data in bytes. This should match your original file size. The SDK uses this for verification and cost calculations.

**provider**: The Ethereum address of the storage provider holding your data. The SDK selects providers based on availability, capacity, and pricing. You typically do not need to interact with provider addresses directly, but seeing which provider holds your data can be useful for debugging or optimization.

### On-Chain Verification Guidance

```javascript
console.log("To verify on-chain:");
console.log(`1. Visit: https://calibration.filfox.info/`);
console.log(`2. Search for your PieceCID: ${uploadResult.pieceCid}`);
```

The storage deal information lives on the Filecoin blockchain where anyone can inspect it. The Filfox explorer provides a web interface for browsing blockchain data.

Searching for your PieceCID shows the associated storage deals, provider information, deal duration, and payment details. This transparency marks a fundamental difference from centralized storage. With AWS S3, you cannot independently verify your data exists beyond downloading it. With Filecoin, the proof exists on-chain for anyone to audit.

Note the caveat about propagation delay. The upload completes once your data is stored and the deal transaction is submitted. But block explorers index blockchain data asynchronously. Depending on timing and network load, your deal might not appear immediately. Wait a few minutes and refresh if the search returns nothing initially.



## Step 2: Run the Upload

Navigate to the `code` directory and execute the script:

```bash
cd first-upload/code
node index.js
```

You should see output similar to:

```
Uploading Your First File to Filecoin...

✓ SDK initialized

=== Step 1: Verify Payment Account Balance ===
Payment Account Balance: 5000000000000000000 (raw units)
✓ Payment account is funded

=== Step 2: Load Upload Data ===
File Path: /path/to/first-upload/data/sample.txt
File Size: 459 bytes
First 100 characters: 🚀 Filecoin Onchain Cloud - Sample Upload File 🌍

This is your first file stored on the File...

=== Step 3: Upload to Filecoin Network ===
Uploading file...
(This may take 30-60 seconds as the data is processed and stored)

✓ Upload successful!

=== Step 4: Upload Response Details ===
PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
  → This is your data's unique identifier on Filecoin
  → Format: Starts with 'bafkzcib' (64-65 characters)
  → Use this to retrieve your data from any provider

Size: 512 bytes
  → Verified size of your uploaded data
  → Matches original file: ✓

Provider: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1
  → Storage provider address storing your data
  → SDK automatically selected this provider for you

=== Step 5: On-Chain Verification ===
Your data is now stored on Filecoin!

To verify on-chain:
1. Visit: https://calibration.filfox.info/
2. Search for your PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq

Note: It may take a few minutes for storage deals to appear in the explorer.
The data is stored immediately, but deal records propagate gradually.

✅ Upload complete! Your file is now stored on decentralized infrastructure.

Save your PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq

You can now use this PieceCID to retrieve your data anytime!
```

The upload succeeded, and you now have data permanently stored on Filecoin Calibration testnet.

## What Happens During Upload

When you call `synapse.storage.upload()`, a complex orchestration occurs across multiple systems. Understanding this flow clarifies what distinguishes Filecoin from traditional storage.

### Phase 1: Local Processing

Your data starts as raw bytes on your machine. The SDK must transform this into a format Filecoin can work with.

First, the data gets padded to align with Filecoin's sector sizes. Filecoin organizes storage into fixed-size sectors (typically 32 GiB or 64 GiB on mainnet, smaller on Calibration). Your data needs padding to fit these constraints. For a small file, most of the eventual sector is padding rather than your actual data.

Next, a Merkle tree is constructed from the padded data. This tree structure enables the cryptographic proofs that providers submit. The root of this tree becomes your PieceCID. This computation happens locally before any network communication occurs.

### Phase 2: Provider Discovery

The SDK queries the Filecoin Onchain Cloud service to find available storage providers. Providers register their capacity, pricing, and service parameters on-chain. The SDK evaluates options based on:

- **Availability**: Can the provider accept new data right now?
- **Pricing**: What does storage cost per byte per epoch?
- **Reputation**: Historical performance and reliability metrics
- **Latency**: Geographic proximity and network performance

For Calibration testnet with Filecoin Onchain Cloud, provider selection is largely automated. On mainnet or with custom deployments, you might specify provider preferences explicitly.

### Phase 3: Data Transfer

Once a provider is selected, your data transfers to their infrastructure. This uses standard HTTP or libp2p protocols depending on provider configuration. The provider receives your bytes and validates the PieceCID matches the data.

For large files, this transfer could take substantial time. For our small sample file, it completes in seconds.

### Phase 4: Deal Creation

After confirming receipt, the provider creates a storage deal on the Filecoin blockchain. This deal specifies:

- **PieceCID**: What data is being stored
- **Size**: How much space the data occupies
- **Duration**: How long storage will last (based on your lockup period)
- **Price**: Total cost in USDFC
- **Collateral**: Provider stake guaranteeing performance

The deal transaction is submitted to the blockchain and must be mined (approximately 30 seconds per block). Once confirmed, the deal becomes public record.

### Phase 5: Payment Authorization

Your payment account must have sufficient balance and the provider must have adequate allowance to charge you. The payment system verifies both conditions and authorizes the charge.

Funds get locked from your payment account for the deal duration. They're not transferred to the provider yet - they remain in escrow. The provider earns those funds gradually by proving storage over time.

### Phase 6: Confirmation

The SDK waits for blockchain confirmation that the deal succeeded. Once confirmed, the upload operation returns with your PieceCID and result details.

Your data is now stored. The provider must submit cryptographic proofs periodically to confirm they still hold the data. Failing to provide proofs results in penalties, creating economic incentive to maintain storage properly.

## Verifying Storage On-Chain

The transparency of blockchain-based storage means you can independently verify claims about your data. Let's walk through what the block explorer reveals.

Navigate to [https://calibration.filfox.info/](https://calibration.filfox.info/) and paste your PieceCID into the search box. The explorer attempts to locate any deals associated with that identifier.

The deal details page shows:

**Deal ID**: A unique number identifying this specific storage agreement. Multiple deals can exist for the same PieceCID if you uploaded the same data multiple times or different users uploaded identical content.

**Client**: Your wallet address. This proves you initiated this storage deal.

**Provider**: The storage provider's address. You can inspect their historical performance, total stored data, and reputation metrics.

**Start Epoch / End Epoch**: When the deal begins and ends, measured in Filecoin epochs (30-second intervals). This determines how long the provider must maintain your data.

**Storage Price per Epoch**: What you're paying for storage each epoch. Multiply by duration to get total cost.

**Provider Collateral**: How much the provider staked as guarantee of performance. If they fail to prove storage, this collateral gets slashed.

**Deal State**: Active, expired, slashed, or other states. Active means storage is currently maintained.

This information exists on-chain and cannot be altered by any party. Centralized storage providers could claim anything about your data, but Filecoin's transparency lets you verify independently.

## Production Considerations

This tutorial demonstrated upload mechanics with a tiny text file. Production deployments face additional considerations worth understanding now.

### File Size Strategy

The current SDK supports files up to 200 MiB. For larger datasets, you need to split data into chunks. Each chunk uploads separately and receives its own PieceCID. Your application must track which PieceCIDs compose the complete dataset.

Future SDK versions will support automatic chunking and aggregate PieceCIDs, but for now, implement chunking at the application level if needed.

Filecoin works most efficiently with larger pieces. The overhead of deals, proofs, and blockchain transactions doesn't scale linearly with data size. Storing one 100 MiB file costs roughly the same as storing one hundred 1 MiB files in terms of operational overhead, but the 100 MiB file enjoys much better economics.

Consider batching small files into larger blobs before upload if your application handles many small objects.

### Metadata Management

The upload in this tutorial didn't attach any metadata. The SDK supports adding up to 5 key-value pairs of metadata per piece, with keys limited to 32 characters and values to 128 characters.

Metadata gets stored on-chain alongside the deal. Use it for application-specific information like original filenames, MIME types, upload timestamps, or user identifiers. Structure metadata carefully since it's immutable once the deal is created.

Example with metadata:

```javascript
const uploadResult = await synapse.storage.upload(fileContent, {
    metadata: {
        filename: "sample.txt",
        type: "text/plain",
        uploadedAt: new Date().toISOString()
    }
});
```

### Error Handling

Production code needs robust error handling. Upload can fail for multiple reasons:

- **Insufficient balance**: Payment account lacks funds to cover storage costs
- **No available providers**: All providers are at capacity or offline
- **Network issues**: Connection problems during data transfer
- **File size violations**: Data exceeds maximum or falls below minimum size
- **Invalid data**: Corrupted or malformed input that cannot be processed

Implement retry logic with exponential backoff for transient failures. Log failures with enough context to diagnose issues. Consider implementing upload queues for high-volume applications where individual upload failures shouldn't block other operations.

### Cost Tracking

Each upload consumes USDFC from your payment account. For production applications, implement monitoring to track:

- **Total storage costs** across all uploads
- **Cost per upload** to identify expensive operations
- **Payment account balance** to prevent service interruption when funds run low
- **Cost by data type or user** to understand spending patterns

The SDK provides methods to query payment account balance and transaction history. Build dashboards that visualize these metrics so you can optimize storage strategy and budget appropriately.

### Redundancy and Replication

A single upload creates one storage deal with one provider. If that provider goes offline or loses data, you lose access until they recover (or permanently if they cannot recover).

For critical data, upload to multiple providers or use the dataset feature to manage replicas automatically. Multiple providers storing the same PieceCID provides redundancy. If one fails, others can still serve the data.

The tradeoff is multiplicative costs - three providers means triple the storage expense. Evaluate data importance and acceptable downtime risk when deciding replication levels.

## Troubleshooting

**"Payment account has no balance" error**

Run the payment-management tutorial first to deposit USDFC into your payment account. Storage operations require funded accounts.

**"Actor balance less than needed" or "gas search failed" error**

This error message looks like:

```
Actor balance less than needed: 0.020289... < 0.069999...
```

**Important**: This error refers to the **storage provider's** balance, NOT your wallet balance! The storage provider trying to process your upload doesn't have enough tFIL in their actor account to pay for the transaction.

This is a **testnet limitation** - providers on Calibration can run out of gas as they're not always topped up promptly.

**Solutions**:
1. **Wait and retry** - The provider might get refunded soon. Wait 5-10 minutes and try again.
2. **Try again later** - During off-peak hours (late night UTC) when fewer users are testing.
3. **Different provider** - The SDK might select a different provider on retry.
4. **Mainnet** - Production mainnet providers maintain adequate balances as they're incentivized by real revenue.

**Note**: If you see this error, your wallet balance and payment account are likely fine. Check that you have:
- At least 0.1 tFIL in your wallet for gas
- At least 1 USDFC in your payment account

If both are sufficient, the issue is provider-side and retrying is the best approach.

**Upload times out or takes extremely long**

Calibration testnet can experience congestion or provider slowness. Wait several minutes and retry. If problems persist, check the [Filecoin Slack](https://filecoin.io/slack) or [status page](https://status.filecoin.io/) for known issues.

**"File size too small" error**

Files must be at least 127 bytes. Pad smaller files with whitespace or combine multiple small files into a larger archive.

**"File size too large" error**

The SDK currently supports maximum 200 MiB uploads. Split larger files into chunks and upload separately, tracking PieceCIDs in your application.



**PieceCID not found in block explorer**

Wait 2-5 minutes after upload completes. Deal records propagate to explorers asynchronously. If still missing after 10 minutes, the deal may still be processing. Check back later or verify your upload transaction was successful.

**Provider address is undefined in result**

Some SDK versions may not populate the provider field in all scenarios. This doesn't indicate upload failure. You can still use the PieceCID for downloads and the storage deal exists on-chain.

## Conclusion

You have successfully uploaded data to Filecoin's decentralized storage network. The file you stored is now maintained by a storage provider who must submit regular cryptographic proofs to verify they still hold your bytes. Those proofs are validated by the Filecoin blockchain automatically. Your PieceCID serves as the permanent address for retrieving this data, and anyone can verify the storage deal exists by inspecting on-chain records.

This represents fundamentally different infrastructure from centralized cloud storage. Your data's existence is not a claim by a trusted provider - it's a cryptographically provable fact recorded on a public blockchain. The provider cannot lie about maintaining your storage without facing economic penalties. And you can retrieve your data from any provider storing that PieceCID, not just the original uploader.

The abstractions provided by the Synapse SDK make this workflow accessible through simple API calls, but understanding what happens beneath those abstractions clarifies why Filecoin enables properties that traditional infrastructure cannot provide.

The next walkthrough will cover retrieving your data using the PieceCID you received. From there, you can explore additional storage operations like managing datasets (collections of related pieces), handling larger files through chunking strategies, implementing metadata for application-specific organization, or optimizing costs through strategic provider selection. The [Synapse SDK documentation](https://docs.filecoin.cloud/developer-guides/synapse/) covers these advanced topics in detail.

The foundational knowledge from this tutorial series - payment accounts, operator allowances, PieceCID mechanics, and upload workflows - applies directly when building production applications on Filecoin mainnet. The only differences are network configurations and the use of real rather than test tokens.
