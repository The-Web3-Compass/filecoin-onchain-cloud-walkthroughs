import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

/**
 * NFT Metadata Storage Demo
 * 
 * This module demonstrates how to:
 * 1. Store NFT metadata JSON on Filecoin
 * 2. Get PieceCIDs for use in NFT contracts
 * 3. Build metadata for both images and JSON
 * 4. Handle batch uploads for collections
 */

// Sample NFT collection
const NFT_COLLECTION = [
    {
        tokenId: 1,
        name: "Cosmic Voyager #1",
        description: "A lone spacecraft traversing the cosmos",
        attributes: [
            { trait_type: "Background", value: "Deep Space" },
            { trait_type: "Rarity", value: "Common" },
            { trait_type: "Speed", value: 85 }
        ]
    },
    {
        tokenId: 2,
        name: "Cosmic Voyager #2",
        description: "A radiant nebula explorer",
        attributes: [
            { trait_type: "Background", value: "Nebula" },
            { trait_type: "Rarity", value: "Rare" },
            { trait_type: "Speed", value: 92 }
        ]
    },
    {
        tokenId: 3,
        name: "Cosmic Voyager #3",
        description: "The legendary starship commander",
        attributes: [
            { trait_type: "Background", value: "Supernova" },
            { trait_type: "Rarity", value: "Legendary" },
            { trait_type: "Speed", value: 99 }
        ]
    }
];

async function main() {
    console.log("NFT Metadata Storage Demo\n");
    console.log("Store NFT JSON metadata on Filecoin for use across any chain.\n");

    // Initialize SDK
    console.log("=== Step 1: SDK Initialization ===\n");

    const backendKey = process.env.PRIVATE_KEY;
    if (!backendKey) {
        throw new Error("Missing PRIVATE_KEY in environment");
    }

    const synapse = await Synapse.create({
        privateKey: backendKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    // Verify backend is ready
    const balance = await synapse.payments.balance(TOKENS.USDFC);
    if (balance === 0n) {
        console.log("Payment account is empty. Fund it first.");
        process.exit(1);
    }
    console.log(`Backend ready. Balance: ${(Number(balance) / 1e18).toFixed(4)} USDFC\n`);

    // Verify operator approval
    const operatorAddress = synapse.getWarmStorageAddress();
    const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);
    if (!approval.isApproved) {
        console.log("Storage operator not approved. Run payment-management tutorial first.");
        process.exit(1);
    }

    // Store metadata index
    const metadataIndex = [];

    // Step 2: Upload individual NFT metadata
    console.log("=== Step 2: Upload NFT Metadata ===\n");

    for (const nft of NFT_COLLECTION) {
        console.log(`Uploading metadata for Token #${nft.tokenId}...`);

        // Create ERC-721 compatible metadata
        const metadata = {
            name: nft.name,
            description: nft.description,
            // In production, store actual image and reference its PieceCID
            image: `https://placeholder.example.com/nft/${nft.tokenId}.png`,
            attributes: nft.attributes,
            // Additional fields
            external_url: `https://example.com/nft/${nft.tokenId}`,
            background_color: "000000"
        };

        // Convert to JSON buffer (ensure minimum size)
        const jsonString = JSON.stringify(metadata, null, 2);
        const paddedJson = jsonString + " ".repeat(Math.max(0, 128 - jsonString.length));
        const metadataBuffer = Buffer.from(paddedJson);

        try {
            const result = await synapse.storage.upload(metadataBuffer);

            console.log(`  PieceCID: ${result.pieceCid}`);
            console.log(`  Size: ${result.size} bytes`);

            metadataIndex.push({
                tokenId: nft.tokenId,
                name: nft.name,
                pieceCid: result.pieceCid.toString(),
                size: result.size
            });

        } catch (error) {
            console.error(`  Failed: ${error.message}`);
        }
    }

    console.log("\n=== Step 3: Metadata Index ===\n");

    console.log("Token ID | PieceCID");
    console.log("-".repeat(80));
    metadataIndex.forEach(item => {
        console.log(`   ${item.tokenId}     | ${item.pieceCid}`);
    });

    // Step 4: Gateway URLs
    console.log("\n=== Step 4: Gateway Access Patterns ===\n");

    console.log("NFT metadata can be accessed via gateways:");
    console.log("");

    metadataIndex.forEach(item => {
        // Filecoin gateway pattern
        console.log(`Token #${item.tokenId}:`);
        console.log(`  PieceCID: ${item.pieceCid}`);
        console.log(`  Gateway:  https://calibration.filfox.info/en/piece/${item.pieceCid}`);
        console.log("");
    });

    // Step 5: Smart Contract Integration
    console.log("=== Step 5: Smart Contract Integration ===\n");

    console.log("For ERC-721 contracts, implement tokenURI() to return metadata:");
    console.log("");
    console.log("  // Solidity example");
    console.log("  function tokenURI(uint256 tokenId) public view returns (string memory) {");
    console.log("      // Option 1: Return API endpoint that fetches from Filecoin");
    console.log("      return string(abi.encodePacked(baseURI, tokenId.toString()));");
    console.log("  }");
    console.log("");
    console.log("Your API server fetches data using the PieceCID and returns JSON.");

    // Step 6: Batch Upload Pattern
    console.log("\n=== Step 6: Batch Upload Pattern ===\n");

    console.log("For large collections (1000+ NFTs), upload a manifest:");
    console.log("");

    // Create manifest
    const manifest = {
        name: "Cosmic Voyagers Collection",
        description: "A collection of interstellar explorers",
        totalSupply: metadataIndex.length,
        tokens: metadataIndex.map(item => ({
            tokenId: item.tokenId,
            pieceCid: item.pieceCid
        }))
    };

    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));

    // Ensure minimum size
    const paddedManifest = manifestBuffer.length >= 127
        ? manifestBuffer
        : Buffer.concat([manifestBuffer, Buffer.alloc(127 - manifestBuffer.length, 32)]);

    console.log("Uploading collection manifest...");

    try {
        const manifestResult = await synapse.storage.upload(paddedManifest);
        console.log(`Manifest PieceCID: ${manifestResult.pieceCid}`);
        console.log(`Manifest Size: ${manifestResult.size} bytes\n`);

        console.log("With the manifest, your contract or frontend can:");
        console.log("  1. Fetch manifest once using its PieceCID");
        console.log("  2. Find individual token PieceCIDs from the manifest");
        console.log("  3. Fetch specific token metadata as needed");

    } catch (error) {
        console.error(`Manifest upload failed: ${error.message}`);
    }

    // Step 7: Multi-Chain NFT Support
    console.log("\n=== Step 7: Multi-Chain NFT Support ===\n");

    console.log("This metadata works for NFTs on any chain:");
    console.log("");
    console.log("  Ethereum:  Contract calls your API, API returns metadata");
    console.log("  Base:      Same pattern - chain-agnostic storage");
    console.log("  Polygon:   Same pattern - single storage backend");
    console.log("  Arbitrum:  Same pattern - decentralized metadata");
    console.log("");
    console.log("Deploy NFT contracts on multiple chains, all point to same metadata.");

    console.log("\n=== Summary ===\n");
    console.log("NFT metadata storage complete.");
    console.log(`- Uploaded ${metadataIndex.length} token metadata files`);
    console.log(`- Each has a unique PieceCID for permanent reference`);
    console.log(`- Metadata is chain-agnostic and decentralized`);
    console.log("");
    console.log("Next steps:");
    console.log("  1. Build API server (see server.js) to serve metadata");
    console.log("  2. Deploy NFT contract with tokenURI pointing to your API");
    console.log("  3. Mint NFTs - metadata is already stored");
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
