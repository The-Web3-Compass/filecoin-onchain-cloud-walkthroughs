import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate large test files for streaming demonstrations
 * Uses streams to avoid loading entire files into memory
 */

const FILE_SIZES = {
    '1MB': 1 * 1024 * 1024,      // 1 MB
    '10MB': 10 * 1024 * 1024,    // 10 MB
    '50MB': 50 * 1024 * 1024     // 50 MB
};

const CHUNK_SIZE = 64 * 1024; // 64 KB chunks for writing

async function generateFile(filename, size) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  Generating ${filename} (${(size / 1024 / 1024).toFixed(2)} MB)`);
    console.log('='.repeat(70));
    console.log();

    const dataDir = join(__dirname, 'data');

    // Create data directory if it doesn't exist
    if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
        console.log('✓ Created data/ directory\n');
    }

    const filepath = join(dataDir, filename);
    const writeStream = createWriteStream(filepath);
    const hash = createHash('sha256');

    let bytesWritten = 0;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const writeChunk = () => {
            let canContinue = true;

            while (bytesWritten < size && canContinue) {
                const remainingBytes = size - bytesWritten;
                const chunkSize = Math.min(CHUNK_SIZE, remainingBytes);

                // Generate random data for this chunk
                // Using a pattern that includes the byte position for verification
                const chunk = Buffer.alloc(chunkSize);
                for (let i = 0; i < chunkSize; i++) {
                    // Create a pattern: position-based value with some randomness
                    chunk[i] = ((bytesWritten + i) % 256);
                }

                // Update hash
                hash.update(chunk);

                // Write chunk to file
                canContinue = writeStream.write(chunk);
                bytesWritten += chunkSize;

                // Display progress
                const progress = (bytesWritten / size) * 100;
                const barLength = 40;
                const filledLength = Math.floor((progress / 100) * barLength);
                const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

                process.stdout.write(
                    `\rProgress: [${bar}] ${progress.toFixed(1)}% ` +
                    `(${(bytesWritten / 1024 / 1024).toFixed(2)} MB / ${(size / 1024 / 1024).toFixed(2)} MB)`
                );
            }

            if (bytesWritten < size) {
                // Wait for drain event before continuing
                writeStream.once('drain', writeChunk);
            } else {
                // Finished writing
                writeStream.end(() => {
                    const duration = (Date.now() - startTime) / 1000;
                    const checksum = hash.digest('hex');

                    console.log('\n');
                    console.log(`✓ File generated successfully`);
                    console.log(`  Path: ${filepath}`);
                    console.log(`  Size: ${(bytesWritten / 1024 / 1024).toFixed(2)} MB`);
                    console.log(`  Time: ${duration.toFixed(2)}s`);
                    console.log(`  Speed: ${(bytesWritten / 1024 / 1024 / duration).toFixed(2)} MB/s`);
                    console.log(`  SHA256: ${checksum.substring(0, 16)}...`);

                    resolve({
                        filename,
                        filepath,
                        size: bytesWritten,
                        duration,
                        checksum
                    });
                });
            }
        };

        writeStream.on('error', (err) => {
            console.error('\n❌ Error writing file:', err.message);
            reject(err);
        });

        // Start writing
        writeChunk();
    });
}

async function main() {
    console.log('='.repeat(70));
    console.log('  Filecoin Streaming: Large File Generator');
    console.log('='.repeat(70));
    console.log();
    console.log('This script generates test files for streaming demonstrations.');
    console.log('Files are created using Node.js streams to avoid memory issues.');
    console.log();

    const results = [];

    try {
        // Generate all test files
        for (const [name, size] of Object.entries(FILE_SIZES)) {
            const filename = `test-${name.toLowerCase()}.bin`;
            const result = await generateFile(filename, size);
            results.push(result);
        }

        // Summary
        console.log('\n' + '='.repeat(70));
        console.log('  Generation Complete!');
        console.log('='.repeat(70));
        console.log();
        console.log('Generated Files:');

        for (const result of results) {
            console.log(`  • ${result.filename}: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
        }

        const totalSize = results.reduce((sum, r) => sum + r.size, 0);
        const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

        console.log();
        console.log(`Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Total Time: ${totalTime.toFixed(2)}s`);
        console.log(`Average Speed: ${(totalSize / 1024 / 1024 / totalTime).toFixed(2)} MB/s`);
        console.log();
        console.log('Next Steps:');
        console.log('  1. Run "npm run upload" to upload files with progress tracking');
        console.log('  2. Run "npm run download" to download files with progress tracking');
        console.log('  3. Run "npm run server" to start the video streaming server');
        console.log();

    } catch (error) {
        console.error('\n❌ Error during file generation:');
        console.error(error);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
