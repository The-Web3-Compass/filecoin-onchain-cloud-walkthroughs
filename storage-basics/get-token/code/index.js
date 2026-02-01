import 'dotenv/config';
import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';

async function main() {
    console.log("Initializing Filecoin Onchain Cloud SDK...");

    // 1. Initialize the SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const synapse = await Synapse.create({
        privateKey: privateKey,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("SDK initialized successfully");

    // 2. Check Balances
    console.log("Checking USDFC balance...");

    // Check balance in your wallet
    const walletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
    console.log(`Wallet Balance: ${ethers.formatUnits(walletBalance, 18)} USDFC`);

    // We want to deposit 2.5 USDFC (enough for ~1TiB for a month!)
    const depositAmount = ethers.parseUnits("2.5", 18);

    if (walletBalance < depositAmount) {
        throw new Error("Insufficient USDFC balance. Please request more tokens from the faucet.");
    }

    console.log("Depositing 2.5 USDFC to payment account...");

    // 3. Deposit & Approve
    // This is the cool part: one transaction to rule them all
    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
        depositAmount,
        synapse.getWarmStorageAddress(), // The storage operator
        ethers.MaxUint256,               // Max rate allowance
        ethers.MaxUint256,               // Max lockup allowance
        TIME_CONSTANTS.EPOCHS_PER_MONTH // Lockup for 30 days
    );

    console.log("Waiting for transaction confirmation...");
    await tx.wait();

    console.log("Success! Your account is now funded and ready to store data.");
}

main().catch((err) => {
    console.error("Error during initialization:");
    console.error(err);
});

