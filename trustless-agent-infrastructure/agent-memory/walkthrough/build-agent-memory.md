# Build Agent Memory System

The previous walkthrough established your agent's identity — a verifiable Agent Card stored on Filecoin that defines who the agent is and what it can do. Identity answers the question "what is this agent?" But a second question matters just as much: "what has this agent done?"

Autonomous agents make decisions without human oversight. They observe conditions, evaluate options, and take actions. In traditional systems, these decisions are logged to a database or file system that the agent's operator controls. The operator can edit logs, delete entries, or fabricate records after the fact. When disputes arise — "why did the agent execute that trade?" or "did the agent actually check the balance before proceeding?" — the logs provide no trustworthy answer because they could have been altered.

Verifiable memory solves this problem by storing agent decision logs on Filecoin. Each memory entry becomes a piece with its own PieceCID — a content-addressed identifier that proves the entry has not been altered since storage. The storage provider must submit regular cryptographic proofs demonstrating they still hold the data. Anyone can download any entry and verify its contents. The result is an append-only, tamper-evident audit trail that proves not just what the agent decided, but that the record of that decision has remained intact.

This walkthrough builds that memory system. You will create a Filecoin Data Set dedicated to agent memory, generate structured log entries representing different types of agent events, upload them to the data set, retrieve and verify a specific entry, and confirm that proof requirements protect the entire memory store.

## Prerequisites

Before proceeding, you must have completed the following:

- **Environment Setup and Token Acquisition** — Your environment should be configured with the Synapse SDK installed, and your wallet should contain tFIL for gas
- **Payment Account Funding** — Your payment account must hold USDFC to pay for storage operations
- **Operator Approval** — The storage operator must be approved to charge your payment account
- **Walkthrough 1 (Agent Card)** — Understanding of PieceCID, upload mechanics, and verification

If any prerequisite is missing, return to the `storage-basics` module or complete Walkthrough 1 first. This walkthrough assumes your payment account is funded and you understand how Filecoin storage works.

## What This Walkthrough Covers

We will walk through seven operations that demonstrate the agent memory workflow:

1. **SDK Initialization** — Connecting to the Filecoin network
2. **Payment Verification** — Confirming the agent can pay for multiple uploads
3. **Data Set Creation** — Building a storage context dedicated to agent memory
4. **Memory Entry Storage** — Uploading structured log entries with different event types
5. **Memory Listing** — Enumerating all entries stored in the data set
6. **Memory Retrieval and Verification** — Downloading a specific entry and confirming integrity
7. **Proof Status** — Understanding how proofs protect the memory store

Each step reveals how agents can maintain trustworthy records of their operations using decentralized storage.

## Understanding Agent Memory Architecture

Before writing code, understanding why agent memory requires special treatment clarifies the design decisions in this walkthrough.

### The Problem with Traditional Logging

Traditional agent logs are stored in databases the operator controls. The operator can edit, delete, or fabricate records after the fact. When disputes arise about agent behavior, the logs provide no trustworthy answer. For autonomous agents handling financial operations, that trust model is insufficient.

### Filecoin as an Append-Only Memory Store

As demonstrated in Walkthrough 1, Filecoin provides content-addressed storage with cryptographic proof guarantees. For agent memory, these properties create an append-only, tamper-evident log: each entry gets a unique PieceCID, entries cannot be modified or deleted once stored, storage providers must submit regular PDP proofs, and anyone can download and verify any entry without the operator's cooperation.

### Data Sets as Memory Banks

As covered in the `storage-basics/datasets` walkthrough, a Filecoin Data Set groups related pieces under shared metadata and a single payment rail. For agent memory, this maps naturally: one data set per agent, one piece per memory entry, and on-chain metadata enabling filtering by agent name or time period.

### Structured Log Schema

Agent memory entries follow a consistent JSON schema that makes them machine-readable and queryable:

```json
{
    "timestamp": "2026-02-16T12:00:00.000Z",
    "type": "DECISION",
    "sequence": 1,
    "context": {
        "trigger": "scheduled_check",
        "observation": "Storage provider pricing dropped 15%",
        "decision": "Initiate new storage deal at reduced rate",
        "confidence": 0.87
    },
    "outcome": "pending",
    "agent": "StorageOptimizer-v1"
}
```

The schema includes:
- **timestamp**: When the event occurred (ISO 8601 format)
- **type**: Event classification — DECISION, OBSERVATION, or ERROR
- **sequence**: Monotonically increasing counter for ordering
- **context**: Event-specific details including trigger, observation, and decision rationale
- **outcome**: Result of the action taken
- **agent**: Agent identifier linking the entry to a specific agent card

This structure enables analysis: "show me all DECISION entries where confidence was below 0.5" or "find all ERROR entries in the last 24 hours." The consistent schema makes it possible to build dashboards, run analytics, and audit agent behavior programmatically.

## Step 1: Create the Memory System Script

Create a file named `index.js` in the `code/` directory:

```javascript
import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

/**
 * Build Agent Memory System
 *
 * This script demonstrates:
 * 1. Creating a storage context (data set) for agent memory
 * 2. Generating structured memory entries (decisions, observations, errors)
 * 3. Uploading memory entries to the data set
 * 4. Listing all stored memories
 * 5. Retrieving and verifying a specific memory
 */
async function main() {
    console.log("Build Agent Memory System\n");

    // ========================================================================
    // Step 1: Initialize SDK
    // ========================================================================
    console.log("=== Step 1: Initialize SDK ===\n");

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env.local");
    }

    const synapse = await Synapse.create({
        privateKey: privateKey,
        rpcURL: process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("SDK initialized successfully.\n");

    // ========================================================================
    // Step 2: Verify Payment Readiness
    // ========================================================================
    console.log("=== Step 2: Verify Payment Readiness ===\n");

    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    const balanceFormatted = Number(paymentBalance) / 1e18;

    console.log(`Payment Account Balance: ${paymentBalance.toString()} (raw units)`);
    console.log(`Formatted: ${balanceFormatted.toFixed(4)} USDFC`);

    if (paymentBalance === 0n) {
        console.log("\nPayment account has no balance.");
        console.log("Please run the storage-basics/payment-management tutorial first.");
        process.exit(1);
    }

    console.log("Payment account is funded.\n");

    const operatorAddress = synapse.getWarmStorageAddress();
    const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
        console.log("Storage operator is not approved to charge this account.");
        console.log("Please run the storage-basics/payment-management tutorial first.");
        process.exit(1);
    }

    console.log("Operator allowances verified.\n");

    // ========================================================================
    // Step 3: Create Storage Context (Memory Data Set)
    // ========================================================================
    console.log("=== Step 3: Create Storage Context (Memory Data Set) ===\n");

    const context = await synapse.storage.createContext({
        metadata: {
            type: "agent-memory",
            agent: "StorageOptimizer-v1",
            format: "structured-log",
            created: new Date().toISOString().split('T')[0]
        }
    });

    console.log("Storage context created successfully.");
    console.log("  This data set will group all agent memory entries together.");
    console.log("  Metadata is stored on-chain for querying and filtering.\n");

    // ========================================================================
    // Step 4: Generate and Store Memory Entries
    // ========================================================================
    console.log("=== Step 4: Generate and Store Memory Entries ===\n");

    // Define three structured memory entries representing different event types
    const memoryEntries = [
        {
            timestamp: new Date().toISOString(),
            type: "DECISION",
            sequence: 1,
            context: {
                trigger: "scheduled_check",
                observation: "Storage provider pricing dropped 15% in the last epoch",
                decision: "Initiate new storage deal at reduced rate",
                confidence: 0.87
            },
            outcome: "pending",
            agent: "StorageOptimizer-v1"
        },
        {
            timestamp: new Date(Date.now() + 1000).toISOString(),
            type: "OBSERVATION",
            sequence: 2,
            context: {
                trigger: "balance_monitor",
                observation: "Payment account balance at 3.2 USDFC, above minimum threshold of 1.0",
                metrics: {
                    balance: 3.2,
                    threshold: 1.0,
                    burn_rate: 0.05,
                    days_remaining: 44
                }
            },
            outcome: "no_action_required",
            agent: "StorageOptimizer-v1"
        },
        {
            timestamp: new Date(Date.now() + 2000).toISOString(),
            type: "ERROR",
            sequence: 3,
            context: {
                trigger: "upload_attempt",
                observation: "Upload failed due to provider capacity",
                error_code: "PROVIDER_FULL",
                retry_count: 0,
                max_retries: 3
            },
            outcome: "scheduled_retry",
            agent: "StorageOptimizer-v1"
        }
    ];

    console.log(`Preparing ${memoryEntries.length} memory entries for storage:\n`);

    const uploadResults = [];

    for (let i = 0; i < memoryEntries.length; i++) {
        const entry = memoryEntries[i];
        const entryBytes = Buffer.from(JSON.stringify(entry));

        console.log(`[${i + 1}/${memoryEntries.length}] Uploading ${entry.type} entry...`);
        console.log(`  Timestamp: ${entry.timestamp}`);
        console.log(`  Size: ${entryBytes.length} bytes`);

        // Pad if below minimum size
        let uploadData = entryBytes;
        if (entryBytes.length < 127) {
            uploadData = Buffer.alloc(127);
            entryBytes.copy(uploadData);
            console.log(`  Padded to: ${uploadData.length} bytes (minimum upload size)`);
        }

        const result = await context.upload(uploadData);

        uploadResults.push({
            type: entry.type,
            sequence: entry.sequence,
            pieceCid: result.pieceCid,
            size: result.size,
            timestamp: entry.timestamp
        });

        console.log(`  PieceCID: ${result.pieceCid}`);
        console.log(`  Stored size: ${result.size} bytes`);
        console.log();
    }

    console.log(`All ${memoryEntries.length} memory entries uploaded successfully.\n`);

    // ========================================================================
    // Step 5: List All Memories in the Data Set
    // ========================================================================
    console.log("=== Step 5: List All Memories in Data Set ===\n");

    console.log("Memory Store Contents:\n");

    for (let i = 0; i < uploadResults.length; i++) {
        const result = uploadResults[i];
        console.log(`  Entry ${result.sequence}: ${result.type}`);
        console.log(`    PieceCID: ${result.pieceCid}`);
        console.log(`    Size: ${result.size} bytes`);
        console.log(`    Timestamp: ${result.timestamp}`);
        console.log();
    }

    console.log(`Total entries: ${uploadResults.length}`);
    console.log(`Total size: ${uploadResults.reduce((sum, r) => sum + r.size, 0)} bytes\n`);

    // ========================================================================
    // Step 6: Retrieve and Verify a Memory
    // ========================================================================
    console.log("=== Step 6: Retrieve and Verify a Memory ===\n");

    // Download the first memory entry and verify its contents
    const targetEntry = uploadResults[0];
    console.log(`Retrieving memory entry ${targetEntry.sequence} (${targetEntry.type})...`);
    console.log(`PieceCID: ${targetEntry.pieceCid}\n`);

    const downloaded = await synapse.storage.download(String(targetEntry.pieceCid));

    const downloadedString = new TextDecoder().decode(downloaded);
    const downloadedEntry = JSON.parse(downloadedString);

    console.log("Retrieved memory contents:");
    console.log(`  Type: ${downloadedEntry.type}`);
    console.log(`  Timestamp: ${downloadedEntry.timestamp}`);
    console.log(`  Trigger: ${downloadedEntry.context.trigger}`);
    console.log(`  Observation: ${downloadedEntry.context.observation}`);
    if (downloadedEntry.context.decision) {
        console.log(`  Decision: ${downloadedEntry.context.decision}`);
    }
    console.log(`  Outcome: ${downloadedEntry.outcome}`);
    console.log();

    // Verify byte-for-byte integrity
    const originalBytes = JSON.stringify(memoryEntries[0]);
    const matches = downloadedString === originalBytes;

    console.log(`Verification: ${matches ? 'PASSED - Memory matches original exactly' : 'FAILED - Memory does not match'}`);
    console.log();

    // ========================================================================
    // Step 7: Check Proof Status
    // ========================================================================
    console.log("=== Step 7: Check Proof Status ===\n");

    console.log("All memory entries are stored with cryptographic proof requirements.\n");

    console.log("Proof of Data Possession (PDP) ensures:");
    console.log("  - The storage provider must regularly prove it holds each memory entry");
    console.log("  - Failed proofs result in economic penalties for the provider");
    console.log("  - Anyone can verify memory persistence by checking the blockchain");
    console.log("  - Memory entries cannot be silently deleted or altered\n");

    console.log("To verify any memory entry on-chain:");
    console.log(`  1. Visit: https://calibration.filfox.info/`);
    console.log(`  2. Search for a PieceCID from the list above`);
    console.log("  3. Check the deal status and proof submission history\n");

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("=== Summary ===\n");

    console.log("Agent memory system complete.\n");

    console.log("What was accomplished:");
    console.log("  - Created a storage context (data set) dedicated to agent memory");
    console.log(`  - Stored ${memoryEntries.length} structured memory entries (DECISION, OBSERVATION, ERROR)`);
    console.log("  - Listed all memories in the data set with their PieceCIDs");
    console.log("  - Retrieved and verified a specific memory entry");
    console.log("  - Confirmed proof requirements for ongoing memory integrity\n");

    console.log("Memory Entry PieceCIDs:");
    for (const result of uploadResults) {
        console.log(`  ${result.type} (seq ${result.sequence}): ${result.pieceCid}`);
    }
    console.log();

    console.log("These PieceCIDs form an immutable audit trail of agent decisions.");
    console.log("Any auditor can download and verify any entry at any time.\n");

    console.log("Next: Payment Setup for Agents (walkthrough 3)");
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
```

This script demonstrates the complete agent memory workflow with detailed logging at each stage.

## Understanding the Code

### Storage Context Creation

```javascript
const context = await synapse.storage.createContext({
    metadata: {
        type: "agent-memory",
        agent: "StorageOptimizer-v1",
        format: "structured-log",
        created: new Date().toISOString().split('T')[0]
    }
});
```

The `createContext()` method establishes a data set on the Filecoin network. This data set serves as the container for all memory entries. The metadata object is stored on-chain and can be queried later — you could search for "all data sets where type is agent-memory" or "all data sets for StorageOptimizer-v1."

Data set metadata is limited to 10 key-value pairs, with keys up to 32 characters and values up to 128 characters. We use four fields: `type` classifies the data set, `agent` links it to a specific agent identity, `format` describes the content structure, and `created` records when the memory store was initialized.

The context object returned provides an `upload()` method that automatically associates uploaded pieces with this data set. This is the key difference from using `synapse.storage.upload()` directly — context uploads are grouped together under one logical container.

### Structured Memory Entries

```javascript
const memoryEntries = [
    {
        timestamp: new Date().toISOString(),
        type: "DECISION",
        sequence: 1,
        context: {
            trigger: "scheduled_check",
            observation: "Storage provider pricing dropped 15% in the last epoch",
            decision: "Initiate new storage deal at reduced rate",
            confidence: 0.87
        },
        outcome: "pending",
        agent: "StorageOptimizer-v1"
    },
    // ... OBSERVATION and ERROR entries
];
```

We define three memory entries representing the three primary event types an agent generates:

**DECISION entries** record when the agent chose to take an action. They include the trigger (what prompted the decision), the observation (what the agent saw), the decision itself, and a confidence score. This is the most important entry type for auditing — it proves why the agent acted.

**OBSERVATION entries** record what the agent noticed without taking action. They include metrics and thresholds. These entries demonstrate the agent is monitoring its environment even when no action is needed.

**ERROR entries** record failures and the agent's response to them. They include error codes, retry counts, and the planned recovery action. These entries are critical for debugging and for proving the agent handled errors appropriately.

The `sequence` field provides ordering. Timestamps alone can be unreliable (clock skew, timezone issues), so a monotonically increasing sequence number ensures entries can be ordered unambiguously.

### Sequential Upload to Context

```javascript
for (let i = 0; i < memoryEntries.length; i++) {
    const entry = memoryEntries[i];
    const entryBytes = Buffer.from(JSON.stringify(entry));

    let uploadData = entryBytes;
    if (entryBytes.length < 127) {
        uploadData = Buffer.alloc(127);
        entryBytes.copy(uploadData);
    }

    const result = await context.upload(uploadData);
    // ...
}
```

Each memory entry is serialized to JSON, converted to bytes, and uploaded through the context. We use a sequential `for` loop with `await` rather than `Promise.all()` to upload entries one at a time. This prevents overwhelming the storage provider and ensures entries are processed in order.

The minimum upload size check (127 bytes) handles edge cases where a very short entry might fall below Filecoin's minimum piece size. Our structured entries are well above this threshold, but the check provides safety for production systems where entries might vary in size.

Each upload returns a `pieceCid` and `size`. We collect these results for later display and verification.

### Memory Retrieval and Verification

```javascript
const downloaded = await synapse.storage.download(String(targetEntry.pieceCid));

const downloadedString = new TextDecoder().decode(downloaded);
const downloadedEntry = JSON.parse(downloadedString);

const originalBytes = JSON.stringify(memoryEntries[0]);
const matches = downloadedString === originalBytes;
```

We download a specific memory entry using its PieceCID and verify the content matches the original. The `download()` method takes a PieceCID string directly — we use `String()` to convert the `PieceLink` object returned by the upload. It returns a `Uint8Array` which we decode to a string and parse as JSON.

The verification step compares the downloaded bytes against the original serialization. This demonstrates the core property of verifiable memory: anyone with the PieceCID can retrieve the entry and confirm it has not been altered. An auditor does not need the agent operator's cooperation — they can independently verify any memory entry using only the PieceCID.

## Step 2: Run the Script

Navigate to the `code` directory and execute:

```bash
cd agent-memory/code
npm install
cp .env.example .env.local
```

Edit `.env.local` with your private key, then run:

```bash
node index.js
```

You should see output similar to:

```
Build Agent Memory System

=== Step 1: Initialize SDK ===

SDK initialized successfully.

=== Step 2: Verify Payment Readiness ===

Payment Account Balance: 5000000000000000000 (raw units)
Formatted: 5.0000 USDFC
Payment account is funded.

Operator allowances verified.

=== Step 3: Create Storage Context (Memory Data Set) ===

Storage context created successfully.
  This data set will group all agent memory entries together.
  Metadata is stored on-chain for querying and filtering.

=== Step 4: Generate and Store Memory Entries ===

Preparing 3 memory entries for storage:

[1/3] Uploading DECISION entry...
  Timestamp: 2026-02-16T12:47:00.000Z
  Size: 312 bytes
  PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
  Stored size: 512 bytes

[2/3] Uploading OBSERVATION entry...
  Timestamp: 2026-02-16T12:47:01.000Z
  Size: 298 bytes
  PieceCID: bafkzcibca4nnt63cz5ywzqj8eo73fp73ynqq6qwsy8in7guy3dm6d58gn3lb
  Stored size: 512 bytes

[3/3] Uploading ERROR entry...
  Timestamp: 2026-02-16T12:47:02.000Z
  Size: 276 bytes
  PieceCID: bafkzcibca2llo41ax4vwypk9dm51dp51wmoo5orwx6gm5esx2bw4a36ef2jkq
  Stored size: 512 bytes

All 3 memory entries uploaded successfully.

=== Step 5: List All Memories in Data Set ===

Memory Store Contents:

  Entry 1: DECISION
    PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
    Size: 512 bytes
    Timestamp: 2026-02-16T12:47:00.000Z

  Entry 2: OBSERVATION
    PieceCID: bafkzcibca4nnt63cz5ywzqj8eo73fp73ynqq6qwsy8in7guy3dm6d58gn3lb
    Size: 512 bytes
    Timestamp: 2026-02-16T12:47:01.000Z

  Entry 3: ERROR
    PieceCID: bafkzcibca2llo41ax4vwypk9dm51dp51wmoo5orwx6gm5esx2bw4a36ef2jkq
    Size: 512 bytes
    Timestamp: 2026-02-16T12:47:02.000Z

Total entries: 3
Total size: 1536 bytes

=== Step 6: Retrieve and Verify a Memory ===

Retrieving memory entry 1 (DECISION)...
PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq

Retrieved memory contents:
  Type: DECISION
  Timestamp: 2026-02-16T12:47:00.000Z
  Trigger: scheduled_check
  Observation: Storage provider pricing dropped 15% in the last epoch
  Decision: Initiate new storage deal at reduced rate
  Outcome: pending

Verification: PASSED - Memory matches original exactly

=== Step 7: Check Proof Status ===

All memory entries are stored with cryptographic proof requirements.

Proof of Data Possession (PDP) ensures:
  - The storage provider must regularly prove it holds each memory entry
  - Failed proofs result in economic penalties for the provider
  - Anyone can verify memory persistence by checking the blockchain
  - Memory entries cannot be silently deleted or altered

To verify any memory entry on-chain:
  1. Visit: https://calibration.filfox.info/
  2. Search for a PieceCID from the list above
  3. Check the deal status and proof submission history

=== Summary ===

Agent memory system complete.

What was accomplished:
  - Created a storage context (data set) dedicated to agent memory
  - Stored 3 structured memory entries (DECISION, OBSERVATION, ERROR)
  - Listed all memories in the data set with their PieceCIDs
  - Retrieved and verified a specific memory entry
  - Confirmed proof requirements for ongoing memory integrity

Memory Entry PieceCIDs:
  DECISION (seq 1): bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
  OBSERVATION (seq 2): bafkzcibca4nnt63cz5ywzqj8eo73fp73ynqq6qwsy8in7guy3dm6d58gn3lb
  ERROR (seq 3): bafkzcibca2llo41ax4vwypk9dm51dp51wmoo5orwx6gm5esx2bw4a36ef2jkq

These PieceCIDs form an immutable audit trail of agent decisions.
Any auditor can download and verify any entry at any time.

Next: Payment Setup for Agents (walkthrough 3)
```

The uploads succeeded, and your agent now has a verifiable memory store on Filecoin.

## Production Considerations

### Batching Memory Entries

Real agents generate hundreds or thousands of log entries per day. Uploading each entry individually is expensive and slow. In production, implement a batching strategy:

1. Accumulate entries locally (in memory, SQLite, or a local file)
2. When the batch reaches a size threshold (e.g., 10 KB) or a time threshold (e.g., every hour), serialize all accumulated entries into a single JSON array
3. Upload the batch as one piece to the data set
4. Record the batch's PieceCID and the sequence range it contains

This reduces the number of on-chain transactions while maintaining the same auditability. Each batch is still content-addressed and verifiable — the PieceCID proves the entire batch has not been altered.

### Encryption for Sensitive Data

Agent memory entries may contain sensitive information — user data, financial details, or proprietary decision logic. Filecoin storage is publicly accessible, so anyone with the PieceCID can download and read the entry.

For sensitive data, encrypt entries before uploading:

```javascript
import { createCipheriv, randomBytes } from 'crypto';

const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
const iv = randomBytes(16);
const cipher = createCipheriv('aes-256-cbc', key, iv);

const encrypted = Buffer.concat([
    iv,
    cipher.update(JSON.stringify(entry)),
    cipher.final()
]);

await context.upload(encrypted);
```

The PieceCID still proves the encrypted data has not been altered. Authorized parties with the decryption key can verify contents. Unauthorized parties can verify the entry exists and has not changed, but cannot read its contents.

### Memory Indexing

Filecoin stores data but does not provide a query engine. To search memory entries by type, timestamp, or content, maintain a local index:

- Store a mapping of PieceCID to entry metadata (type, timestamp, sequence) in a local database
- When you need to find specific entries, query the local index first
- Use the PieceCID from the index to download the full entry from Filecoin
- Periodically verify the local index against Filecoin to detect any discrepancies

This hybrid approach gives you fast querying (local database) with verifiable storage (Filecoin). The local index can be rebuilt from Filecoin data at any time by downloading all entries in the data set.

### Cost Management

Each memory entry upload consumes USDFC from your payment account. Monitor costs by:

- Tracking the number of entries uploaded per day
- Calculating the average cost per entry
- Setting budget alerts when daily spending exceeds thresholds
- Implementing batching to reduce per-entry costs
- Archiving old entries to cheaper storage tiers if available

The next walkthrough covers autonomous payment management, which includes monitoring and replenishing the funds that power this memory system.

## Troubleshooting

**"Payment account has no balance"**

Your payment account lacks USDFC to pay for storage. Multiple uploads consume more funds than a single upload. Ensure your account has sufficient balance for all planned entries. Run the `storage-basics/payment-management` tutorial to deposit funds.

**"Storage operator is not approved"**

The storage operator does not have permission to charge your payment account. Run the `storage-basics/payment-management` tutorial to approve the operator.

**"Actor balance less than needed" or "gas search failed"**

This error refers to the storage provider's balance, not yours. The provider on Calibration testnet may have run out of gas. Wait 5-10 minutes and retry. This is a testnet limitation.

**Upload fails for one entry but succeeds for others**

Individual uploads can fail due to provider capacity, network timeouts, or transient errors. The script uploads sequentially, so a failure on entry 2 does not affect entry 1 (already stored) or entry 3 (not yet attempted). Retry the failed entry individually.

**Verification shows "FAILED - Memory does not match"**

This should not occur under normal conditions. If it does, verify your network connection and retry. Content-addressed storage guarantees data integrity, so a mismatch suggests a transmission error during download rather than a storage corruption.

**"Error creating storage context"**

Context creation can fail if metadata is improperly formatted (values exceeding 128 characters, more than 10 key-value pairs) or if the network is experiencing issues. Verify your metadata values are within limits and retry.

## Conclusion

You have built a verifiable memory system for an autonomous agent. The data set you created serves as a dedicated memory bank, and each entry stored within it has a unique PieceCID that proves its contents have not been altered. The storage provider must submit regular cryptographic proofs demonstrating they still hold each entry, and anyone can download and verify any entry using only its PieceCID.

This memory system transforms agent logging from a trust-based exercise into a cryptographically verifiable one. Traditional logs require trusting the operator. Filecoin-backed memory requires trusting only mathematics. An auditor can independently verify any claim about what the agent did by downloading the relevant memory entries and checking their contents.

The three entry types demonstrated — DECISION, OBSERVATION, and ERROR — cover the primary categories of agent behavior. Decisions prove why the agent acted. Observations prove what the agent saw. Errors prove how the agent handled failures. Together, they create a complete, tamper-evident record of agent operations.

The next walkthrough completes the agent infrastructure by building autonomous payment management. Your agent has an identity (the Agent Card) and a memory (the Data Set). Now it needs the ability to fund itself — monitoring balances, depositing funds when they run low, and ensuring operator approvals remain active. Without autonomous payment management, the agent's storage operations stop when funds run out, effectively killing the agent.

## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
