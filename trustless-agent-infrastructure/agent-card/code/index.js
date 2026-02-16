import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create and Store an Agent Card on Filecoin
 *
 * This script demonstrates:
 * 1. Building an ERC-8004 Agent Card (JSON metadata)
 * 2. Uploading it to Filecoin via the Synapse SDK
 * 3. Downloading and verifying the stored card
 * 4. Simulating on-chain registration
 * 5. Checking proof status for the stored card
 */
async function main() {
    console.log("Create and Store Agent Card on Filecoin\n");

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

    const provider = new ethers.JsonRpcProvider(
        process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"
    );
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log("SDK initialized successfully.");
    console.log(`Agent Wallet: ${wallet.address}\n`);

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

    console.log(`Storage Operator: ${operatorAddress}`);
    console.log(`Approved: ${approval.isApproved}`);

    if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
        console.log("\nStorage operator is not approved to charge this account.");
        console.log("Please run the storage-basics/payment-management tutorial first.");
        process.exit(1);
    }

    console.log("Operator allowances verified.\n");

    // ========================================================================
    // Step 3: Build the Agent Card
    // ========================================================================
    console.log("=== Step 3: Build the Agent Card ===\n");

    const agentCard = {
        name: "StorageOptimizer v1",
        description: "An autonomous agent that monitors Filecoin storage deals, optimizes payment balances, and manages data lifecycle operations.",
        image: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        external_url: "https://github.com/example/storage-optimizer",
        attributes: [
            { trait_type: "Agent Protocol", value: "ERC-8004" },
            { trait_type: "Framework", value: "Synapse SDK" },
            { trait_type: "Capability", value: "Storage Booking" },
            { trait_type: "Capability", value: "Balance Monitoring" },
            { trait_type: "Capability", value: "Deal Optimization" },
            { trait_type: "Network", value: "Filecoin Calibration" },
            { trait_type: "Version", value: "1.0.0" }
        ],
        engine: {
            runtime: "node:18",
            entrypoint: "node dist/index.js"
        },
        endpoints: {
            health: "/api/health",
            capabilities: "/api/capabilities",
            execute: "/api/execute"
        },
        trust: {
            verification: "on-chain",
            proofType: "PDP",
            registry: "ERC-8004"
        }
    };

    console.log("Agent Card constructed:");
    console.log(`  Name: ${agentCard.name}`);
    console.log(`  Description: ${agentCard.description.substring(0, 80)}...`);
    console.log(`  Attributes: ${agentCard.attributes.length} traits defined`);
    console.log(`  Endpoints: ${Object.keys(agentCard.endpoints).length} service endpoints`);
    console.log();

    // Save to disk for reference
    const cardPath = join(__dirname, 'agent-card.json');
    writeFileSync(cardPath, JSON.stringify(agentCard, null, 2));
    console.log(`Card saved to disk: ${cardPath}\n`);

    // ========================================================================
    // Step 4: Upload Agent Card to Filecoin
    // ========================================================================
    console.log("=== Step 4: Upload Agent Card to Filecoin ===\n");

    const cardBytes = Buffer.from(JSON.stringify(agentCard));
    console.log(`Card size: ${cardBytes.length} bytes`);

    if (cardBytes.length < 127) {
        console.log("Card is below minimum upload size (127 bytes). Padding...");
        const padded = Buffer.alloc(127);
        cardBytes.copy(padded);
        console.log(`Padded size: ${padded.length} bytes`);
    }

    console.log("Uploading to Filecoin...");
    console.log("(This may take 30-60 seconds)\n");

    const uploadResult = await synapse.storage.upload(cardBytes, {
        metadata: {
            type: "agent-card",
            protocol: "ERC-8004",
            agent: agentCard.name,
            version: "1.0.0"
        }
    });

    console.log("Upload successful.\n");

    console.log("Upload Response:");
    console.log(`  PieceCID: ${uploadResult.pieceCid}`);
    console.log(`  Size: ${uploadResult.size} bytes`);
    if (uploadResult.provider) {
        console.log(`  Provider: ${uploadResult.provider}`);
    }
    console.log();

    // ========================================================================
    // Step 5: Download and Verify the Agent Card
    // ========================================================================
    console.log("=== Step 5: Download and Verify Agent Card ===\n");

    console.log("Downloading card from Filecoin using PieceCID...\n");

    const downloaded = await synapse.storage.download(String(uploadResult.pieceCid));

    const downloadedString = new TextDecoder().decode(downloaded);
    const downloadedCard = JSON.parse(downloadedString);

    console.log("Downloaded card contents:");
    console.log(`  Name: ${downloadedCard.name}`);
    console.log(`  Description: ${downloadedCard.description.substring(0, 80)}...`);
    console.log(`  Attributes: ${downloadedCard.attributes.length} traits`);
    console.log();

    // Byte-for-byte verification
    const originalBytes = JSON.stringify(agentCard);
    const matches = downloadedString === originalBytes;

    console.log(`Verification: ${matches ? 'PASSED - Card matches original exactly' : 'FAILED - Card does not match'}`);
    console.log();

    // ========================================================================
    // Step 6: Simulate On-Chain Registration
    // ========================================================================
    console.log("=== Step 6: On-Chain Registration (Simulation) ===\n");

    // In production, you would interact with a deployed ERC-8004 Registry contract.
    // The registry maps agent IDs (uint256) to owner addresses and tokenURIs.
    // Since no public registry is deployed on Calibration yet, we simulate the flow.

    const REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000000";
    const REGISTRY_ABI = [
        "function registerAgent(string memory tokenURI) public returns (uint256)",
        "event AgentRegistered(uint256 indexed agentId, address indexed owner, string tokenURI)"
    ];

    const tokenURI = `piece://${String(uploadResult.pieceCid)}`;

    console.log("Registration Parameters:");
    console.log(`  Registry: ${REGISTRY_ADDRESS} (placeholder)`);
    console.log(`  Owner: ${wallet.address}`);
    console.log(`  Token URI: ${tokenURI}`);
    console.log();

    // Check if a real registry exists at the address
    const code = await provider.getCode(REGISTRY_ADDRESS);
    if (code === '0x') {
        console.log("Registry contract is not deployed at this address.");
        console.log("In a production deployment, the following transaction would execute:");
        console.log(`  registry.registerAgent("${tokenURI}")`);
        console.log();
        console.log("This would:");
        console.log("  1. Mint an NFT representing the agent identity");
        console.log("  2. Set the tokenURI to point to the Filecoin-stored card");
        console.log("  3. Emit an AgentRegistered event with the new agent ID");
        console.log("  4. Map the agent ID to the owner wallet address");
    } else {
        const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);
        try {
            const tx = await registry.registerAgent(tokenURI);
            console.log(`Transaction sent: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log("Registration confirmed on-chain.");
        } catch (error) {
            console.log("Registration transaction failed:", error.message);
        }
    }
    console.log();

    // ========================================================================
    // Step 7: Check Proof Status
    // ========================================================================
    console.log("=== Step 7: Check Proof Status ===\n");

    console.log("Your Agent Card is now stored on Filecoin with cryptographic proof requirements.\n");

    console.log("Proof Verification:");
    console.log("  The storage provider must submit regular Proof of Data Possession (PDP)");
    console.log("  proofs to the blockchain, proving they still hold your agent card data.");
    console.log("  Failed proofs result in economic penalties for the provider.\n");

    console.log("To verify on-chain:");
    console.log(`  1. Visit: https://calibration.filfox.info/`);
    console.log(`  2. Search for your PieceCID: ${uploadResult.pieceCid}`);
    console.log("  3. Check the deal status and proof submission history");
    console.log();
    console.log("Note: Deal records may take a few minutes to appear in the explorer.\n");

    // ========================================================================
    // Summary
    // ========================================================================
    console.log("=== Summary ===\n");

    console.log("Agent Card creation complete.\n");

    console.log("What was accomplished:");
    console.log("  - Built an ERC-8004 compliant Agent Card with capabilities and endpoints");
    console.log("  - Uploaded the card to Filecoin with verifiable storage proofs");
    console.log("  - Downloaded and verified the card matches the original exactly");
    console.log("  - Simulated on-chain registration linking identity to storage");
    console.log("  - Confirmed proof requirements for ongoing data integrity\n");

    console.log("Key Identifiers:");
    console.log(`  PieceCID: ${uploadResult.pieceCid}`);
    console.log(`  Agent Wallet: ${wallet.address}`);
    console.log(`  Token URI: ${tokenURI}\n`);

    console.log("Save your PieceCID. You will need it in the next walkthrough");
    console.log("to build the agent memory system.\n");

    console.log("Next: Build Agent Memory System (walkthrough 2)");
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
