# Implementing the dApp-Pays Payment Architecture

The previous walkthrough established User-Pays architecture where end-users control their wallets, fund their accounts, and pay providers directly. That model maximizes decentralization but imposes significant onboarding friction. Users must understand crypto, acquire tokens, and configure payment accounts before using your application.

This walkthrough introduces the **dApp-Pays Model** - the opposite approach where your application maintains a funded treasury and covers all storage costs for users. From the user's perspective, storage is free. They upload files, download content, and never see a transaction or manage a wallet. Your application absorbs the cost and manages the economic infrastructure invisibly.

Understanding dApp-Pays architecture matters because most mainstream applications need Web2-like onboarding. Users expect to sign up with email and start using your product immediately. Requiring wallet setup and token acquisition destroys conversion rates. dApp-Pays solves this by hiding blockchain complexity entirely.

## Prerequisites

Before running this walkthrough, you must have:

- **tFIL in your wallet** - For gas fees (get from [Calibration Faucet](https://faucet.calibration.fildev.network/))
- **USDFC in your payment account** - For storage payments
- **Storage operator approved** - Permission for providers to charge you

> **Important**: Having USDFC in your wallet is not enough. You must deposit it into your payment account by running `storage-basics/payment-management` first. See [prerequisites.md](../prerequisites.md) for complete setup instructions.

This walkthrough builds on those foundations while shifting the economic responsibility from user to application.

## What This Walkthrough Covers

We will walk through six areas that demonstrate dApp-Pays architecture:

1. **Architectural Overview** - Understanding the sponsorship model and its tradeoffs
2. **Treasury Setup** - How your application manages funds
3. **User Authentication** - Separating identity from wallet connection
4. **Sponsored Upload** - Performing storage operations on behalf of users
5. **PieceCID Mapping** - Linking on-chain data to application users
6. **Treasury Monitoring** - Ensuring your application remains solvent

Each step reveals how your application becomes the economic actor in storage transactions while users remain uninvolved financially.

## Understanding the dApp-Pays Model

In dApp-Pays architecture, your application operates a **treasury wallet** - an Ethereum account holding tFIL (for gas) and USDFC (for storage). This wallet has its own payment account, already funded and with operator approvals configured. When users interact with your application, the treasury wallet signs all transactions and pays all costs.

![dapp-pays-model](https://raw.githubusercontent.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/refs/heads/main/payment-architecture/dapp-pays/images/1.png)

The user experience transforms completely:

**For users:**
- Zero crypto knowledge required
- No wallet connection
- No token management
- No transaction signing
- Free storage (from their perspective)

**For your application:**
- 100% of storage costs fall on you
- Treasury management becomes critical infrastructure
- You control the on-chain data relationships
- Billing and monetization happen through traditional means

This mirrors how centralized cloud storage works. When you use Dropbox, you don't pay AWS directly for S3 storage. Dropbox maintains AWS accounts, handles payments, and either gives you free tier or charges you through their own billing system. dApp-Pays replicates this model on Filecoin.

The practical implication: **you own the storage deals**. The blockchain shows your treasury address as the payer, not users. Users have no direct relationship with storage providers. If your application shuts down or you stop paying, users lose access to "their" data.

This creates different trust assumptions than User-Pays. Users must trust your application to maintain payments and provide access. You cannot credibly offer censorship-resistant storage because you control the payment mechanism.

## How dApp-Pays Architecture Works

The dApp-Pays flow inverts the User-Pays relationship:

![dapp-pays-flow](https://raw.githubusercontent.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/refs/heads/main/payment-architecture/dapp-pays/images/2.png)

### Phase 1: Treasury Preparation (One-Time Setup)

Before your application launches, you:
1. Generate a treasury wallet with a secure private key
2. Fund the wallet with tFIL for gas
3. Deposit USDFC into the treasury's payment account
4. Approve storage operators to charge the treasury

This setup mirrors what individual users do in User-Pays, but you do it once and share across all users.

### Phase 2: User Authentication (Per Session)

When users access your application, authenticate them through traditional means:
- Email/password
- OAuth (Google, GitHub, etc.)
- Magic links
- Phone number verification

Wallet connection is irrelevant because you're paying, not them. Your application maintains its own user database mapping userIds to their data.

### Phase 3: Sponsored Operation (Per Request)

When a user uploads data:
1. Your backend receives the file
2. Your backend authenticates the user (traditional auth)
3. Your backend calls the Synapse SDK using **treasury credentials**
4. The treasury pays for storage
5. Your backend stores the mapping: userId → PieceCID

The user never sees blockchain transactions. From their perspective, they clicked "upload" and the file is now stored.

### Phase 4: Data Retrieval (Per Request)

When a user downloads data:
1. Your backend authenticates the user
2. Your backend looks up their PieceCIDs in your database
3. Your backend retrieves data using the PieceCID
4. Your backend serves the data to the user

Downloads typically don't cost USDFC (depending on provider terms), but your backend handles retrieval regardless.

### Phase 5: Treasury Maintenance (Ongoing)

Your application must monitor treasury health:
- Available USDFC balance
- Locked funds in active deals
- Incoming lockup requirements for new uploads
- Alert thresholds for refunding

Running out of treasury funds breaks your entire application.

## Step 1: Scaffold the Project

The dApp-Pays model positions your application as the economic actor. The project you build here represents that backend — the piece of infrastructure that holds treasury credentials and sponsors storage on behalf of users. Getting the scaffolding right matters because a misconfigured module system or a missing dependency produces errors that look like SDK bugs but are really project setup issues.

**Create a dedicated directory:**

```bash
mkdir dapp-pays-demo
cd dapp-pays-demo
```

**Initialize and configure the project:**

```bash
npm init -y
```

Replace the generated `package.json` contents with:

```json
{
  "name": "dapp-pays-demo",
  "version": "1.0.0",
  "description": "Demonstration of dApp-Pays (Sponsored) payment model",
  "type": "module",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "@filoz/synapse-sdk": "^0.36.1",
    "dotenv": "^16.4.5"
  }
}
```

The `"type": "module"` entry tells Node.js to interpret `.js` files as ES modules. Without it, the `import` statements the SDK requires will fail with a syntax error before your code even runs.

**Pull in the dependencies:**

```bash
npm install
```

This installs two packages:

- **@filoz/synapse-sdk** — the Filecoin interface that handles wallet operations, storage deals, and payment account management behind clean method calls.
- **dotenv** — reads environment variables from a local file so your treasury key never touches source code.

**Store your treasury credentials:**

Create a `.env` file at the project root:

```
PRIVATE_KEY=your_treasury_private_key_here
```

In this architecture, this key represents your *application's treasury wallet* — the account that funds storage for all users. Export it from MetaMask (Account Details → Show Private Key) and paste it here. This should be the same wallet you funded with tFIL and deposited USDFC into during the prerequisites.

In production, a `.env` file is insufficient. Treasury keys warrant secrets management infrastructure (AWS Secrets Manager, HashiCorp Vault, or similar). For this walkthrough, `.env` keeps things focused on architecture rather than DevOps.

**Protect the key from version control:**

```
node_modules/
.env
```

Save that as `.gitignore`. A leaked treasury key is worse than a leaked user key — it drains the account that your entire application depends on, not just one user's funds. Treat this habit as non-negotiable from day one.

## Step 2: Create the dApp-Pays Script

Create `index.js` in your project directory:

```javascript
import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

// Load .env.local first (if it exists), then .env
dotenv.config({ path: '.env.local' });
dotenv.config();

// Simulated application database
const APPLICATION_DB = {
    users: {
        "user_alice": { email: "alice@example.com", uploads: [] },
        "user_bob": { email: "bob@example.com", uploads: [] }
    }
};

async function main() {
    console.log("dApp-Pays Architecture Demo\n");
    console.log("In this model, the application treasury pays for all storage.");
    console.log("Users never interact with wallets or tokens.\n");

    // Step 1: Initialize Treasury Connection
    const treasuryKey = process.env.PRIVATE_KEY;
    if (!treasuryKey) {
        throw new Error("Missing PRIVATE_KEY (Treasury wallet key)");
    }

    const treasury = await Synapse.create({
        privateKey: treasuryKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("=== Step 1: Treasury Initialized ===");
    console.log("SDK connected with treasury wallet credentials.");
    console.log("This wallet is controlled by your application, not users.\n");

    // Step 2: Verify Treasury Solvency
    console.log("=== Step 2: Treasury Solvency Check ===");

    const balance = await treasury.payments.balance(TOKENS.USDFC);
    const balanceFormatted = Number(balance) / 1e18;

    console.log(`Treasury Balance: ${balance.toString()} (raw units)`);
    console.log(`Formatted: ${balanceFormatted.toFixed(4)} USDFC`);

    if (balance === 0n) {
        console.log("\nTreasury is empty. Your application cannot sponsor uploads.");
        console.log("Fund the treasury's payment account before accepting user uploads.");
        process.exit(1);
    }

    // Check account info for ongoing obligations
    const health = await treasury.payments.accountInfo(TOKENS.USDFC);
    console.log(`\nTreasury Info:`);
    console.log(`  Available: ${(Number(health.availableFunds) / 1e18).toFixed(4)} USDFC`);
    console.log(`  Locked: ${(Number(health.lockupCurrent) / 1e18).toFixed(4)} USDFC`);
    console.log("Treasury is solvent.\n");

    // Step 3: Verify Operator Approval
    console.log("=== Step 3: Operator Approval ===");
    const operatorAddress = treasury.getWarmStorageAddress();
    const approval = await treasury.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    console.log(`Storage Operator: ${operatorAddress}`);
    console.log(`Approved: ${approval.isApproved}`);

    if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
        console.log("\nStorage operator is not approved.");
        console.log("Please run the payment-management tutorial first.");
        process.exit(1);
    }
    console.log("Operator approved.\n");

    // Step 4: Simulate User Request
    console.log("=== Step 4: Simulated User Request ===");

    const userId = "user_alice";
    const user = APPLICATION_DB.users[userId];

    console.log(`Authenticated user: ${userId}`);
    console.log(`Email: ${user.email}`);
    console.log("User authenticated via traditional OAuth/session - no wallet involved.\n");

    const userData = Buffer.from(
        `Document created by ${userId}\n` +
        `Email: ${user.email}\n` +
        `Created: ${new Date().toISOString()}\n` +
        `This file is stored by the application treasury, not the user.\n` +
        `The application sponsors all storage costs on behalf of users.\n` +
        `Minimum upload size is 127 bytes.`
    );

    console.log(`User submitted ${userData.length} bytes for upload.`);

    // Step 5: Sponsored Upload
    console.log("\n=== Step 5: Sponsored Upload ===");
    console.log("Application treasury is signing and paying for this upload.");
    console.log("User will not see any transaction or pay any fees.\n");

    console.log("Uploading to Filecoin network...");
    console.log("(This may take 30-60 seconds)\n");

    let uploadResult;
    try {
        uploadResult = await treasury.storage.upload(userData);

        console.log("Upload successful.");
        console.log(`PieceCID: ${uploadResult.pieceCid}`);
        console.log(`Size: ${uploadResult.size} bytes`);
        if (uploadResult.provider) {
            console.log(`Provider: ${uploadResult.provider}`);
        }
        console.log(`Sponsor: Application Treasury`);
    } catch (error) {
        console.error("Sponsored upload failed:", error.message);
        process.exit(1);
    }

    // Step 6: Update Application Database
    console.log("\n=== Step 6: Database Update ===");

    user.uploads.push({
        pieceCid: uploadResult.pieceCid,
        size: uploadResult.size,
        uploadedAt: new Date().toISOString(),
        sponsoredBy: "treasury"
    });

    console.log(`Recorded upload for ${userId}:`);
    console.log(`  PieceCID: ${uploadResult.pieceCid}`);
    console.log(`  Database now tracks this PieceCID belongs to ${userId}`);
    console.log("  This mapping only exists in your app - not on-chain.\n");

    console.log("User's storage inventory:");
    user.uploads.forEach((upload, index) => {
        console.log(`  ${index + 1}. ${upload.pieceCid.toString().substring(0, 30)}...`);
        console.log(`     Size: ${upload.size} bytes, Uploaded: ${upload.uploadedAt}`);
    });

    // Step 7: Verify Economic Relationship
    console.log("\n=== Step 7: Economic Verification ===");

    const rails = await treasury.payments.getRailsAsPayer(TOKENS.USDFC);
    const activeRails = rails.filter(r => !r.isTerminated);

    console.log(`Treasury has ${activeRails.length} active payment rails.`);
    console.log("Treasury is the payer on all rails.");
    console.log("Users have no on-chain payment relationship with providers.\n");

    // Step 8: Treasury Health After Operation
    console.log("=== Step 8: Post-Operation Treasury Health ===");

    const newHealth = await treasury.payments.accountInfo(TOKENS.USDFC);
    console.log(`Updated Treasury Info:`);
    console.log(`  Available: ${(Number(newHealth.availableFunds) / 1e18).toFixed(4)} USDFC`);
    console.log(`  Locked: ${(Number(newHealth.lockupCurrent) / 1e18).toFixed(4)} USDFC`);

    const lockupIncrease = Number(newHealth.lockupCurrent) - Number(health.lockupCurrent);
    if (lockupIncrease > 0) {
        console.log(`  New lockup from this upload: ${(lockupIncrease / 1e18).toFixed(6)} USDFC`);
    }

    console.log("\n=== Summary ===");
    console.log("dApp-Pays architecture complete.");
    console.log("- Treasury funded and managed by application");
    console.log("- User authenticated via traditional means (no wallet)");
    console.log("- Upload executed and paid by treasury");
    console.log("- PieceCID mapped to user in application database");
    console.log("- User experience: upload file, done. No crypto complexity.");
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
```

This script demonstrates the complete dApp-Pays workflow with treasury management and user mapping.

## Understanding the Code

### Treasury Initialization

```javascript
const treasury = await Synapse.create({
    privateKey: treasuryKey,
    rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
});
```

The critical distinction from User-Pays: **this private key belongs to your application, not users**. You control it. You store it securely (environment variables, secrets manager, HSM). You never share it with users.

In production, this key requires extreme protection. If compromised, attackers can drain your treasury. Standard practices apply:
- Never commit to version control
- Use secrets management (AWS Secrets Manager, HashiCorp Vault)
- Consider HSM or threshold signatures for high-value treasuries
- Implement multi-sig for large fund movements

### Treasury Solvency Verification

```javascript
const balance = await treasury.payments.balance(TOKENS.USDFC);

if (balance === 0n) {
    console.log("Treasury is empty.");
    process.exit(1);
}

const info = await treasury.payments.accountInfo(TOKENS.USDFC);
```

Before accepting uploads, verify your treasury can pay. The `accountInfo()` method provides richer information than simple balance:

- `availableFunds`: USDFC currently available for new operations
- `lockupCurrent`: USDFC already committed to ongoing deals
- `lockupRate`: Rate of USDFC being consumed per epoch

Monitoring these metrics prevents service interruptions. If `fundedUntilEpoch` drops below acceptable thresholds, trigger alerts to refund the treasury.

### Simulated User Authentication

```javascript
const userId = "user_alice";
const user = APPLICATION_DB.users[userId];
```

This simulates traditional user authentication. In production:

```javascript
// Express.js example
app.post('/api/upload', authenticate, async (req, res) => {
    const userId = req.session.userId; // From OAuth, JWT, etc.
    const file = req.body.file;
    
    // Proceed with sponsored upload using treasury credentials
});
```

Users authenticate through your existing systems. They never connect wallets because they're not paying. Your application validates their identity, accepts their data, and handles storage using treasury funds.

### Sponsored Upload Execution

```javascript
uploadResult = await treasury.storage.upload(userData);
```

The upload call looks identical to User-Pays, but the identity context differs completely. The `treasury` variable holds your application's credentials. The resulting storage deal names your treasury as the payer.

Users have no visibility into this transaction. They don't sign anything. They don't see gas fees. From their perspective, data upload is a pure API call that either succeeds or fails.

### Database Mapping

```javascript
user.uploads.push({
    pieceCid: uploadResult.pieceCid,
    size: uploadResult.size,
    uploadedAt: new Date().toISOString(),
    sponsoredBy: treasuryAddress
});
```

This step is **critical and unique to dApp-Pays**. The blockchain doesn't know about alice@example.com. It only knows that your treasury stored a piece with a specific PieceCID. The association between that PieceCID and "user_alice" exists only in your application database.

You must maintain this mapping reliably:
- If you lose it, users lose access to their data
- If you corrupt it, users access wrong data
- If you delete it, data becomes orphaned on-chain

This is an operational responsibility you accept in exchange for user convenience.

### Economic Verification

```javascript
const rails = await treasury.payments.getRailsAsPayer(TOKENS.USDFC);
```

Checking payment rails confirms the expected economic structure: your treasury is the payer on all rails. Users appear nowhere in on-chain payment relationships.

This verification step helps during debugging. If you accidentally created rails under a user context (due to a bug), this check would reveal the discrepancy.

## Step 3: Run the Script

With your project scaffolded and treasury credentials in place, run the demo:

```bash
npm start
```

Or directly:

```bash
node index.js
```

Expected output:

```
dApp-Pays Architecture Demo

In this model, the application treasury pays for all storage.
Users never interact with wallets or tokens.

=== Step 1: Treasury Connection ===
Treasury Address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1
This wallet is controlled by your application, not users.

=== Step 2: Treasury Solvency Check ===
Treasury Balance: 5000000000000000000 wei
Formatted: 5.0000 USDFC

Treasury Health:
  Available: 4.5000 USDFC
  Locked: 0.5000 USDFC
  Funded for: 1000000 epochs
Treasury is solvent. Proceeding with sponsored operations.

=== Step 3: Simulated User Request ===
Authenticated user: user_alice
Email: alice@example.com
User authenticated via traditional OAuth/session - no wallet involved.

User submitted 142 bytes for upload.

=== Step 4: Sponsored Upload ===
Application treasury is signing and paying for this upload.
User will not see any transaction or pay any fees.

Uploading to Filecoin network...
(This may take 30-60 seconds)

Upload successful.
PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
Size: 512 bytes
Provider: 0x1234567890abcdef...
Sponsor: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1 (Application Treasury)

=== Step 5: Database Update ===
Recorded upload for user_alice:
  PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
  Database now tracks this PieceCID belongs to user_alice
  This mapping only exists in your app - not on-chain.

User's storage inventory:
  1. bafkzcibca3mms52by4xvzpi7dn6...
     Size: 512 bytes, Uploaded: 2024-01-15T10:30:00.000Z

=== Step 6: Economic Verification ===
Treasury has 1 active payment rails.
Payer on all rails: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1 (Treasury)
Users have no on-chain payment relationship with providers.

=== Step 7: Post-Operation Treasury Health ===
Updated Treasury Health:
  Available: 4.4900 USDFC
  Locked: 0.5100 USDFC
  New lockup from this upload: 0.010000 USDFC

=== Summary ===
dApp-Pays architecture complete.
- Treasury funded and managed by application
- User authenticated via traditional means (no wallet)
- Upload executed and paid by treasury
- PieceCID mapped to user in application database
- User experience: upload file, done. No crypto complexity.
```

The upload succeeded with your treasury as the sponsor. The user experienced zero blockchain friction.

## When to Use dApp-Pays Architecture

dApp-Pays architecture fits specific use cases well:

**Consumer applications**: Social media, photo sharing, document collaboration - anywhere users expect free or freemium models without crypto complexity.

**Onboarding-sensitive products**: When conversion rate matters more than decentralization guarantees.

**Enterprise/B2B SaaS**: Corporate customers pay through invoices and contracts, not per-transaction crypto payments. You absorb crypto complexity internally.

**Free tiers and trials**: Offering initial storage at no cost to attract users, with optional upgrade paths.

**Applications where you must control data**: Compliance, moderation, or business requirements that need centralized control over stored content.

dApp-Pays works poorly for:

**Decentralization-maximalist applications**: You cannot claim censorship resistance when you control the payment mechanism.

**Very high-volume storage**: Treasury costs grow linearly with usage. Without monetization, you can exhaust funds.

**Applications where users demand data sovereignty**: If users want to own their relationship with storage providers, dApp-Pays prevents that.

## Production Considerations

### Treasury Security

Your treasury private key is the most critical secret in dApp-Pays:

```javascript
// NEVER do this
const treasuryKey = "0x1234567890abcdef..."; // Hardcoded

// DO this instead
const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
// And use proper secrets management for the environment variable
```

Consider:
- AWS Secrets Manager, HashiCorp Vault, or similar for storing keys
- Separate keys for development, staging, and production
- Multi-sig arrangements for production treasuries
- Regular key rotation procedures (with careful fund migration)

### Treasury Monitoring and Alerting

Build dashboards and alerts around treasury health:

```javascript
async function checkTreasuryHealth(synapse, thresholds) {
    const info = await synapse.payments.accountInfo(TOKENS.USDFC);
    const availableUSDFC = Number(info.availableFunds) / 1e18;
    
    if (availableUSDFC < thresholds.critical) {
        await sendAlert("CRITICAL: Treasury critically low", availableUSDFC);
        // Consider pausing new uploads
    } else if (availableUSDFC < thresholds.warning) {
        await sendAlert("WARNING: Treasury running low", availableUSDFC);
    }
    
    return availableUSDFC;
}
```

Integrate with your existing monitoring (Datadog, PagerDuty, etc.) to ensure timely refunding.

### Database Reliability

The user→PieceCID mapping must be durable:

```javascript
// Use proper database transactions
async function recordUpload(db, userId, uploadResult) {
    await db.transaction(async (trx) => {
        await trx('uploads').insert({
            user_id: userId,
            piece_cid: uploadResult.pieceCid,
            size: uploadResult.size,
            uploaded_at: new Date(),
            sponsored_by: treasuryAddress
        });
    });
}
```

Implement backups, replication, and disaster recovery for this data. Losing the mapping means losing the ability to associate users with their data.

### Monetization Strategies

dApp-Pays doesn't mean users never pay - it means they don't pay on-chain:

- **Subscription models**: Monthly fee covers X GB of storage
- **Usage-based billing**: Track storage and charge through Stripe/traditional billing
- **Freemium tiers**: Free tier up to limit, paid tier beyond
- **Ad-supported**: Free storage, monetized through advertising

Your application translates traditional payments (or ad revenue, or venture funding) into USDFC treasury funding.

### Data Deletion and Pruning

When users delete data or their accounts, consider:

```javascript
async function handleUserDeletion(db, userId) {
    // 1. Get all user's uploads
    const uploads = await db('uploads').where('user_id', userId);
    
    // 2. Mark them as orphaned (data still on-chain but user gone)
    // Note: You can't actually delete from Filecoin mid-deal
    await db('uploads')
        .where('user_id', userId)
        .update({ status: 'orphaned', orphaned_at: new Date() });
    
    // 3. Let storage deals expire naturally
    // Or continue paying if data has archival value
}
```

On-chain storage deals cannot be cancelled mid-term. You pay for the full duration. Plan retention and deletion policies accordingly.

## Troubleshooting

**"Treasury is empty"**

Fund your treasury's payment account before accepting uploads. This is an operational responsibility.

**"Sponsored upload failed"**

Check treasury balance, operator approvals, and provider availability. The failure might be transient - implement retry logic.

**User data appearing incorrectly**

Verify your database mapping logic. The PieceCID→user association only exists in your database - check for corruption or race conditions.

**Treasury draining faster than expected**

Audit upload patterns. Are users uploading unexpectedly large files? Is there abuse? Implement rate limits and storage quotas per user.

## Conclusion

dApp-Pays architecture moves blockchain complexity entirely behind the scenes. Users interact with your application through familiar Web2 patterns while your treasury handles Filecoin payments invisibly.

This model enables mainstream adoption by eliminating crypto friction, but it fundamentally changes trust relationships. Users depend on your application for continued storage access. You bear full financial responsibility for storage costs. The decentralization benefits of Filecoin apply to storage providers and verification, not to the user→application relationship.

The code patterns demonstrated here - treasury management, traditional authentication, sponsored uploads, database mapping - form the foundation for consumer-friendly decentralized storage applications.

The next walkthrough explores **Hybrid architecture** - combining User-Pays and dApp-Pays to create tiered systems where free users get sponsored storage while premium users pay directly for additional capacity.

## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
