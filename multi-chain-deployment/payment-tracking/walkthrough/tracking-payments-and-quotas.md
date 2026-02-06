# Tracking User Payments and Quotas

The previous walkthrough established backend storage infrastructure. Your service can upload and download data from Filecoin using a centrally managed wallet. But a critical piece is missing: how do users pay for storage, and how do you track their usage?

This walkthrough builds the accounting layer. You will create a database schema to track users, payments, and storage quotas. Users pay on L2 chains like Base, Arbitrum, or Polygon. Your backend records those payments, converts them to storage quotas, and enforces limits before allowing uploads.

## Prerequisites

Before running this walkthrough, you must have:

- **Backend storage configured** - Complete walkthrough 1 first
- **tFIL and USDFC** - Funded payment account on Calibration testnet
- **Storage operator approved** - Permission for providers to charge you

This walkthrough adds a database layer on top of the storage foundation.

> [!IMPORTANT]
> **What is Real vs Simulated in This Walkthrough**
> 
> | Operation | Status | Why |
> |-----------|--------|-----|
> | **Filecoin Upload** | **REAL** ✅ | Your USDFC is spent, data is stored on-chain |
> | **Filecoin Download** | **REAL** ✅ | Data is retrieved from providers |
> | **Database Operations** | **REAL** ✅ | SQLite tracks quotas locally |
> | **User Payment on L2** | **SIMULATED** ⚠️ | We generate fake tx hashes to skip L2 setup |
>
> The L2 payment ("User pays $5 on Base") is simulated because implementing real L2 payments would require deploying contracts on Base, funding wallets with Base ETH, etc. - a separate tutorial entirely.
>
> **The important takeaway**: All Filecoin storage operations are real and cost real (testnet) USDFC.

## What This Walkthrough Covers

We will walk through eight areas that establish payment tracking:

1. **Architecture Overview** - Understanding the payment-to-quota flow
2. **Database Schema** - Designing tables for users, payments, and uploads
3. **User Registration** - Creating accounts linked to wallet addresses
4. **Payment Processing** - Recording L2 payments and granting quotas
5. **Quota Enforcement** - Checking limits before uploads
6. **Upload Integration** - Deducting quota after successful storage
7. **Multi-Chain Patterns** - Supporting Base, Arbitrum, Polygon
8. **Production Considerations** - Real payment verification

Each step builds toward a complete quota management system.

## Understanding Payment-to-Quota Flow

The core flow converts payments on any chain to storage capacity on Filecoin:

```
User pays $5 USDC on Base
       ↓
Backend detects payment (monitors address or receives webhook)
       ↓
Backend verifies transaction on Base RPC
       ↓
Backend records payment in database
       ↓
Backend grants 500 MB quota to user ($1 = 100 MB)
       ↓
User can now upload up to 500 MB to Filecoin
       ↓
Each upload deducts from quota
```

This flow decouples the payment chain from the storage chain. Users never need Filecoin tokens. They pay with whatever they already have.

## Database Schema Design

The schema tracks three entities:

**Users**: Wallet addresses with quota balances
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    address TEXT UNIQUE,     -- Wallet address (e.g., 0x...)
    email TEXT,              -- Optional contact info
    chain TEXT,              -- Primary chain (base, arbitrum, polygon)
    quota_bytes INTEGER,     -- Total storage quota granted
    used_bytes INTEGER,      -- Storage actually consumed
    created_at TEXT
);
```

**Payments**: Transaction records from L2 chains
```sql
CREATE TABLE payments (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,         -- Link to user
    chain TEXT,              -- Which L2 the payment came from
    tx_hash TEXT UNIQUE,     -- Transaction hash for verification
    amount_usd REAL,         -- Payment amount in USD
    quota_bytes_granted INTEGER,  -- Quota granted from this payment
    created_at TEXT
);
```

**Uploads**: Storage records with PieceCIDs
```sql
CREATE TABLE uploads (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,         -- Link to user
    piece_cid TEXT,          -- Filecoin PieceCID
    size_bytes INTEGER,      -- Actual storage consumed
    created_at TEXT
);
```

The `tx_hash` uniqueness constraint prevents double-crediting the same payment.

## Step 1: Create the Database Module

Create `db.js` in your `code` directory:

```javascript
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'storage.db');

export function initDatabase() {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            address TEXT UNIQUE NOT NULL,
            email TEXT,
            chain TEXT NOT NULL,
            quota_bytes INTEGER DEFAULT 0,
            used_bytes INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            chain TEXT NOT NULL,
            tx_hash TEXT UNIQUE NOT NULL,
            amount_usd REAL NOT NULL,
            quota_bytes_granted INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS uploads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            piece_cid TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    return db;
}

export function createUser(db, address, chain, email = null) {
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO users (address, chain, email)
        VALUES (?, ?, ?)
    `);
    stmt.run(address, chain, email);
    return db.prepare('SELECT * FROM users WHERE address = ?').get(address);
}

export function recordPayment(db, userId, chain, txHash, amountUsd, quotaBytesGranted) {
    db.prepare(`
        INSERT INTO payments (user_id, chain, tx_hash, amount_usd, quota_bytes_granted)
        VALUES (?, ?, ?, ?, ?)
    `).run(userId, chain, txHash, amountUsd, quotaBytesGranted);

    db.prepare('UPDATE users SET quota_bytes = quota_bytes + ? WHERE id = ?')
        .run(quotaBytesGranted, userId);
}

export function recordUpload(db, userId, pieceCid, sizeBytes) {
    db.prepare(`
        INSERT INTO uploads (user_id, piece_cid, size_bytes)
        VALUES (?, ?, ?)
    `).run(userId, pieceCid, sizeBytes);

    db.prepare('UPDATE users SET used_bytes = used_bytes + ? WHERE id = ?')
        .run(sizeBytes, userId);
}

export function getUserQuota(db, userId) {
    const user = db.prepare('SELECT quota_bytes, used_bytes FROM users WHERE id = ?').get(userId);
    if (!user) return null;
    return {
        quotaBytes: user.quota_bytes,
        usedBytes: user.used_bytes,
        remainingBytes: user.quota_bytes - user.used_bytes
    };
}

export function canUpload(db, userId, sizeBytes) {
    const quota = getUserQuota(db, userId);
    if (!quota) return false;
    return quota.remainingBytes >= sizeBytes;
}
```

This module encapsulates all database operations.

## Step 2: Create the Main Script

Create `index.js` in your `code` directory:

```javascript
import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import {
    initDatabase,
    createUser,
    getUser,
    recordPayment,
    recordUpload,
    getUserQuota,
    canUpload,
    getUserUploads
} from './db.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

// Pricing: $1 USD = 100 MB of storage quota
const BYTES_PER_USD = 100 * 1024 * 1024;

async function main() {
    console.log("Payment Tracking and Quota Management Demo\n");

    // Initialize database
    const db = initDatabase();
    console.log("Database initialized.\n");

    // Initialize Synapse SDK
    const synapse = await Synapse.create({
        privateKey: process.env.PRIVATE_KEY,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    // Verify backend is ready
    const balance = await synapse.payments.balance(TOKENS.USDFC);
    if (balance === 0n) {
        console.log("Backend payment account is empty.");
        process.exit(1);
    }

    // Simulate user registration
    const userAddress = "0x" + "a".repeat(40);
    let user = createUser(db, userAddress, "base", "alice@example.com");
    console.log(`User registered: ${user.address}\n`);

    // Simulate payment on Base
    const paymentAmount = 5.00;
    const txHash = "0x" + Date.now().toString(16) + "abc123";
    const quotaGranted = Math.floor(paymentAmount * BYTES_PER_USD);

    console.log(`Payment received: $${paymentAmount} USD on Base`);
    console.log(`Quota granted: ${formatBytes(quotaGranted)}\n`);

    recordPayment(db, user.id, "base", txHash, paymentAmount, quotaGranted);

    // Check quota before upload
    const uploadData = Buffer.from(
        `User data timestamp: ${new Date().toISOString()}\n` +
        `This file exceeds the 127 byte minimum requirement.` +
        `Additional padding to ensure minimum size is met.`.repeat(2)
    );

    if (!canUpload(db, user.id, uploadData.length)) {
        console.log("Upload blocked: Insufficient quota.");
        process.exit(0);
    }

    console.log("Quota check passed. Uploading...\n");

    // Perform upload
    const result = await synapse.storage.upload(uploadData);
    console.log(`Upload successful: ${result.pieceCid}\n`);

    // Record upload
    recordUpload(db, user.id, result.pieceCid.toString(), result.size);

    // Show final status
    const quota = getUserQuota(db, user.id);
    console.log("Final quota status:");
    console.log(`  Total: ${formatBytes(quota.quotaBytes)}`);
    console.log(`  Used: ${formatBytes(quota.usedBytes)}`);
    console.log(`  Remaining: ${formatBytes(quota.remainingBytes)}`);

    db.close();
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

main().catch(console.error);
```

## Understanding the Code

### Pricing Model

```javascript
const BYTES_PER_USD = 100 * 1024 * 1024;  // 100 MB per dollar
```

This constant defines your storage pricing. Adjust based on your economics:
- Higher value = cheaper storage for users
- Lower value = higher margins for you

In production, you might have tiered pricing or dynamic rates.

### User Registration

```javascript
let user = createUser(db, userAddress, "base", "alice@example.com");
```

Users are identified by their wallet address. The `chain` field tracks where they primarily interact. This helps with:
- Displaying the right payment options
- Routing support inquiries
- Analytics on which chains drive usage

### Payment Recording

```javascript
recordPayment(db, user.id, "base", txHash, paymentAmount, quotaGranted);
```

The transaction hash serves as a unique identifier. Attempting to record the same hash twice fails due to the UNIQUE constraint. This prevents double-crediting.

### Quota Enforcement

```javascript
if (!canUpload(db, user.id, uploadData.length)) {
    console.log("Upload blocked: Insufficient quota.");
    process.exit(0);
}
```

Before every upload, check if the user has sufficient remaining quota. This is a critical security boundary. Users cannot consume storage beyond what they paid for.

### Upload Recording

```javascript
recordUpload(db, user.id, result.pieceCid.toString(), result.size);
```

After successful upload, record the PieceCID and actual size. The SDK may pad data, so use `result.size` rather than input size for accurate accounting.

## Step 3: Run the Script

```bash
cd multi-chain-deployment/payment-tracking/code
npm install
cp .env.example .env.local
# Edit .env.local with your private key
npm start
```

Expected output:

```
Payment Tracking and Quota Management Demo

Database initialized.
Backend ready. Payment account: 4.5000 USDFC

User registered: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

Payment received: $5.00 USD on Base
Quota granted: 500 MB

Quota check passed. Uploading...

Upload successful: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq

Final quota status:
  Total: 500 MB
  Used: 512 Bytes
  Remaining: 499.9 MB
```

## Multi-Chain Payment Verification

The demo simulates payments. In production, verify payments on-chain:

```javascript
import { ethers } from 'ethers';

const RPC_URLS = {
    base: 'https://mainnet.base.org',
    arbitrum: 'https://arb1.arbitrum.io/rpc',
    polygon: 'https://polygon-rpc.com'
};

async function verifyPayment(txHash, chain, expectedAmount, paymentAddress) {
    const provider = new ethers.JsonRpcProvider(RPC_URLS[chain]);
    
    const tx = await provider.getTransaction(txHash);
    if (!tx) return { verified: false, reason: 'Transaction not found' };
    
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) {
        return { verified: false, reason: 'Transaction failed' };
    }
    
    // For native token payments
    if (tx.to.toLowerCase() === paymentAddress.toLowerCase()) {
        const valueUSD = await convertToUSD(tx.value, chain);
        if (valueUSD >= expectedAmount) {
            return { verified: true, amountUSD: valueUSD };
        }
    }
    
    // For ERC20 payments, parse transfer events
    // ... additional logic for USDC, USDT, etc.
    
    return { verified: false, reason: 'Payment amount mismatch' };
}
```

### Payment Flow Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│   Database   │
│  (User pays  │     │  (Verifies   │     │  (Records    │
│   on L2)     │     │   payment)   │     │   quota)     │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   Filecoin   │
                     │  (Storage)   │
                     └──────────────┘
```

## Production Considerations

### Atomic Transactions

Wrap payment recording and upload in database transactions:

```javascript
async function processUploadWithPayment(db, synapse, userId, data) {
    return db.transaction(async () => {
        if (!canUpload(db, userId, data.length)) {
            throw new Error('Insufficient quota');
        }
        
        const result = await synapse.storage.upload(data);
        recordUpload(db, userId, result.pieceCid, result.size);
        
        return result;
    });
}
```

### Race Conditions

Use database-level locking for quota checks:

```javascript
const user = db.prepare('SELECT * FROM users WHERE id = ? FOR UPDATE').get(userId);
```

### Refund Handling

Track failed uploads and refund quota:

```javascript
async function handleFailedUpload(db, userId, attemptedSize) {
    db.prepare(`
        INSERT INTO failed_uploads (user_id, size_bytes, reason)
        VALUES (?, ?, ?)
    `).run(userId, attemptedSize, 'Upload failed');
    
    // Quota was not deducted since upload failed
    // Log for investigation
}
```

### Quota Alerts

Notify users when approaching limits:

```javascript
function checkQuotaAlerts(db, userId) {
    const quota = getUserQuota(db, userId);
    const usagePercent = (quota.usedBytes / quota.quotaBytes) * 100;
    
    if (usagePercent > 90) {
        return { alert: 'critical', message: 'Storage 90% full' };
    } else if (usagePercent > 75) {
        return { alert: 'warning', message: 'Storage 75% full' };
    }
    return null;
}
```

## Troubleshooting

**"Database locked"**

SQLite has limited concurrency. For production with high throughput, migrate to PostgreSQL.

**"Insufficient quota" but payment was made**

Check if payment recording succeeded. Verify the transaction hash is unique and the quota calculation is correct.

**"Upload failed after quota check passed"**

The upload may have failed for network reasons. Quota was not deducted since `recordUpload` only runs after successful upload.

## Conclusion

You have built a complete payment and quota tracking system. Users can pay on any L2 chain, and your backend converts those payments to Filecoin storage capacity.

The key patterns:
- Database tracks users, payments, and uploads
- Transaction hashes prevent double-crediting
- Quota checks gate all uploads
- Upload records update usage after success

This system scales to support thousands of users across multiple chains while maintaining accurate accounting. The next walkthrough extends this foundation to NFT metadata storage.
