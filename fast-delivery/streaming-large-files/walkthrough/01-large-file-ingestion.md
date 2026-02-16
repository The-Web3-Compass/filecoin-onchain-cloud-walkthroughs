# Part 1: Real Media Ingestion & Persistence

In this first module, we tackle the most fundamental challenge of modern media applications: **Gravity**.

Data has weight. A 5KB text file is light; you can toss it around in memory without thinking. But a 250MB 4K video file? That has mass. If you try to lift it all at once using `fs.readFileSync()`, your application's memory will buckle under the weight.

We are going to learn how to move heavy data like water: not by lifting the whole lake, but by pumping it through a pipe. This concept is called **Streaming**.

---

## The "Memory Wall" Problem

Every server has a limit. In a containerized environment (like Docker or AWS Lambda), your Node.js process might only be allowed 512MB of RAM. 

When you use `fs.readFileSync()`, Node.js attempts to allocate a single **Buffer** in the heap that is exactly the size of your file. For a 4GB file, V8 (Node's engine) will simply refuse the allocation and crash the process with an "Out of Memory" error.

By using **Streams**, we change the scaling factor. Memory usage becomes **constant** relative to the file size. Whether you are uploading a 10MB clip or a 10TB dataset, your RAM usage remains pegged at approximately 64KB (the default chunk size).

---

## Step 1: Workspace Setup

Before we touch any media, we need a clean staging area. We will create a dedicated project folder and the necessary directory structure to house our assets.

### Instructions:
1.  **Create Project Folder**: Open your terminal and create a new directory for this module.
    ```bash
    mkdir streaming-masterclass && cd streaming-masterclass
    ```
2.  **Initialize Project**: Generate a `package.json` and install the required streaming dependencies.
    ```bash
    npm init -y
    npm install @filoz/synapse-sdk express dotenv
    ```
3.  **Create Asset Directory**: Create a folder named `video/`. This is where we will store our source 4K media.
    ```bash
    mkdir video
    ```

---

## Step 2: Acquiring Sample Media

To test streaming, we need a high-quality video that provides a realistic workload for our pipeline. Instead of generating noise, we will use a stunning 4K capture of the Alps.

### Instructions:
1.  Visit [Pixabay: Alps Sunrise](https://pixabay.com/videos/alps-sunrise-fog-sea-of-fog-clouds-328740/).
2.  Click the **Download** button.
3.  Select the **4K / 3840x2160** resolution (approx. 233MB).
4.  Save the file as `video.mp4` **inside the `video/` folder** you created in Step 1.

---

## Step 3: Ingesting the Data

Now that we have our asset, we need to move it into the Filecoin network. The Synapse SDK supports streaming natively, but we want to do more than just upload: we want to track progress and handle the data gracefully.

### The Code: `upload-with-progress.js`

This script reads our video file chunk-by-chunk and pipes it to the Filecoin network while updating the user on the progress.

```javascript
import { createReadStream, statSync } from 'fs';
import { Readable } from 'stream';
import { Synapse } from '@filoz/synapse-sdk';

// ... SDK initialization skipped ...

async function upload() {
    const filePath = './video/video.mp4';
    const stats = statSync(filePath);
    const fileSize = stats.size;
    let bytesUploaded = 0;

    // 1. The Source: Reading from disk
    const fileStream = createReadStream(filePath, { 
        highWaterMark: 64 * 1024 // 64KB chunks
    });

    // 2. The Spy: Monitoring the flow
    const progressStream = new Readable({
        read() {
            const chunk = fileStream.read();
            if (chunk) {
                bytesUploaded += chunk.length;
                this.push(chunk);
                
                // Real-time progress update
                const progress = (bytesUploaded / fileSize * 100).toFixed(1);
                process.stdout.write(`\rUploading: [${progress}%]`);
            } else {
                fileStream.once('readable', () => this.read());
            }
        }
    });

    fileStream.on('end', () => progressStream.push(null));

    // 3. The Handshake: Bridging Node.js to Web Streams
    const webStream = Readable.toWeb(progressStream);

    // 4. The Destination: Persistence
    const context = await synapse.storage.createContext({ 
        withCDN: true,
        metadata: { filename: 'alps-4k.mp4' }
    });
    
    const result = await context.upload(webStream);
    console.log(`\nSuccess! PieceCID: ${result.pieceCid}`);
}
```

### What's Happening

*   **`createReadStream`**: Opens a non-blocking readable "pipe" to the file. The `highWaterMark` is our chunk size—if we don't specify it, Node.js defaults to 64KB, which is optimized for most OS kernels.
*   **The "Spy" Stream**: We wrap the file stream in a custom `Readable`. This allows us to "touch" every chunk as it passes through, incrementing our counter before passing it on to the next stage.
*   **`Readable.toWeb`**: This is a critical architectural adapter. The Filecoin SDK uses the modern **Web Streams API** (standard in browsers), while Node.js's file system uses the legacy **Node Streams API**. This utility bridges the two worlds.
*   **`upload(webStream)`**: The SDK begins pulling chunks from our pipeline. It will only pull a new chunk when the network is ready to receive it, respecting **Backpressure**.

### Why This Matters

User experience relies on visibility. If a user uploads a 250MB file and stares at a frozen loader for 30 seconds, they assume the application is broken. By instrumenting the stream, we provide "heartbeat" feedback without adding memory overhead.

Crucially, **we never held the video in memory**. The RAM usage of this script remains identical whether the file is 1MB or 100GB.

---

## Real-World Context: Defensive Ingestion

In production, ingestion is rarely a straight line. Network hiccups happen. 

If this were a 10GB dataset, you would implement **Resumable Uploads**. Instead of one giant stream, you would split the file into smaller 10MB parts (shards), upload them individually, and have the backend reassemble them. This ensures that a single TCP connection reset doesn't force a user to restart a 90% completed upload.

---

## Troubleshooting & Fault Tolerance

Ingesting large media often reveals environmental issues that smaller files hide.

### 1. Network Timeouts (`ECONNRESET`)
If your upload hangs or resets at 90%, it is usually due to a low timeout on your internet gateway or proxy. 
*   **The Fix**: In production, you would wrap the `upload()` call in a retry loop using a library like `p-retry`. For this tutorial, ensure you have a stable connection and that no aggressive firewall is closing long-running TCP sockets.

### 2. "Invalid Payload" or Context Errors
If the SDK returns an error during `createContext`:
*   **The Check**: Ensure your `PRIVATE_KEY` is correctly set in your `.env` file and that the account has sufficient FIL on Calibration testnet to cover the storage deal metadata.

---

## Conclusion

You have successfully implemented the **Ingestion Layer** of our media stack. You have:

-   **Respected Physics**: Used Backpressure to handle 4K video with zero risk of heap exhaustion.
-   **Engineered Clarity**: Instrumented the pipeline to provide real-time user feedback.
-   **Prepared for Retrieval**: Enabled the `withCDN` flag, which instructs the network to keep this data "hot" on edge servers.

But ingestion is only half the battle. A video sitting on a server is useless unless we can get it to a user. In **[Part 2](./02-streaming-server.md)**, we will build the machinery to get that data *out* just as efficiently as we put it *in*.

## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
