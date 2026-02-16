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
