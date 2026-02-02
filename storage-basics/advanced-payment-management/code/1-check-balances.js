import 'dotenv/config';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';

async function main() {
    console.log("Checking Balances\n");

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

    // Check wallet balance
    const walletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
    console.log("Wallet Balance:");
    console.log(`  ${ethers.formatUnits(walletBalance, 18)} USDFC`);
    console.log(`  → Funds in your wallet (not yet deposited)`);
    console.log(`  → Can be used for gas or deposited for storage\n`);

    // Check payment account balance
    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    console.log("Payment Account Balance:");
    console.log(`  ${ethers.formatUnits(paymentBalance, 18)} USDFC`);
    console.log(`  → Funds deposited for storage operations`);
    console.log(`  → Available for operator charges\n`);

    // Calculate total
    const totalBalance = walletBalance + paymentBalance;
    console.log(`Total USDFC: ${ethers.formatUnits(totalBalance, 18)}\n`);

    console.log("✅ Balance check complete!");
}

main().catch((err) => {
    console.error("Error checking balances:");
    console.error(err);
    process.exit(1);
});
