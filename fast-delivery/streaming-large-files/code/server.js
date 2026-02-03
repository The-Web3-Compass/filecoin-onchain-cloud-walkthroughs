import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';
import { readFileSync, createReadStream, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize Synapse SDK
let synapse = null;

async function initializeSynapse() {
    if (synapse) return synapse;

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('Missing PRIVATE_KEY in .env file');
    }

    synapse = await Synapse.create({
        privateKey: privateKey,
        rpcURL: 'https://api.calibration.node.glif.io/rpc/v1'
    });

    console.log('✓ Synapse SDK initialized');
    return synapse;
}

/**
 * Parse Range header
 * Format: "bytes=start-end" or "bytes=start-"
 */
function parseRange(rangeHeader, fileSize) {
    if (!rangeHeader) {
        return null;
    }

    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start > end || end >= fileSize) {
        return null;
    }

    return { start, end };
}

/**
 * Stream video from Filecoin Beam CDN with Range Request support
 */
app.get('/video/:pieceCid', async (req, res) => {
    const { pieceCid } = req.params;
    const rangeHeader = req.headers.range;

    console.log(`\n📹 Video request: ${pieceCid}`);
    console.log(`   Range: ${rangeHeader || 'none (full file)'}`);

    try {
        // Initialize SDK if needed
        const sdk = await initializeSynapse();

        // Create storage context with Beam CDN
        const context = await sdk.storage.createContext({
            withCDN: true
        });

        // Download the file from Beam CDN
        console.log('   Fetching from Beam CDN...');
        const videoData = await context.download(pieceCid);
        const fileSize = videoData.length;

        console.log(`   File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

        // Handle Range Request
        if (rangeHeader) {
            const range = parseRange(rangeHeader, fileSize);

            if (!range) {
                console.log('   ❌ Invalid range request');
                return res.status(416).send('Requested Range Not Satisfiable');
            }

            const { start, end } = range;
            const chunkSize = end - start + 1;

            console.log(`   Sending bytes ${start}-${end} (${(chunkSize / 1024).toFixed(2)} KB)`);

            // Extract the requested chunk
            const chunk = videoData.slice(start, end + 1);

            // Send 206 Partial Content response
            res.status(206);
            res.set({
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': 'video/mp4' // Adjust based on actual file type
            });

            res.send(Buffer.from(chunk));
            console.log('   ✓ Partial content sent');

        } else {
            // Send full file
            console.log('   Sending full file');

            res.status(200);
            res.set({
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4', // Adjust based on actual file type
                'Accept-Ranges': 'bytes'
            });

            res.send(Buffer.from(videoData));
            console.log('   ✓ Full file sent');
        }

    } catch (error) {
        console.error('   ❌ Error streaming video:', error.message);
        res.status(500).json({
            error: 'Failed to stream video',
            message: error.message
        });
    }
});

/**
 * Upload video to Filecoin
 */
app.post('/upload', async (req, res) => {
    const { filename, data } = req.body;

    console.log(`\n📤 Upload request: ${filename}`);

    try {
        // Initialize SDK if needed
        const sdk = await initializeSynapse();

        // Verify payment account
        const paymentBalance = await sdk.payments.balance(TOKENS.USDFC);
        if (paymentBalance === 0n) {
            throw new Error('Payment account has no balance');
        }

        // Convert base64 data to Uint8Array
        const fileData = Buffer.from(data, 'base64');
        console.log(`   File size: ${(fileData.length / 1024 / 1024).toFixed(2)} MB`);

        // Create storage context with Beam CDN
        const context = await sdk.storage.createContext({
            withCDN: true,
            metadata: {
                filename,
                uploadedAt: new Date().toISOString()
            }
        });

        // Upload to Filecoin
        console.log('   Uploading to Filecoin...');
        const result = await context.upload(fileData);

        console.log(`   ✓ Upload complete: ${result.pieceCid}`);

        res.json({
            success: true,
            pieceCid: String(result.pieceCid),
            size: fileData.length
        });

    } catch (error) {
        console.error('   ❌ Upload failed:', error.message);
        res.status(500).json({
            error: 'Upload failed',
            message: error.message
        });
    }
});

/**
 * Get video metadata
 */
app.get('/metadata/:pieceCid', async (req, res) => {
    const { pieceCid } = req.params;

    try {
        const sdk = await initializeSynapse();
        const context = await sdk.storage.createContext({ withCDN: true });

        // Download just to get size (in production, you'd cache this)
        const data = await context.download(pieceCid);

        res.json({
            pieceCid,
            size: data.length,
            sizeFormatted: `${(data.length / 1024 / 1024).toFixed(2)} MB`
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to get metadata',
            message: error.message
        });
    }
});

/**
 * Serve the HTML player
 */
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'player.html'));
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        sdk: synapse ? 'initialized' : 'not initialized'
    });
});

// Start server
app.listen(PORT, () => {
    console.log('='.repeat(70));
    console.log('  Filecoin Video Streaming Server');
    console.log('='.repeat(70));
    console.log();
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log();
    console.log('Available endpoints:');
    console.log(`  GET  /                    - HTML video player`);
    console.log(`  GET  /video/:pieceCid     - Stream video with Range Request support`);
    console.log(`  POST /upload              - Upload video to Filecoin`);
    console.log(`  GET  /metadata/:pieceCid  - Get video metadata`);
    console.log(`  GET  /health              - Health check`);
    console.log();
    console.log('Features:');
    console.log('  ✓ HTTP Range Request support for video seeking');
    console.log('  ✓ Beam CDN integration for fast delivery');
    console.log('  ✓ Upload videos directly from browser');
    console.log('  ✓ Stream videos by PieceCID');
    console.log();
    console.log('Next Steps:');
    console.log('  1. Open http://localhost:' + PORT + ' in your browser');
    console.log('  2. Upload a video file (MP4 recommended)');
    console.log('  3. Copy the PieceCID and load the video');
    console.log('  4. Test seeking/scrubbing through the video');
    console.log();
    console.log('Press Ctrl+C to stop the server');
    console.log('='.repeat(70));
    console.log();
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down server...');
    process.exit(0);
});
