# Advanced Payment Management

This module teaches you how to monitor and manage Filecoin payment accounts through hands-on examples.

## Overview

Each script demonstrates a specific payment operation:

1. **Check Balances** - View wallet vs payment account balances
2. **Account Health** - Monitor lockup, available funds, and days remaining
3. **Operator Approvals** - Inspect which operators can charge your account
4. **Payment Rails** - Visualize active payment channels
5. **Withdraw Funds** - Move available funds back to your wallet

## Prerequisites

- Completed the `payment-management` tutorial
- Have USDFC in your payment account
- (Optional) Uploaded data to create payment rails

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Add your PRIVATE_KEY to .env
   ```

## Running the Scripts

Each script can be run independently:

```bash
# Check wallet and payment account balances
npm run balances

# Monitor account health (lockup, days remaining)
npm run health

# Check operator approval status
npm run approvals

# View payment rails (requires uploaded data)
npm run rails

# Withdraw available funds
npm run withdraw
```

## Recommended Order

Follow this sequence for the best learning experience:

1. Start with `npm run balances` to understand where your funds are
2. Run `npm run health` to see detailed account metrics
3. Check `npm run approvals` to verify operator permissions
4. View `npm run rails` to see active payment channels (if you've uploaded data)
5. Finally, try `npm run withdraw` to move funds back to your wallet

## What You'll Learn

- **Balance Management**: Distinguish between wallet and payment account funds
- **Health Monitoring**: Calculate days remaining and understand lockup mechanics
- **Security**: Review and understand operator approvals
- **Payment Flow**: Visualize how payments flow through rails
- **Fund Recovery**: Withdraw unlocked funds when needed

## Troubleshooting

### "No active payment rails found"
- This is normal if you haven't uploaded data yet
- Complete the `first-upload` tutorial to create your first rail

### "No funds available to withdraw"
- All your funds are locked for active storage deals
- Wait for deals to complete or deposit more funds

### Withdrawal fails with "execution reverted"
- Funds may have become locked between check and withdrawal
- The script uses a 99.9% buffer to minimize this issue
- Ensure you have sufficient tFIL for gas fees

## Next Steps

After completing these scripts, check out the comprehensive walkthrough in `walkthrough/advanced-payment-operations.md` for:

- Deep dive into payment architecture
- Production deployment strategies
- Monitoring and alerting patterns
- Cost tracking and optimization

## Support

For more information, see:
- [Filecoin Onchain Cloud Documentation](https://docs.filecoin.cloud/)
- [Payment Operations Guide](https://docs.filecoin.cloud/developer-guides/payments/payment-operations/)
- [Rails & Settlement](https://docs.filecoin.cloud/developer-guides/payments/rails-settlement/)
