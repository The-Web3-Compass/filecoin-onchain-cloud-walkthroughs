import 'dotenv/config';
import { Synapse, formatUnits } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
    console.log("Withdrawing Funds\n");

    // Initialize the SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

    const synapse = Synapse.create({
        account: privateKeyToAccount(formattedPrivateKey),
        source: 'withdraw-funds'
    });

    console.log("✓ SDK initialized\n");

    // Get current balances before withdrawal (USDFC is the default token)
    const walletBalanceBefore = await synapse.payments.walletBalance();
    const paymentBalanceBefore = await synapse.payments.balance();

    console.log("Current Balances:");
    console.log(`  Wallet: ${formatUnits(walletBalanceBefore)} USDFC`);
    console.log(`  Payment Account: ${formatUnits(paymentBalanceBefore)} USDFC\n`);

    // Get account info to check available funds
    const accountInfo = await synapse.payments.accountInfo();

    console.log(`Available to withdraw: ${formatUnits(accountInfo.availableFunds)} USDFC\n`);

    if (accountInfo.availableFunds > 0n) {
        // Withdraw 99.9% of available funds to account for any ongoing charges
        const withdrawAmount = (accountInfo.availableFunds * 999n) / 1000n;

        console.log(`Withdrawing ${formatUnits(withdrawAmount)} USDFC...`);
        console.log("(Using 99.9% of available to avoid precision issues)\n");

        try {
            // withdraw() returns a transaction hash directly
            const hash = await synapse.payments.withdraw({ amount: withdrawAmount });
            console.log(`Transaction Hash: ${hash}`);
            console.log("Waiting for confirmation...\n");

            await synapse.client.waitForTransactionReceipt({ hash });
            console.log(`✓ Withdrawal confirmed\n`);

            // Verify balances after withdrawal
            const walletBalanceAfter = await synapse.payments.walletBalance();
            const paymentBalanceAfter = await synapse.payments.balance();

            console.log("Updated Balances:");
            console.log(`  Wallet: ${formatUnits(walletBalanceAfter)} USDFC (was ${formatUnits(walletBalanceBefore)})`);
            console.log(`  Payment Account: ${formatUnits(paymentBalanceAfter)} USDFC (was ${formatUnits(paymentBalanceBefore)})`);
            console.log();

            const walletIncrease = walletBalanceAfter - walletBalanceBefore;
            console.log(`✅ Successfully withdrew ${formatUnits(walletIncrease)} USDFC to wallet!\n`);
        } catch (error) {
            console.error(`Withdrawal failed: ${error.message}`);
            console.error("\nPossible reasons:");
            console.error("  • Funds became locked between check and withdrawal");
            console.error("  • Insufficient gas (tFIL) in wallet");
            console.error("  • Network congestion or RPC issues\n");
            process.exit(1);
        }
    } else {
        console.log("No funds available to withdraw.");
        console.log("  → All funds are locked for active storage deals");
        console.log("  → Wait for deals to complete or deposit more funds\n");
    }
}

main().catch((err) => {
    console.error("Error during withdrawal:");
    console.error(err);
    process.exit(1);
});
