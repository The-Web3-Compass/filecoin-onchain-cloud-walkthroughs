import 'dotenv/config';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';
import { createWriteStream, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Download large files from Filecoin with real-time progress tracking
 * Demonstrates chunked download with progress display
 */

function createProgressBar(progress, width = 40) {
    const filledLength = Math.floor((progress / 100) * width);
    return '█'.repeat(filledLength) + '░'.repeat(width - filledLength);
}

async function downloadWithProgress(synapse, pieceCid, outputPath) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  Downloading: ${pieceCid}`);
    console.log('='.repeat(70));
    console.log();

    const startTime = Date.now();

    try {
        // Create storage context with Beam CDN enabled
        const context = await synapse.storage.createContext({
            withCDN: true
        });

        console.log('Fetching file from Beam CDN...\n');

        // Download the file
        // Note: The SDK downloads the entire file and returns a Uint8Array
        // For true streaming, we would need SDK support for chunked downloads
        // This example shows progress tracking with the current SDK

        const downloadedData = await context.download(pieceCid);

        const downloadTime = (Date.now() - startTime) / 1000;
        const fileSize = downloadedData.length;
        const avgSpeed = fileSize / 1024 / 1024 / downloadTime;

        console.log(`✓ Download complete!`);
        console.log(`  Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Download Time: ${downloadTime.toFixed(2)}s`);
        console.log(`  Average Speed: ${avgSpeed.toFixed(2)} MB/s`);
        console.log();

        // Write to file using streams
        console.log('Writing to file...\n');

        const writeStream = createWriteStream(outputPath);
        const hash = createHash('sha256');

        let bytesWritten = 0;
        const CHUNK_SIZE = 64 * 1024; // 64 KB chunks

        return new Promise((resolve, reject) => {
            const writeChunks = () => {
                let canContinue = true;

                while (bytesWritten < fileSize && canContinue) {
                    const remainingBytes = fileSize - bytesWritten;
                    const chunkSize = Math.min(CHUNK_SIZE, remainingBytes);
                    const chunk = downloadedData.slice(bytesWritten, bytesWritten + chunkSize);

                    // Update hash
                    hash.update(chunk);

                    // Write chunk
                    canContinue = writeStream.write(chunk);
                    bytesWritten += chunkSize;

                    // Display progress
                    const progress = (bytesWritten / fileSize) * 100;
                    const bar = createProgressBar(progress);

                    process.stdout.write(
                        `\rWriting: [${bar}] ${progress.toFixed(1)}% ` +
                        `(${(bytesWritten / 1024 / 1024).toFixed(2)} MB / ${(fileSize / 1024 / 1024).toFixed(2)} MB)`
                    );
                }

                if (bytesWritten < fileSize) {
                    writeStream.once('drain', writeChunks);
                } else {
                    writeStream.end(() => {
                        const checksum = hash.digest('hex');
                        const totalTime = (Date.now() - startTime) / 1000;

                        console.log('\n');
                        console.log(`✓ File written successfully`);
                        console.log(`  Path: ${outputPath}`);
                        console.log(`  SHA256: ${checksum.substring(0, 16)}...`);
                        console.log(`  Total Time: ${totalTime.toFixed(2)}s`);
                        console.log();

                        resolve({
                            pieceCid,
                            size: fileSize,
                            downloadTime,
                            totalTime,
                            avgSpeed,
                            checksum,
                            outputPath
                        });
                    });
                }
            };

            writeStream.on('error', (err) => {
                console.error('\n❌ Error writing file:', err.message);
                reject(err);
            });

            writeChunks();
        });

    } catch (error) {
        console.error('\n❌ Download failed:', error.message);
        throw error;
    }
}

async function verifyDownload(originalPath, downloadedPath) {
    console.log('🔍 Verifying downloaded file...\n');

    if (!existsSync(originalPath)) {
        console.log('⚠️  Original file not found, skipping verification');
        return;
    }

    const originalStats = statSync(originalPath);
    const downloadedStats = statSync(downloadedPath);

    console.log('File Size Comparison:');
    console.log(`  Original:   ${(originalStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Downloaded: ${(downloadedStats.size / 1024 / 1024).toFixed(2)} MB`);

    if (originalStats.size === downloadedStats.size) {
        console.log('  ✓ Sizes match!');
    } else {
        console.log('  ✗ Sizes do not match!');
        return false;
    }

    // Calculate checksums
    console.log('\nCalculating checksums...');

    const originalData = readFileSync(originalPath);
    const downloadedData = readFileSync(downloadedPath);

    const originalHash = createHash('sha256').update(originalData).digest('hex');
    const downloadedHash = createHash('sha256').update(downloadedData).digest('hex');

    console.log(`  Original:   ${originalHash.substring(0, 32)}...`);
    console.log(`  Downloaded: ${downloadedHash.substring(0, 32)}...`);

    if (originalHash === downloadedHash) {
        console.log('  ✓ Checksums match! File integrity verified.');
        return true;
    } else {
        console.log('  ✗ Checksums do not match!');
        return false;
    }
}

async function main() {
    console.log('='.repeat(70));
    console.log('  Filecoin Streaming: Download with Progress Tracking');
    console.log('='.repeat(70));
    console.log();

    // ========================================================================
    // STEP 1: Initialize SDK
    // ========================================================================
    console.log('📡 Step 1: Initializing Filecoin SDK...\n');

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('Missing PRIVATE_KEY in .env file');
    }

    const synapse = await Synapse.create({
        privateKey: privateKey,
        rpcURL: 'https://api.calibration.node.glif.io/rpc/v1'
    });

    console.log('✓ SDK initialized successfully\n');

    // ========================================================================
    // STEP 2: Read PieceCID
    // ========================================================================
    console.log('📄 Step 2: Reading PieceCID...\n');

    const pieceCidFile = join(__dirname, 'pieceCid.txt');

    if (!existsSync(pieceCidFile)) {
        console.log('⚠️  PieceCID file not found!');
        console.log('Please run "npm run upload" first to upload a file.');
        process.exit(1);
    }

    const pieceCid = readFileSync(pieceCidFile, 'utf-8').trim();
    console.log(`PieceCID: ${pieceCid}`);
    console.log('✓ PieceCID loaded\n');

    // ========================================================================
    // STEP 3: Download with Progress Tracking
    // ========================================================================
    console.log('📥 Step 3: Downloading with Progress Tracking...\n');

    const dataDir = join(__dirname, 'data');
    const outputPath = join(dataDir, 'downloaded-test-10mb.bin');

    try {
        const result = await downloadWithProgress(synapse, pieceCid, outputPath);

        // ========================================================================
        // STEP 4: Verify Download
        // ========================================================================
        console.log('='.repeat(70));
        console.log('  Step 4: Verifying Download');
        console.log('='.repeat(70));
        console.log();

        const originalPath = join(dataDir, 'test-10mb.bin');
        const verified = await verifyDownload(originalPath, outputPath);

        console.log();

        // ========================================================================
        // Summary
        // ========================================================================
        console.log('='.repeat(70));
        console.log('  Download Complete!');
        console.log('='.repeat(70));
        console.log();
        console.log('Download Summary:');
        console.log(`  PieceCID: ${result.pieceCid}`);
        console.log(`  Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Download Time: ${result.downloadTime.toFixed(2)}s`);
        console.log(`  Total Time: ${result.totalTime.toFixed(2)}s`);
        console.log(`  Average Speed: ${result.avgSpeed.toFixed(2)} MB/s`);
        console.log(`  Verified: ${verified ? '✓ Yes' : '✗ No'}`);
        console.log();
        console.log('Next Steps:');
        console.log('  1. Run "npm run server" to start the video streaming server');
        console.log('  2. Upload a video file and test streaming in the browser');
        console.log();

    } catch (error) {
        console.error('Download failed:', error);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('\n❌ Error during download:');
    console.error(err);
    process.exit(1);
});
