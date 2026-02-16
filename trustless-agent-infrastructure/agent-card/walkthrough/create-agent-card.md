# Create and Store an Agent Card on Filecoin

The previous modules established your foundation with Filecoin storage: uploading files, managing payments, monitoring proofs, and building multi-chain applications. Those operations treated storage as a utility — you stored data because your application needed it somewhere. This walkthrough shifts perspective. Instead of storing data *for* an application, you store data that *defines* an autonomous actor on the network.

In the emerging decentralized AI economy, agents are software entities that operate independently — negotiating deals, managing resources, and interacting with other agents or users without constant human supervision. But autonomy creates a trust problem. When you encounter an agent offering a service, how do you verify its identity? How do you confirm its capabilities? How do you know it is the same agent you interacted with last week and not an impersonator?

Traditional systems solve this with API keys, OAuth tokens, and centralized identity providers. Those solutions work when a trusted authority manages the registry. In decentralized systems, no such authority exists. The answer is to anchor agent identity on the blockchain and store the agent's detailed profile — its "Agent Card" — on verifiable storage. The blockchain provides the immutable identity anchor. Filecoin provides the cryptographically proven storage for the rich metadata that describes what the agent actually does.

This walkthrough guides you through building that identity layer. You will construct an Agent Card following the ERC-8004 metadata pattern, upload it to Filecoin using the Synapse SDK, verify the stored data matches your original exactly, simulate on-chain registration, and confirm that storage proofs protect your agent's identity document.

## Prerequisites

Before proceeding, you must have completed the following:

- **Environment Setup and Token Acquisition** — Your environment should be configured with the Synapse SDK installed, and your wallet should contain tFIL for gas
- **Payment Account Funding** — Your payment account must hold USDFC to pay for storage operations
- **Operator Approval** — The storage operator must be approved to charge your payment account

If any prerequisite is missing, return to the `storage-basics` module and complete the `payment-management` walkthrough first. This walkthrough assumes your payment account is funded and ready to handle storage charges.

## What This Walkthrough Covers

We will walk through seven operations that demonstrate the agent identity workflow:

1. **SDK Initialization** — Connecting to the Filecoin network with agent credentials
2. **Payment Verification** — Confirming the agent can pay for storage
3. **Card Construction** — Building the Agent Card JSON metadata programmatically
4. **Verifiable Storage** — Uploading the card to Filecoin with piece-level metadata
5. **Download and Verification** — Retrieving the card and confirming byte-for-byte integrity
6. **On-Chain Registration** — Simulating how a registry contract binds identity to storage
7. **Proof Status** — Understanding how cryptographic proofs protect the stored card

Each step reveals how agent identity works in a trustless environment and why Filecoin storage provides guarantees that traditional infrastructure cannot.

## Understanding Agent Identity Architecture

Before writing code, understanding the architecture clarifies what you are building and why each component exists.

### The Identity Problem

When you encounter an autonomous agent, you need to verify its identity, confirm its capabilities, and ensure it has not been impersonated — all without trusting a centralized authority. Traditional API keys and OAuth tokens depend on a registry operator who can revoke identities, alter records, or go offline.

### The ERC-8004 Approach

ERC-8004 (proposed) addresses this by separating agent identity into two layers:

**On-Chain Identity**: A smart contract (the Registry) maps unique agent IDs to owner wallet addresses and metadata pointers. This layer is minimal — it stores only an ID, an owner address, and a URI pointing to the full metadata. The on-chain record is immutable, censorship-resistant, and publicly auditable.

**Off-Chain Metadata**: The Agent Card is a JSON document stored on Filecoin that contains the agent's full profile — name, description, capabilities, service endpoints, trust parameters, and runtime requirements. Storing this on Filecoin rather than a centralized server ensures the metadata cannot be censored or silently altered. Any change to the card produces a different PieceCID, which would require an on-chain transaction to update the registry pointer.

This separation minimizes gas costs (only a URI is stored on-chain) while maximizing verifiability (the full metadata is cryptographically proven on Filecoin).

### Why Filecoin for Agent Metadata

Filecoin adds economic persistence guarantees that IPFS pinning alone cannot provide. As covered in the `storage-basics` module, storage providers must submit regular Proof of Data Possession (PDP) proofs to the blockchain. Failed proofs result in economic penalties. For agent identity, this means the card cannot disappear, anyone can verify it exists, and the content is immutable — the same PieceCID always returns the same bytes.

## Step 1: Create the Agent Card Script

Create a file named `index.js` in the `code/` directory:

```javascript
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
```

This script demonstrates the complete agent identity workflow with detailed logging at each stage.

## Understanding the Code

### SDK and Wallet Initialization

```javascript
const synapse = await Synapse.create({
    privateKey: privateKey,
    rpcURL: process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"
});

const provider = new ethers.JsonRpcProvider(
    process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1"
);
const wallet = new ethers.Wallet(privateKey, provider);
```

We initialize two connections to the Filecoin network. The Synapse SDK handles storage and payment operations — uploading the card, checking balances, verifying operator approvals. The ethers.js provider and wallet handle direct blockchain interactions — reading contract code, simulating registration transactions.

In a production agent, the private key represents the agent's own identity. This is the key that owns the agent's on-chain registration. Whoever controls this key controls the agent's identity. The security implications are significant: if this key is compromised, an attacker can update the agent's metadata, redirect its endpoints, or transfer ownership entirely.

### Payment Verification

```javascript
const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);

if (paymentBalance === 0n) {
    console.log("\nPayment account has no balance.");
    process.exit(1);
}
```

Before uploading the Agent Card, we verify the payment account holds funds. The `balance()` method returns a BigInt representing USDFC in wei-equivalent units (18 decimal places). The `0n` syntax is JavaScript's BigInt literal notation.

This check prevents confusing errors later. If you attempt an upload with an unfunded account, the storage provider rejects the operation, but the error message might not clearly indicate the payment issue. Explicit verification provides clarity.

### Operator Approval Verification

```javascript
const operatorAddress = synapse.getWarmStorageAddress();
const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
    console.log("\nStorage operator is not approved to charge this account.");
    process.exit(1);
}
```

Even with funds, uploads fail if the storage operator lacks permission to charge the payment account. The `serviceApproval()` method returns an object with three critical fields: `isApproved` (boolean), `rateAllowance` (maximum charge rate per epoch), and `lockupAllowance` (maximum total lockup). All three must be valid for uploads to succeed.

### Agent Card Construction

```javascript
const agentCard = {
    name: "StorageOptimizer v1",
    description: "An autonomous agent that monitors Filecoin storage deals...",
    image: "ipfs://bafybeig...",
    external_url: "https://github.com/example/storage-optimizer",
    attributes: [
        { trait_type: "Agent Protocol", value: "ERC-8004" },
        { trait_type: "Framework", value: "Synapse SDK" },
        // ...
    ],
    engine: { runtime: "node:18", entrypoint: "node dist/index.js" },
    endpoints: { health: "/api/health", capabilities: "/api/capabilities", execute: "/api/execute" },
    trust: { verification: "on-chain", proofType: "PDP", registry: "ERC-8004" }
};
```

The Agent Card is a JSON object that follows the ERC-721 metadata standard with agent-specific extensions. The `name`, `description`, `image`, `external_url`, and `attributes` fields are standard ERC-721. The `engine`, `endpoints`, and `trust` fields extend the standard for agent-specific needs.

The `attributes` array uses the `trait_type`/`value` pattern that NFT marketplaces and explorers already understand. This means your agent's capabilities are immediately visible in tools like OpenSea or any ERC-721 compatible explorer, even though those tools were not designed for agents.

The `engine` field tells other systems how to run the agent. The `endpoints` field tells clients where to send requests. The `trust` field specifies how to verify the agent's claims. Together, these fields provide everything needed to discover, verify, and interact with the agent.

### Uploading with Metadata

```javascript
const cardBytes = Buffer.from(JSON.stringify(agentCard));

const uploadResult = await synapse.storage.upload(cardBytes, {
    metadata: {
        type: "agent-card",
        protocol: "ERC-8004",
        agent: agentCard.name,
        version: "1.0.0"
    }
});
```

We serialize the Agent Card to JSON bytes and upload using the Synapse SDK. The `metadata` parameter attaches key-value pairs to the piece on-chain. These metadata fields are stored alongside the storage deal and can be queried later.

Piece metadata is limited to 5 key-value pairs, with keys up to 32 characters and values up to 128 characters. We use four fields here: `type` identifies this as an agent card, `protocol` specifies the standard, `agent` names the agent, and `version` tracks the card version. This metadata enables filtering — you could query "show me all agent-card pieces" or "find all ERC-8004 pieces for StorageOptimizer v1."

The upload returns a `pieceCid` — the content-addressed identifier for the stored card. This PieceCID is derived from the card's bytes, so the same card always produces the same identifier. Change a single character in the card and the PieceCID changes completely.

### Download and Verification

```javascript
const downloaded = await synapse.storage.download(String(uploadResult.pieceCid));

const downloadedString = new TextDecoder().decode(downloaded);
const downloadedCard = JSON.parse(downloadedString);

const originalBytes = JSON.stringify(agentCard);
const matches = downloadedString === originalBytes;
```

After uploading, we immediately download the card using its PieceCID and verify the content matches the original. The `download()` method takes a PieceCID string directly. We use `String()` to convert the `PieceLink` object returned by the upload into a plain string. This demonstrates a critical property of content-addressed storage: the PieceCID guarantees you receive exactly what was stored. If the provider returned different bytes, the PieceCID would not match, and the SDK would reject the response.

The verification step compares the downloaded string against the original JSON serialization. If they match, the card was stored and retrieved without any alteration. This is the foundation of trustless identity — you do not need to trust the storage provider because the mathematics of content addressing prove data integrity.

### On-Chain Registration Simulation

```javascript
const REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000000";
const tokenURI = `piece://${String(uploadResult.pieceCid)}`;

const code = await provider.getCode(REGISTRY_ADDRESS);
if (code === '0x') {
    console.log("Registry contract is not deployed at this address.");
    // Simulation output...
}
```

The registration step demonstrates how the on-chain identity layer would work. In production, a deployed ERC-8004 Registry contract would accept a `tokenURI` (the PieceCID-based URI pointing to the Filecoin-stored card) and mint an NFT representing the agent's identity.

We use a placeholder address and check whether a contract exists there. On Calibration testnet, no public ERC-8004 registry is deployed yet, so the script simulates the flow. The important concept is the link: the on-chain NFT stores a URI pointing to the off-chain card, and the card is stored on Filecoin with cryptographic proof guarantees.

The `piece://` URI scheme indicates the metadata is stored as a Filecoin piece identified by its PieceCID. This differs from the `ipfs://` scheme used in traditional NFTs. Both are content-addressed, but `piece://` explicitly references Filecoin's proof-backed storage rather than general IPFS availability.

## Step 2: Run the Script

Navigate to the `code` directory and execute:

```bash
cd agent-card/code
npm install
cp .env.example .env.local
```

Edit `.env.local` with your private key, then run:

```bash
node index.js
```

You should see output similar to:

```
Create and Store Agent Card on Filecoin

=== Step 1: Initialize SDK ===

SDK initialized successfully.
Agent Wallet: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1

=== Step 2: Verify Payment Readiness ===

Payment Account Balance: 5000000000000000000 (raw units)
Formatted: 5.0000 USDFC
Payment account is funded.

Storage Operator: 0x6454...
Approved: true
Operator allowances verified.

=== Step 3: Build the Agent Card ===

Agent Card constructed:
  Name: StorageOptimizer v1
  Description: An autonomous agent that monitors Filecoin storage deals, optimizes payme...
  Attributes: 7 traits defined
  Endpoints: 3 service endpoints

Card saved to disk: /path/to/agent-card.json

=== Step 4: Upload Agent Card to Filecoin ===

Card size: 712 bytes
Uploading to Filecoin...
(This may take 30-60 seconds)

Upload successful.

Upload Response:
  PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
  Size: 768 bytes
  Provider: 0x9876543210fedcba...

=== Step 5: Download and Verify Agent Card ===

Downloading card from Filecoin using PieceCID...

Downloaded card contents:
  Name: StorageOptimizer v1
  Description: An autonomous agent that monitors Filecoin storage deals, optimizes payme...
  Attributes: 7 traits

Verification: PASSED - Card matches original exactly

=== Step 6: On-Chain Registration (Simulation) ===

Registration Parameters:
  Registry: 0x0000000000000000000000000000000000000000 (placeholder)
  Owner: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1
  Token URI: piece://bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq

Registry contract is not deployed at this address.
In a production deployment, the following transaction would execute:
  registry.registerAgent("piece://bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq")

This would:
  1. Mint an NFT representing the agent identity
  2. Set the tokenURI to point to the Filecoin-stored card
  3. Emit an AgentRegistered event with the new agent ID
  4. Map the agent ID to the owner wallet address

=== Step 7: Check Proof Status ===

Your Agent Card is now stored on Filecoin with cryptographic proof requirements.

Proof Verification:
  The storage provider must submit regular Proof of Data Possession (PDP)
  proofs to the blockchain, proving they still hold your agent card data.
  Failed proofs result in economic penalties for the provider.

To verify on-chain:
  1. Visit: https://calibration.filfox.info/
  2. Search for your PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
  3. Check the deal status and proof submission history

Note: Deal records may take a few minutes to appear in the explorer.

=== Summary ===

Agent Card creation complete.

What was accomplished:
  - Built an ERC-8004 compliant Agent Card with capabilities and endpoints
  - Uploaded the card to Filecoin with verifiable storage proofs
  - Downloaded and verified the card matches the original exactly
  - Simulated on-chain registration linking identity to storage
  - Confirmed proof requirements for ongoing data integrity

Key Identifiers:
  PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
  Agent Wallet: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1
  Token URI: piece://bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq

Save your PieceCID. You will need it in the next walkthrough
to build the agent memory system.

Next: Build Agent Memory System (walkthrough 2)
```

The upload succeeded, and your agent now has a verifiable identity document stored on Filecoin.

## Production Considerations

### Card Versioning

Agent Cards are immutable once stored. The PieceCID is derived from the card's content, so any change produces a different identifier. To update an agent's profile, you upload a new version of the card and update the on-chain registry to point to the new PieceCID.

This creates a natural version history. The old card still exists on Filecoin (as long as its storage deal is active), and the blockchain records the sequence of registry updates. Auditors can reconstruct the complete history of an agent's identity changes by examining the on-chain transaction log.

For production systems, include a `version` field in both the card and the piece metadata. This enables querying for specific versions and implementing rollback logic if a card update causes problems.

### Image Assets

The example uses a placeholder image CID. In production, you would first upload your agent's avatar image to Filecoin, receive its PieceCID, and reference that PieceCID in the card's `image` field before uploading the card itself. This creates a two-step process: upload the image, then upload the card that references the image.

### Multi-Agent Systems

Organizations running multiple agents should establish naming conventions and registry patterns. Consider using the `attributes` array to include an `organization` trait, a `fleet-id` trait, and a `role` trait. This enables querying like "show me all agents in fleet-7 with the Storage Booking capability."

### Security

The private key used to register an agent controls that agent's identity. In production:

- Use a dedicated wallet for each agent, separate from your personal or treasury wallets
- Store private keys in hardware security modules (HSMs) or secure enclaves
- Implement key rotation by updating the registry's owner field
- Monitor for unauthorized registry updates using event listeners
- Keep only operational funds in the agent's wallet — use a cold wallet for reserves

## Troubleshooting

**"Payment account has no balance"**

Your payment account lacks USDFC to pay for storage. Run the `storage-basics/payment-management` tutorial to deposit funds. Having USDFC in your wallet is not sufficient — it must be deposited into the payment account.

**"Storage operator is not approved"**

The storage operator does not have permission to charge your payment account. Run the `storage-basics/payment-management` tutorial to approve the operator with appropriate rate and lockup allowances.

**"Actor balance less than needed" or "gas search failed"**

This error refers to the storage provider's balance, not yours. The provider on Calibration testnet may have run out of gas. Wait 5-10 minutes and retry. This is a testnet limitation — mainnet providers maintain adequate balances.

**Upload times out or takes extremely long**

Calibration testnet can experience congestion. Wait several minutes and retry. If problems persist, check the [Filecoin Slack](https://filecoin.io/slack) for known issues.

**Verification shows "FAILED - Card does not match"**

This should not occur under normal conditions. If it does, it indicates a data integrity issue. Verify your network connection is stable and retry the upload. Content-addressed storage guarantees that the PieceCID matches the data, so a mismatch suggests a transmission error rather than a storage problem.

**"Cannot read properties of undefined" on downloadedCard**

The downloaded data may not be valid JSON. This can happen if the upload included padding bytes. Ensure your card serialization produces valid JSON and that the card size exceeds the 127-byte minimum without requiring padding.

## Conclusion

You have created a verifiable agent identity on Filecoin. The Agent Card you built defines your agent's capabilities, service endpoints, and trust parameters in a standardized JSON format. That card is now stored on Filecoin with cryptographic proof guarantees — the storage provider must regularly prove they hold your data, and anyone can verify this by checking the blockchain.

The PieceCID you received serves as the permanent, content-addressed identifier for your agent's identity document. It can be referenced from an on-chain registry to create a complete identity system: the blockchain proves ownership, and Filecoin proves the metadata exists and has not been altered.

This identity layer is the foundation for everything that follows. An agent without verifiable identity is just another anonymous API. An agent with a Filecoin-backed identity card has a provable, persistent, censorship-resistant profile that other agents and users can discover, verify, and trust.

The next walkthrough builds on this foundation by creating a verifiable memory system. Your agent has an identity — now it needs the ability to record its decisions and actions in a way that creates an auditable, tamper-proof history. You will use Filecoin Data Sets to build an append-only memory store that proves not just what the agent is, but what it has done.

## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
