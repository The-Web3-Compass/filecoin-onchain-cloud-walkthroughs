# Streaming Large Files on Filecoin

Developers building media-intensive applications eventually face a fundamental hurdle. Static storage works for documents and small images, but when you transition to high-definition video or massive datasets, traditional "Download and Play" models collapse. You aren't just storing data anymore; you are managing **Delivery**.

Filecoin Onchain Cloud transforms this challenge. By combining permanent decentralized storage with the **Beam CDN**, it provides a high-performance content delivery network that rivals centralized counterparts while maintaining the cryptographic guarantees of the blockchain. 

## The "Memory Wall"

If you try to load a 4GB movie file into a standard server instance using standard buffers (`fs.readFileSync`), your application will crash instantly. This is the **"Memory Wall"**. Most server instances have limited RAM, and trying to hold a massive file in a single buffer is physically impossible.

**Streaming** changes the rules. Instead of moving the entire lake, you move the water through a pipe. By processing data in small chunks, you can handle files of *any* size, from feature films to genomic datasets—using only a few megabytes of RAM.

In this three-part masterclass, we will transform your Filecoin application into a high-performance media server.

---

## Learning Objectives

We have broken this masterclass into three distinct engineering challenges:

### [Part Part 1: The Media Asset](./01-large-file-ingestion.md)
**The Foundation.**
Before you can stream media, you must first master the physics of data ingestion. We will bypass the memory wall using Node.js Streams to move high-bitrate video into the cloud safely.
*   **Engineering Focus**: Data Gravity, Node.js Streams, and Backpressure.
*   **The Artifact**: A workflow to upload real 4K video to Filecoin with a constant, tiny memory footprint.

### [Part 2: The Streaming Proxy](./02-streaming-server.md)
**The Core Engine.**
This is where the magic happens. We build a middleware server that speaks the language of modern browsers: **HTTP Range Requests (RFC 7233)**.
*   **Engineering Focus**: Partial Content Handshakes, Byte-Range calculation, and Latency Optimization.
*   **The Artifact**: An Express.js server that acts as a smart proxy between your users and the Filecoin Beam network.

### [Part 3: The Custom Video Player](./03-custom-video-player.md)
**The User Experience.**
A robust backend needs a surgical frontend. We will build a native interface that provides immediate playback and frame-accurate seeking without the overhead of heavy frameworks.
*   **Engineering Focus**: Native Browser APIs vs. Heavy Frameworks, UX perception, and "The Last Mile."
*   **The Artifact**: A high-performance, vanilla JavaScript video player implementation.

---

## Prerequisites

To get the most out of this series, you should have:

1.  **Funded Wallet**: A MetaMask account configured for **Filecoin Calibration** testnet.
2.  **CDN Knowledge**: Completed the [Enable Beam CDN](../../enable-beam/walkthrough/enable-beam.md) walkthrough.
3.  **Environment**: Node.js 20+ and a basic understanding of `async/await` and environment variables.

If you have completed the [Getting Started](../../get-token/walkthrough/setup-and-initialization.md) module, you are already equipped for this task.

---

## Quick Start (For the Impatient)

If you have already read the theory and just want to see the code running:

> [!NOTE]
> All reference code for this module is available in the official repository:
> [**Streaming Large Files Codebase**](https://github.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/tree/main/fast-delivery/streaming-large-files/code)

**1. Install Dependencies**
```bash
npm install
```

**2. Acquire Sample Media**
Download a high-resolution sample (like this [4K Alps Video](https://pixabay.com/videos/alps-sunrise-fog-sea-of-fog-clouds-328740/)) and save it as `video/video.mp4`.

**3. Upload to Filecoin**
```bash
npm run upload
```
*Note the PieceCID returned by this step.*

**4. Start the Streaming Server**
```bash
npm run server
```

**5. Play the Video**
Open `http://localhost:3000`, paste your PieceCID, and click **Load Video**.

---

## Ready to Build?

The "Memory Wall" is the biggest hurdle for new developers handling media. Let's break through it.

**[Continue to Part 1: Real Media Ingestion](./01-large-file-ingestion.md)**
