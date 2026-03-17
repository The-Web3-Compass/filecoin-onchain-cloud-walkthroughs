# Managing Payment Accounts on Filecoin

In the previous walkthrough, you configured your environment and performed your first deposit to a Filecoin payment account. That experience was deliberately streamlined to minimize friction and get you operational quickly. This walkthrough goes deeper into what actually happens when you fund a payment account and why each parameter matters.

Understanding payment account mechanics proves valuable when you need to make informed decisions about production deployments. How much should you deposit? What do rate allowances actually control? Why does the lockup period exist? These questions have practical implications for how you architect your storage strategy and manage costs over time.

This walkthrough examines each component of the payment setup process. You will learn what the deposit transaction is actually doing onchain, how operator allowances protect your funds while enabling automated payments, and how to verify that your payment account is configured correctly. By the end, you will understand not just how to fund an account, but how the payment architecture works and why it was designed this way.

## Prerequisites

Before proceeding, ensure you have completed the previous walkthrough:

- **Environment Setup**: You should have a working project with the Synapse SDK installed
- **Funded Wallet**: Your wallet should contain USDFC and tFIL from the Calibration faucets
- **Basic Understanding**: You should understand the dual-token model and why payment accounts exist

If you skipped the initial setup walkthrough, complete that first. This module builds on those foundations and assumes you are familiar with SDK initialization and basic wallet operations.

## What This Walkthrough Covers

We will examine six distinct aspects of payment account management:

1. **Balance Verification** - Understanding the difference between wallet balance and payment account balance
2. **Deposit Parameters** - What each parameter controls and how to choose appropriate values
3. **Operator Allowances** - How rate and lockup allowances protect your funds
4. **Transaction Anatomy** - What happens onchain when you deposit and approve
5. **Balance Checking** - Verifying funds were deposited correctly
6. **Allowance Inspection** - Confirming operator permissions are set as intended

Each section explains not only what to do, but why the architecture requires it and what tradeoffs are involved.

## Payment Accounts: A Deeper Look

![payment accounts](https://raw.githubusercontent.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/refs/heads/main/storage-basics/payment-management/images/1.png)

When you deposited USDFC in the previous walkthrough, you moved tokens from your wallet into a distinct payment account. This might have seemed like unnecessary complexity. After all, why not just pay storage operators directly from your wallet?

The answer involves a fundamental tension in decentralized storage. Operators need the ability to charge you automatically over time as they continue storing your data. Filecoin produces blocks every 30 seconds, which means storage charges potentially occur thousands of times per month. Requiring manual approval for each charge would render the system completely unusable.

However, granting an operator unlimited access to your entire wallet creates obvious risks. If that operator gets compromised, experiences a bug, or behaves maliciously, your entire wallet balance becomes vulnerable.

Payment accounts solve this by creating a controlled escrow mechanism. You deposit a specific amount into an account. You grant operators limited permissions to charge from that account. Your main wallet remains completely isolated. If anything goes wrong, the maximum exposure is limited to whatever you deposited.

This architecture enables the automated recurring payments that storage requires while preventing operators from accessing your broader funds. The tradeoff is the additional step of depositing into the payment account, but this overhead proves negligible compared to the security and usability benefits.

## Step 1: Create the Payment Management Script

Create a file named `index.js` in your project directory:

```javascript
import 'dotenv/config';
import { Synapse } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
    console.log("Managing Filecoin Payment Accounts...\n");

    // Initialize the SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

    const synapse = Synapse.create({
        account: privateKeyToAccount(formattedPrivateKey),
        source: 'payment-management'
    });

    console.log("✓ SDK initialized\n");

    // Check wallet balance
    const walletBalance = await synapse.payments.walletBalance();

    // Step 1: Define storage size requirements
    console.log("=== Step 1: Configure Deposit Parameters ===");

    // Let's pretend we want to store 5 TiB of data
    // 5 TiB = 5 * 1024 * 1024 * 1024 * 1024 bytes
    const targetDataSize = BigInt(5 * 1024 * 1024 * 1024 * 1024);
    console.log(`Target Data Size: 5 TiB`);

    // The SDK automatically calculates the exact deposit needed
    // based on the size of the data you intend to upload
    const prep = await synapse.storage.prepare({
        dataSize: targetDataSize,
    });

    console.log(`Total Value Required: ${prep.costs.depositNeeded} raw units of USDFC (wei)`);
    console.log(`Payment Status: ${prep.costs.ready ? 'Ready to upload' : 'Deposit required'}\n`);

    // Step 2: Validate sufficient balance
    console.log("=== Step 2: Validate Balance ===");
    if (walletBalance < prep.costs.depositNeeded) {
        throw new Error(
            `Insufficient balance. Required: ${prep.costs.depositNeeded} USDFC (wei), ` +
            `Available: ${walletBalance} USDFC (wei)`
        );
    }
    console.log("✓ Sufficient USDFC balance confirmed\n");

    // Step 3: Execute deposit and approval
    console.log("=== Step 3: Deposit and Approve Operator ===");

    // `prepare` returns a single transaction that handles deposit + approval.
    // If your account is already funded, `transaction` will be null.
    if (prep.transaction) {
        console.log("Submitting payment and approval transaction...");
        const { hash } = await prep.transaction.execute();
        console.log(`Transaction Hash: ${hash}`);
        console.log("Waiting for confirmation...");
        await synapse.client.waitForTransactionReceipt({ hash });
        console.log(`✓ Payment transaction confirmed\n`);
    } else {
        console.log(`✓ Payment already setup! No transactions required.\n`);
    }

    // Step 4: Verify payment account balance
    console.log("=== Step 4: Verify Payment Account Balance ===");

    const paymentBalance = await synapse.payments.balance();
    console.log(`Payment Account Balance: ${paymentBalance.toString()} USDFC (wei)`);

    const updatedWalletBalance = await synapse.payments.walletBalance();
    console.log(`Wallet Balance: ${updatedWalletBalance.toString()} USDFC (wei)\n`);

    console.log("\n✅ Payment setup complete! Your account is ready for storage operations.");
}

main().catch((err) => {
    console.error("Error during payment management:");
    console.error(err);
    process.exit(1);
});
```

This script demonstrates four key operations that give you complete visibility into payment account management. Each console log group corresponds to a distinct operation worth understanding individually.

## Understanding the Code

### Wallet Balance vs Payment Account Balance

```javascript
const walletBalance = await synapse.payments.walletBalance();
```

This retrieves your wallet's USDFC balance, which represents tokens you control directly through your private key. This is distinct from your payment account balance, which exists in the payment contract.

The distinction matters because only wallet balance can be used for arbitrary transactions. Payment account balance is locked into the payment system and can only be used for storage payments or withdrawn back to your wallet through specific operations.

### Understanding `prepare()`

```javascript
const prep = await synapse.storage.prepare({
    dataSize: targetDataSize
});
```

Choosing an appropriate deposit amount historically involved balancing several complex factors, calculating epochs, and factoring in the varying operator limits manually. With Synapse SDK `v0.37.0+`, this complexity is handled for you by `synapse.storage.prepare()`.

You simply tell it how much data you intend to store (`dataSize`), and it returns:
1. `costs`: An object detailing EXACTLY how much USDFC is required (`depositNeeded`), the current `ready` status of your payment account, and the calculated `rate`.
2. `transaction`: A single prepared transaction object (deposit + approval combined). If your payment account is already funded adequately, `transaction` will be `null`.

Current Calibration pricing is approximately 2.5 USDFC per TiB per month for Warm Storage. The SDK natively understands this and factors in your `dataSize` to determine what's required.

### Transaction Execution

```javascript
if (prep.transaction) {
    const { hash } = await prep.transaction.execute();
// ...
```

The `transaction` object returned by `prepare()` encapsulates the required deposit and approval as a single atomic call. Calling `.execute()` submits it to the blockchain and returns the transaction hash. The Synapse SDK formats these calls optimally.

### Balance Verification

```javascript
const paymentBalance = await synapse.payments.balance();
const updatedWalletBalance = await synapse.payments.walletBalance();
```

After the deposit, you verify that funds moved correctly. The `balance()` method returns your payment account balance, which should have increased by the deposit amount. The `walletBalance()` method returns your wallet balance, which should have decreased by the deposit amount plus gas costs.

## Step 2: Run the Script

Execute the script to see each operation in detail:

```bash
node index.js
```

You should see output similar to:

```
Managing Filecoin Payment Accounts...

✓ SDK initialized

=== Step 1: Configure Deposit Parameters ===
Target Data Size: 5 TiB
Total Value Required: 3750000000000000000 raw units of USDFC (wei)
Payment Status: Deposit required

=== Step 2: Validate Balance ===
✓ Sufficient USDFC balance confirmed

=== Step 3: Deposit and Approve Operator ===
Submitting payment and approval transaction...
Transaction Hash: 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
Waiting for confirmation...
✓ Payment transaction confirmed

=== Step 4: Verify Payment Account Balance ===
Payment Account Balance: 3750000000000000000 USDFC (wei)
Wallet Balance: 13499000000000000000 USDFC (wei)

✅ Payment setup complete! Your account is ready for storage operations.
```

The output shows each step executing successfully. Note that the wallet balance decreased by slightly more than the deposit amount due to gas costs for the transaction.

## Production Considerations

### Deposit Strategy

For production applications, you should establish a systematic approach to payment account deposits.

**Monitor Balance Actively**: Implement monitoring that alerts you when payment account balance falls below a threshold. Running out of funds mid-month could interrupt user access to stored data. A simple approach is to query `synapse.payments.balance()` periodically and trigger an alert when the balance drops below what you need for the next billing cycle.

**Maintain a Buffer**: Deposit more than the exact minimum required. Storage costs can vary slightly based on network conditions. A 20% buffer handles variations without requiring constant attention.

**Automate Top-Ups**: For high-volume applications, consider automating payment account deposits when balance falls below a threshold. This prevents manual oversight from becoming a operational burden.

**Separate Accounts for Different Purposes**: If you operate multiple distinct services, consider using separate wallets with separate payment accounts. This provides isolation and makes cost tracking clearer.

### Allowance Management

The unlimited allowances used in this example work well for most scenarios, but you should understand when to use restricted allowances.

**Rate Limits for Testing**: When testing new storage patterns, setting an explicit rate allowance can prevent unexpected costs if something behaves differently than anticipated. If you expect charges of 0.1 USDFC per epoch, setting a rate allowance of 0.2 USDFC per epoch provides safety while allowing normal operations.

**Lockup Limits for Liquidity**: If you need to maintain high liquidity in your payment account for rapid withdrawals, you might set a lockup allowance that reserves some portion of the account balance. For example, with a 100 USDFC balance, you could set a 75 USDFC lockup allowance, ensuring at least 25 USDFC remains unlocked.

**Periodic Allowance Reviews**: Even with unlimited allowances, you should periodically verify which operators have access to your accounts. The `allowance()` method lets you audit these permissions. If you no longer use a particular operator, consider revoking their allowance to reduce potential attack surface.

### Lockup Period Strategy

The lockup period affects both cost and flexibility. Understanding these tradeoffs helps you choose appropriately.

**Longer Lockups for Stable Storage**: If you know your data will remain stored long-term, extending the lockup period to 3-6 months reduces the frequency of deal renewals. Each renewal involves some onchain operation overhead. Fewer renewals means less overhead and potentially lower costs.

**Shorter Lockups for Flexibility**: If your storage needs are uncertain or you may want to withdraw funds soon, shorter lockups make sense. A 7-14 day lockup gives you flexibility to change direction without waiting months for funds to unlock.

**Consider Withdrawal Timing**: Remember that locked funds cannot be withdrawn immediately. If you anticipate needing to withdraw 75% of your payment account balance in 60 days, ensure your lockup period does not exceed 60 days or plan your deposits accordingly.

## Transaction Costs

Every deposit to your payment account consumes gas paid in tFIL. Understanding these costs helps with budgeting.

On Calibration testnet, gas is free since tFIL has no value. On mainnet, gas costs real FIL. The deposit transaction is relatively expensive because it performs two operations atomically: an ERC-20 permit signature verification and an operator approval.

Typical gas costs on mainnet range from 0.0001 to 0.001 FIL depending on network congestion, which translates to a few cents at current FIL prices. This is negligible compared to the storage costs you are funding, but it means you should not deposit trivial amounts frequently. Depositing 0.1 USDFC every day would waste more on gas than the deposits are worth.

A reasonable strategy is to deposit enough to cover at least one month of storage in each transaction. This amortizes the gas cost across a meaningful period.

## Security Best Practices

Payment accounts reduce risk but do not eliminate it entirely. Follow these practices to maintain security:

**Use Dedicated Wallets for Production**: Your payment account management wallet should be separate from wallets holding significant funds. If the private key becomes compromised, the attacker can withdraw the payment account balance, but not access your other funds.

**Implement Withdrawal Policies**: Establish clear policies around who can withdraw funds from payment accounts and under what circumstances. This should be documented and enforced through operational procedures.

**Monitor Unexpected Activity**: Implement alerting for unusual patterns like rapid balance decreases or unexpected operators being approved. This helps detect compromised keys or bugs in your application.

**Regular Allowance Audits**: Periodically review which operators have allowances on your payment accounts. Revoke allowances for operators you no longer use.

## Troubleshooting

**"Insufficient balance" errors**

Ensure your wallet contains enough USDFC to cover the deposit amount. Remember that you also need tFIL for gas, so if you have exactly the deposit amount in USDFC but no tFIL, the transaction will fail.

**Transaction fails with "permit expired"**

The permit signature used in the deposit transaction has a deadline. If your system clock is significantly wrong, the signature might be rejected. Ensure your system time is accurate.

**Balance does not update after deposit**

Wait approximately 60 seconds for the transaction to be mined. Filecoin block times are around 30 seconds. If the balance still has not updated after several minutes, check the transaction hash on the [Calibration block explorer](https://calibration.filfox.info/) to see if it succeeded or failed.

**Allowance shows as 0 after approval**

This typically means the transaction failed. Verify the transaction hash shows success on the block explorer. If the transaction succeeded but allowances show 0, ensure you are checking the allowance for the correct operator address.

**"Cannot format null value" error when checking allowances**

This error occurs when trying to format `null` or `undefined` allowance values with `formatUnits()`. The code in this walkthrough includes null checks to prevent this, but if you encounter it in your own code, ensure you check for null/undefined before formatting:

```javascript
const MAX_UINT256 = 2n ** 256n - 1n;

if (allowance.rateAllowance === null || allowance.rateAllowance === undefined) {
    console.log('Rate Allowance: Not set');
} else if (allowance.rateAllowance === MAX_UINT256) {
    console.log('Rate Allowance: Unlimited');
} else {
    console.log(`Rate Allowance: ${formatUnits(allowance.rateAllowance)} USDFC`);
}
```

This defensive approach handles edge cases where the blockchain state may not be fully synchronized immediately after transactions.

**Allowance shows "Not set"**

This indicates that the RPC node has not yet fully indexed the transaction. Even though the transaction is confirmed, the read-only state query might return incomplete data for a few seconds. This is known as "eventual consistency." 

If you see this, simply wait 10-20 seconds and run a separate script to check allowances again, or add a short delay in your script before checking:

```javascript
await new Promise(r => setTimeout(r, 5000));
```

**Cannot withdraw from payment account**

Funds in active storage deals are locked and cannot be withdrawn until the lockup period expires. Check how much of your balance is currently locked using the `synapse.payments.balance()` query. The total balance includes locked amounts, but only unlocked amounts can be withdrawn.

## Conclusion

You now understand how payment accounts work at a detailed level. You have seen what each parameter controls, why the architecture uses atomic transactions, and how to verify that deposits and allowances are configured correctly.

The payment account system demonstrates thoughtful design that balances competing concerns. It enables the automated recurring payments that decentralized storage requires while preventing operators from accessing more funds than appropriate. It uses cryptographically enforced limits rather than trust. And it provides transparency through queryable onchain state.

From here, you are ready to begin storing data using the Synapse SDK. The next walkthrough will cover uploading files, retrieving them, and understanding how storage deals work. The payment foundation you have built here will automatically handle the financial aspects while you focus on the storage operations themselves.

For production deployments, revisit the sections on deposit strategy, allowance management, and security practices. These patterns scale from testnet experimentation to mainnet applications handling production data and real costs.

## Community & Support

Need help? Visit the [Filecoin Slack](https://filecoin.io/slack) to resolve any queries. Also, join the [Web3Compass Telegram group](https://t.me/+Bmec234RB3M3YTll) to ask the community.
