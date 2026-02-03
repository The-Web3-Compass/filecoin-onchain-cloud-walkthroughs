# Advanced Payment Operations on Filecoin

In the previous payment management walkthrough, you learned how to deposit USDFC into a payment account and approve operators. That tutorial focused on the initial setup—getting funds into the system and granting permissions. This walkthrough explores what happens after that initial setup: how to monitor your account health, understand where your funds are, manage operator permissions, visualize payment flows, and withdraw funds when needed.

Production applications require ongoing payment management. You need to know when balances are running low, understand which operators have access to your funds, track active payment channels, and maintain visibility into your financial position. This walkthrough teaches you how to implement comprehensive payment monitoring and management for production deployments.



## Module Structure

This module provides **five separate scripts**, each focusing on a specific payment operation. This structure allows you to learn each concept in isolation and run operations independently:

> [!NOTE]
> All reference scripts are available in the official repository: [Runable Scripts](https://github.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/tree/main/storage-basics/advanced-payment-management/code)

```
code/
├── 1-check-balances.js      - Wallet vs payment account balances
├── 2-account-health.js       - Lockup, available funds, days remaining
├── 3-operator-approvals.js   - Operator permission inspection
├── 4-payment-rails.js        - Payment channel visualization
├── 5-withdraw-funds.js       - Fund withdrawal operations
├── package.json              - Dependencies and npm scripts
├── .env.example              - Environment template
└── README.md                 - Setup instructions
```

Each script is self-contained and can be run independently using npm scripts:

```bash
npm run balances    # Check balances
npm run health      # Account health monitoring
npm run approvals   # Operator approvals
npm run rails       # Payment rails visualization
npm run withdraw    # Withdraw funds
```


## Prerequisites

Before proceeding, ensure you have completed:

- **Environment Setup**: Working project with Synapse SDK installed
- **Payment Management**: Completed the `payment-management` tutorial and deposited USDFC
- **Operator Approval**: Approved the Warm Storage operator
- **(Optional) Storage Operations**: Uploaded data to create payment rails (for script 4)

If you have not yet deposited funds or approved operators, complete the `payment-management` tutorial first. This module assumes you have an active payment account with funds.

## What This Walkthrough Covers

We will explore five payment management operations through dedicated scripts:

1. **Check Balances** (`1-check-balances.js`) - Understanding wallet vs payment account balances
2. **Account Health** (`2-account-health.js`) - Tracking lockup, available funds, and days remaining
3. **Operator Approvals** (`3-operator-approvals.js`) - Inspecting which operators can charge your account
4. **Payment Rails** (`4-payment-rails.js`) - Viewing active payment channels and their details
5. **Withdraw Funds** (`5-withdraw-funds.js`) - Moving available funds back to your wallet

Each section explains the operation, demonstrates the code, discusses production considerations, and provides troubleshooting guidance.

## Understanding the Payment Architecture

Before diving into operations, let's clarify how funds flow through the Filecoin payment system. This architecture might seem complex at first, but each component serves a specific purpose.

### The Three-Layer Model

Your USDFC exists in three potential states:

**1. Wallet Balance**
- Tokens in your Ethereum wallet
- Fully under your control
- Can be used for gas fees or deposited for storage
- Not yet available for storage operations

**2. Payment Account Balance**
- Tokens deposited into the Filecoin Pay contract
- Available for operator charges
- Protected by allowance limits
- Can be withdrawn (if not locked)

**3. Locked Funds**
- Portion of payment account reserved for active deals
- Guarantees future payments to providers
- Cannot be withdrawn while deals are active
- Released when deals complete

The distinction between these states matters because operations like withdrawals only work on unlocked funds. Understanding this architecture prevents confusion when funds appear "stuck" in the payment account.

### Why Lockup Exists

The lockup mechanism protects storage providers from non-payment. When you create a storage deal, the system calculates how much you will owe over the deal's duration and locks that amount. This ensures providers get paid even if you stop settling payments or your account runs low.

Think of lockup as a security deposit. The provider knows they can access these funds if needed, which enables them to provide service without constant payment verification. For you, it means maintaining a buffer above your lockup requirement to avoid deal termination.

## Step 1: Checking Balances

**Script**: `1-check-balances.js`  
**Run with**: `npm run balances`

The first operation in any payment management workflow is understanding where your funds are. Let's examine how to check both wallet and payment account balances.

### The Code

```javascript
const walletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);

console.log("Wallet Balance:");
console.log(`  ${ethers.formatUnits(walletBalance, 18)} USDFC`);

console.log("Payment Account Balance:");
console.log(`  ${ethers.formatUnits(paymentBalance, 18)} USDFC`);

const totalBalance = walletBalance + paymentBalance;
console.log(`Total USDFC: ${ethers.formatUnits(totalBalance, 18)}`);
```

### What's Happening

**`walletBalance(TOKENS.USDFC)`** queries the USDFC ERC-20 contract to check your wallet's token balance. This is the standard ERC-20 `balanceOf()` call, wrapped by the SDK for convenience.

**`balance(TOKENS.USDFC)`** queries the Filecoin Pay contract to check your payment account balance. This is a separate balance from your wallet—funds you have explicitly deposited for storage operations.

Both methods return `bigint` values representing the smallest token unit (wei). We use `ethers.formatUnits(value, 18)` to convert to human-readable USDFC amounts (USDFC has 18 decimal places, like most ERC-20 tokens).

### Why You Need Both

Checking only one balance gives an incomplete picture. Consider these scenarios:

**Scenario 1: Funds in Wallet, Empty Payment Account**
- You have USDFC but have not deposited it yet
- Storage operations will fail
- Solution: Deposit funds using `depositWithPermitAndApproveOperator()`

**Scenario 2: Empty Wallet, Funds in Payment Account**
- You can perform storage operations
- But you cannot pay gas fees for new deposits or withdrawals
- Solution: Keep some tFIL in wallet for gas

**Scenario 3: Funds Split Between Both**
- Normal operating state
- Wallet holds reserve funds
- Payment account holds active storage budget

Production applications should monitor both balances and alert when either falls below thresholds.

### Production Considerations

**Monitoring Frequency**: Check balances at least daily. For high-volume applications, check hourly or implement real-time monitoring via blockchain events.

**Alert Thresholds**: Set alerts when:
- Payment account balance < 7 days of storage costs
- Wallet balance < 0.1 tFIL (insufficient for gas)
- Total balance < minimum operational requirement

**Cost Tracking**: Log balance changes to track storage costs over time. This data helps with budgeting and cost optimization.

## Step 2: Account Health Monitoring

**Script**: `2-account-health.js`  
**Run with**: `npm run health`

Balance checks tell you how much you have. Account health monitoring tells you how long it will last and what constraints you are operating under.

### The Code

```javascript
const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);

console.log(`Total Funds: ${ethers.formatUnits(accountInfo.funds, 18)} USDFC`);
console.log(`Current Lockup: ${ethers.formatUnits(accountInfo.lockupCurrent, 18)} USDFC`);
console.log(`Lockup Rate: ${ethers.formatUnits(accountInfo.lockupRate, 18)} USDFC/epoch`);
console.log(`Available Funds: ${ethers.formatUnits(accountInfo.availableFunds, 18)} USDFC`);

// Calculate days remaining
if (accountInfo.lockupRate > 0n) {
    const epochsRemaining = accountInfo.availableFunds / accountInfo.lockupRate;
    const daysRemaining = Number(epochsRemaining) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);
    console.log(`Days Remaining: ~${daysRemaining.toFixed(1)} days`);
}
```

### Understanding the Response

The `accountInfo()` method returns a comprehensive view of your payment account:

**`funds`** - Total balance in your payment account. This should match the value from `balance()` in Step 1.

**`lockupCurrent`** - Amount currently locked for active storage deals. This is your safety buffer that providers can access if needed. Formula: `sum of (paymentRate × lockupPeriod)` for all active rails.

**`lockupRate`** - How much gets locked per epoch across all your active deals. If you are storing 1 GiB, this might be ~0.0000565 USDFC/epoch. This rate determines how quickly your balance depletes.

**`availableFunds`** - Funds you can withdraw right now. Formula: `funds - lockupCurrent`. This is the only portion you can move back to your wallet.

**`lockupLastSettledAt`** - Epoch number when payments were last processed. This updates when you or providers settle payment rails.

### Calculating Days Remaining

The days remaining calculation answers a critical question: "How long until I run out of funds?"

```javascript
const epochsRemaining = accountInfo.availableFunds / accountInfo.lockupRate;
const daysRemaining = Number(epochsRemaining) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);
```

This calculation assumes your current storage usage remains constant. If you upload more data, the lockup rate increases and days remaining decreases. If deals complete, the lockup rate decreases and days remaining increases.

**Why This Matters**: Running out of funds causes payment rails to terminate, which stops storage service. Monitoring days remaining lets you deposit more funds before termination occurs.

### Health Thresholds

Implement a tiered alert system:

**Critical (< 3 days)**: Immediate action required. Deposit funds now or risk service interruption.

**Warning (< 7 days)**: Plan to deposit funds soon. Review storage usage and costs.

**Caution (< 14 days)**: Normal monitoring. No immediate action needed but keep an eye on it.

**Healthy (> 14 days)**: Operating normally. Continue routine monitoring.

### Production Monitoring

**Automated Alerts**: Set up monitoring that checks `accountInfo()` daily and sends alerts based on days remaining. Use email, Slack, PagerDuty, or your preferred notification system.

**Trend Analysis**: Track lockup rate over time. Increasing rates indicate growing storage usage. Decreasing rates might indicate deals completing or data deletion.

**Capacity Planning**: Use historical lockup rates to predict future funding needs. If your rate grows 10% monthly, plan deposits accordingly.

## Step 3: Operator Approvals

**Script**: `3-operator-approvals.js`  
**Run with**: `npm run approvals`

Operator approvals control which contracts can charge your payment account. Understanding and monitoring these approvals is critical for security and operational awareness.

### The Code

```javascript
const operatorAddress = synapse.getWarmStorageAddress();
const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

console.log(`Approved: ${approval.isApproved ? '✓ Yes' : '✗ No'}`);

if (approval.isApproved) {
    let rateDisplay = approval.rateAllowance === ethers.MaxUint256 
        ? 'Unlimited' 
        : `${ethers.formatUnits(approval.rateAllowance, 18)} USDFC`;
    
    let lockupDisplay = approval.lockupAllowance === ethers.MaxUint256 
        ? 'Unlimited' 
        : `${ethers.formatUnits(approval.lockupAllowance, 18)} USDFC`;

    console.log(`Rate Allowance: ${rateDisplay}`);
    console.log(`Lockup Allowance: ${lockupDisplay}`);
}
```

### Understanding Approvals

**`isApproved`** - Boolean indicating whether the operator has any approval. If false, the operator cannot create payment rails or charge your account.

**`rateAllowance`** - Maximum amount the operator can charge per epoch. `ethers.MaxUint256` means unlimited, which is safe for audited operators like Warm Storage because on-chain logic enforces actual charges.

**`lockupAllowance`** - Maximum amount the operator can lock up across all deals. Again, `ethers.MaxUint256` is common and safe for trusted operators.

### Why Unlimited Allowances Are Safe

You might be concerned seeing "Unlimited" allowances. This seems dangerous—why grant unlimited access to your funds?

The key is that allowances are maximums, not actual charges. The operator can only charge what the on-chain storage contracts allow. For Warm Storage:

- Charges are based on actual storage usage (GiB × time × rate)
- All charges are transparent and verifiable on-chain
- The contract is audited and cannot charge arbitrary amounts
- You can revoke approval anytime

Think of it like a credit card authorization. The merchant gets approval for "up to $X" but can only charge the actual purchase amount. The on-chain contract enforces the actual charge limits.

### Checking Multiple Operators

The example checks only the Warm Storage operator, but you might approve multiple operators in production:

```javascript
const operators = [
    synapse.getWarmStorageAddress(),
    // Add other operator addresses here
];

for (const operator of operators) {
    const approval = await synapse.payments.serviceApproval(operator, TOKENS.USDFC);
    console.log(`Operator ${operator}: ${approval.isApproved ? 'Approved' : 'Not Approved'}`);
}
```

### Security Best Practices

**Regular Audits**: Review approved operators monthly. Revoke any you no longer use.

**Principle of Least Privilege**: Only approve operators you actively use. Do not pre-approve "just in case."

**Revocation**: If you suspect an operator is compromised or behaving incorrectly, revoke approval immediately using `synapse.payments.revokeOperator()`.

**Monitoring**: Track operator charges over time. Unexpected charge patterns might indicate issues.

## Step 4: Payment Rails Visualization

**Script**: `4-payment-rails.js`  
**Run with**: `npm run rails`

Payment rails are the actual payment channels between you and storage providers. Understanding rails gives you visibility into active storage relationships and payment flows.

> [!NOTE]
> **Defensive Coding**: The script includes null checks for rail properties (`from`, `to`, `operator`) as these may be undefined in certain rail states. This prevents crashes when displaying rail information.

### What Are Payment Rails?

A payment rail is an on-chain payment channel that enables continuous, automated payments from you (payer) to a storage provider (payee), managed by an operator contract. When you upload data, the system creates a rail to handle ongoing storage payments.

Think of rails as subscription payment channels. Instead of manually paying the provider every epoch, the rail automates the process. Providers can settle the rail periodically to claim accumulated payments.

### Rail Components

Each rail consists of:

- **Payer**: Your address (the account paying for storage)
- **Payee**: Provider's address (receiving storage payments)
- **Operator**: Contract managing the rail (e.g., Warm Storage contract)
- **Payment Rate**: Amount paid per epoch (based on storage size and pricing)
- **Lockup Period**: How many epochs of payments to lock in advance
- **Settled Up To**: Last epoch that was paid
- **End Epoch**: When the rail terminated (0 if still active)

### The Code

```javascript
const payerRails = await synapse.payments.getRailsAsPayer(TOKENS.USDFC);

console.log(`Found ${payerRails.length} active payment rail(s):`);

for (const rail of payerRails) {
    console.log(`Rail ID: ${rail.railId}`);
    console.log(`  Status: ${rail.isTerminated ? '✗ Terminated' : '✓ Active'}`);
    console.log(`  Payment Rate: ${ethers.formatUnits(rail.paymentRate, 18)} USDFC/epoch`);
    
    const lockupDays = Number(rail.lockupPeriod) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);
    console.log(`  Lockup Period: ${rail.lockupPeriod} epochs (~${lockupDays.toFixed(1)} days)`);
    console.log(`  Settled Up To: Epoch ${rail.settledUpTo}`);
}
```

### Understanding Rail Status

**Active Rails** (`isTerminated: false`):
- Currently processing payments
- Contributing to your lockup requirement
- Provider is actively storing your data
- Payments accumulate until settled

**Terminated Rails** (`isTerminated: true`, `endEpoch > 0`):
- No longer processing payments
- Not contributing to lockup
- Storage deal has ended
- Provider may settle final payments

### Getting Detailed Rail Information

For deeper inspection, use `getRail()` to get complete rail details:

```javascript
const railDetails = await synapse.payments.getRail(railId);

console.log(`Token: ${railDetails.token}`);
console.log(`Commission Rate: ${railDetails.commissionRateBps} basis points`);
console.log(`Fee Recipient: ${railDetails.serviceFeeRecipient}`);
```

This shows additional information like commission rates (fees taken by the operator) and fee recipients.

### When Rails Are Created

Rails are created automatically when you upload data. The upload process:

1. You call `context.upload()` with your data
2. SDK negotiates with a storage provider
3. Provider accepts the deal
4. System creates a payment rail
5. Upload completes and returns PieceCID

If you have not uploaded data yet, you will see "No active payment rails found." Complete the `first-upload` tutorial to create your first rail.

### Production Monitoring

**Rail Health Checks**: Monitor rail status daily. Unexpected terminations might indicate payment issues or provider problems.

**Settlement Tracking**: Track `settledUpTo` values. If a rail has not settled in days, investigate why. Providers should settle regularly.

**Cost Analysis**: Sum payment rates across all rails to understand total storage costs per epoch. Multiply by epochs per day to get daily costs.

**Provider Diversity**: If all rails point to the same provider, you have single-point-of-failure risk. Consider distributing storage across multiple providers.

## Step 5: Withdrawing Funds

**Script**: `5-withdraw-funds.js`  
**Run with**: `npm run withdraw`

Withdrawals move available funds from your payment account back to your wallet. This operation is useful when you want to reduce your storage budget or move funds elsewhere.

> [!IMPORTANT]
> **Precision Buffer**: The script withdraws 99.9% of available funds (not 100%) to avoid "execution reverted" errors caused by ongoing charges between the balance check and withdrawal transaction. This small buffer prevents precision-related failures.

### When You Can Withdraw

You can only withdraw **available funds**—the portion of your balance not locked for active deals. The formula:

```
availableFunds = totalFunds - lockupCurrent
```

If all your funds are locked, `availableFunds` will be 0 and withdrawal will fail.

### The Code

```javascript
const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);

if (accountInfo.availableFunds > 0n) {
    const withdrawAmount = accountInfo.availableFunds;
    console.log(`Withdrawing ${ethers.formatUnits(withdrawAmount, 18)} USDFC...`);

    const withdrawTx = await synapse.payments.withdraw(withdrawAmount, TOKENS.USDFC);
    console.log(`Transaction Hash: ${withdrawTx.hash}`);
    
    const receipt = await withdrawTx.wait();
    console.log(`✓ Withdrawal confirmed in block ${receipt.blockNumber}`);

    // Verify balances changed
    const newWalletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
    const newPaymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    console.log(`New Wallet Balance: ${ethers.formatUnits(newWalletBalance, 18)} USDFC`);
    console.log(`New Payment Balance: ${ethers.formatUnits(newPaymentBalance, 18)} USDFC`);
} else {
    console.log("No funds available to withdraw.");
}
```

### What Happens During Withdrawal

1. **Validation**: Contract checks that `withdrawAmount <= availableFunds`
2. **Transfer**: Moves USDFC from payment contract to your wallet
3. **Balance Update**: Decreases payment account balance
4. **Event Emission**: Emits on-chain event for tracking

The transaction requires gas (paid in tFIL), so ensure your wallet has sufficient tFIL before withdrawing.

### Partial vs Full Withdrawal

The example withdraws all available funds, but you can withdraw any amount up to `availableFunds`:

```javascript
// Withdraw half of available funds
const withdrawAmount = accountInfo.availableFunds / 2n;
await synapse.payments.withdraw(withdrawAmount, TOKENS.USDFC);
```

Partial withdrawals are useful when you want to reduce your storage budget but maintain some buffer.

### Why Withdrawal Might Fail

**Precision Issues / Execution Reverted**: Funds became locked between the `accountInfo()` check and the withdrawal transaction due to ongoing epoch charges. The script uses a 99.9% buffer to minimize this.

**Insufficient Available Funds**: You are trying to withdraw more than `availableFunds`. Check `accountInfo()` first.

**Insufficient Gas**: Your wallet lacks tFIL to pay transaction fees. Get more tFIL from the faucet.

**Network Issues**: RPC endpoint is down or slow. Retry with a different endpoint.

**Pending Transactions**: You have an unconfirmed transaction. Wait for it to complete.

### Production Considerations

**Automated Withdrawals**: Some applications automatically withdraw excess funds above a threshold. This minimizes exposure while maintaining operational buffer.

**Withdrawal Scheduling**: Withdraw during low-activity periods to avoid interfering with storage operations.

**Balance Verification**: Always verify balances after withdrawal to confirm the transaction succeeded.

**Emergency Withdrawals**: In emergencies (e.g., security incident), withdraw all available funds immediately to minimize exposure.

## Production Deployment Strategies

Integrating these payment operations into production requires thoughtful architecture. Here are proven patterns:

### Monitoring Architecture

**Polling Approach**:
```javascript
async function monitorPaymentHealth() {
    const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);
    const daysRemaining = calculateDaysRemaining(accountInfo);
    
    if (daysRemaining < 3) {
        await sendCriticalAlert("Payment account critically low!");
    } else if (daysRemaining < 7) {
        await sendWarningAlert("Payment account running low");
    }
    
    // Log metrics for dashboards
    await logMetric("payment_account_balance", accountInfo.funds);
    await logMetric("days_remaining", daysRemaining);
}

// Run every hour
setInterval(monitorPaymentHealth, 60 * 60 * 1000);
```

**Event-Based Approach**:
```javascript
// Listen for on-chain events
const filter = paymentContract.filters.Withdraw();
paymentContract.on(filter, (from, amount, event) => {
    console.log(`Withdrawal detected: ${ethers.formatUnits(amount, 18)} USDFC`);
    // Update internal state, trigger alerts, etc.
});
```

### Auto-Replenishment

Automatically deposit funds when balance gets low:

```javascript
async function autoReplenish() {
    const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);
    const daysRemaining = calculateDaysRemaining(accountInfo);
    
    if (daysRemaining < 7) {
        const depositAmount = ethers.parseUnits("10.0", 18); // 10 USDFC
        await synapse.payments.depositWithPermitAndApproveOperator(
            depositAmount,
            synapse.getWarmStorageAddress(),
            ethers.MaxUint256,
            ethers.MaxUint256,
            TIME_CONSTANTS.EPOCHS_PER_MONTH
        );
        console.log("Auto-replenished payment account");
    }
}
```

### Cost Tracking

Track costs over time for budgeting and optimization:

```javascript
async function trackCosts() {
    const rails = await synapse.payments.getRailsAsPayer(TOKENS.USDFC);
    
    let totalCostPerEpoch = 0n;
    for (const rail of rails) {
        if (!rail.isTerminated) {
            totalCostPerEpoch += rail.paymentRate;
        }
    }
    
    const costPerDay = totalCostPerEpoch * TIME_CONSTANTS.EPOCHS_PER_DAY;
    const costPerMonth = costPerDay * 30n;
    
    console.log(`Daily cost: ${ethers.formatUnits(costPerDay, 18)} USDFC`);
    console.log(`Monthly cost: ${ethers.formatUnits(costPerMonth, 18)} USDFC`);
    
    // Store in database for historical analysis
    await db.costs.insert({
        timestamp: Date.now(),
        dailyCost: costPerDay.toString(),
        monthlyCost: costPerMonth.toString(),
        activeRails: rails.filter(r => !r.isTerminated).length
    });
}
```

### Dashboard Integration

Expose payment metrics via API for dashboards:

```javascript
app.get('/api/payment-status', async (req, res) => {
    const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);
    const rails = await synapse.payments.getRailsAsPayer(TOKENS.USDFC);
    
    res.json({
        balance: ethers.formatUnits(accountInfo.funds, 18),
        locked: ethers.formatUnits(accountInfo.lockupCurrent, 18),
        available: ethers.formatUnits(accountInfo.availableFunds, 18),
        daysRemaining: calculateDaysRemaining(accountInfo),
        activeRails: rails.filter(r => !r.isTerminated).length,
        totalRails: rails.length
    });
});
```

## Troubleshooting

### "Insufficient available funds" Error

**Symptom**: Withdrawal fails with insufficient funds error, but `balance()` shows funds exist.

**Cause**: All funds are locked for active storage deals.

**Solution**: 
1. Check `accountInfo().availableFunds` to see how much you can withdraw
2. Wait for deals to complete to unlock funds
3. Or deposit more funds if you need to withdraw now

### Rail Not Found

**Symptom**: `getRail(railId)` throws "rail not found" error.

**Cause**: Rail ID does not exist or was terminated and cleaned up.

**Solution**:
1. Use `getRailsAsPayer()` to get valid rail IDs
2. Check if rail was terminated (`endEpoch > 0`)
3. Verify you are using the correct network (Calibration vs Mainnet)

### Eventual Consistency Issues

**Symptom**: `accountInfo()` shows old data immediately after deposit/withdrawal.

**Cause**: Blockchain state takes time to propagate through RPC nodes.

**Solution**:
1. Wait 5-10 seconds after transactions before querying state
2. Use `tx.wait()` to ensure transaction is confirmed
3. Implement retry logic with exponential backoff

### Days Remaining Shows Infinity

**Symptom**: Days remaining calculation returns `Infinity`.

**Cause**: `lockupRate` is 0 (no active storage deals).

**Solution**:
1. Check if `lockupRate > 0` before calculating days remaining
2. Display "No active storage" instead of days remaining
3. This is normal if you have not uploaded data yet

## Summary

You have learned how to comprehensively monitor and manage Filecoin payment accounts through five dedicated operations:

**What You Accomplished**:
- ✅ Check wallet and payment account balances to understand fund distribution
- ✅ Monitor account health with lockup metrics and days remaining calculations
- ✅ Inspect operator approvals to verify permissions and security
- ✅ Visualize payment rails to track active storage relationships
- ✅ Withdraw available funds back to your wallet

**Key Takeaways**:
- Payment accounts separate storage funds from your wallet for automated operations
- Lockup protects providers by reserving funds for future payments
- Available funds = Total funds - Lockup requirement
- Payment rails automate ongoing payments to storage providers
- Regular monitoring prevents service interruptions from low balances

**Production Best Practices**:
- Monitor account health daily or hourly for production applications
- Set up tiered alerts (critical < 3 days, warning < 7 days)
- Review operator approvals periodically for security
- Track payment rail status to detect issues early
- Maintain a buffer above minimum lockup requirements

These payment operations form the foundation of robust production deployments on Filecoin. Use them to build monitoring systems, dashboards, and automated management workflows for your storage applications.
