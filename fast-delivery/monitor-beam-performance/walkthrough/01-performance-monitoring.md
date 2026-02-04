# Part 1: Performance Monitoring & Metrics

This walkthrough is the first in a three-part series on building production-grade monitoring for decentralized storage. We will begin by constructing a "Heartbeat Prober"—an autonomous agent that continuously verifies the network's performance. By the end, you will understand not just *how* to measure speed, but *why* latency varies in a peer-to-peer network and how to quantify it.

---

## Prerequisites

Before proceeding, ensure you have the following:

- **Node.js 18+** installed
- **MetaMask** wallet with **Calibration Testnet** configured
- **tFIL** (gas) and **USDFC** (token) from faucets
- A solid understanding of the basics from the [Enable Beam CDN](../../enable-beam/walkthrough/enable-beam.md) walkthrough

---

## The Metrics That Matter

In standard web development, we often obsess over "server load" or "memory usage". In a decentralized CDN, those metrics are irrelevant to you. You care about the **User Experience**.

Two specific metrics define this experience:

### 1. Time to First Byte (TTFB)

TTFB measures responsiveness. It is the duration between a user clicking "Play" and the video player receiving the first chunk of data.

In the Beam network, a high TTFB usually indicates one of two things:
1.  **Network Latency**: The storage provider is physically far away from the user.
2.  **Sealing Latency**: The provider might be retrieving data from "sealed" (cold) storage rather than an unsealed (hot) cache.

For a modern application, a TTFB under **200ms** feels instantaneous. Anything over **1 second** feels broken.

### 2. Throughput

Throughput measures bandwidth. Once the data starts flowing, how fast does it arrive?

This is distinct from TTFB. You can have a provider with excellent responsiveness (low TTFB) but narrow pipes (low throughput). This results in buffering during high-bitrate video playback.

---

## Step 1: Architecting the Monitor

We will build a modular system where each component has a single responsibility. This is not just a script; it is a scaffold for a production service.

Create your project workspace:

```bash
mkdir monitor-beam
cd monitor-beam
npm init -y
```

### 2. Install The Toolchain

We need a specific set of tools. Note that `ethers` is a **peer dependency** of the Synapse SDK, meaning you must install it alongside the SDK.

```bash
npm install @filoz/synapse-sdk ethers dotenv express cors node-cron
```

**Why these packages?**
- **`@filoz/synapse-sdk`**: The official Filecoin Cloud SDK. It handles the complex cryptography and networking required to talk to Filecoin and Beam CDN.
- **`ethers`**: Essential for handling 18-decimal token precision (BigInts) and blockchain interactions.
- **`node-cron`**: Monitoring isn't a one-time event. We need a scheduler to run our probes every minute/hour (we'll use this in Part 3).
- **`express` & `cors`**: For serving our data to a dashboard.

### 3. Configure `package.json`

Open `package.json`. Two critical changes are needed:

1.  **Enable ES Modules**: Add `"type": "module"`. This allows us to use modern `import` syntax.
2.  **Add Control Scripts**:

```json
{
  "name": "monitor-beam",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "fund": "node fund-account.js",
    "collect": "node metrics-collector.js",
    "costs": "node cost-tracker.js",
    "dashboard": "node dashboard.js"
  },
  "dependencies": {
    ...
  }
}
```

---

## Step 2: The Security Layer

Monitoring agents often run on unattended servers. This makes security critical. **Never commit your private key.**

Create a `.env` file for your private keys:

```bash
touch .env
echo ".env" >> .gitignore
```

Add your credentials:

```properties
PRIVATE_KEY=0x...your_private_key...
```

### Funding the Operations

Active monitoring costs money (micropayments). We need to fund our robot.

We will create `fund-account.js`. This script uses the `Synapse.create()` method to initialize a connection and then executes a deposit.

```javascript
import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';
import 'dotenv/config';

async function main() {
    console.log("Initializing Funding Operation...");
    
    // 1. Initialize the SDK
    // The RPC URL points to the Calibration Testnet.
    const synapse = await Synapse.create({
        privateKey: process.env.PRIVATE_KEY,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("SDK Initialized. Preparing Deposit...");

    // 2. Deposit & Approve
    // We use 'depositWithPermitAndApproveOperator' for atomic safety.
    // It is safer than doing a deposit() and then an approve() separately.
    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
        ethers.parseUnits("2.0", 18), // 2.0 USDFC
        synapse.getWarmStorageAddress(),
        ethers.MaxUint256, // Unlimited Rate Allowance (Safe, as usage is metered)
        ethers.MaxUint256, // Unlimited Lockup Allowance
        TIME_CONSTANTS.EPOCHS_PER_MONTH // Valid for 1 Month
    );
    
    await tx.wait();
    console.log("✅ Payment Channel Funded: 2.0 USDFC");
}

main().catch(console.error);
```

Run initialization:
```bash
npm run fund
```

---

## Step 3: Implementing the Heartbeat Prober

Now we build the core engine (`metrics-collector.js`). The concept of a "Prober" is standard in Site Reliability Engineering (SRE). Instead of waiting for a user to complain that the site is slow, the Prober actively simulates a user every few minutes.

Our Prober will perform a **Synthetic Transaction**:
1.  **Generate** a random payload (to prevent caching optimizations).
2.  **Upload** it to the network (Write Test).
3.  **Download** it immediately (Read Test).
4.  **Measure** the precise timings.

### The Code

```javascript
// From metrics-collector.js

async function collectMetrics(synapse) {
    console.log('\n📊 Collecting Performance Metrics...\n');

    // 1. Generate Non-Compressible Data
    const testData = Buffer.alloc(TEST_FILE_SIZE);
    for (let i = 0; i < TEST_FILE_SIZE; i++) {
        testData[i] = i % 256;
    }

    const metrics = {
        timestamp: new Date().toISOString(),
        operation: 'upload-download-cycle',
        ttfb: 0,
        throughput: 0,
        // ... (other fields initialized)
    };

    // 2. The Write Test (Upload)
    // Create context with Beam CDN enabled
    const context = await synapse.storage.createContext({
        withCDN: true,
        metadata: { purpose: 'metrics-collection' }
    });

    const uploadStart = Date.now();
    const uploadResult = await context.upload(testData);
    metrics.uploadTime = (Date.now() - uploadStart) / 1000;
    
    // 3. The Read Test (Download)
    const downloadStart = Date.now();
    
    // In a real implementation using a stream, we would capture 
    // the first byte timestamp here. For this simplified version,
    // we measure total time and approximate TTFB.
    const downloadedData = await context.download(String(uploadResult.pieceCid));
    const downloadEnd = Date.now();

    metrics.downloadTime = (downloadEnd - downloadStart) / 1000;
    
    // Calculate KPIs
    metrics.bytesTransferred = downloadedData.length;
    // Throughput in MB/s
    metrics.throughput = (metrics.bytesTransferred / 1024 / 1024) / metrics.downloadTime; 
    
    return metrics;
}
```

### Under the Hood

Let's unpack why we wrote the code this way. There are a few subtle traps in network monitoring that catch most beginners.

**1. The "Unzippable" Payload**
Notice we filled our buffer with `i % 256`? That wasn't just to be fancy.
If you fill a 1MB file with zeros (low entropy), modern network appliances (routers, modems, and even the protocol itself) will compress it on the fly. You might think you're testing your 100Mbps connection, but you're actually testing how fast your router's CPU can unzip a stream of zeros. By using random noise, we force the network to do the heavy lifting, giving us the *true* unwired capacity of the pipe.

**2. The Priority Lane (`withCDN: true`)**
```javascript
const context = await synapse.storage.createContext({ withCDN: true });
```
This flag is the difference between "Archival" and "Retrieval." Without it, your data lands on a storage provider prioritized for long-term sealing (Cold Storage). With it, you signal the Beam network: *“I need this accessible immediately.”* It routes your payload to retrieval-specialized nodes ("The Beam Fleet") that keep data in hot RAM or SSD caches, ready for sub-second delivery.

**3. The Stopwatch Problem**
We started our timer (`Date.now()`) *before* the download function call. Why?
If you put the timer inside the callback, you only measure the transfer time. You miss the DNS lookup, the TCP handshake, the SSL negotiation, and the server's "thinking time" (TTFB). Real users feel all of that delay. If your dashboard says "50ms" but the user waited 2 seconds for the connection to open, your metrics are lying to you. We measure from the *intent* to download, not the start of the bytes.

**4. The Two Speeds**
Think of your connection like a hallway.
*   **TTFB** is how fast the door opens.
*   **Throughput** is how wide the hallway is.
You can have a provider that takes 3 seconds to unseal a file (terrible TTFB) but then streams it to you at 1Gbps (amazing throughput). If you were streaming 4K video, the user would suffer a long initial buffer, but perfect playback afterwards. You need both numbers to know *which* part of the experience is broken.

### Production Considerations

**Sampling Frequency**: How often should you run this?
- **Too Frequent (e.g., every 10s)**: You will drain your wallet and potentially get rate-limited.
- **Too Sparse (e.g., every 6h)**: You will miss transient outages.
- **Recommended**: Every 5-15 minutes provides good granularity for trending without excessive cost.

**Geographic Bias**: Running this script from your laptop in London tests the performance **for users in London**. It tells you nothing about the experience in Tokyo. In production (as discussed in Part 3), you should deploy this prober to distributed cloud functions (AWS Lambda or Cloudflare Workers) to get a global view.

---

## Conclusion

You have successfully built the **Performance Layer** of your monitoring stack. You now have a tool that gives you objective truth about the network's behavior.

But speed is not the only metric that matters. Speed costs money.

In **[Part 2: Costs, Egress, & Alerts](./02-costs-and-alerts.md)**, we will explore the **Economic Layer**. We will learn how to track your "Burn Rate" in real-time and build an automated "Circuit Breaker" to protect your wallet from runaway costs.
