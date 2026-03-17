import 'dotenv/config';
import { Synapse, formatUnits } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
    console.log("Checking Balances\n");

    // Initialize the SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

    const synapse = Synapse.create({
        account: privateKeyToAccount(formattedPrivateKey),
        source: 'check-balances'
    });

    console.log("✓ SDK initialized\n");

    // Check wallet balance (USDFC is the default token)
    const walletBalance = await synapse.payments.walletBalance();
    console.log("Wallet Balance:");
    console.log(`  ${formatUnits(walletBalance)} USDFC`);
    console.log(`  → Funds in your wallet (not yet deposited)`);
    console.log(`  → Can be used for gas or deposited for storage\n`);

    // Check payment account balance
    const paymentBalance = await synapse.payments.balance();
    console.log("Payment Account Balance:");
    console.log(`  ${formatUnits(paymentBalance)} USDFC`);
    console.log(`  → Funds deposited for storage operations`);
    console.log(`  → Available for operator charges\n`);

    // Calculate total
    const totalBalance = walletBalance + paymentBalance;
    console.log(`Total USDFC: ${formatUnits(totalBalance)}\n`);

    console.log("✅ Balance check complete!");
}

main().catch((err) => {
    console.error("Error checking balances:");
    console.error(err);
    process.exit(1);
});
