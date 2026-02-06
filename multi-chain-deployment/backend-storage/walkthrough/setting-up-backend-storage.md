# Setting Up Backend Storage

When building applications that span multiple blockchains, a fundamental challenge emerges: where do you store the actual data? Users might interact with your application on Base, Arbitrum, Polygon, or any other L2 chain, but those networks are optimized for computation and state management, not for storing large amounts of data. Putting significant data directly on-chain quickly becomes prohibitively expensive.

This walkthrough establishes the foundation for multi-chain storage architecture. You will set up a backend service that handles all Filecoin operations, enabling your application to accept payments on any chain while using Filecoin's decentralized storage for the actual data.

## Prerequisites

Before running this walkthrough, you must have:

- **tFIL in your wallet** - For gas fees (get from [Calibration Faucet](https://faucet.calibration.fildev.network/))
- **USDFC in your payment account** - For storage payments
- **Storage operator approved** - Permission for providers to charge you

> **Important**: Having USDFC in your wallet is not enough. You must deposit it into your payment account by running `storage-basics/payment-management` first. See that module for complete setup instructions.

## What This Walkthrough Covers

We will walk through eight areas that establish your backend storage infrastructure:

1. **Architecture Overview** - Understanding multi-chain storage patterns
2. **Backend Wallet Initialization** - Setting up the SDK with server-side credentials
3. **Balance Verification** - Checking both wallet and payment account balances
4. **Operator Approval** - Verifying storage providers can charge your account
5. **Upload Demonstration** - Storing data on Filecoin
6. **Download Demonstration** - Retrieving and verifying data
7. **Account Health** - Monitoring available funds and lockups
8. **Integration Patterns** - Connecting to web servers and APIs

Each step builds toward a production-ready backend storage service.

## Understanding Multi-Chain Storage Architecture

Traditional applications often couple their payment and storage systems. A user pays for storage on the same platform that provides it. Multi-chain architecture decouples these concerns.

**The Pattern**:
- Users interact with your frontend on their preferred L2 chain
- Payments happen on that L2 (Base USDC, Arbitrum ETH, Polygon MATIC)
- Your backend service receives payment confirmation
- Backend uploads data to Filecoin using its own funded wallet
- Users receive content identifiers (PieceCIDs) to access their data

This separation provides several advantages:

**Chain Agnostic**: Users never need Filecoin tokens. They pay with whatever they already have on their preferred chain. Your backend handles the Filecoin economy internally.

**Unified Storage**: All user data, regardless of which chain they used to pay, ends up in the same storage system. This simplifies data management and retrieval.

**Cost Control**: You can batch operations, optimize timing, and manage storage costs centrally rather than having each user individually navigate Filecoin economics.

**User Experience**: Users get a familiar payment experience on their chain of choice while benefiting from decentralized storage without knowing the technical details.

## Backend Wallet Architecture

Your backend operates a dedicated Filecoin wallet. This wallet holds funds and signs all storage transactions. Understanding its role is crucial for secure implementation.

**What the backend wallet does**:
- Holds tFIL for gas fees
- Maintains a payment account with USDFC deposits
- Signs upload and download requests
- Pays storage providers on behalf of all users

**What the backend wallet does NOT do**:
- Accept user payments (those happen on L2s)
- Store user credentials
- Provide direct access to users

The private key for this wallet should be treated as critical infrastructure. In production:
- Store in secure secret management (AWS Secrets Manager, HashiCorp Vault)
- Never commit to version control
- Rotate periodically with careful fund migration
- Consider multi-signature or threshold schemes for high-value deployments

## Step 1: Create the Backend Storage Script

Create a file named `index.js` in your `code` directory:

```javascript
import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

// Load .env.local first (if it exists), then .env
dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
    console.log("Backend Storage Setup for Multi-Chain Applications\n");
    console.log("This service handles Filecoin storage for any L2 chain.");
    console.log("Users pay on their preferred chain; storage happens on Filecoin.\n");

    // Step 1: Initialize Backend Wallet
    console.log("=== Step 1: Backend Wallet Initialization ===\n");

    const backendKey = process.env.PRIVATE_KEY;
    if (!backendKey) {
        throw new Error("Missing PRIVATE_KEY in environment");
    }

    const synapse = await Synapse.create({
        privateKey: backendKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("Backend SDK initialized successfully.");
    console.log("This wallet handles all Filecoin operations for your multi-chain app.\n");

    // Step 2: Check Wallet Balance (Gas)
    console.log("=== Step 2: Wallet Balance Check ===\n");

    const walletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
    const walletBalanceFormatted = Number(walletBalance) / 1e18;

    console.log(`Wallet USDFC Balance: ${walletBalanceFormatted.toFixed(4)} USDFC`);

    if (walletBalance === 0n) {
        console.log("\nWallet has no USDFC.");
        console.log("Get USDFC from: https://faucet.circle.com/ (select Filecoin Calibration)");
        console.log("Also ensure you have tFIL for gas from: https://faucet.calibration.fildev.network/");
    }

    // Step 3: Check Payment Account Balance
    console.log("\n=== Step 3: Payment Account Balance ===\n");

    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    const paymentBalanceFormatted = Number(paymentBalance) / 1e18;

    console.log(`Payment Account Balance: ${paymentBalanceFormatted.toFixed(4)} USDFC`);

    if (paymentBalance === 0n) {
        console.log("\nPayment account is empty.");
        console.log("You must deposit USDFC from wallet to payment account.");
        console.log("Run the storage-basics/payment-management tutorial first.");
        process.exit(1);
    }

    console.log("Payment account is funded and ready for storage operations.");

    // Step 4: Verify Operator Approval
    console.log("\n=== Step 4: Operator Approval ===\n");

    const operatorAddress = synapse.getWarmStorageAddress();
    const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    console.log(`Storage Operator: ${operatorAddress}`);
    console.log(`Approved: ${approval.isApproved}`);
    console.log(`Rate Allowance: ${(Number(approval.rateAllowance) / 1e18).toFixed(6)} USDFC/epoch`);
    console.log(`Lockup Allowance: ${(Number(approval.lockupAllowance) / 1e18).toFixed(4)} USDFC`);

    if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
        console.log("\nStorage operator not approved.");
        console.log("Run the storage-basics/payment-management tutorial to approve.");
        process.exit(1);
    }

    console.log("\nOperator approved. Backend is ready for storage operations.");

    // Step 5: Demo Upload
    console.log("\n=== Step 5: Demo Upload ===\n");

    const demoData = Buffer.from(
        `Multi-chain storage demo\n` +
        `Timestamp: ${new Date().toISOString()}\n` +
        `This data is stored on Filecoin but serves any L2 chain.\n` +
        `Backend wallet handles all storage payments.\n` +
        `Users on Base, Arbitrum, or Polygon can access this data.\n` +
        `Minimum upload size is 127 bytes - this message exceeds that.`
    );

    console.log(`Uploading ${demoData.length} bytes to Filecoin...`);
    console.log("(This may take 30-60 seconds)\n");

    let uploadResult;
    try {
        uploadResult = await synapse.storage.upload(demoData);

        console.log("Upload successful.");
        console.log(`PieceCID: ${uploadResult.pieceCid}`);
        console.log(`Size: ${uploadResult.size} bytes`);
        if (uploadResult.provider) {
            console.log(`Provider: ${uploadResult.provider}`);
        }
    } catch (error) {
        console.error("Upload failed:", error.message);
        process.exit(1);
    }

    // Step 6: Demo Download
    console.log("\n=== Step 6: Demo Download ===\n");

    console.log(`Downloading data for PieceCID: ${uploadResult.pieceCid}...`);

    try {
        const downloadedData = await synapse.storage.download(uploadResult.pieceCid);

        console.log("Download successful.");
        console.log(`Retrieved ${downloadedData.length} bytes`);
        console.log("\nContent:");
        const decoder = new TextDecoder();
        console.log(decoder.decode(downloadedData));

        // Verify integrity
        const matches = Buffer.compare(
            Buffer.from(demoData),
            Buffer.from(downloadedData)
        ) === 0;

        if (matches) {
            console.log("Integrity verified: Downloaded data matches original.");
        } else {
            console.log("Warning: Data mismatch detected.");
        }
    } catch (error) {
        console.error("Download failed:", error.message);
    }

    // Step 7: Account Health
    console.log("\n=== Step 7: Account Health ===\n");

    const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);

    console.log("Current Account Status:");
    console.log(`  Available: ${(Number(accountInfo.availableFunds) / 1e18).toFixed(4)} USDFC`);
    console.log(`  Locked: ${(Number(accountInfo.lockupCurrent) / 1e18).toFixed(4)} USDFC`);

    // Step 8: Integration Patterns
    console.log("\n=== Step 8: Integration Patterns ===\n");

    console.log("Your backend is ready to serve multi-chain applications:");
    console.log("");
    console.log("1. Express/Fastify API Pattern:");
    console.log("   POST /api/upload - Accept data, store on Filecoin, return PieceCID");
    console.log("   GET /api/download/:pieceCid - Retrieve data by PieceCID");
    console.log("");
    console.log("2. Multi-Chain Payment Flow:");
    console.log("   - User pays on Base/Arbitrum/Polygon");
    console.log("   - Your backend verifies payment via L2 RPC");
    console.log("   - Backend uploads to Filecoin using this SDK");
    console.log("   - User receives PieceCID for their data");

    console.log("\n=== Summary ===\n");
    console.log("Backend storage service configured successfully.");
    console.log(`- Payment account: ${paymentBalanceFormatted.toFixed(4)} USDFC available`);
    console.log(`- Operator approved: ${approval.isApproved}`);
    console.log(`- Demo upload/download: Complete`);
    console.log("\nNext: Implement payment tracking (walkthrough 2) or NFT metadata (walkthrough 3).");
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
```

This script establishes your complete backend storage infrastructure.

## Understanding the Code

### SDK Initialization

```javascript
const synapse = await Synapse.create({
    privateKey: backendKey,
    rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
});
```

The SDK initializes with your backend wallet's private key. This differs from user-facing wallets in several ways:

- **Server-side execution**: This runs on your servers, not in browsers
- **Persistent connection**: The SDK instance can live for the lifetime of your server
- **Centralized responsibility**: One wallet handles all user operations

In production, you might initialize the SDK once at server startup and reuse it across requests.

### Dual Balance Checking

```javascript
const walletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
```

Two distinct balances matter:

1. **Wallet Balance**: USDFC sitting in your Ethereum-compatible wallet, not yet deposited into the payment system. This is like cash in your pocket.

2. **Payment Account Balance**: USDFC deposited into Filecoin's payment infrastructure, available for storage operations. This is like money in your storage account.

Your backend needs payment account funds to perform uploads. Wallet funds must be deposited first.

### Operator Verification

```javascript
const operatorAddress = synapse.getWarmStorageAddress();
const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);
```

Storage operators must be explicitly approved to charge your payment account. This approval includes:

- **Rate Allowance**: Maximum USDFC per epoch the operator can charge
- **Lockup Allowance**: Maximum USDFC that can be locked for ongoing deals

Without approval, uploads fail because providers cannot collect payment.

### Upload and Download

```javascript
const uploadResult = await synapse.storage.upload(demoData);
const downloadedData = await synapse.storage.download(uploadResult.pieceCid);
```

The upload returns a PieceCID - a content-addressed identifier derived from your data. This identifier:

- Works globally across any provider storing the data
- Never expires (as long as storage deals remain active)
- Enables verification that downloaded data matches what was uploaded

### Account Health

```javascript
const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);
```

Monitor your account health to ensure continuous operation:

- **availableFunds**: USDFC ready for new operations
- **lockupCurrent**: USDFC locked in active storage deals

Set up monitoring to alert when available funds drop below thresholds.

## Step 2: Run the Script

Navigate to the `code` directory and execute:

```bash
cd multi-chain-deployment/backend-storage/code
npm install
cp .env.example .env.local
# Edit .env.local with your private key
npm start
```

Expected output (abbreviated):

```
Backend Storage Setup for Multi-Chain Applications

This service handles Filecoin storage for any L2 chain.
Users pay on their preferred chain; storage happens on Filecoin.

=== Step 1: Backend Wallet Initialization ===

Backend SDK initialized successfully.
This wallet handles all Filecoin operations for your multi-chain app.

=== Step 2: Wallet Balance Check ===

Wallet USDFC Balance: 5.0000 USDFC

=== Step 3: Payment Account Balance ===

Payment Account Balance: 4.5000 USDFC
Payment account is funded and ready for storage operations.

=== Step 4: Operator Approval ===

Storage Operator: 0x...
Approved: true
Rate Allowance: 0.001000 USDFC/epoch
Lockup Allowance: 10.0000 USDFC

Operator approved. Backend is ready for storage operations.

=== Step 5: Demo Upload ===

Uploading 280 bytes to Filecoin...
(This may take 30-60 seconds)

Upload successful.
PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
Size: 512 bytes

=== Step 6: Demo Download ===

Download successful.
Integrity verified: Downloaded data matches original.

=== Summary ===

Backend storage service configured successfully.
```

Your backend storage service is now operational.

## Web Server Integration

In production, you would wrap this functionality in an API server. Here is a minimal Express pattern:

```javascript
import express from 'express';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

const app = express();
app.use(express.json());

// Initialize SDK once at startup
let synapse;
async function initSDK() {
    synapse = await Synapse.create({
        privateKey: process.env.PRIVATE_KEY,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });
}

app.post('/api/upload', async (req, res) => {
    try {
        const data = Buffer.from(req.body.data, 'base64');
        const result = await synapse.storage.upload(data);
        res.json({ pieceCid: result.pieceCid, size: result.size });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/download/:pieceCid', async (req, res) => {
    try {
        const data = await synapse.storage.download(req.params.pieceCid);
        res.json({ data: Buffer.from(data).toString('base64') });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

initSDK().then(() => {
    app.listen(3000, () => console.log('Backend storage API running'));
});
```

This pattern separates storage operations from payment verification, which happens in a different layer.

## Production Considerations

### Secret Management

Never hardcode or commit private keys:

```javascript
// Development
dotenv.config({ path: '.env.local' });

// Production - use your cloud provider's secret manager
const privateKey = await getSecret('backend-storage-key');
```

### Error Handling

Wrap all SDK calls in try-catch blocks and implement retries for transient failures:

```javascript
async function uploadWithRetry(data, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await synapse.storage.upload(data);
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}
```

### Monitoring

Track key metrics:
- Payment account balance
- Upload success/failure rates
- Average upload latency
- Operator approval status

Set up alerts when balances drop below operational thresholds.

## Troubleshooting

**"Payment account is empty"**

Your payment account has no USDFC deposited. Run `storage-basics/payment-management` first to deposit funds.

**"Storage operator not approved"**

The warm storage operator is not approved to charge your account. Run `storage-basics/payment-management` to approve the operator.

**"Upload failed"**

Check your payment account balance and operator approval. Also verify network connectivity to the Filecoin testnet.

## Conclusion

You have established a backend storage service that can support any multi-chain application. The key architectural insight is separation of concerns: payments happen on L2 chains where your users already are, while storage happens on Filecoin through your backend service.

This foundation enables the patterns in subsequent walkthroughs: tracking payments and managing quotas across chains, and storing NFT metadata with IPFS-compatible addressing.

The backend wallet acts as a bridge between the diverse L2 ecosystem and Filecoin's storage network. Users never need to interact with Filecoin directly. They pay with familiar tokens on familiar chains. Your backend translates those payments into decentralized storage.
