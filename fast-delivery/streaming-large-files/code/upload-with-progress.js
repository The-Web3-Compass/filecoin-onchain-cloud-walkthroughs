import 'dotenv/config';
import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';
import { createReadStream, statSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Upload large files to Filecoin with real-time progress tracking
 * Demonstrates streaming upload using ReadableStream
 */

const CHUNK_SIZE = 64 * 1024; // 64 KB chunks for progress tracking

function createProgressBar(progress, width = 40) {
    const filledLength = Math.floor((progress / 100) * width);
    return '█'.repeat(filledLength) + '░'.repeat(width - filledLength);
}

async function uploadWithProgress(synapse, filepath) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  Uploading: ${filepath.split('/').pop()}`);
    console.log('='.repeat(70));
    console.log();

    // Get file size
    const stats = statSync(filepath);
    const fileSize = stats.size;
    console.log(`File Size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log();

    // Read file as stream
    const fileStream = createReadStream(filepath, {
        highWaterMark: CHUNK_SIZE
    });

    let bytesUploaded = 0;
    const startTime = Date.now();

    // Create a transform stream to track progress
    const progressStream = new Readable({
        async read() {
            // This will be driven by the file stream
        }
    });

    fileStream.on('data', (chunk) => {
        bytesUploaded += chunk.length;

        // Calculate progress
        const progress = (bytesUploaded / fileSize) * 100;
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = bytesUploaded / 1024 / 1024 / elapsed;
        const bar = createProgressBar(progress);

        // Display progress
        process.stdout.write(
            `\rUploading: [${bar}] ${progress.toFixed(1)}% ` +
            `(${(bytesUploaded / 1024 / 1024).toFixed(2)} MB / ${(fileSize / 1024 / 1024).toFixed(2)} MB) ` +
            `${speed.toFixed(2)} MB/s`
        );

        // Push chunk to progress stream
        progressStream.push(chunk);
    });

    fileStream.on('end', () => {
        progressStream.push(null); // Signal end of stream
    });

    fileStream.on('error', (err) => {
        console.error('\n❌ Error reading file:', err.message);
        progressStream.destroy(err);
    });

    try {
        // Create storage context with Beam CDN enabled
        const context = await synapse.storage.createContext({
            withCDN: true,
            metadata: {
                filename: filepath.split('/').pop(),
                size: fileSize,
                uploadedAt: new Date().toISOString()
            }
        });

        // Upload using the progress stream
        // Note: The SDK accepts Uint8Array or ReadableStream
        // We'll convert our Node.js stream to a Web ReadableStream
        const webStream = Readable.toWeb(progressStream);

        const result = await context.upload(webStream);

        const uploadTime = (Date.now() - startTime) / 1000;
        const avgSpeed = fileSize / 1024 / 1024 / uploadTime;

        console.log('\n');
        console.log(`✓ Upload complete!`);
        console.log(`  PieceCID: ${result.pieceCid}`);
        console.log(`  Upload Time: ${uploadTime.toFixed(2)}s`);
        console.log(`  Average Speed: ${avgSpeed.toFixed(2)} MB/s`);
        console.log();

        return {
            pieceCid: String(result.pieceCid),
            filename: filepath.split('/').pop(),
            size: fileSize,
            uploadTime,
            avgSpeed
        };

    } catch (error) {
        console.error('\n❌ Upload failed:', error.message);
        throw error;
    }
}

async function main() {
    console.log('='.repeat(70));
    console.log('  Filecoin Streaming: Upload with Progress Tracking');
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
    // STEP 2: Verify Payment Account
    // ========================================================================
    console.log('💰 Step 2: Verifying Payment Account...\n');

    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    console.log(`Payment Account Balance: ${ethers.formatUnits(paymentBalance, 18)} USDFC`);

    if (paymentBalance === 0n) {
        console.log('\n⚠️  Warning: Payment account has no balance!');
        console.log('Please fund your account first:');
        console.log('1. Get USDFC from: https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc');
        console.log('2. Deposit to payment account (see walkthrough for details)');
        process.exit(1);
    }

    // Verify operator allowances
    const operatorAddress = synapse.getWarmStorageAddress();
    const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
        console.log('\n⚠️  Warning: Operator allowances not set!');
        console.log('Please approve the storage operator:');
        console.log('See the walkthrough for deposit and approval instructions.');
        process.exit(1);
    }

    console.log('✓ Payment account funded and operator approved\n');

    // ========================================================================
    // STEP 3: Check for Test Files
    // ========================================================================
    console.log('📄 Step 3: Checking for Test Files...\n');

    const dataDir = join(__dirname, 'data');
    const testFile = join(dataDir, 'test-10mb.bin');

    if (!existsSync(testFile)) {
        console.log('⚠️  Test file not found!');
        console.log('Please run "npm run generate" first to create test files.');
        process.exit(1);
    }

    console.log('✓ Test file found\n');

    // ========================================================================
    // STEP 4: Upload with Progress Tracking
    // ========================================================================
    console.log('📤 Step 4: Uploading with Progress Tracking...\n');

    const uploadResults = [];

    try {
        // Upload the 10MB test file
        const result = await uploadWithProgress(synapse, testFile);
        uploadResults.push(result);

        // Save PieceCID to file for download script
        const pieceCidFile = join(__dirname, 'pieceCid.txt');
        writeFileSync(pieceCidFile, result.pieceCid);
        console.log(`✓ PieceCID saved to: pieceCid.txt`);
        console.log();

    } catch (error) {
        console.error('Upload failed:', error);
        process.exit(1);
    }

    // ========================================================================
    // Summary
    // ========================================================================
    console.log('='.repeat(70));
    console.log('  Upload Complete!');
    console.log('='.repeat(70));
    console.log();
    console.log('Upload Summary:');

    for (const result of uploadResults) {
        console.log(`  • ${result.filename}:`);
        console.log(`    PieceCID: ${result.pieceCid}`);
        console.log(`    Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`    Time: ${result.uploadTime.toFixed(2)}s`);
        console.log(`    Speed: ${result.avgSpeed.toFixed(2)} MB/s`);
    }

    console.log();
    console.log('Next Steps:');
    console.log('  1. Run "npm run download" to download the file with progress tracking');
    console.log('  2. Run "npm run server" to start the video streaming server');
    console.log();
}

main().catch((err) => {
    console.error('\n❌ Error during upload:');
    console.error(err);
    process.exit(1);
});
