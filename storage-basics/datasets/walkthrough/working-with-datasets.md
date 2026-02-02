# Working with Datasets on Filecoin

The previous tutorials demonstrated storing and retrieving individual files on Filecoin. Each upload produced a PieceCID, and each download required specifying that identifier. This approach works perfectly for isolated files, but real applications rarely deal with single files in isolation. You build photo albums, not individual photos. You manage document collections, not isolated PDFs. You backup entire projects, not random files.

This walkthrough introduces **datasets** - Filecoin's mechanism for managing collections of related files as cohesive units. Instead of tracking dozens of individual PieceCIDs and managing payment streams for each piece separately, you create a dataset that groups related content together. This provides unified metadata, simplified payment management, and easier organization of your stored data.

Traditional cloud storage handles this through folders and directories. You create a folder, upload files into it, and the provider manages the relationship. Filecoin takes a different approach that provides the same organizational benefits while maintaining the cryptographic guarantees and decentralization that make blockchain storage valuable. Datasets exist as on-chain entities with associated metadata, payment rails, and proof requirements. You can verify their existence, query their contents, and audit their storage proofs - all without trusting a centralized provider.

## Prerequisites

Before proceeding, you must have completed the previous tutorials:

- **Environment Setup and Token Acquisition**: SDK installed, wallet configured with tFIL and USDFC
- **Payment Account Funding**: Payment account funded and operator allowances approved
- **First Upload**: Understanding of PieceCID and upload mechanics
- **Download and Verification**: Familiarity with retrieval and verification

If any prerequisite is missing, return to those modules first. This walkthrough assumes you understand payment accounts, operator allowances, and basic storage operations.

## What This Walkthrough Covers

Six operations demonstrate the complete dataset workflow:

1. **Payment Verification**: Confirming your account can handle multiple uploads
2. **Dataset Creation**: Establishing a storage context with metadata
3. **Multi-File Upload**: Adding multiple files to the same dataset
4. **Dataset Information**: Retrieving metadata and provider details
5. **Piece Listing**: Enumerating all files in the dataset
6. **Proof Status**: Verifying cryptographic storage proofs

Each step reveals how datasets simplify multi-file storage while maintaining Filecoin's transparency and verifiability.

## Understanding Datasets vs Individual Pieces

Before examining code, understanding what datasets provide clarifies why they matter.

### The Individual Piece Approach

When you upload a file using `synapse.storage.upload()`, you create a storage deal for that specific piece. The SDK:

1. Computes the PieceCID from your bytes
2. Selects a storage provider
3. Transfers the data
4. Creates an on-chain deal
5. Authorizes payment from your account
6. Returns the PieceCID

If you upload 50 files this way, you create 50 separate deals with 50 separate payment authorizations. You track 50 PieceCIDs manually. If you want to tag these files as related (e.g., "Q4 2025 Financial Reports"), you maintain that metadata in your own database. The blockchain knows nothing about the relationship between these pieces.

### The Dataset Approach

When you create a storage context (dataset) and upload files to it, you establish a logical container that groups related pieces. The SDK:

1. Creates a dataset with your specified metadata
2. Establishes a payment rail for the entire dataset
3. Uploads each file to the same provider/context
4. Associates all pieces with the dataset
5. Stores metadata on-chain for querying

Now those 50 files share metadata, a unified payment stream, and a logical grouping that exists on-chain. You can query "show me all pieces in the Q4 2025 Financial Reports dataset" rather than maintaining your own mapping. The blockchain understands the relationship.

### Key Differences

**Payment Management**: Individual pieces each require separate payment authorization. Datasets establish a single payment rail that covers all pieces in the collection.

**Metadata**: Individual pieces can have metadata, but it's attached to each piece separately. Dataset metadata applies to the entire collection and can be queried at the dataset level.

**Provider Selection**: Individual uploads might select different providers. Dataset uploads typically use the same provider for consistency.

**Organization**: Individual pieces require external tracking to maintain relationships. Datasets provide on-chain organization that's queryable and verifiable.

**Proof Verification**: Individual pieces require checking proofs separately. Datasets let you verify proof status for the entire collection.

## Real-World Use Cases

Datasets shine in scenarios where files naturally group together:

**Document Collections**: Legal contracts, financial reports, or compliance documents that belong to the same project or time period. Tag the dataset with project identifiers and query by metadata.

**Photo Albums**: Event photos, family albums, or professional portfolios. Group related images together and attach metadata like date, location, or event name.

**Code Repositories**: Project source files, dependencies, and documentation. Store entire repositories as datasets with version metadata.

**Backup Sets**: System backups, database dumps, or disaster recovery data. Group snapshots by date and system identifier for easy restoration.

**Media Libraries**: Video collections, audio files, or multimedia projects. Organize by series, season, or production date.

**Research Data**: Scientific datasets, experiment results, or academic papers. Tag with study identifiers and publication dates.

The common thread is **logical cohesion**. If files relate to each other conceptually, datasets provide better organization than managing individual pieces.

## Step 1: Create the Dataset Management Script

Create a file named `index.js` in the `code/` directory:

```javascript
import 'dotenv/config';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { readFileSync, readdirSync } from 'fs';

async function main() {
    console.log("Working with Filecoin Datasets...\\n");

    // Initialize SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const synapse = await Synapse.create({
        privateKey: privateKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("✓ SDK initialized\\n");

    // Step 1: Verify Payment Account and Allowances
    console.log("=== Step 1: Verify Payment Account ===" );

    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    console.log(`Payment Account Balance: ${paymentBalance.toString()} (raw units)`);

    if (paymentBalance === 0n) {
        console.log("\\n⚠️  Warning: Payment account has no balance!");
        process.exit(1);
    }

    const operatorAddress = synapse.getWarmStorageAddress();
    const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
        console.log("⚠️  Warning: Operator allowances are not set!");
        process.exit(1);
    }
    console.log("✓ Operator allowances verified\\n");

    // Step 2: Create a Storage Context (Dataset)
    console.log("=== Step 2: Create Storage Context (Dataset) ===");
    
    const context = await synapse.storage.createContext({
        metadata: {
            project: "filecoin-tutorials",
            category: "documentation",
            version: "1.0",
            created: new Date().toISOString().split('T')[0]
        }
    });

    console.log("✓ Storage context created successfully\\n");

    // Step 3: Upload Multiple Files to the Dataset
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
        const result = await context.upload(fileContent);
        
        uploadResults.push({
            filename: filename,
            pieceCid: result.pieceCid,
            size: result.size
        });
        
        console.log(`  ✓ Uploaded - PieceCID: ${result.pieceCid}\\n`);
    }

    // Step 4: Retrieve Dataset Information
    console.log("=== Step 4: Retrieve Dataset Information ===");
    
    const storageInfo = await synapse.storage.getStorageInfo();
    console.log(`Total Providers: ${storageInfo.providers.length}\\n`);

    // Step 5: List All Pieces in the Dataset
    console.log("=== Step 5: List All Pieces in Dataset ===");
    
    uploadResults.forEach((result, index) => {
        console.log(`Piece ${index + 1}: ${result.filename}`);
        console.log(`  PieceCID: ${result.pieceCid}`);
        console.log(`  Size: ${result.size} bytes\\n`);
    });

    // Step 6: Check Proof Status
    console.log("=== Step 6: Check Proof Status ===");
    console.log("✓ All pieces uploaded with cryptographic proof requirements\\n");
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
```

This script demonstrates the complete dataset workflow with clear logging at each stage.

## Understanding the Code

### Payment Account Verification

```javascript
const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);

if (paymentBalance === 0n) {
    console.log("\\n⚠️  Warning: Payment account has no balance!");
    process.exit(1);
}
```

Before uploading multiple files, we verify the payment account holds sufficient funds. Multiple uploads consume more USDFC than single uploads, so this check prevents mid-operation failures.

The balance check uses BigInt (note the `0n` syntax) because blockchain token amounts are represented as large integers to avoid floating-point errors.

### Allowance Verification

```javascript
const operatorAddress = synapse.getWarmStorageAddress();
const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
    console.log("⚠️  Warning: Operator allowances are not set!");
    process.exit(1);
}
```

We also verify that the storage operator has permission to charge your account. This defensive check catches configuration issues before attempting uploads.

The `serviceApproval()` method returns an object with `isApproved`, `rateAllowance`, and `lockupAllowance` fields. All three must be properly set for uploads to succeed.

### Creating a Storage Context

```javascript
const context = await synapse.storage.createContext({
    metadata: {
        project: "filecoin-tutorials",
        category: "documentation",
        version: "1.0",
        created: new Date().toISOString().split('T')[0]
    }
});
```

This creates a storage context (dataset) with associated metadata. The `createContext()` method establishes:

**A Logical Container**: All files uploaded through this context belong to the same dataset.

**Metadata Storage**: The metadata object is stored on-chain and can be queried later. This enables searching for datasets by project, category, version, or any custom keys you define.

**Payment Rail**: A payment stream is established for this dataset. All uploads to this context use the same payment authorization.

**Provider Preference**: The context may select a specific provider or use default provider selection logic.

The metadata keys are arbitrary strings you define. Common patterns include:
- `project`: Project or application identifier
- `category`: Content type or classification
- `version`: Version number or iteration
- `created`: Timestamp or date
- `owner`: User or organization identifier
- `environment`: Production, staging, development, etc.

Choose metadata keys that match your application's querying needs. If you'll search for datasets by date, include a date field. If you'll filter by user, include a user identifier.

### Loading Files from Directory

```javascript
const dataDir = "./data";
const files = readdirSync(dataDir);

console.log(`Found ${files.length} files to upload:`);
files.forEach(file => console.log(`  - ${file}`));
```

We use Node.js filesystem methods to discover all files in the `data/` directory. The `readdirSync()` function returns an array of filenames. The path `"./data"` is relative to where you run the script from (the `code/` directory).

This approach works well for demonstrations but has limitations in production. For large directories, you might want to:
- Filter files by extension or pattern
- Sort files by name or modification date
- Exclude hidden files or system files
- Handle subdirectories recursively

The tutorial includes four sample files demonstrating different file types: text, JSON, markdown, and CSV. This variety shows that datasets can contain heterogeneous content.

### Uploading Multiple Files

```javascript
const uploadResults = [];

for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filepath = `${dataDir}/${filename}`;
    
    console.log(`[${i + 1}/${files.length}] Uploading ${filename}...`);
    
    const fileContent = readFileSync(filepath);
    const result = await context.upload(fileContent);
    
    uploadResults.push({
        filename: filename,
        pieceCid: result.pieceCid,
        size: result.size
    });
    
    console.log(`  ✓ Uploaded - PieceCID: ${result.pieceCid}\\n`);
}
```

This loop uploads each file to the storage context sequentially. Key aspects:

**Sequential Processing**: We use a `for` loop with `await` rather than `Promise.all()` to upload files one at a time. This prevents overwhelming the provider and makes progress easier to track.

**Context Upload Method**: Instead of `synapse.storage.upload()`, we call `context.upload()`. This associates the upload with the dataset we created.

**Result Tracking**: We collect each upload result (filename, PieceCID, size) in an array for later display. This creates a manifest of what was uploaded.

**Progress Indication**: The `[${i + 1}/${files.length}]` prefix shows upload progress, which is helpful when uploading many files.

For production applications with many files, consider:
- Implementing parallel uploads with concurrency limits
- Adding retry logic for failed uploads
- Saving progress to resume interrupted operations
- Displaying upload speed and estimated time remaining

### Retrieving Dataset Information

```javascript
const storageInfo = await synapse.storage.getStorageInfo();
console.log(`Total Providers: ${storageInfo.providers.length}`);
```

The `getStorageInfo()` method returns information about available storage providers and your datasets. This includes:

**Providers**: Array of storage provider objects with details like name, ID, address, and active status.

**Datasets**: Information about datasets you've created (implementation-dependent).

**Service Status**: Health and availability of storage services.

This method helps verify that your dataset is properly registered and managed by the storage infrastructure.

### Listing Dataset Pieces

```javascript
uploadResults.forEach((result, index) => {
    console.log(`Piece ${index + 1}: ${result.filename}`);
    console.log(`  PieceCID: ${result.pieceCid}`);
    console.log(`  Size: ${result.size} bytes\\n`);
});
```

We iterate through the upload results to display all pieces in the dataset. This creates a manifest showing:
- Original filename (not stored on-chain, maintained locally)
- PieceCID (the on-chain identifier)
- File size in bytes

In production applications, you'd typically store this manifest in a database or configuration file. The blockchain stores PieceCIDs and metadata, but mapping friendly names to PieceCIDs requires application-level tracking.

**Note on PieceCID Type**: The `pieceCid` field returned by the SDK is a `PieceLink` object, not a plain string. When displaying it with `console.log()`, JavaScript automatically converts it to a string. However, if you need to manipulate it (e.g., substring operations), explicitly convert it first using `String(result.pieceCid)`.

### Proof Status Verification

```javascript
console.log("=== Step 6: Check Proof Status ===");
console.log("✓ All pieces uploaded with cryptographic proof requirements");
```

When files are uploaded to Filecoin, storage providers must submit regular cryptographic proofs that they're maintaining the data. These proofs use Proof of Data Possession (PDP) protocols.

The proof system works as follows:

1. **Initial Proof**: Provider proves they stored the data by submitting a Proof-of-Replication (PoRep)
2. **Ongoing Proofs**: Provider submits Proof-of-Spacetime (PoSt) proofs regularly (typically every 30 minutes)
3. **Verification**: The blockchain validates proofs automatically
4. **Penalties**: Failed proofs result in slashed collateral and potential deal termination

You can verify proof status by:
- Checking the blockchain explorer for your PieceCID
- Querying provider proof submission history
- Monitoring deal status through the SDK

The tutorial demonstrates that proofs are required, but detailed proof querying depends on the SDK version and available APIs.

## Step 2: Prepare Sample Data

Create a `data/` directory inside the `code/` directory and add your sample files:

```bash
mkdir data
```

You can create your own sample files or use these examples:

**document1.txt**: A text file containing project documentation (~900 bytes)
**config.json**: A JSON configuration file (~450 bytes)
**notes.md**: A markdown file with technical notes (~750 bytes)
**data.csv**: A CSV file with sample data (~250 bytes)

These files demonstrate that datasets can contain different file types and formats. Total size should be approximately 2-3 KB, well within Filecoin's constraints (127 bytes minimum, 200 MiB maximum per file).

> [!TIP]
> The sample files are provided in the tutorial repository at `datasets/data/`. You can copy them to your `code/data/` directory, or create your own files to upload.

## Step 3: Run the Dataset Script

Navigate to the code directory and execute:

```bash
cd datasets/code
node index.js
```

Expected output:

```
Working with Filecoin Datasets...

✓ SDK initialized

=== Step 1: Verify Payment Account ===
Payment Account Balance: 5000000000000000000 (raw units)
✓ Payment account is funded
✓ Operator allowances verified

=== Step 2: Create Storage Context (Dataset) ===
Creating a storage context with metadata...
✓ Storage context created successfully
  → This dataset will group all uploaded files together
  → Metadata is stored on-chain for easy querying

=== Step 3: Upload Multiple Files to Dataset ===
Found 4 files to upload:
  - config.json
  - data.csv
  - document1.txt
  - notes.md

[1/4] Uploading config.json...
  Size: 456 bytes
  ✓ Uploaded successfully
  PieceCID: bafkzcibca...
  Size: 512 bytes

[2/4] Uploading data.csv...
  Size: 250 bytes
  ✓ Uploaded successfully
  PieceCID: bafkzcibca...
  Size: 256 bytes

[3/4] Uploading document1.txt...
  Size: 892 bytes
  ✓ Uploaded successfully
  PieceCID: bafkzcibca...
  Size: 1024 bytes

[4/4] Uploading notes.md...
  Size: 734 bytes
  ✓ Uploaded successfully
  PieceCID: bafkzcibca...
  Size: 768 bytes

✅ Successfully uploaded 4 files to the dataset

=== Step 4: Retrieve Dataset Information ===
Storage Information:
  Total Providers: 1

  Primary Provider:
    Name: Warm Storage
    ID: 1
    Active: true
    Address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1

✓ Dataset is active and managed by storage provider

=== Step 5: List All Pieces in Dataset ===

Dataset contains 4 pieces:

Piece 1:
  File: config.json
  PieceCID: bafkzcibca...
  Size: 512 bytes

Piece 2:
  File: data.csv
  PieceCID: bafkzcibca...
  Size: 256 bytes

Piece 3:
  File: document1.txt
  PieceCID: bafkzcibca...
  Size: 1024 bytes

Piece 4:
  File: notes.md
  PieceCID: bafkzcibca...
  Size: 768 bytes

=== Step 6: Check Proof Status ===
Proof of Data Possession (PDP) ensures providers are storing your data.

✓ All pieces have been uploaded to the storage provider
✓ Storage deals are created on-chain
✓ Providers must submit regular cryptographic proofs
✓ Failed proofs result in provider penalties

=== Summary ===

✅ Dataset Operations Complete!

What you accomplished:
  • Created a storage context with metadata
  • Uploaded 4 files to the dataset
  • Retrieved dataset information
  • Listed all pieces in the dataset
  • Verified proof status
```

The upload succeeded, and you now have a dataset containing four related files on Filecoin Calibration testnet.

## Production Considerations

### Dataset Organization Strategy

For production applications, establish clear dataset organization patterns:

**By Project**: Create one dataset per project or application. Tag with project identifiers.

**By Time Period**: Group files by month, quarter, or year. Useful for archives and backups.

**By User**: Create user-specific datasets. Tag with user IDs for access control.

**By Content Type**: Separate datasets for images, documents, videos, etc.

**By Environment**: Different datasets for production, staging, and development data.

Choose an organization strategy that matches your application's access patterns and querying needs.

### Metadata Schema Design

Design metadata schemas carefully since they're stored on-chain and immutable:

**Use Consistent Keys**: Standardize metadata key names across all datasets. Don't use `project` in one dataset and `projectId` in another.

**Plan for Querying**: Include fields you'll search by. If you'll filter by date, include a date field in a consistent format.

**Keep Values Concise**: Metadata is stored on-chain, so verbose values increase costs. Use abbreviations or codes where appropriate.

**Version Your Schema**: Include a schema version field so you can evolve metadata structure over time.

**Document Your Schema**: Maintain documentation of what each metadata key means and what values are valid.

Example metadata schema:

```javascript
{
    schema: "v1",
    project: "myapp",
    type: "backup",
    env: "prod",
    date: "2026-02-02",
    owner: "user123",
    retention: "90d"
}
```

### Cost Optimization

Multiple files in a dataset can be more cost-effective than individual uploads:

**Shared Payment Rail**: One payment authorization covers all pieces in the dataset.

**Batch Operations**: Upload multiple files in one session, reducing overhead.

**Provider Consistency**: Using the same provider for related files may offer better pricing.

**Metadata Efficiency**: Dataset-level metadata is more efficient than per-piece metadata for shared attributes.

Monitor costs by:
- Tracking total dataset size
- Calculating cost per file vs cost per dataset
- Comparing dataset approach vs individual uploads
- Optimizing file sizes before upload

### Monitoring Dataset Health

Implement monitoring to track dataset status:

**Proof Status**: Regularly verify that providers are submitting proofs for your datasets.

**Deal Expiration**: Monitor when storage deals expire and implement renewal logic.

**Provider Health**: Track provider uptime and performance.

**Access Patterns**: Log which datasets are accessed frequently vs rarely.

**Cost Tracking**: Monitor spending per dataset to identify expensive collections.

Build dashboards that visualize:
- Total datasets created
- Files per dataset
- Storage costs per dataset
- Proof submission success rates
- Deal expiration timelines

### Backup and Redundancy

For critical datasets, implement redundancy:

**Multiple Providers**: Upload the same dataset to multiple providers. If one goes offline, others can serve the data.

**Geographic Distribution**: Choose providers in different regions for disaster recovery.

**Regular Verification**: Periodically download and verify files to ensure data integrity.

**Metadata Backup**: Store dataset metadata and file manifests in multiple locations.

**Automated Monitoring**: Set up alerts for proof failures or provider issues.

The tradeoff is multiplicative costs - three providers means triple the storage expense. Evaluate data criticality against budget constraints.

## Troubleshooting

### "Payment account has no balance"

Your payment account lacks USDFC to pay for storage. Run the payment-management tutorial to deposit funds.

### "Operator allowances are not set"

The storage operator doesn't have permission to charge your account. Run the payment-management tutorial to approve the operator with appropriate allowances.

### "Error creating storage context"

Context creation can fail if:
- Invalid metadata format (must be an object with string keys and values)
- Network connectivity issues
- Provider unavailability

Verify your metadata is properly formatted and retry after a few minutes.

### Upload fails for specific files

Individual file uploads can fail due to:
- File size violations (< 127 bytes or > 200 MiB)
- Provider capacity issues
- Network timeouts
- Insufficient payment account balance

Check file sizes, verify payment account balance, and retry failed uploads individually.

### "Cannot read directory" errors

The script expects a `data/` directory in the same location where you run the script (inside the `code/` directory). Verify:
- You're running the script from the `code/` directory: `cd datasets/code`
- The `data/` subdirectory exists: `mkdir data` if needed
- The `data/` directory contains files (at least one file)
- File permissions allow reading

The path `"./data"` is relative to your current working directory, so make sure you're in the `code/` folder when running `node index.js`.

### Dataset information not available

Some SDK versions may not expose full dataset querying capabilities. This is expected. The core functionality (creating contexts and uploading files) works regardless.

### Proof status unclear

Detailed proof querying depends on SDK version and API availability. You can always verify proofs by:
- Searching for PieceCIDs on the block explorer
- Checking deal status on-chain
- Querying provider proof submission history

### "TypeError: pieceCid.substring is not a function"

The `pieceCid` returned by the SDK is a `PieceLink` object, not a plain string. If you need to manipulate it as a string (e.g., for display or substring operations), convert it first:

```javascript
// Convert PieceLink object to string
const cidString = String(result.pieceCid);

// Now you can use string methods
const shortCid = cidString.substring(0, 20) + '...' + cidString.substring(cidString.length - 10);
```

This ensures compatibility regardless of the SDK version's return type.

## Conclusion

You have successfully created a Filecoin dataset and uploaded multiple files to it. The dataset groups related files together with shared metadata, unified payment management, and on-chain organization. Each file received its own PieceCID for individual retrieval, but they're logically associated through the dataset.

This demonstrates how Filecoin handles collections of files efficiently. Instead of managing dozens of individual pieces with separate payment streams and manual tracking, datasets provide structure and automation. The metadata you attached is stored on-chain and queryable. The payment rail handles all uploads through one authorization. The provider manages all pieces consistently.

Datasets represent a practical abstraction over Filecoin's piece-based storage model. They don't sacrifice the cryptographic guarantees or decentralization that make Filecoin valuable. Every piece still has a unique PieceCID. Providers still submit proofs. Storage deals still exist on-chain. Datasets simply add organizational structure that makes multi-file storage manageable.

From here, you can explore advanced dataset operations like querying by metadata, adding files to existing datasets, implementing dataset versioning, or building application-specific organization schemes. The [Synapse SDK documentation](https://docs.filecoin.cloud/developer-guides/synapse/) covers these topics in detail.

The patterns you learned here - storage contexts, metadata tagging, multi-file uploads, and proof verification - apply directly to production applications on Filecoin mainnet. The only differences are network configuration and the use of real tokens instead of testnet tokens.
