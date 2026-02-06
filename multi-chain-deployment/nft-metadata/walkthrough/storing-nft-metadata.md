# Storing NFT Metadata with Filecoin

NFTs on Ethereum, Base, Polygon, and other chains share a common challenge: where do you store the actual metadata? The blockchain stores a token ID and a URI. That URI must point to JSON describing the NFT - its name, description, image, and attributes. If that JSON disappears, your NFT loses its meaning.

This walkthrough demonstrates storing NFT metadata on Filecoin's decentralized network. You will upload ERC-721 compatible JSON, receive permanent content identifiers (PieceCIDs), and build an API that serves metadata to NFT contracts across any chain.

## Prerequisites

Before running this walkthrough, you must have:

- **Backend storage configured** - Complete walkthrough 1 first
- **tFIL and USDFC** - Funded payment account on Calibration testnet
- **Storage operator approved** - Permission for providers to charge you

This walkthrough builds on the storage foundation.

## What This Walkthrough Covers

We will walk through seven areas that establish NFT metadata storage:

1. **NFT Metadata Standards** - Understanding ERC-721 and ERC-1155 JSON formats
2. **PieceCID vs IPFS CID** - How Filecoin identifiers work
3. **Single Token Upload** - Storing individual NFT metadata
4. **Batch Collection Upload** - Handling large collections efficiently
5. **API Server** - Serving metadata to NFT contracts
6. **Smart Contract Integration** - Implementing tokenURI()
7. **Multi-Chain Patterns** - Serving NFTs across chains

Each step builds toward production-ready NFT infrastructure.

## Understanding NFT Metadata Standards

ERC-721 defines a standard JSON format for NFT metadata:

```json
{
  "name": "Cosmic Voyager #1",
  "description": "A lone spacecraft traversing the cosmos",
  "image": "https://example.com/nft/1.png",
  "attributes": [
    { "trait_type": "Background", "value": "Deep Space" },
    { "trait_type": "Rarity", "value": "Common" },
    { "trait_type": "Speed", "value": 85 }
  ],
  "external_url": "https://example.com/nft/1",
  "background_color": "000000"
}
```

**Required fields**:
- `name`: Human-readable name
- `description`: Longer description
- `image`: URI to the image (can be IPFS, HTTP, or data URI)

**Optional fields**:
- `attributes`: Array of trait objects for marketplaces
- `external_url`: Link to view on your site
- `background_color`: Hex color for display

When an NFT marketplace like OpenSea reads your contract's `tokenURI()`, it expects this JSON format.

## PieceCID: Filecoin's Content Identifier

When you upload to Filecoin, you receive a **PieceCID** - a content-addressed identifier derived from your data:

```
bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
```

Key properties:

**Content-Derived**: The identifier is computed from your data's bytes. Same data always produces the same PieceCID.

**Permanent**: PieceCIDs never expire. As long as storage deals remain active, the identifier works.

**Verifiable**: Anyone can verify that data matches its PieceCID by recomputing the hash.

**Gateway Accessible**: PieceCIDs can be accessed through HTTP gateways for traditional web access.

For NFT metadata, store the PieceCID in your database. Your API server fetches data by PieceCID and returns JSON to NFT contracts.

## Step 1: Create the NFT Metadata Script

Create `index.js` in your `code` directory:

```javascript
import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

dotenv.config({ path: '.env.local' });
dotenv.config();

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
    }
];

async function main() {
    console.log("NFT Metadata Storage Demo\n");

    // Initialize SDK
    const synapse = await Synapse.create({
        privateKey: process.env.PRIVATE_KEY,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    const metadataIndex = [];

    // Upload each NFT's metadata
    for (const nft of NFT_COLLECTION) {
        console.log(`Uploading Token #${nft.tokenId}...`);

        const metadata = {
            name: nft.name,
            description: nft.description,
            image: `https://example.com/nft/${nft.tokenId}.png`,
            attributes: nft.attributes
        };

        // Ensure minimum size (127 bytes)
        const jsonString = JSON.stringify(metadata, null, 2);
        const paddedJson = jsonString + " ".repeat(Math.max(0, 128 - jsonString.length));
        const metadataBuffer = Buffer.from(paddedJson);

        const result = await synapse.storage.upload(metadataBuffer);
        
        console.log(`  PieceCID: ${result.pieceCid}`);
        
        metadataIndex.push({
            tokenId: nft.tokenId,
            pieceCid: result.pieceCid.toString()
        });
    }

    // Display index
    console.log("\nMetadata Index:");
    metadataIndex.forEach(item => {
        console.log(`  Token ${item.tokenId}: ${item.pieceCid}`);
    });
}

main().catch(console.error);
```

## Understanding the Code

### Metadata Structure

```javascript
const metadata = {
    name: nft.name,
    description: nft.description,
    image: `https://example.com/nft/${nft.tokenId}.png`,
    attributes: nft.attributes
};
```

This creates ERC-721 compatible JSON. The `image` field typically points to:
- An IPFS gateway URL
- Your own CDN
- Another PieceCID gateway URL

### Size Padding

```javascript
const paddedJson = jsonString + " ".repeat(Math.max(0, 128 - jsonString.length));
```

Filecoin has a minimum upload size of 127 bytes. Most NFT metadata exceeds this, but padding ensures small JSON objects upload successfully.

### Building the Index

```javascript
metadataIndex.push({
    tokenId: nft.tokenId,
    pieceCid: result.pieceCid.toString()
});
```

Store the mapping between token IDs and PieceCIDs. In production, persist this to a database.

## Step 2: Run the Upload Script

```bash
cd multi-chain-deployment/nft-metadata/code
npm install
cp .env.example .env.local
# Edit .env.local with your private key
npm start
```

Expected output:

```
NFT Metadata Storage Demo

Uploading Token #1...
  PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
Uploading Token #2...
  PieceCID: bafkzcibca4nnt63cy5xvzpi8en73fp73yopp6qwsy8ho7guy3dym6d58go3lr

Metadata Index:
  Token 1: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
  Token 2: bafkzcibca4nnt63cy5xvzpi8en73fp73yopp6qwsy8ho7guy3dym6d58go3lr
```

## Step 3: Create the API Server

NFT contracts need an HTTP endpoint. Create `server.js`:

```javascript
import dotenv from 'dotenv';
import express from 'express';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
let synapse;

// Initialize SDK on startup
async function initSDK() {
    synapse = await Synapse.create({
        privateKey: process.env.PRIVATE_KEY,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });
}

// Serve metadata by token ID
app.get('/api/metadata/:tokenId', async (req, res) => {
    const tokenId = parseInt(req.params.tokenId);
    
    // Look up PieceCID from database (demo uses hardcoded mapping)
    const pieceCidMap = {
        1: 'bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq',
        2: 'bafkzcibca4nnt63cy5xvzpi8en73fp73yopp6qwsy8ho7guy3dym6d58go3lr'
    };
    
    const pieceCid = pieceCidMap[tokenId];
    if (!pieceCid) {
        return res.status(404).json({ error: 'Token not found' });
    }
    
    try {
        const data = await synapse.storage.download(pieceCid);
        const metadata = JSON.parse(data.toString());
        res.json(metadata);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
});

// Upload new metadata
app.post('/api/upload', express.json(), async (req, res) => {
    const { metadata } = req.body;
    
    const jsonString = JSON.stringify(metadata, null, 2);
    const buffer = Buffer.from(jsonString + " ".repeat(Math.max(0, 128 - jsonString.length)));
    
    const result = await synapse.storage.upload(buffer);
    
    res.json({
        pieceCid: result.pieceCid.toString(),
        size: result.size
    });
});

initSDK().then(() => {
    app.listen(3000, () => console.log('NFT Metadata API on port 3000'));
});
```

Run the server:

```bash
npm run server
```

Test with curl:

```bash
curl http://localhost:3000/api/metadata/1
```

## Step 4: Smart Contract Integration

Your NFT contract's `tokenURI()` returns metadata URIs:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract CosmicVoyagers is ERC721 {
    string public baseURI;
    
    constructor(string memory _baseURI) ERC721("Cosmic Voyagers", "COSMIC") {
        baseURI = _baseURI;
    }
    
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(tokenId > 0 && tokenId <= 1000, "Invalid token");
        return string(abi.encodePacked(baseURI, "/api/metadata/", toString(tokenId)));
    }
    
    function toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(buffer);
    }
}
```

Deploy with your API server's URL as `baseURI`:

```javascript
const baseURI = "https://your-api.example.com";
const contract = await CosmicVoyagers.deploy(baseURI);
```

When OpenSea queries `tokenURI(1)`, it receives:
```
https://your-api.example.com/api/metadata/1
```

Your API fetches from Filecoin and returns JSON.

## Batch Upload Pattern

For large collections, upload a manifest:

```javascript
const manifest = {
    name: "Cosmic Voyagers Collection",
    description: "10,000 interstellar explorers",
    tokens: metadataIndex  // Array of {tokenId, pieceCid}
};

const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
const manifestResult = await synapse.storage.upload(manifestBuffer);

console.log(`Manifest PieceCID: ${manifestResult.pieceCid}`);
```

Your API can:
1. Fetch the manifest once at startup
2. Cache token-to-PieceCID mappings in memory
3. Serve individual token metadata without database queries

## Multi-Chain NFT Support

The same metadata serves NFTs on any chain:

```
Ethereum Mainnet:
  Contract: 0x123...abc
  baseURI: https://api.example.com
  
Base:
  Contract: 0x456...def  
  baseURI: https://api.example.com  (same!)
  
Polygon:
  Contract: 0x789...ghi
  baseURI: https://api.example.com  (same!)
```

All three contracts point to the same API. The API fetches from Filecoin. Users mint on their preferred chain; metadata is chain-agnostic.

## Production Considerations

### Caching

Add Redis or in-memory caching:

```javascript
const cache = new Map();

app.get('/api/metadata/:tokenId', async (req, res) => {
    const tokenId = req.params.tokenId;
    
    if (cache.has(tokenId)) {
        return res.json(cache.get(tokenId));
    }
    
    const metadata = await fetchFromFilecoin(tokenId);
    cache.set(tokenId, metadata);
    res.json(metadata);
});
```

### CDN for Images

Store images separately and use CDN URLs:

```javascript
const metadata = {
    name: nft.name,
    image: `https://cdn.example.com/images/${tokenId}.png`,  // CDN, not Filecoin
    // ...
};
```

Images are large and frequently accessed. CDNs handle this better than Filecoin retrieval on every request.

### Rate Limiting

Protect your API:

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 100  // 100 requests per minute
});

app.use('/api/', limiter);
```

### Health Checks

Add endpoints for monitoring:

```javascript
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        sdkReady: !!synapse,
        timestamp: new Date().toISOString() 
    });
});
```

## Troubleshooting

**"Upload failed"**

Check payment account balance and operator approval. Run `storage-basics/payment-management` first.

**"Token not found"**

The token ID is not in your PieceCID mapping. Ensure you uploaded metadata for this token and stored the mapping.

**"Slow metadata responses"**

Filecoin retrieval can take seconds. Implement caching to serve repeat requests instantly.

## Conclusion

You have built NFT metadata infrastructure that:

- Stores JSON on decentralized storage
- Serves metadata via HTTP API
- Works with any ERC-721 contract
- Supports NFTs across multiple chains

The key insight: NFT contracts only store a URI. By pointing that URI to your API, and backing your API with Filecoin storage, you create decentralized metadata without requiring users to understand Filecoin.

This completes the Multi-Chain Deployment module. You now have:
1. Backend storage foundation
2. Payment tracking and quotas
3. NFT metadata with API

All three components work together to enable applications that accept payments on L2s while using Filecoin for permanent, decentralized storage.
