# Implementing the User-Pays Payment Architecture

The previous modules established your foundation with the Synapse SDK: setting up your environment, acquiring test tokens, funding your payment account, and uploading and downloading data. Those operations assumed a simple model where you, the developer, control the wallet and pay for storage directly. This works perfectly for personal projects, backend scripts, and infrastructure where a single entity owns both the code and the funds.

But what happens when you build an application for other people to use?

This walkthrough introduces **payment architecture** - the design patterns that determine who pays for storage operations in your application. We start with the **User-Pays Model**, the most decentralized approach where end-users maintain their own wallets, hold their own funds, and pay providers directly. Your application becomes an interface that facilitates storage operations without handling money at all.

Understanding payment architecture matters because the wrong choice creates either unsustainable costs for you (paying for all your users' storage) or impossible friction for users (requiring crypto knowledge to use your app). This module and the following two present the spectrum of options so you can choose the architecture that fits your specific use case.

## Prerequisites

Before running this walkthrough, you must have:

- **tFIL in your wallet** - For gas fees (get from [Calibration Faucet](https://faucet.calibration.fildev.network/))
- **USDFC in your payment account** - For storage payments
- **Storage operator approved** - Permission for providers to charge you

> **Important**: Having USDFC in your wallet is not enough. You must deposit it into your payment account by running `storage-basics/payment-management` first. See [prerequisites.md](../prerequisites.md) for complete setup instructions.

This walkthrough assumes familiarity with those concepts. We will build on that foundation rather than repeat it.

## What This Walkthrough Covers

We will walk through five areas that demonstrate the User-Pays architecture:

1. **Architectural Overview** - Understanding the model and its tradeoffs
2. **Wallet Connection** - How your application interacts with user wallets
3. **Balance Verification** - Checking if a user can afford an operation
4. **Operator Approval Verification** - Confirming payment permissions exist
5. **Upload Execution** - Performing storage operations on behalf of users

Each step reveals how your application's relationship to money changes when users pay directly, and what responsibilities remain with your code.

## Understanding the User-Pays Model

In the User-Pays model, your application never touches funds. Users arrive with their own wallets containing tFIL (for gas) and USDFC (for storage). They have already funded their payment accounts and approved storage operators. Your application simply triggers operations that the user's wallet executes.

![user-pays-model](https://raw.githubusercontent.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/refs/heads/main/payment-architecture/user-pays/images/1.png)

This mirrors how most decentralized applications work. A DEX like Uniswap does not hold your tokens - it provides an interface for swapping tokens that you own. A NFT marketplace like OpenSea does not own the NFTs - it facilitates transactions between buyers and sellers. Similarly, a User-Pays storage application does not pay for storage - it orchestrates uploads using funds the user controls.

The practical implications are significant:

**For your application:**
- Zero financial liability. Users pay their own bills.
- No treasury management. You do not need to hold or manage funds.
- No billing systems. No subscriptions, invoices, or payment processing.
- Simpler compliance. You never custody user funds.

**For your users:**
- Complete control. They own their data and pay for it directly.
- Censorship resistance. You cannot cut off their storage by withholding payment.
- Transparency. They see exactly what they pay for.
- Higher friction. They need wallets, tokens, and technical knowledge.

The tradeoff crystallizes around onboarding friction. Users must understand crypto wallets, acquire tokens, fund payment accounts, and approve operators before using your application. For crypto-native users building on Filecoin, this poses no barrier. For mainstream users expecting Web2 convenience, this creates substantial friction.

## How Filecoin Payment Architecture Works

Before writing code, understanding the relationship between wallets, payment accounts, and operators clarifies what your application actually does.

![wallet-payment-account](https://raw.githubusercontent.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/refs/heads/main/payment-architecture/user-pays/images/2.png)

When a user connects to your application, they provide access to their **wallet**. This wallet holds tFIL (for gas fees) and potentially USDFC (the stablecoin used for storage payments). But storage providers do not charge wallets directly.

Instead, the user has a **payment account** - a separate on-chain entity that holds USDFC specifically for storage operations. Users deposit USDFC from their wallet into their payment account. This separation exists for security: if a malicious operator overcharges, they drain the payment account, not the entire wallet.

The user must also **approve operators** to charge their payment account. Storage providers are operators with specific permission to deduct USDFC. Without approval, providers cannot charge for storage, and uploads fail.

Your application's role in User-Pays architecture:

1. **Connect to the user's wallet** (they control the private key)
2. **Check their payment account balance** (is it funded?)
3. **Check operator approvals** (can providers charge them?)
4. **Execute storage operations** (using their credentials)

Notice what's missing: your application never deposits funds, never approves operators, never manages USDFC. Those are user responsibilities. Your application verifies readiness and executes operations.

## Step 1: Set Up the Project

Before writing any code, we need a clean project directory with the right configuration. This keeps dependencies isolated and ensures the SDK loads correctly.

**Create your project directory:**

```bash
mkdir user-pays-demo
cd user-pays-demo
```

**Initialize the project:**

```bash
npm init -y
```

This generates a default `package.json`. Open it and modify it to enable ES modules and add a start script:

```json
{
  "name": "user-pays-demo",
  "version": "1.0.0",
  "description": "Demonstration of User-Pays payment model",
  "type": "module",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "@filoz/synapse-sdk": "^0.39.0",
    "viem": "^2.0.0",
    "dotenv": "^16.4.5"
  }
}
```

The `"type": "module"` line is critical. The Synapse SDK uses ES module imports, and Node.js defaults to CommonJS without this setting. Omit it and your first `import` statement throws a syntax error.

**Install dependencies:**

```bash
npm install
```

Three packages handle everything this walkthrough needs:

- **@filoz/synapse-sdk** provides the interface to Filecoin — wallet operations, storage interactions, and payment account management. It abstracts the blockchain plumbing into straightforward method calls.
- **viem** is the Ethereum client library the Synapse SDK uses under the hood. You need it directly to create a wallet account from your private key.
- **dotenv** loads your private key from environment variables, keeping secrets out of source code.

**Configure your environment:**

Create a `.env` file in your project root:

```
PRIVATE_KEY=your_private_key_here
```

Export your private key from MetaMask (Account Details → Show Private Key) and paste it here. This should be the same wallet you funded with tFIL and USDFC during the prerequisites.

Add a `.gitignore` to prevent accidental exposure:

```
node_modules/
.env
```

This is not a suggestion. Bots scan GitHub continuously for exposed private keys and drain wallets within seconds. Even on testnets, building the right habits matters.

## Step 2: Create the User-Pays Script

Create a file named `index.js` in your project directory:

```javascript
import 'dotenv/config';
import { Synapse } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
    console.log("User-Pays Architecture Demo\n");
    console.log("In this model, the user controls their wallet and pays for storage directly.");
    console.log("The application facilitates operations but never handles funds.\n");

    // Step 1: Connect to User Wallet
    const userPrivateKey = process.env.PRIVATE_KEY;
    if (!userPrivateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const formattedKey = userPrivateKey.startsWith('0x')
        ? userPrivateKey
        : `0x${userPrivateKey}`;

    const synapse = Synapse.create({
        account: privateKeyToAccount(formattedKey),
        source: 'user-pays-demo'
    });

    console.log("=== Step 1: SDK Initialized ===");
    console.log("SDK connected with user's wallet credentials.");
    console.log("In production, this would connect to MetaMask or WalletConnect.\n");

    // Step 2: Check Payment Account Balance
    console.log("=== Step 2: Payment Account Balance ===");

    const walletBalance = await synapse.payments.walletBalance();
    const paymentBalance = await synapse.payments.balance();
    const balanceFormatted = Number(paymentBalance) / 1e18;

    console.log(`Wallet Balance: ${(Number(walletBalance) / 1e18).toFixed(4)} USDFC`);
    console.log(`Payment Account Balance: ${paymentBalance.toString()} (raw units)`);
    console.log(`Formatted: ${balanceFormatted.toFixed(4)} USDFC`);

    if (paymentBalance === 0n) {
        console.log("\nUser has no funds in their payment account.");
        console.log("Please run the payment-management tutorial first to fund your account.");
        process.exit(1);
    }

    console.log("Payment account is funded.\n");

    // Step 3: Verify Payment Readiness
    console.log("=== Step 3: Payment Readiness ===");

    const sampleData = Buffer.from(
        `User-Pays Demo File\n` +
        `Uploaded at: ${new Date().toISOString()}\n` +
        `This data is paid for directly by the user's payment account.\n` +
        `The user controls their wallet and pays storage costs directly.\n` +
        `Minimum upload size is 127 bytes.`
    );

    const prep = await synapse.storage.prepare({
        dataSize: BigInt(sampleData.length)
    });

    if (!prep.costs.ready) {
        console.log("\nPayment account needs additional funds or approvals for this upload.");
        console.log("Please run the payment-management tutorial first.");
        process.exit(1);
    }

    console.log("Payment account is ready for storage operations.\n");

    // Step 4: Execute Storage Operation
    console.log("=== Step 4: Upload Execution ===");
    console.log(`Uploading ${sampleData.length} bytes...`);
    console.log("(This may take 30-60 seconds)\n");

    try {
        const result = await synapse.storage.upload(sampleData);

        console.log("Upload successful.");
        console.log(`PieceCID: ${result.pieceCid}`);
        console.log(`Copies stored: ${result.copies.length}`);
    } catch (error) {
        console.error("Upload failed:", error.message);
        process.exit(1);
    }

    // Step 5: Verify Payment Rail
    console.log("\n=== Step 5: Payment Verification ===");

    const rails = await synapse.payments.getRailsAsPayer({});
    const activeRails = rails.filter(r => !r.isTerminated);

    console.log(`Total payment rails: ${rails.length}`);
    console.log(`Active rails: ${activeRails.length}`);

    if (activeRails.length > 0) {
        const latestRail = activeRails[activeRails.length - 1];
        console.log(`\nMost recent rail:`);
        console.log(`  Rail ID: ${latestRail.railId}`);
        console.log("  This confirms the user is paying directly for storage.");
    }

    console.log("\n=== Summary ===");
    console.log("User-Pays architecture complete.");
    console.log("- SDK initialized with user wallet credentials");
    console.log("- Verified user has funds and payment is ready");
    console.log("- Executed an upload paid by user's payment account");
    console.log("- Application never held or managed any funds");
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
```

This script demonstrates the complete User-Pays workflow with explicit verification at each stage.

## Understanding the Code

### Wallet Connection

```javascript
const formattedKey = userPrivateKey.startsWith('0x')
    ? userPrivateKey
    : `0x${userPrivateKey}`;

const synapse = Synapse.create({
    account: privateKeyToAccount(formattedKey),
    source: 'user-pays-demo'
});
```

`Synapse.create()` is now synchronous — no `await` needed. The `privateKeyToAccount()` function from viem converts the raw private key into a full account object that the SDK uses for signing. The `source` parameter is required and serves as a namespace identifier for your application's data sets — it ensures uploads from this application are tracked separately from other applications sharing the same wallet.

In this demo, we use a private key from the environment file. In a production web application, you would use viem's `custom()` transport to connect to MetaMask or WalletConnect, receiving an `account` from the user's browser wallet instead.

The critical distinction: **the user controls this key, not your application**. Your application receives signing capabilities temporarily during the session. When the user closes their browser or disconnects, your access ends. You never store or manage user private keys.

### Balance Verification

```javascript
const walletBalance = await synapse.payments.walletBalance();
const paymentBalance = await synapse.payments.balance();

if (paymentBalance === 0n) {
    // Block the operation
    process.exit(1);
}
```

We check two separate balances. `walletBalance()` returns the USDFC sitting in the user's on-chain wallet — not yet usable for storage. `balance()` returns the USDFC already deposited into the payment account, which is what actually pays for storage operations. Both methods default to USDFC and return a BigInt in wei (18 decimal places).

This verification serves multiple purposes:

**User experience**: Attempting an upload with zero balance produces a confusing blockchain error. Checking proactively lets us display a helpful message explaining what the user needs to do.

**Gas efficiency**: If we know the operation will fail, we save the user gas fees by not submitting a doomed transaction.

**Application logic**: Your application might display different UI depending on whether users are funded. A photo sharing app might show "Upload Photo" only when balance is sufficient, or display "Fund Account" prompts otherwise.

### Payment Readiness Check

```javascript
const prep = await synapse.storage.prepare({
    dataSize: BigInt(sampleData.length)
});

if (!prep.costs.ready) {
    // Block the operation
    process.exit(1);
}
```

`prepare()` is the SDK's single-call answer to "can this account afford this upload right now?" It checks both the deposited balance and the operator approvals in one shot, and returns a `costs` object with a `ready` boolean. If anything is missing — insufficient deposit, missing approval — `ready` is `false`.

This replaces the older pattern of manually calling `getWarmStorageAddress()` and `serviceApproval()` separately. The SDK handles those checks internally, so your application just needs to react to the result.

In User-Pays architecture, users typically set up deposits and approvals during onboarding via the payment-management walkthrough. Your application's job is to verify readiness and gate operations accordingly — not to create approvals on the user's behalf.

### Upload Execution

```javascript
const result = await synapse.storage.upload(sampleData);

console.log(`PieceCID: ${result.pieceCid}`);
console.log(`Copies stored: ${result.copies.length}`);
```

With verified funds and readiness confirmed, the upload executes exactly as in previous walkthroughs. The result includes a `pieceCid` — the cryptographic identifier for your data on Filecoin — and a `copies` array showing how many storage providers received the data. The difference is conceptual: **the user's credentials authorize this operation, and the user's payment account pays for it**.

Your application's role is facilitation. You prepared the data, called the SDK method, and handled the result. But the economic relationship is directly between the user and the storage provider. You are not a party to that transaction.

### Payment Rail Verification

```javascript
const rails = await synapse.payments.getRailsAsPayer({});
```

Payment rails are the on-chain streams that transfer USDFC from payer to provider over time. By querying rails where the user is the payer, we confirm the economic relationship we expected: the user pays directly.

This verification step is optional but valuable for debugging and audit purposes. It proves your User-Pays architecture works correctly - the user truly is the payer, not some intermediary.

## Step 3: Run the Script

With dependencies installed and your `.env` configured, execute the script:

```bash
npm start
```

Or run it directly:

```bash
node index.js
```

You should see output similar to:

```
User-Pays Architecture Demo

In this model, the user controls their wallet and pays for storage directly.
The application facilitates operations but never handles funds.

=== Step 1: SDK Initialized ===
SDK connected with user's wallet credentials.
In production, this would connect to MetaMask or WalletConnect.

=== Step 2: Payment Account Balance ===
Wallet Balance: 5.0000 USDFC
Payment Account Balance: 5000000000000000000 (raw units)
Formatted: 5.0000 USDFC
Payment account is funded.

=== Step 3: Payment Readiness ===
Payment account is ready for storage operations.

=== Step 4: Upload Execution ===
Uploading 196 bytes...
(This may take 30-60 seconds)

Upload successful.
PieceCID: bafkzcibca3mms52by4xvzpi7dn62eo62xmpp5pwrx7hm6fty2cxl5c47fm2kq
Copies stored: 1

=== Step 5: Payment Verification ===
Total payment rails: 3
Active rails: 1

Most recent rail:
  Rail ID: 42
  This confirms the user is paying directly for storage.

=== Summary ===
User-Pays architecture complete.
- SDK initialized with user wallet credentials
- Verified user has funds and payment is ready
- Executed an upload paid by user's payment account
- Application never held or managed any funds
```

The upload succeeded with the user as the direct payer.

## What Happens During User-Pays Operations

When your application facilitates a User-Pays upload, the economic flow differs from centralized storage:

### Phase 1: Transaction Signing

Your application calls `synapse.storage.upload()`. The SDK prepares a transaction that must be signed by the user's wallet. In our demo, this happens automatically because we have the private key. In a browser application with MetaMask, this would trigger a popup asking the user to approve the transaction.

The user sees exactly what they're authorizing: a storage deal creation with specific costs. They can reject if the terms look wrong.

### Phase 2: Payment Account Debit

The transaction includes instructions to lock USDFC from the user's payment account. This lockup covers the storage cost for the deal duration. The funds move from available balance to locked state, still owned by the user but committed to this storage deal.

The storage operator becomes entitled to claim these funds by submitting valid proofs over time.

### Phase 3: Deal Creation

A storage deal forms on the Filecoin blockchain. The deal specifies:
- **Payer**: The user's address
- **Provider**: The storage operator
- **PieceCID**: Content identifier of the stored data
- **Duration**: How long storage lasts
- **Rate**: USDFC per epoch

This deal is a direct contract between user and provider. Your application is not named in the deal at all.

### Phase 4: Payment Streaming

As time passes, USDFC streams from the user's locked funds to the provider. The amount transferred each epoch (about 30 seconds) follows the agreed rate. Providers must continue submitting valid storage proofs to claim payments.

If the provider fails to prove storage, they lose access to those funds. The economic incentive aligns provider behavior with user interests.

### Phase 5: Deal Completion

When the deal expires, any remaining locked funds return to the user's available balance. The data may or may not remain available depending on whether the user extends storage.

Throughout this entire lifecycle, your application has no financial role. You facilitated the initial upload but the ongoing economic relationship is purely between user and provider.

## When to Use User-Pays Architecture

User-Pays architecture fits specific use cases well:

**Crypto-native applications**: If your users are developers, DeFi participants, or blockchain enthusiasts, they already have wallets and understand the model. The friction is minimal because they're already onboarded to crypto.

**High-value data storage**: For important archives, legal documents, or data the user truly owns, the direct relationship with providers makes sense. Users control their storage destiny.

**Zero-liability applications**: If you cannot or do not want to handle money, User-Pays removes that responsibility entirely. No billing disputes, no refund requests, no payment processing.

**Decentralized applications**: For truly decentralized systems where no single entity should have control, User-Pays ensures users remain sovereign over their storage.

**Professional tools**: Power users who expect to pay for resources (like professional cloud storage) may prefer the transparency of direct payment.

User-Pays works poorly for:

**Mainstream consumer applications**: Casual users who expect free or subscription-based services will bounce at the requirement to manage crypto wallets.

**Onboarding-sensitive products**: If your growth depends on frictionless signup, requiring wallet setup and token acquisition kills conversion.

**Applications subsidizing usage**: If your business model involves offering free storage to attract users, User-Pays cannot implement that without modifications.

The next walkthrough covers the opposite approach: dApp-Pays, where your application manages funds and users pay nothing directly.

## Production Considerations

### Wallet Integration

The demo uses a private key for simplicity. Production applications should integrate proper wallet connection using viem's wallet client:

```javascript
// Example with MetaMask (conceptual)
import { createWalletClient, custom } from 'viem';
import { calibration } from '@filoz/synapse-sdk';

const walletClient = createWalletClient({
    chain: calibration,
    transport: custom(window.ethereum)
});

const [userAddress] = await walletClient.getAddresses();

// Then initialize Synapse with the connected account
const synapse = Synapse.create({
    account: userAddress,
    source: 'your-app'
});
```

The Synapse SDK's React package (`@filoz/synapse-react`) provides hooks that simplify wallet integration for React applications.

### Balance Monitoring

Display real-time balance information so users understand their funding status:

```javascript
// Component that shows current balance
async function displayBalance(synapse) {
    const balance = await synapse.payments.balance();
    const formatted = Number(balance) / 1e18;

    console.log(`Available: ${formatted.toFixed(4)} USDFC`);

    // Also show locked funds
    const info = await synapse.payments.accountInfo();
    const locked = Number(info.lockupCurrent) / 1e18;
    console.log(`Locked: ${locked.toFixed(4)} USDFC`);
}
```

### Payment Readiness Check

Check payment readiness before showing upload UI:

```javascript
async function checkReadiness(synapse, dataSize) {
    const prep = await synapse.storage.prepare({
        dataSize: BigInt(dataSize)
    });

    if (!prep.costs.ready) {
        // Guide user to fund their account or set up approvals
        console.log("Your payment account is not ready for this upload size.");
        console.log("Run the payment-management walkthrough to configure your account.");
        return false;
    }
    return true;
}
```

### Error Communication

Translate blockchain errors into user-friendly messages:

```javascript
try {
    await synapse.storage.upload(data);
} catch (error) {
    if (error.message.includes("insufficient funds")) {
        console.log("Your payment account needs more USDFC to complete this upload.");
    } else if (error.message.includes("not approved")) {
        console.log("The storage operator needs approval to charge your account.");
    } else {
        console.log("Upload failed. Please try again in a few minutes.");
    }
}
```

## Troubleshooting

**"Payment account has no balance"**

The user needs to deposit USDFC into their payment account. Direct them to the payment-management walkthrough or your application's funding instructions.

**"Operator not approved"**

The user needs to approve the storage operator. This typically happens during initial setup. If they skipped that step, guide them through approval.

**"Transaction rejected by user"**

In browser wallet integrations, users can decline to sign transactions. Your application should handle rejection gracefully and explain what operation was blocked.

**"Insufficient gas"**

The user needs tFIL in their wallet for transaction gas. This is separate from USDFC for storage. Direct them to the Calibration faucet for test tokens.

## Conclusion

User-Pays architecture places users in full control of their storage economics. Your application facilitates operations without touching money, creating a clear separation between product functionality and financial responsibility.

This model maximizes decentralization and user sovereignty at the cost of onboarding friction. Users must understand wallets, acquire tokens, and manage their payment accounts independently.

The code patterns demonstrated here - checking balances, verifying approvals, executing operations, confirming payment rails - form the foundation for User-Pays applications. Whether you build a developer tool, an archival service, or a crypto-native application, these patterns ensure users understand what they're paying for and your application remains financially uninvolved.

The next walkthrough explores the opposite end of the spectrum: dApp-Pays architecture, where your application manages a treasury and covers all storage costs for users, creating a Web2-like experience with no user-facing crypto requirements.

## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
