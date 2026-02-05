import dotenv from 'dotenv';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';

// Load .env.local first (if it exists), then .env
dotenv.config({ path: '.env.local' });
dotenv.config();

/**
 * User-Pays Architecture Demo
 * 
 * In this model, the user controls their wallet and pays for storage directly.
 * The application facilitates operations but never handles funds.
 */
async function main() {
    console.log("User-Pays Architecture Demo\n");
    console.log("In this model, the user controls their wallet and pays for storage directly.");
    console.log("The application facilitates operations but never handles funds.\n");

    // Step 1: Connect to User Wallet
    const userPrivateKey = process.env.PRIVATE_KEY;
    if (!userPrivateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const synapse = await Synapse.create({
        privateKey: userPrivateKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("=== Step 1: SDK Initialized ===");
    console.log("SDK connected with user's wallet credentials.");
    console.log("In production, this would connect to MetaMask or WalletConnect.\n");

    // Step 2: Check Payment Account Balance
    console.log("=== Step 2: Payment Account Balance ===");

    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    const balanceFormatted = Number(paymentBalance) / 1e18;

    console.log(`Payment Account Balance: ${paymentBalance.toString()} (raw units)`);
    console.log(`Formatted: ${balanceFormatted.toFixed(4)} USDFC`);

    if (paymentBalance === 0n) {
        console.log("\nUser has no funds in their payment account.");
        console.log("Please run the payment-management tutorial first to fund your account.");
        process.exit(1);
    }

    console.log("Payment account is funded.\n");

    // Step 3: Verify Operator Approval
    console.log("=== Step 3: Operator Approval ===");

    const operatorAddress = synapse.getWarmStorageAddress();
    const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    console.log(`Storage Operator: ${operatorAddress}`);
    console.log(`Approved: ${approval.isApproved}`);
    console.log(`Rate Allowance: ${approval.rateAllowance.toString()}`);
    console.log(`Lockup Allowance: ${approval.lockupAllowance.toString()}`);

    if (!approval.isApproved || approval.rateAllowance === 0n || approval.lockupAllowance === 0n) {
        console.log("\nStorage operator is not approved to charge this user.");
        console.log("Please run the payment-management tutorial first.");
        process.exit(1);
    }

    console.log("Operator is approved.\n");

    // Step 4: Execute Storage Operation
    console.log("=== Step 4: Upload Execution ===");

    const sampleData = Buffer.from(
        `User-Pays Demo File\n` +
        `Uploaded at: ${new Date().toISOString()}\n` +
        `This data is paid for directly by the user's payment account.\n` +
        `The user controls their wallet and pays storage costs directly.\n` +
        `Minimum upload size is 127 bytes.`
    );

    console.log(`Uploading ${sampleData.length} bytes...`);
    console.log("(This may take 30-60 seconds)\n");

    try {
        const result = await synapse.storage.upload(sampleData);

        console.log("Upload successful.");
        console.log(`PieceCID: ${result.pieceCid}`);
        console.log(`Size: ${result.size} bytes`);
        if (result.provider) {
            console.log(`Provider: ${result.provider}`);
        }
    } catch (error) {
        console.error("Upload failed:", error.message);
        process.exit(1);
    }

    // Step 5: Verify Payment Rail
    console.log("\n=== Step 5: Payment Verification ===");

    const rails = await synapse.payments.getRailsAsPayer(TOKENS.USDFC);
    const activeRails = rails.filter(r => !r.isTerminated);

    console.log(`Total payment rails: ${rails.length}`);
    console.log(`Active rails: ${activeRails.length}`);

    if (activeRails.length > 0) {
        const latestRail = activeRails[activeRails.length - 1];
        console.log(`\nMost recent rail:`);
        console.log(`  Rail ID: ${latestRail.railId}`);
        console.log("  This confirms the user is paying directly for storage.");
    }

    console.log("\n=== Summary ===");
    console.log("User-Pays architecture complete.");
    console.log("- SDK initialized with user wallet credentials");
    console.log("- Verified user has funds and approvals");
    console.log("- Executed an upload paid by user's payment account");
    console.log("- Application never held or managed any funds");
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
