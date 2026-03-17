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
