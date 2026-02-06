import dotenv from 'dotenv';
import express from 'express';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory metadata cache (in production, use Redis or database)
const metadataCache = new Map();

let synapse;

/**
 * NFT Metadata API Server
 * 
 * Serves NFT metadata from Filecoin storage.
 * NFT contracts call tokenURI() which points to this API.
 */

async function initSDK() {
    const backendKey = process.env.PRIVATE_KEY;
    if (!backendKey) {
        throw new Error("Missing PRIVATE_KEY");
    }

    synapse = await Synapse.create({
        privateKey: backendKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("Synapse SDK initialized.");
}

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /api/metadata/:tokenId
 * 
 * Returns NFT metadata for a given token ID.
 * In production, look up PieceCID from database or manifest.
 */
app.get('/api/metadata/:tokenId', async (req, res) => {
    try {
        const tokenId = parseInt(req.params.tokenId);

        if (isNaN(tokenId)) {
            return res.status(400).json({ error: 'Invalid token ID' });
        }

        // Check cache first
        if (metadataCache.has(tokenId)) {
            return res.json(metadataCache.get(tokenId));
        }

        // In production, look up PieceCID from database
        // For demo, generate sample metadata
        const metadata = {
            name: `Token #${tokenId}`,
            description: `NFT metadata for token ${tokenId}`,
            image: `https://placeholder.example.com/nft/${tokenId}.png`,
            attributes: [
                { trait_type: "Token ID", value: tokenId },
                { trait_type: "Generated", value: new Date().toISOString() }
            ]
        };

        // Cache for future requests
        metadataCache.set(tokenId, metadata);

        res.json(metadata);

    } catch (error) {
        console.error('Error fetching metadata:', error);
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
});

/**
 * GET /api/metadata/piece/:pieceCid
 * 
 * Fetches and returns metadata directly from Filecoin by PieceCID.
 */
app.get('/api/metadata/piece/:pieceCid', async (req, res) => {
    try {
        const { pieceCid } = req.params;

        if (!synapse) {
            return res.status(503).json({ error: 'SDK not initialized' });
        }

        // Download from Filecoin
        const data = await synapse.storage.download(pieceCid);
        const metadata = JSON.parse(data.toString());

        res.json(metadata);

    } catch (error) {
        console.error('Error fetching from Filecoin:', error);
        res.status(500).json({ error: 'Failed to fetch from Filecoin' });
    }
});

/**
 * POST /api/upload
 * 
 * Uploads NFT metadata to Filecoin.
 * Returns PieceCID for storage reference.
 */
app.post('/api/upload', async (req, res) => {
    try {
        const { metadata } = req.body;

        if (!metadata) {
            return res.status(400).json({ error: 'Missing metadata in request body' });
        }

        if (!synapse) {
            return res.status(503).json({ error: 'SDK not initialized' });
        }

        // Convert to buffer
        const jsonString = JSON.stringify(metadata, null, 2);
        const paddedJson = jsonString + " ".repeat(Math.max(0, 128 - jsonString.length));
        const metadataBuffer = Buffer.from(paddedJson);

        // Upload to Filecoin
        const result = await synapse.storage.upload(metadataBuffer);

        res.json({
            success: true,
            pieceCid: result.pieceCid.toString(),
            size: result.size
        });

    } catch (error) {
        console.error('Error uploading:', error);
        res.status(500).json({ error: 'Failed to upload metadata' });
    }
});

/**
 * GET /api/collection/:collectionId
 * 
 * Returns collection manifest with all token PieceCIDs.
 */
app.get('/api/collection/:collectionId', async (req, res) => {
    // In production, fetch manifest from database or Filecoin
    res.json({
        collectionId: req.params.collectionId,
        name: "Sample Collection",
        totalSupply: 0,
        tokens: []
    });
});

// Start server
async function start() {
    try {
        await initSDK();

        app.listen(PORT, () => {
            console.log(`NFT Metadata API running on http://localhost:${PORT}`);
            console.log("");
            console.log("Endpoints:");
            console.log(`  GET  /health`);
            console.log(`  GET  /api/metadata/:tokenId`);
            console.log(`  GET  /api/metadata/piece/:pieceCid`);
            console.log(`  POST /api/upload`);
            console.log(`  GET  /api/collection/:collectionId`);
        });

    } catch (error) {
        console.error("Failed to start server:", error.message);
        process.exit(1);
    }
}

start();
