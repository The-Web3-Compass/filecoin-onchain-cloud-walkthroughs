import 'dotenv/config';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';

async function main() {
    console.log("Withdrawing Funds\n");

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

    // Get current balances before withdrawal
    const walletBalanceBefore = await synapse.payments.walletBalance(TOKENS.USDFC);
    const paymentBalanceBefore = await synapse.payments.balance(TOKENS.USDFC);

    console.log("Current Balances:");
    console.log(`  Wallet: ${ethers.formatUnits(walletBalanceBefore, 18)} USDFC`);
    console.log(`  Payment Account: ${ethers.formatUnits(paymentBalanceBefore, 18)} USDFC\n`);

    // Get account info to check available funds
    const accountInfo = await synapse.payments.accountInfo(TOKENS.USDFC);

    console.log(`Available to withdraw: ${ethers.formatUnits(accountInfo.availableFunds, 18)} USDFC\n`);

    if (accountInfo.availableFunds > 0n) {
        // Add a small buffer to avoid precision issues
        // Withdraw 99.9% of available funds to account for any ongoing charges
        const withdrawAmount = (accountInfo.availableFunds * 999n) / 1000n;

        console.log(`Withdrawing ${ethers.formatUnits(withdrawAmount, 18)} USDFC...`);
        console.log("(Using 99.9% of available to avoid precision issues)\n");

        try {
            const withdrawTx = await synapse.payments.withdraw(withdrawAmount, TOKENS.USDFC);
            console.log(`Transaction Hash: ${withdrawTx.hash}`);
            console.log("Waiting for confirmation...\n");

            const receipt = await withdrawTx.wait();
            console.log(`✓ Withdrawal confirmed in block ${receipt.blockNumber}\n`);

            // Verify balances after withdrawal
            const walletBalanceAfter = await synapse.payments.walletBalance(TOKENS.USDFC);
            const paymentBalanceAfter = await synapse.payments.balance(TOKENS.USDFC);

            console.log("Updated Balances:");
            console.log(`  Wallet: ${ethers.formatUnits(walletBalanceAfter, 18)} USDFC (was ${ethers.formatUnits(walletBalanceBefore, 18)})`);
            console.log(`  Payment Account: ${ethers.formatUnits(paymentBalanceAfter, 18)} USDFC (was ${ethers.formatUnits(paymentBalanceBefore, 18)})`);
            console.log();

            const walletIncrease = walletBalanceAfter - walletBalanceBefore;
            console.log(`✅ Successfully withdrew ${ethers.formatUnits(walletIncrease, 18)} USDFC to wallet!\n`);
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
