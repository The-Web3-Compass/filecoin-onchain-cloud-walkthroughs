# Building Hybrid Payment Systems

The previous walkthroughs presented two poles of payment architecture: User-Pays where users control everything and pay directly, and dApp-Pays where your treasury handles all costs invisibly. Each model has clear tradeoffs - User-Pays adds friction but maximizes user sovereignty, while dApp-Pays removes friction but creates financial liability for your application.

Most production applications need something in between.

This walkthrough introduces **Hybrid architecture** - combining both models to create tiered storage systems. Free users get sponsored storage from your treasury up to defined limits. Power users who exceed quotas or want premium features pay directly from their own wallets. This approach enables frictionless onboarding while maintaining economic sustainability.

Understanding Hybrid architecture matters because it represents how mature storage applications actually work. Dropbox offers free tiers with premium upgrades. Google Photos provides limited free storage before requiring payment. Your application can offer the same model on decentralized infrastructure, capturing the best properties of both approaches.

## Prerequisites

Before running this walkthrough, you must have:

- **tFIL in your wallet** - For gas fees (get from [Calibration Faucet](https://faucet.calibration.fildev.network/))
- **USDFC in your payment account** - For storage payments
- **Storage operator approved** - Permission for providers to charge you

> **Important**: Having USDFC in your wallet is not enough. You must deposit it into your payment account by running `storage-basics/payment-management` first. See [prerequisites.md](../prerequisites.md) for complete setup instructions.

This walkthrough combines patterns from both previous modules. Familiarity with each is essential.

## What This Walkthrough Covers

We will walk through seven areas that demonstrate Hybrid architecture:

1. **Architectural Overview** - Understanding the hybrid model and quota systems
2. **Quota Configuration** - Defining free tier limits and upgrade thresholds
3. **Decision Engine** - Logic that routes operations to appropriate payers
4. **Sponsored Path** - Treasury-funded operations for free users
5. **User-Paid Path** - Direct payment for premium users
6. **Tier Transitions** - Upgrading and downgrading between models
7. **Operational Monitoring** - Tracking usage across both tiers

Each step reveals how to build a sustainable economic model that balances user acquisition with operational costs.

## Understanding Hybrid Architecture

Hybrid architecture introduces a **decision layer** between user operations and payment execution. When a user requests storage, your application evaluates their current status:

- Are they within their free quota?
- Have they reached limits requiring upgrade?
- Do they have a connected wallet with funds?
- What tier are they currently on?

![hybrid-architecture](https://raw.githubusercontent.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/refs/heads/main/payment-architecture/hybrid/images/1.png)

Based on this evaluation, the system routes to either treasury-sponsored execution (dApp-Pays path) or user-funded execution (User-Pays path).

The practical implications create a best-of-both-worlds scenario:

**For new users:**
- Zero friction onboarding (no wallet required initially)
- Free storage up to defined limits
- Exposure to the product without financial commitment

**For power users:**
- Unlimited storage capacity (at their expense)
- Direct control over their data's economic relationship
- Premium features funded by their payments

**For your application:**
- Controlled treasury burn rate (free tier has caps)
- Revenue potential (premium tier or upgrades)
- Sustainable economics (costs shift to heavy users)

The key insight: **hybrid architecture commoditizes the basics while monetizing scale**. Small users cost you little. Large users pay their own way or fund your growth through premium pricing.

## Quota System Design

Before writing code, understand how quota systems work in this context.

A typical quota structure might include:

| Tier | Storage Limit | Monthly Upload Limit | Payer |
|------|---------------|---------------------|-------|
| Free | 500 MB | 1 GB | Treasury |
| Pro | 50 GB | 100 GB | User |
| Enterprise | Unlimited | Unlimited | User (negotiated rate) |

Your application tracks cumulative usage per user:

```javascript
const userQuota = {
    userId: "user_alice",
    tier: "free",
    storageUsed: 256 * 1024 * 1024,  // 256 MB
    storageLimit: 500 * 1024 * 1024, // 500 MB limit
    monthlyUploaded: 100 * 1024 * 1024, // 100 MB this month
    monthlyUploadLimit: 1024 * 1024 * 1024 // 1 GB limit
};
```

When processing an upload request, compare requested size against remaining quota:

```javascript
const remainingStorage = userQuota.storageLimit - userQuota.storageUsed;
const requestedSize = uploadData.length;

if (requestedSize <= remainingStorage) {
    // Use treasury (dApp-Pays)
} else {
    // Require user payment (User-Pays) or reject
}
```

This logic generalizes to any quota dimension: storage size, file count, bandwidth, operation frequency, or custom business rules.

## Step 1: Create the Hybrid Architecture Script

Create a file named `index.js` in your `code` directory:

```javascript
import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

// Load .env.local first (if it exists), then .env
dotenv.config({ path: '.env.local' });
dotenv.config();

// Simulated user database with quota tracking
const USER_DATABASE = {
    "alice": {
        email: "alice@example.com",
        tier: "free",
        storageUsed: 200 * 1024 * 1024,
        storageLimit: 500 * 1024 * 1024,
        walletConnected: false
    },
    "bob": {
        email: "bob@example.com",
        tier: "free",
        storageUsed: 490 * 1024 * 1024,
        storageLimit: 500 * 1024 * 1024,
        walletConnected: true
    },
    "carol": {
        email: "carol@example.com",
        tier: "pro",
        storageUsed: 10 * 1024 * 1024 * 1024,
        storageLimit: 50 * 1024 * 1024 * 1024,
        walletConnected: true
    }
};

async function main() {
    console.log("Hybrid Payment Architecture Demo\n");
    console.log("This model combines treasury sponsorship with user payments.");
    console.log("Free tier users get sponsored. Power users pay directly.\n");

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY");
    }

    // Treasury context (dApp-Pays)
    const treasury = await Synapse.create({
        privateKey: privateKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    // User context (User-Pays) - in production, comes from browser wallet
    const userWallet = await Synapse.create({
        privateKey: privateKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("=== System Initialization ===");
    console.log("Treasury SDK initialized.");
    console.log("User wallet SDK initialized (demo uses same key).");
    console.log("In production, user wallet comes from browser connection.\n");

    const treasuryBalance = await treasury.payments.balance(TOKENS.USDFC);
    console.log(`Treasury Balance: ${(Number(treasuryBalance) / 1e18).toFixed(4)} USDFC`);

    if (treasuryBalance === 0n) {
        console.log("Treasury empty - free tier unavailable.");
        process.exit(1);
    }

    // Verify operator approval for treasury
    const operatorAddress = treasury.getWarmStorageAddress();
    const approval = await treasury.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    if (!approval.isApproved || approval.rateAllowance === 0n) {
        console.log("Treasury operator not approved. Run payment-management first.");
        process.exit(1);
    }

    // Demo: Process uploads for different user scenarios
    console.log("\n" + "=".repeat(60) + "\n");

    // Scenario 1: Free user within quota (Alice)
    await processUpload(treasury, userWallet, "alice", 50 * 1024 * 1024);

    console.log("\n" + "=".repeat(60) + "\n");

    // Scenario 2: Free user over quota (Bob)
    await processUpload(treasury, userWallet, "bob", 20 * 1024 * 1024);

    console.log("\n" + "=".repeat(60) + "\n");

    // Scenario 3: Pro user (Carol) - always uses own wallet
    await processUpload(treasury, userWallet, "carol", 100 * 1024 * 1024);
}

async function processUpload(treasury, userWallet, userId, fileSize) {
    console.log(`=== Processing Upload for ${userId} ===\n`);
    
    const user = USER_DATABASE[userId];
    if (!user) {
        console.log("User not found.");
        return;
    }

    console.log(`User: ${user.email}`);
    console.log(`Tier: ${user.tier}`);
    console.log(`Storage: ${formatBytes(user.storageUsed)} / ${formatBytes(user.storageLimit)}`);
    console.log(`Upload Size: ${formatBytes(fileSize)}`);

    // Decision engine: determine payment path
    const decision = evaluatePaymentPath(user, fileSize);
    console.log(`\nDecision: ${decision.path}`);
    console.log(`Reason: ${decision.reason}\n`);

    // Execute based on decision
    if (decision.path === "SPONSORED") {
        await executeSponsoredUpload(treasury, userId, fileSize);
    } else if (decision.path === "USER_PAID") {
        await executeUserPaidUpload(userWallet, userId, fileSize, decision.reason);
    } else if (decision.path === "BLOCKED") {
        handleBlockedUpload(userId, decision.reason);
    }
}

function evaluatePaymentPath(user, requestedSize) {
    // Rule 1: Pro tier users always pay themselves
    if (user.tier === "pro" || user.tier === "enterprise") {
        return {
            path: "USER_PAID",
            reason: "Pro/Enterprise tier - user pays for all storage"
        };
    }

    // Rule 2: Check if request fits within free quota
    const remainingQuota = user.storageLimit - user.storageUsed;
    
    if (requestedSize <= remainingQuota) {
        return {
            path: "SPONSORED",
            reason: "Within free tier quota - treasury sponsors"
        };
    }

    // Rule 3: Over quota - check if user can pay
    if (user.walletConnected) {
        return {
            path: "USER_PAID",
            reason: "Over free quota - user wallet available for payment"
        };
    }

    // Rule 4: Over quota, no wallet - blocked
    return {
        path: "BLOCKED",
        reason: "Over free quota and no wallet connected - upgrade required"
    };
}

async function executeSponsoredUpload(treasury, userId, fileSize) {
    console.log("Executing SPONSORED upload (Treasury pays)...");

    const demoData = Buffer.from(
        `Sponsored content for ${userId}\n` +
        `Size: ${fileSize} bytes (simulated)\n` +
        `Sponsored by application treasury\n` +
        `Timestamp: ${new Date().toISOString()}\n` +
        `Free tier user - storage costs covered by treasury.\n` +
        `Minimum upload size is 127 bytes.`
    );

    try {
        const result = await treasury.storage.upload(demoData);

        console.log("Upload successful (Treasury sponsored)");
        console.log(`PieceCID: ${result.pieceCid}`);
        console.log(`Payer: Treasury`);

        USER_DATABASE[userId].storageUsed += fileSize;
        console.log(`Updated usage: ${formatBytes(USER_DATABASE[userId].storageUsed)}`);
        
    } catch (error) {
        console.error("Sponsored upload failed:", error.message);
    }
}

async function executeUserPaidUpload(userWallet, userId, fileSize, reason) {
    console.log("Executing USER_PAID upload (User pays)...");
    console.log(`Reason: ${reason}\n`);
    
    // Check if user can afford the operation
    const balance = await userWallet.payments.balance(TOKENS.USDFC);
    
    if (balance === 0n) {
        console.log("User has no funds in payment account.");
        console.log("In production, prompt user to fund their account.");
        return;
    }

    const demoData = Buffer.from(
        `Premium content for ${userId}\n` +
        `Size: ${fileSize} bytes (simulated)\n` +
        `Paid by user wallet\n` +
        `Timestamp: ${new Date().toISOString()}\n` +
        `Pro/Enterprise tier - user paying directly for storage.\n` +
        `Minimum upload size is 127 bytes.`
    );

    try {
        const result = await userWallet.storage.upload(demoData);

        console.log("Upload successful (User paid)");
        console.log(`PieceCID: ${result.pieceCid}`);
        console.log(`Payer: User Wallet`);

        USER_DATABASE[userId].storageUsed += fileSize;
        console.log(`Updated usage: ${formatBytes(USER_DATABASE[userId].storageUsed)}`);
        
    } catch (error) {
        console.error("User-paid upload failed:", error.message);
    }
}

function handleBlockedUpload(userId, reason) {
    console.log("Upload BLOCKED");
    console.log(`Reason: ${reason}\n`);
    console.log("User action required:");
    console.log("  1. Connect a wallet with USDFC");
    console.log("  2. Fund their payment account");
    console.log("  3. Upgrade to Pro tier for higher limits");
    console.log("\nIn production, display upgrade modal to user.");
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
```

This script demonstrates the complete Hybrid workflow with quota evaluation and dynamic path selection.

## Understanding the Code

### Dual Context Initialization

```javascript
const treasury = await Synapse.create({
    privateKey: privateKey,
    rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
});

const userWallet = await Synapse.create({
    privateKey: privateKey,
    rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
});
```

Hybrid architecture requires two SDK contexts:

1. **Treasury** - Your application's wallet for sponsored operations
2. **User Wallet** - The user's wallet for direct payments

In production, these would be distinct:
- Treasury key stored securely in your backend
- User wallet connected via browser (MetaMask, WalletConnect)

For this demo, we use the same key for both to simplify testing.

### User Database with Quota Tracking

```javascript
const USER_DATABASE = {
    "alice": {
        tier: "free",
        storageUsed: 200 * 1024 * 1024,
        storageLimit: 500 * 1024 * 1024,
        walletConnected: false
    }
};
```

Your application database must track:
- **Current tier** - Determines rules applied
- **Usage metrics** - Storage consumed, operations performed
- **Limits** - Thresholds that trigger tier changes
- **Wallet status** - Whether user can pay directly

This data drives the decision engine. Without accurate tracking, you cannot implement hybrid logic correctly.

### The Decision Engine

```javascript
function evaluatePaymentPath(user, requestedSize) {
    // Rule 1: Pro tier users always pay themselves
    if (user.tier === "pro") {
        return { path: "USER_PAID", reason: "..." };
    }

    // Rule 2: Check if request fits within free quota
    const remainingQuota = user.storageLimit - user.storageUsed;
    if (requestedSize <= remainingQuota) {
        return { path: "SPONSORED", reason: "..." };
    }

    // Rule 3: Over quota - check if user can pay
    if (user.walletConnected) {
        return { path: "USER_PAID", reason: "..." };
    }

    // Rule 4: Blocked
    return { path: "BLOCKED", reason: "..." };
}
```

The decision engine encapsulates your business logic. Rules can be arbitrarily complex:

- Time-based quotas (monthly limits that reset)
- File-type restrictions (free tier only supports certain formats)
- Geographic rules (sponsored in some regions, paid in others)
- Feature gates (sponsored for basic operations, paid for advanced)

The key is returning a clear decision: SPONSORED, USER_PAID, or BLOCKED.

### Path Execution

```javascript
if (decision.path === "SPONSORED") {
    await executeSponsoredUpload(treasury, userId, fileSize);
} else if (decision.path === "USER_PAID") {
    await executeUserPaidUpload(userWallet, userId, fileSize);
} else if (decision.path === "BLOCKED") {
    handleBlockedUpload(userId, decision.reason);
}
```

After the decision, execution routes to the appropriate handler:

- **Sponsored** uploads use treasury credentials
- **User-paid** uploads use user wallet credentials
- **Blocked** operations stop and prompt for action

Each handler logs the payer address, confirming the economic relationship matches intent.

### Quota Updates

```javascript
USER_DATABASE[userId].storageUsed += fileSize;
```

After successful upload, update quota tracking regardless of who paid. This ensures accurate accounting for future decisions.

For sponsored uploads, this prevents users from exceeding free limits. For user-paid uploads, this tracks total storage (relevant for billing, analytics, or soft limits).

## Step 2: Run the Script

Navigate to the `code` directory and execute:

```bash
cd hybrid/code
npm install
node index.js
```

Expected output:

```
Hybrid Payment Architecture Demo

This model combines treasury sponsorship with user payments.
Free tier users get sponsored. Power users pay directly.

=== System Initialization ===
Treasury: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1
User Wallet (demo): 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1
In production, user wallet comes from browser connection.

Treasury Balance: 5.0000 USDFC

============================================================

=== Processing Upload for alice ===

User: alice@example.com
Tier: free
Storage: 200 MB / 500 MB
Upload Size: 50 MB

Decision: SPONSORED
Reason: Within free tier quota - treasury sponsors

Executing SPONSORED upload (Treasury pays)...
Upload successful (Treasury sponsored)
PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
Payer: Treasury (0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1)
Updated usage: 250 MB

============================================================

=== Processing Upload for bob ===

User: bob@example.com
Tier: free
Storage: 490 MB / 500 MB
Upload Size: 20 MB

Decision: USER_PAID
Reason: Over free quota - user wallet available for payment

Executing USER_PAID upload (User pays)...
Upload successful (User paid)
PieceCID: bafkzcibca4nnt63cz5ywzqj8eo73fp2nqq6qxm7fn7guz3dxm6d48gn3lb
Payer: User (0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1)
Updated usage: 510 MB

============================================================

=== Processing Upload for carol ===

User: carol@example.com
Tier: pro
Storage: 10 GB / 50 GB
Upload Size: 100 MB

Decision: USER_PAID
Reason: Pro/Enterprise tier - user pays for all storage

Executing USER_PAID upload (User pays)...
Upload successful (User paid)
PieceCID: bafkzcibca5oou74d06zxzrk9fp84gq3orr7ryn8go8hvz4eyn7e59ho4mc
Payer: User (0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1)
Updated usage: 10.1 GB
```

Three scenarios demonstrate the hybrid logic:

1. **Alice** (free, under quota) → Treasury pays
2. **Bob** (free, over quota, wallet connected) → User pays
3. **Carol** (pro tier) → User pays (always)

## Tier Transition Patterns

Hybrid architecture requires handling transitions between tiers:

### Upgrade Flow (Free → Pro)

```javascript
async function upgradeUser(userId) {
    const user = USER_DATABASE[userId];
    
    // Verify wallet connection first
    if (!user.walletConnected) {
        throw new Error("Connect wallet before upgrading");
    }
    
    // Verify user can afford Pro tier
    const balance = await userWallet.payments.balance(TOKENS.USDFC);
    const minimumBalance = BigInt(10e18); // 10 USDFC minimum
    
    if (balance < minimumBalance) {
        throw new Error("Insufficient balance for Pro tier");
    }
    
    // Update tier
    user.tier = "pro";
    user.storageLimit = 50 * 1024 * 1024 * 1024; // 50 GB
    
    console.log(`${userId} upgraded to Pro tier`);
}
```

### Downgrade Flow (Pro → Free)

```javascript
async function downgradeUser(userId) {
    const user = USER_DATABASE[userId];
    
    // Check if current usage exceeds free limits
    const freeLimit = 500 * 1024 * 1024; // 500 MB
    
    if (user.storageUsed > freeLimit) {
        console.log("Cannot downgrade: usage exceeds free tier limit");
        console.log("Delete data or maintain Pro tier");
        return false;
    }
    
    // Update tier
    user.tier = "free";
    user.storageLimit = freeLimit;
    
    // Future uploads will be treasury-sponsored again
    console.log(`${userId} downgraded to Free tier`);
    return true;
}
```

Downgrade handling requires policy decisions:
- Can users downgrade if they're over free limits?
- Do you archive excess data? Delete it? Require cleanup first?
- How do you handle active payment rails from their Pro period?

These are business decisions your application must codify.

## When to Use Hybrid Architecture

Hybrid architecture fits most production applications:

**SaaS products**: Free tier for acquisition, paid tiers for power users. Classic freemium model.

**Consumer applications**: Let casual users try free, convert engaged users to paid.

**API products**: Free tier for evaluation, metered billing for production usage.

**Enterprise with individuals**: Company pays (Pro) for employees, contractors use free tier.

Hybrid works poorly for:

**Pure B2B enterprise**: Where all users are paid from day one.

**Maximum decentralization**: Hybrid still requires treasury infrastructure (centralization).

**Simple applications**: Overhead of quota tracking may not justify complexity.

## Production Considerations

### Real-Time Quota Checking

Quotas must be checked atomically with uploads:

```javascript
async function processUploadWithLock(userId, fileSize) {
    return await db.transaction(async (trx) => {
        // Lock user row for update
        const user = await trx('users')
            .where('id', userId)
            .forUpdate()
            .first();
        
        const decision = evaluatePaymentPath(user, fileSize);
        
        if (decision.path === "SPONSORED") {
            // Execute upload...
            
            // Update quota in same transaction
            await trx('users')
                .where('id', userId)
                .increment('storage_used', fileSize);
        }
        
        return result;
    });
}
```

Without transactional quota updates, race conditions can exceed limits.

### Treasury Budget Allocation

Set treasury budgets per time period:

```javascript
const TREASURY_CONFIG = {
    dailyBudget: 100e18,      // 100 USDFC per day
    warningThreshold: 80e18,  // Alert at 80 USDFC
    criticalThreshold: 20e18, // Reject new sponsors at 20 USDFC
    
    // Track spending
    todaySpent: 0n,
    lastReset: new Date()
};

function canSponsor(estimatedCost) {
    const remaining = TREASURY_CONFIG.dailyBudget - TREASURY_CONFIG.todaySpent;
    return BigInt(estimatedCost) <= remaining;
}
```

This prevents runaway spending if user growth exceeds projections.

### Analytics and Monitoring

Track metrics across both paths:

```javascript
const METRICS = {
    sponsoredUploads: 0,
    sponsoredBytes: 0n,
    userPaidUploads: 0,
    userPaidBytes: 0n,
    blockedAttempts: 0,
    
    // By tier
    freeUserCount: 0,
    proUserCount: 0,
    conversionRate: 0
};
```

These metrics inform pricing, quota tuning, and growth decisions.

### Graceful Degradation

If treasury funds run low:

```javascript
async function evaluatePaymentPathWithFallback(user, fileSize, treasuryBalance) {
    // If treasury critically low, deny sponsorship
    if (treasuryBalance < CRITICAL_THRESHOLD) {
        if (user.walletConnected) {
            return { path: "USER_PAID", reason: "Treasury temporarily unavailable" };
        }
        return { path: "BLOCKED", reason: "Free tier temporarily unavailable" };
    }
    
    // Normal evaluation
    return evaluatePaymentPath(user, fileSize);
}
```

This prevents service outage when treasury needs refunding.

## Troubleshooting

**"Free tier unavailable"**

Treasury balance is critically low. Refund the treasury payment account.

**"User blocked but has wallet"**

Check wallet connection status in your database. The wallet might be cached as connected but actually disconnected.

**"Quota exceeded but upload succeeded"**

Race condition in quota checking. Implement transactional quota updates.

**"Pro user getting sponsored"**

Tier not properly set in database after upgrade. Verify upgrade flow updates tier correctly.

**"Usage tracking drift"**

On-chain data and database tracking diverged. Implement reconciliation jobs that verify PieceCIDs on-chain match database records.

## Conclusion

Hybrid architecture combines the accessibility of dApp-Pays with the sustainability of User-Pays. Free tiers attract users without financial barriers, while paid tiers monetize power users and control treasury burn.

The decision engine represents your business logic in code. Quota systems, tier definitions, and upgrade flows express how you want economics to work. The Synapse SDK handles the actual payments - your application handles the policy.

This model enables sustainable decentralized storage applications that behave like the best Web2 services while delivering Web3 properties under the hood. Users experience convenient storage. Your treasury stays solvent. Power users get unlimited capacity. Everyone wins.

The patterns demonstrated here - dual context management, decision engines, quota tracking, tier transitions - form the foundation for production-ready storage applications.

With the three payment architecture walkthroughs complete, you now understand the full spectrum of economic models available when building on Filecoin Onchain Cloud. Choose User-Pays for maximum decentralization, dApp-Pays for maximum convenience, or Hybrid for balanced sustainability.
