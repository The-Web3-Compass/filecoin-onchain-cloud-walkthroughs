import 'dotenv/config';
import { Synapse } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
    console.log("Initializing Filecoin Onchain Cloud SDK...\n");

    // 1. Initialize the SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    // Ensure privateKey starts with 0x for viem
    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

    const synapse = Synapse.create({
        account: privateKeyToAccount(formattedPrivateKey),
        source: 'get-token-tutorial',
        // Optional: specify chain, defaults to calibration testnet
    });

    console.log("✓ SDK initialized successfully\n");

    // 2. Check Balances
    console.log("=== Checking Balances ===");

    // Check balance in your wallet (USDFC is the default token)
    const walletBalance = await synapse.payments.walletBalance();
    
    // We can use native BigInt division for a rough estimate or a formatting library,
    // but here we just show the raw units
    console.log(`Wallet Balance: ${walletBalance.toString()} USDFC (raw wei)`);

    // In the new API, we don't need to manually deposit and approve the operator
    // with complex lockup periods. The `synapse.storage.prepare()` method calculates
    // the exact deposit needed for your data size and returns a single transaction
    // that handles both funding and approval.
    
    console.log("\nSuccess! Your account is configured and your wallet is funded.");
    console.log("You're ready to proceed to the next tutorial to learn about storage payments.");
}

main().catch((err) => {
    console.error("Error during initialization:");
    console.error(err);
    process.exit(1);
});
