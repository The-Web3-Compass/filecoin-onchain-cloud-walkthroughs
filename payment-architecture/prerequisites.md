# Prerequisites for Payment Architecture Walkthroughs

Before running the payment architecture examples, you need a funded payment account on the Filecoin Calibration testnet.

## Requirements

| Requirement | Purpose |
|-------------|---------|
| **tFIL** | Gas fees for transactions |
| **USDFC** | Payment for storage operations |
| **Funded payment account** | Storage providers charge this account |
| **Operator approval** | Permission for providers to charge you |

## Step 1: Get Test Tokens

### tFIL (Gas)
Get tFIL from the Calibration faucet:
- https://faucet.calibration.fildev.network/

### USDFC (Storage Payment)
Get USDFC from:
- https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc

## Step 2: Fund Your Payment Account

Having USDFC in your wallet is not enough. You must **deposit** it into your payment account.

Run the payment-management module from storage-basics:

```bash
cd storage-basics/payment-management/code
npm install
# Create .env.local with your PRIVATE_KEY
npm start
```

This script:
1. Checks your wallet USDFC balance
2. Deposits USDFC into your payment account
3. Approves the warm storage operator

## Step 3: Verify Setup

After running payment-management, verify your setup by checking:

```javascript
// Check payment account balance (not wallet balance)
const balance = await synapse.payments.balance(TOKENS.USDFC);

// Check operator approval
const operator = synapse.getWarmStorageAddress();
const approval = await synapse.payments.serviceApproval(operator, TOKENS.USDFC);
```

If `balance > 0` and `approval.isApproved === true`, you're ready.

## Environment Setup

Each module requires a `.env.local` file:

```bash
PRIVATE_KEY=your_private_key_here
```

> **Note**: The private key should correspond to the wallet you funded with tFIL and USDFC.

## Module Dependencies

| Module | Dependencies |
|--------|-------------|
| storage-basics | None |
| payment-architecture | storage-basics/payment-management (funding) |
| fast-delivery | storage-basics (basic operations) |

## Common Issues

**"Payment Account Balance: 0"**
- You have USDFC in your wallet but haven't deposited to your payment account
- Solution: Run `storage-basics/payment-management`

**"Operator not approved"**
- The storage provider lacks permission to charge your account
- Solution: Run `storage-basics/payment-management` (it handles approval)

**"Data size below minimum"**
- Upload data must be at least 127 bytes
- Solution: Increase your sample data size

**"Missing PRIVATE_KEY"**
- The `.env.local` file is missing or incorrectly named
- Solution: Create `.env.local` with `PRIVATE_KEY=your_key`
