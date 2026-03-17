# Getting Started with Filecoin Onchain Cloud

Developers building applications that need storage have long faced an uncomfortable choice. You can trust centralized providers like AWS and accept the tradeoffs that come with it, or you can pursue decentralized alternatives and spend considerable time managing deal negotiations, storage proofs, and payment channels. Neither path has been particularly smooth.

Filecoin Onchain Cloud offers a third option. It brings blockchain storage closer to how modern cloud infrastructure actually works. You get cryptographic proof that your data exists, not just promises. You get economics that keep providers accountable. And you get an SDK that abstracts away the blockchain complexity. The platform selects your storage providers, continuously verifies your data, and handles payments automatically. You write standard API calls and let the network manage the rest.

![filecoin onchain cloud vs traditional cloud](https://raw.githubusercontent.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/refs/heads/main/storage-basics/get-token/images/1.png)

One aspect worth highlighting early is the pricing model. Traditional cloud providers can adjust prices at will. Other blockchain storage platforms tie costs directly to volatile tokens, which creates real business problems when you need to explain why infrastructure costs tripled overnight due to market movements. Filecoin addresses this with a dual token system that keeps storage pricing stable even when crypto markets fluctuate. This makes it possible to budget infrastructure spending with actual predictability.

This walkthrough will take you from a fresh environment to a funded storage account ready for real work. We'll use the Calibration testnet throughout, so everything is free while you learn. By the end, you'll have configured your environment, funded a payment account, and understood why this architecture solves problems that other approaches struggle with.

## Prerequisites

You will need the following:

- **Node.js 20 or higher** available at [nodejs.org](https://nodejs.org/)
- **MetaMask browser extension** available at [metamask.io](https://metamask.io/)
- Familiarity with async/await patterns and environment variables
- Some blockchain development experience with ethers.js, web3.js, or similar libraries

If you have built applications on Ethereum, Polygon, or Base, the concepts here will feel familiar. The patterns translate directly.

## Filecoin Networks: Mainnet vs. Calibration

Filecoin operates two environments that serve different purposes.

**Mainnet** is the production network. It uses real FIL tokens, creates real storage deals, and involves real money. When your application is ready for users, mainnet is where it runs.

**Calibration** is the testnet. It provides the same functionality as mainnet but uses worthless test tokens called tFIL and USDFC. This makes it ideal for development, testing, and learning. We will use Calibration exclusively in this walkthrough.

Testnets exist precisely so you can experiment freely. You can try edge cases, deploy incomplete code, observe failures, and learn how the system behaves. All of this happens without any financial risk.

## Step 1: Add Calibration to MetaMask

MetaMask ships with Ethereum network configurations but requires manual setup for Filecoin Calibration.

The simplest approach is to use Chainlist:

1. Navigate to [Chainlist Filecoin Calibration](https://chainlist.org/chain/314159)
2. Click **Connect Wallet** to link your MetaMask
3. Click **Add to MetaMask** and approve the network addition

The network configuration includes:
- **Chain ID**: 314159, which uniquely identifies the Calibration network
- **Currency**: tFIL, where the "t" prefix indicates testnet
- **RPC URL**: The endpoint MetaMask uses to communicate with Filecoin nodes
- **Block Explorer**: The interface for viewing transaction details

After adding the network, switch to Calibration using MetaMask's network dropdown. Your balance will display 0 tFIL initially.

## Step 2: Get Test Tokens

Filecoin uses two distinct tokens that serve different purposes. Understanding the reasoning behind this design reveals how Filecoin solves a problem that affects most blockchain storage platforms.

### The Rationale for Two Tokens

Most blockchains use a single token for all operations. This creates a difficult situation where gas fees for transactions and storage costs share the same volatile asset.

When that token's price increases sharply, storage costs increase proportionally. When network congestion rises, gas prices spike and even simple operations become expensive. Forecasting costs becomes speculative rather than analytical.

Consider what this means in practice. If you build a consumer application on a single token blockchain where your app stores user data, you face an unpleasant situation when the token price surges. Your options are limited: absorb the cost increases yourself and threaten your margins, pass them to users and damage your product experience, or attempt to predict crypto markets months in advance. None of these approaches work well for sustainable businesses.

Filecoin separates these concerns into two tokens:
- **tFIL** serves as the gas token and pays for transactions and computational work
- **USDFC** serves as the storage token and pays for data storage while remaining pegged to USD

This separation provides three tangible advantages.

First, storage costs become predictable. USDFC maintains its peg to the dollar, so you can budget storage in actual currency rather than volatile crypto. When you forecast $1,000 per month for storage, that projection holds regardless of market conditions.

Second, storage costs remain independent of network congestion. When transaction volume spikes and gas prices rise, storage pricing stays unchanged. Your storage remains affordable even during high traffic periods.

Third, you can optimize gas and storage separately. These are fundamentally different problems that benefit from different strategies. Gas costs respond well to transaction batching and timing optimization. Storage costs respond well to capacity planning and longer term commitments. Treating them as separate concerns lets you optimize each appropriately.

![token comparison table](https://raw.githubusercontent.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/refs/heads/main/storage-basics/get-token/images/2.png)

### Getting tFIL for Gas

1. Visit the [Calibration tFIL Faucet](https://faucet.calibnet.chainsafe-fil.io/funds.html)
2. Paste your MetaMask wallet address
3. Click to request tFIL

Tokens arrive in your wallet within seconds. You need tFIL for transaction fees since every blockchain operation consumes gas.

### Getting USDFC for Storage

1. Visit the [Calibration USDFC Faucet](https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc)
2. Paste your wallet address
3. Request test USDFC

USDFC is what you will actually spend on storage services. The faucet provides enough tokens for extensive experimentation.

Request generous amounts of both tokens now. Running out during development interrupts your workflow, and returning to faucets repeatedly slows progress.

## Step 3: Install Dependencies

Create a new project directory and install the required packages:

```bash
mkdir my-foc-app
cd my-foc-app
npm init -y
npm install @filoz/synapse-sdk viem dotenv
```

These three packages serve distinct purposes:

**@filoz/synapse-sdk** provides your interface to Filecoin. It manages wallet operations, transaction signing, storage interactions, and payment accounts. The blockchain complexity is abstracted into straightforward method calls. Documentation is available at [docs.filecoin.cloud/developer-guides/synapse](https://docs.filecoin.cloud/developer-guides/synapse/).

**viem** is the modern Ethereum library. Since Filecoin is EVM compatible, viem works seamlessly for utilities like parsing token amounts, managing accounts, and formatting data. We use it for key management and basic wallet operations. Documentation is available at [viem.sh](https://viem.sh/).

**dotenv** loads environment variables from .env files. This is essential for keeping your private key out of source code.

After installation, update your package.json to enable ES modules, which the Synapse SDK requires:

```json
{
  "name": "my-foc-app",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "dependencies": {
    "@filoz/synapse-sdk": "^0.39.0",
    "dotenv": "^17.2.3",
    "viem": "^2.0.0"
  }
}
```

The `"type": "module"` setting is essential. It instructs Node.js to treat .js files as ES modules rather than CommonJS. The Synapse SDK will not function without this configuration.

## Step 4: Configure Your Environment

Create a .env file in your project root:

```
PRIVATE_KEY=your_wallet_private_key_here
```

To export your private key from MetaMask:

1. Open MetaMask and click the three dots beside your account
2. Select **Account Details**
3. Click **Show Private Key**
4. Enter your MetaMask password
5. Copy the key and paste it into your .env file

### Security Considerations

Add .env to your .gitignore immediately:

```
node_modules/
.env
```

This step is not optional. Developers regularly lose funds by accidentally committing private keys to GitHub. Automated bots continuously scan repositories for exposed keys and drain wallets within seconds of discovery. This happens frequently.

Additionally, use a separate wallet for development work. Create a dedicated MetaMask account specifically for testnet operations. Never use your primary wallet for development. If your development key becomes compromised, you lose nothing of value.

## Step 5: Write the Initialization Script

Create index.js in your project root:

```javascript
import 'dotenv/config';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { mainnet } from '@filoz/synapse-core/chains';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
    console.log("Initializing Filecoin Onchain Cloud SDK...\n");

    // 1. Initialize the SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    // Ensure privateKey starts with 0x for viem
    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

    const synapse = Synapse.create({
        account: privateKeyToAccount(formattedPrivateKey),
        source: 'get-token-tutorial',
        // Optional: specify chain, defaults to calibration testnet
        // chain: mainnet 
    });

    console.log("✓ SDK initialized successfully\n");

    // 2. Check Balances
    console.log("=== Checking Balances ===");

    // Check balance in your wallet
    const walletBalance = await synapse.payments.walletBalance({ token: TOKENS.USDFC });
    
    // USDFC has 18 decimals, this shows the raw "wei" amount
    console.log(`Wallet Balance: ${walletBalance.toString()} USDFC (raw wei)`);

    // In the new API, we don't need to manually deposit and approve the operator
    // with complex lockup periods. The `synapse.storage.prepare()` method calculates
    // the exact deposit needed for your data size and returns a single transaction
    // that handles both funding and approval.
    
    console.log("\nSuccess! Your account is configured and your wallet is funded.");
    console.log("You're ready to proceed to the next tutorial to learn about storage payments.");
}

main().catch((err) => {
    console.error("Error during initialization:");
    console.error(err);
    process.exit(1);
});
```

### Understanding the Code


![code-flow](https://raw.githubusercontent.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/refs/heads/main/storage-basics/get-token/images/3.png)

**SDK Initialization**

```javascript
    const synapse = Synapse.create({
        account: privateKeyToAccount(formattedPrivateKey),
        source: 'get-token-tutorial'
    });
```

The `Synapse.create()` method establishes your connection to Filecoin. It uses your private key (managed safely via viem's `privateKeyToAccount`) and a source identifier to return a fully configured instance. By default, it connects to the Calibration testnet using reliable public endpoints, which saves you from hunting down infrastructure URLs.

**Balance Verification**

```javascript
const walletBalance = await synapse.payments.walletBalance({ token: TOKENS.USDFC });
console.log(`Wallet Balance: ${walletBalance.toString()} USDFC (raw wei)`);
```

Checking your wallet's balance is incredibly straightforward. The `walletBalance` method retrieves the raw amount of USDFC in your connected wallet. Because blockchains store token amounts as integers to prevent floating-point errors (and USDFC uses 18 decimals), the raw value looks much higher than standard decimal inputs.

**Simplified Payments**

Historically, developers had to manually handle allowances, calculate epochs, determine lockup parameters, and send complicated atomic `depositWithPermitAndApproveOperator` transactions just to deposit tokens into the payment contract. 

With `v0.37.0+` of the Synapse SDK, all of this is abstracted away. In the next tutorial, you'll see how `synapse.storage.prepare()` intelligently calculates exactly what deposit is needed for the requested upload size and returns a single `transaction.execute()` call to seamlessly fund and approve the deal.

## Step 6: Run the Script

Execute the script:

```bash
node index.js
```

You should see output similar to:

```
Initializing Filecoin Onchain Cloud SDK...
SDK initialized successfully
Checking USDFC balance...
Wallet Balance: 10.0 USDFC
Depositing 2.5 USDFC to payment account...
Waiting for transaction confirmation...
Success! Your account is now funded and ready to store data.
```

Your payment account is now funded and approved for storage operations. To verify the transaction onchain, visit the [Calibration block explorer](https://calibration.filfox.info/) and search for your wallet address or transaction hash.

## Architecture Deep Dive

The system you just configured employs several architectural patterns that are worth understanding in detail.

### Payment Accounts vs. Wallets

Your wallet holds tokens directly under your control via your private key. This is straightforward ownership.

Payment accounts work differently. They are separate balances designed specifically for recurring storage payments. This separation addresses a fundamental problem: storage operators need to charge you automatically over time, but they should never have direct access to your main wallet.

Without payment accounts, you would face three unsatisfactory options.

The first option is granting operators direct wallet access. This is problematic because if an operator gets compromised or acts maliciously, your entire wallet balance becomes vulnerable.

The second option is requiring manual approval for every payment. This maximizes security but destroys usability. You would need to manually approve transactions potentially multiple times daily. No practical application can function this way.

The third option is granting large pre-approvals upfront to reduce approval frequency. This remains risky because a compromised operator could drain the entire pre-approved amount.

Payment accounts resolve this elegantly. You deposit a controlled amount into a dedicated account. You approve specific operators to charge from it within defined limits. Your main wallet remains completely isolated. If any operator attempts to exceed their limits, the blockchain automatically rejects the transaction. The solution is simple, secure, and practical.

### Operators and Allowances

Storage operators run the physical infrastructure. They manage hardware, maintain data redundancy, provide retrieval services, and generate the cryptographic proofs that verify storage.

When you approve an operator, you grant permission for them to charge your payment account up to specific limits. The enforcement mechanism is embedded in the protocol itself. If an operator attempts to charge more than their allowance permits, the blockchain rejects the transaction automatically. No trusted intermediary is required. The protocol enforces limits through cryptographic verification.

This resembles a credit card limit conceptually but differs fundamentally in implementation. Credit card limits are enforced by the card issuer, a trusted third party who could theoretically change limits, fail to enforce them, or suffer a security breach.

Filecoin's allowances exist as cryptographically verifiable state embedded in the blockchain protocol. They cannot be modified without your signature. No trusted party can override them. No security breach can circumvent them. The mathematics of the system provide the protection.

### Why Dual Tokens Matter for Production Applications

The dual token system fundamentally expands what you can build on blockchain storage.

Single token blockchains create challenging scenarios. When every operation uses one volatile token, cost spikes become unavoidable. When that token appreciates, all your costs increase. When the network becomes congested, gas prices surge and basic operations become prohibitively expensive. Long term planning devolves into speculation about token prices.

Filecoin separates these concerns. tFIL handles gas for transaction processing. USDFC handles storage payments and remains pegged to USD.

This provides three concrete benefits for production applications.

Predictable costs become achievable because USDFC maintains its USD peg. You can budget storage in real currency rather than volatile cryptocurrency. When you project $1,000 monthly for storage, that projection remains accurate regardless of market movements.

Storage costs remain independent of network congestion. When transaction volume increases and gas prices rise, storage pricing stays constant. Your storage remains affordable even during periods of high network activity.

Gas and storage can be optimized separately because they respond to different strategies. Gas costs benefit from transaction batching and timing optimization. Storage costs benefit from capacity planning and longer term commitments. Treating them as distinct concerns enables proper optimization of each.

Building consumer applications on single token storage blockchains presents real difficulties. When token prices surge and storage costs increase 300%, you must either absorb those costs and damage your margins, or pass them to users and damage your product. Neither option supports a sustainable business.

The dual token system enables stable pricing for your users. Your costs remain predictable. Users see consistent prices. You can build sustainable businesses without embedding massive financial uncertainty into your infrastructure layer.

## Troubleshooting

**"Missing PRIVATE_KEY in .env file"**

Verify that your .env file exists in the project root directory. Ensure the private key value has no quotation marks around it. Restart your terminal to reload environment variables.

**"Insufficient USDFC balance"**

Request additional tokens from the USDFC faucet. Wait approximately one minute for tokens to arrive before retrying. Verify your actual balance in MetaMask.

**"Cannot find module" or "ERR_REQUIRE_ESM" errors**

Verify that `"type": "module"` is present in your package.json. The Synapse SDK requires ES modules. Delete the `node_modules` directory and `package-lock.json` file, then run `npm install` again. Confirm you have `viem` installed alongside `@filoz/synapse-sdk`.

**Transaction fails or times out**

The Calibration testnet occasionally experiences slower block production. Wait several minutes and retry. Check the [Calibration explorer](https://calibration.filfox.info/) to verify that transactions are processing normally.

**"Module not found" errors**

Run npm install to ensure all dependencies are installed. Verify that import statements use correct package names. Confirm you are running Node.js version 20 or higher using node --version.

## Conclusion

You now have a funded payment account on Filecoin Calibration, ready for storage operations. The account holds USDFC for storage payments, and the Warm Storage operator is approved to charge it within the limits you specified.

From here, you can begin uploading and retrieving data using the Synapse SDK's storage module. The [Synapse SDK documentation](https://docs.filecoin.cloud/developer-guides/synapse/) covers storage operations in detail, and the [storage calculator](https://docs.filecoin.cloud/developer-guides/storage/storage-costs/#detailed-calculator-guide) can help you estimate costs for production deployments.

The patterns you learned here, including payment accounts, operator allowances, and the dual token model, apply directly when you move to mainnet. The only differences are the network configuration and the use of real tokens.
## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
