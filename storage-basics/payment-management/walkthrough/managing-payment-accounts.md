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

When you deposited USDFC in the previous walkthrough, you moved tokens from your wallet into a distinct payment account. This might have seemed like unnecessary complexity. After all, why not just pay storage operators directly from your wallet?

The answer involves a fundamental tension in decentralized storage. Operators need the ability to charge you automatically over time as they continue storing your data. Filecoin produces blocks every 30 seconds, which means storage charges potentially occur thousands of times per month. Requiring manual approval for each charge would render the system completely unusable.

However, granting an operator unlimited access to your entire wallet creates obvious risks. If that operator gets compromised, experiences a bug, or behaves maliciously, your entire wallet balance becomes vulnerable.

Payment accounts solve this by creating a controlled escrow mechanism. You deposit a specific amount into an account. You grant operators limited permissions to charge from that account. Your main wallet remains completely isolated. If anything goes wrong, the maximum exposure is limited to whatever you deposited.

This architecture enables the automated recurring payments that storage requires while preventing operators from accessing your broader funds. The tradeoff is the additional step of depositing into the payment account, but this overhead proves negligible compared to the security and usability benefits.

## Step 1: Create the Payment Management Script

Create a file named `index.js` in your project directory:

```javascript
import 'dotenv/config';
import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';

async function main() {
    console.log("Managing Filecoin Payment Accounts...\n");

    // Initialize the SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const synapse = await Synapse.create({
        privateKey: privateKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("✓ SDK initialized\n");

    // Step 1: Check wallet balance
    console.log("=== Step 1: Check Wallet Balance ===");
    const walletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
    console.log(`Wallet Balance: ${ethers.formatUnits(walletBalance, 18)} USDFC\n`);

    // Step 2: Define deposit parameters
    console.log("=== Step 2: Configure Deposit Parameters ===");
    
    const depositAmount = ethers.parseUnits("5.0", 18);
    console.log(`Deposit Amount: ${ethers.formatUnits(depositAmount, 18)} USDFC`);
    
    const operatorAddress = synapse.getWarmStorageAddress();
    console.log(`Operator Address: ${operatorAddress}`);
    
    const rateAllowance = ethers.MaxUint256;
    console.log(`Rate Allowance: Unlimited (${rateAllowance})`);
    
    const lockupAllowance = ethers.MaxUint256;
    console.log(`Lockup Allowance: Unlimited (${lockupAllowance})`);
    
    const lockupPeriod = TIME_CONSTANTS.EPOCHS_PER_MONTH;
    const lockupDays = Number(lockupPeriod / TIME_CONSTANTS.EPOCHS_PER_DAY);
    console.log(`Lockup Period: ${lockupPeriod} epochs (~${lockupDays} days)\n`);

    // Step 3: Validate sufficient balance
    console.log("=== Step 3: Validate Balance ===");
    if (walletBalance < depositAmount) {
        throw new Error(
            `Insufficient balance. Required: ${ethers.formatUnits(depositAmount, 18)} USDFC, ` +
            `Available: ${ethers.formatUnits(walletBalance, 18)} USDFC`
        );
    }
    console.log("✓ Sufficient USDFC balance confirmed\n");

    // Step 4: Execute deposit and approval
    console.log("=== Step 4: Deposit and Approve Operator ===");
    console.log("Submitting transaction...");
    
    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
        depositAmount,
        operatorAddress,
        rateAllowance,
        lockupAllowance,
        lockupPeriod
    );

    console.log(`Transaction Hash: ${tx.hash}`);
    console.log("Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log(`✓ Transaction confirmed in block ${receipt.blockNumber}\n`);

    // Step 5: Verify payment account balance
    console.log("=== Step 5: Verify Payment Account Balance ===");
    
    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    console.log(`Payment Account Balance: ${ethers.formatUnits(paymentBalance, 18)} USDFC`);
    
    const updatedWalletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
    console.log(`Wallet Balance: ${ethers.formatUnits(updatedWalletBalance, 18)} USDFC\n`);

    // Step 6: Check operator allowances
    console.log("=== Step 6: Check Operator Allowances ===");
    
    const allowance = await synapse.payments.allowance(
        operatorAddress,
        TOKENS.USDFC
    );
    
    console.log(`Rate Allowance: ${allowance.rateAllowance === ethers.MaxUint256 ? 'Unlimited' : ethers.formatUnits(allowance.rateAllowance, 18)}`);
    console.log(`Lockup Allowance: ${allowance.lockupAllowance === ethers.MaxUint256 ? 'Unlimited' : ethers.formatUnits(allowance.lockupAllowance, 18)}`);
    
    console.log("\n✅ Payment setup complete! Your account is ready for storage operations.");
}

main().catch((err) => {
    console.error("Error during payment management:");
    console.error(err);
    process.exit(1);
});
```

This script demonstrates six key operations that give you complete visibility into payment account management. Each console log group corresponds to a distinct operation worth understanding individually.

## Understanding the Code

### Wallet Balance vs Payment Account Balance

```javascript
const walletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
```

This retrieves your wallet's USDFC balance, which represents tokens you control directly through your private key. This is distinct from your payment account balance, which exists in the payment contract.

The distinction matters because only wallet balance can be used for arbitrary transactions. Payment account balance is locked into the payment system and can only be used for storage payments or withdrawn back to your wallet through specific operations.

### Deposit Amount Considerations

```javascript
const depositAmount = ethers.parseUnits("5.0", 18);
```

Choosing an appropriate deposit amount involves balancing several factors. Depositing too little means you will need to perform additional deposit transactions frequently, which wastes gas. Depositing too much ties up funds in the payment account that could be used elsewhere.

For testnet experimentation, the actual amount matters little since tokens are free. For production deployments, you should calculate this based on your anticipated storage needs. The [storage calculator](https://docs.filecoin.cloud/developer-guides/storage/storage-costs/#detailed-calculator-guide) provides precise estimates based on data volume and duration.

Current Calibration pricing is approximately 2.5 USDFC per TiB per month for Warm Storage. If you plan to store 10 TiB for three months, you would need approximately 75 USDFC plus a buffer for variations in storage operator pricing.

### The Operator Address

```javascript
const operatorAddress = synapse.getWarmStorageAddress();
```

This returns the address of the Warm Storage operator maintained by the Filecoin Onchain Cloud team. Warm Storage optimizes for frequently accessed data and provides fast retrieval times.

Filecoin also offers Cold Storage for archival data that you rarely need to access. Cold Storage costs less but retrieval takes longer. The operator you choose depends on your data access patterns. If users regularly download files from your application, Warm Storage makes sense. If you are storing compliance records or backups that you hope never to access, Cold Storage may be more economical.

The operator address is critical because you are granting this address permission to charge your payment account. You should only approve operators you trust. The Warm Storage operator is maintained by the Filecoin Onchain Cloud team and undergoes regular security audits, but you should perform your own due diligence for any operator you approve.

### Rate Allowance

```javascript
const rateAllowance = ethers.MaxUint256;
```

The rate allowance limits how much an operator can charge per epoch. An epoch on Filecoin lasts 30 seconds, so rate allowance controls the maximum charge every 30 seconds.

Setting this to `ethers.MaxUint256` (unlimited) might seem reckless, but it is actually safe when combined with other protections. Operators cannot charge arbitrary amounts. They can only charge for storage you actively use based on cryptographically verified proofs. If you store 1 GiB, the operator can only charge for 1 GiB even with unlimited rate allowance.

The unlimited setting simply means you will not accidentally block legitimate charges due to rate limits. If you stored 100 TiB and the epoch charge exceeds your rate allowance, the payment would fail and you could lose access to your data. Unlimited prevents this scenario.

You could set a specific rate limit if you want an absolute ceiling on charges per epoch. This might make sense if you are experimenting and want to ensure you cannot accidentally be charged more than expected. For production deployments with validated storage amounts, unlimited is typically the correct choice.

### Lockup Allowance

```javascript
const lockupAllowance = ethers.MaxUint256;
```

The lockup allowance limits the total amount that can be locked for storage deals. When an operator stores your data, they lock a portion of your payment account balance for the deal duration. This guarantees they receive payment for maintaining the storage.

Setting this to unlimited means operators can lock your entire payment account balance if needed. This is safe because:

1. Locked funds are still your funds. They cannot be taken, only temporarily reserved.
2. You can only store as much data as your payment account can fund. Operators cannot lock arbitrary amounts.
3. Locked funds unlock automatically when the storage deal period expires.

If you set a lower lockup allowance, you might prevent yourself from using your full payment account balance. For example, if you deposit 100 USDFC but set a 50 USDFC lockup allowance, you could only use half your deposit for storage deals. There is rarely a reason to constrain this.

### Lockup Period

```javascript
const lockupPeriod = TIME_CONSTANTS.EPOCHS_PER_MONTH;
```

The lockup period determines how long funds remain locked per storage deal. Setting this to one month means each storage deal locks funds for 30 days.

This matters more than it might initially appear. A longer lockup period means your funds remain committed for longer. If you want to withdraw funds from your payment account, you must wait for locked amounts to unlock. A 6-month lockup period means potentially waiting 6 months to access those funds.

However, shorter lockup periods create overhead. When a lockup expires, the storage deal must be renewed, which involves some onchain operations. Very short lockup periods mean constant renewals.

For most applications, 30 days strikes a reasonable balance between flexibility and operational efficiency. If you are certain your storage needs are long-term, you could extend this to 3-6 months to reduce renewal frequency. If you are experimenting and may want to withdraw funds quickly, you could shorten it to 1-2 weeks.

### The Atomic Transaction

```javascript
const tx = await synapse.payments.depositWithPermitAndApproveOperator(
    depositAmount,
    operatorAddress,
    rateAllowance,
    lockupAllowance,
    lockupPeriod
);
```

This single method call performs two distinct operations atomically:

1. Deposits USDFC from your wallet into your payment account
2. Approves the operator to charge from that payment account within specified limits

Executing these atomically provides important guarantees. Either both operations succeed or both fail. You cannot end up in a state where funds got deposited but the operator was not approved, or where the operator was approved but funds were not deposited.

The method also saves gas by combining what would otherwise be two separate transactions into one. On mainnet, where gas costs real money, this optimization provides tangible savings.

### Balance Verification

```javascript
const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
const updatedWalletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
```

After the deposit, you should verify that funds moved correctly. The `balance()` method returns your payment account balance, which should have increased by the deposit amount. The `walletBalance()` method returns your wallet balance, which should have decreased by the deposit amount plus gas costs.

This verification serves as a sanity check. If the balances do not reflect the expected changes, something went wrong. On testnet this is not critical, but on mainnet you should always verify that large deposits succeeded as intended.

### Allowance Inspection

```javascript
const allowance = await synapse.payments.allowance(
    operatorAddress,
    TOKENS.USDFC
);
```

This retrieves the current allowance you have granted to the operator. The returned object contains `rateAllowance` and `lockupAllowance` fields that reflect the limits you set.

Checking allowances confirms that the approval succeeded and the operator has the permissions needed to charge your account. This is particularly important if you ever need to revoke or modify allowances later. The allowance system provides transparency into exactly which operators can charge your account and what their limits are.

## Step 2: Run the Script

Execute the script to see each operation in detail:

```bash
node index.js
```

You should see output similar to:

```
Managing Filecoin Payment Accounts...

✓ SDK initialized

=== Step 1: Check Wallet Balance ===
Wallet Balance: 18.5 USDFC

=== Step 2: Configure Deposit Parameters ===
Deposit Amount: 5.0 USDFC
Operator Address: 0x1234567890abcdef1234567890abcdef12345678
Rate Allowance: Unlimited (115792089237316195423570985008687907853269984665640564039457584007913129639935)
Lockup Allowance: Unlimited (115792089237316195423570985008687907853269984665640564039457584007913129639935)
Lockup Period: 86400 epochs (~30 days)

=== Step 3: Validate Balance ===
✓ Sufficient USDFC balance confirmed

=== Step 4: Deposit and Approve Operator ===
Submitting transaction...
Transaction Hash: 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
Waiting for confirmation...
✓ Transaction confirmed in block 123456

=== Step 5: Verify Payment Account Balance ===
Payment Account Balance: 5.0 USDFC
Wallet Balance: 13.499 USDFC

=== Step 6: Check Operator Allowances ===
Rate Allowance: Unlimited
Lockup Allowance: Unlimited

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

On Calibration testnet, gas is free since tFIL has no value. On mainnet, gas costs real FIL. The `depositWithPermitAndApproveOperator` transaction is relatively expensive because it performs two operations: an ERC-20 permit signature verification and an operator approval.

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

The permit signature used in `depositWithPermitAndApproveOperator` has a deadline. If your system clock is significantly wrong, the signature might be rejected. Ensure your system time is accurate.

**Balance does not update after deposit**

Wait approximately 60 seconds for the transaction to be mined. Filecoin block times are around 30 seconds. If the balance still has not updated after several minutes, check the transaction hash on the [Calibration block explorer](https://calibration.filfox.info/) to see if it succeeded or failed.

**Allowance shows as 0 after approval**

This typically means the transaction failed. Verify the transaction hash shows success on the block explorer. If the transaction succeeded but allowances show 0, ensure you are checking the allowance for the correct operator address.

**Cannot withdraw from payment account**

Funds in active storage deals are locked and cannot be withdrawn until the lockup period expires. Check how much of your balance is currently locked using the `synapse.payments.balance()` query. The total balance includes locked amounts, but only unlocked amounts can be withdrawn.

## Conclusion

You now understand how payment accounts work at a detailed level. You have seen what each parameter controls, why the architecture uses atomic transactions, and how to verify that deposits and allowances are configured correctly.

The payment account system demonstrates thoughtful design that balances competing concerns. It enables the automated recurring payments that decentralized storage requires while preventing operators from accessing more funds than appropriate. It uses cryptographically enforced limits rather than trust. And it provides transparency through queryable onchain state.

From here, you are ready to begin storing data using the Synapse SDK. The next walkthrough will cover uploading files, retrieving them, and understanding how storage deals work. The payment foundation you have built here will automatically handle the financial aspects while you focus on the storage operations themselves.

For production deployments, revisit the sections on deposit strategy, allowance management, and security practices. These patterns scale from testnet experimentation to mainnet applications handling production data and real costs.
