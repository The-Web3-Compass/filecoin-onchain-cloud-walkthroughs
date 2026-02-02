import 'dotenv/config';
import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';

async function main() {
    console.log("Managing Filecoin Payment Accounts...\n");

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

    // Step 1: Define deposit parameters
    console.log("=== Step 1: Configure Deposit Parameters ===");

    const depositAmount = ethers.parseUnits("5.0", 18);
    console.log(`Deposit Amount: ${ethers.formatUnits(depositAmount, 18)} USDFC`);

    const operatorAddress = synapse.getWarmStorageAddress();
    console.log(`Operator Address: ${operatorAddress}`);

    const rateAllowance = ethers.MaxUint256;
    console.log(`Rate Allowance: Unlimited (${rateAllowance})`);

    const lockupAllowance = ethers.MaxUint256;
    console.log(`Lockup Allowance: Unlimited (${lockupAllowance})`);

    const lockupPeriod = TIME_CONSTANTS.EPOCHS_PER_MONTH;
    const lockupDays = Number(lockupPeriod / TIME_CONSTANTS.EPOCHS_PER_DAY);
    console.log(`Lockup Period: ${lockupPeriod} epochs (~${lockupDays} days)\n`);

    // Step 2: Validate sufficient balance
    console.log("=== Step 2: Validate Balance ===");
    if (walletBalance < depositAmount) {
        throw new Error(
            `Insufficient balance. Required: ${ethers.formatUnits(depositAmount, 18)} USDFC, ` +
            `Available: ${ethers.formatUnits(walletBalance, 18)} USDFC`
        );
    }
    console.log("✓ Sufficient USDFC balance confirmed\n");

    // Step 3: Execute deposit and approval
    console.log("=== Step 3: Deposit and Approve Operator ===");
    console.log("Submitting transaction...");

    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
        depositAmount,
        operatorAddress,
        rateAllowance,
        lockupAllowance,
        lockupPeriod
    );

    console.log(`Transaction Hash: ${tx.hash}`);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log(`✓ Transaction confirmed in block ${receipt.blockNumber}\n`);

    // Step 4: Verify payment account balance
    console.log("=== Step 4: Verify Payment Account Balance ===");

    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    console.log(`Payment Account Balance: ${ethers.formatUnits(paymentBalance, 18)} USDFC`);

    const updatedWalletBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
    console.log(`Wallet Balance: ${ethers.formatUnits(updatedWalletBalance, 18)} USDFC\n`);

    // Step 5: Check operator allowances
    console.log("=== Step 5: Check Operator Allowances ===");

    console.log("Waiting 5 seconds for network consistency...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    const allowance = await synapse.payments.allowance(
        operatorAddress,
        TOKENS.USDFC
    );

    // Format rate allowance with null check
    let rateAllowanceDisplay;
    if (allowance.rateAllowance === null || allowance.rateAllowance === undefined) {
        rateAllowanceDisplay = 'Not set';
    } else if (allowance.rateAllowance === ethers.MaxUint256) {
        rateAllowanceDisplay = 'Unlimited';
    } else {
        rateAllowanceDisplay = `${ethers.formatUnits(allowance.rateAllowance, 18)} USDFC`;
    }

    // Format lockup allowance with null check
    let lockupAllowanceDisplay;
    if (allowance.lockupAllowance === null || allowance.lockupAllowance === undefined) {
        lockupAllowanceDisplay = 'Not set';
    } else if (allowance.lockupAllowance === ethers.MaxUint256) {
        lockupAllowanceDisplay = 'Unlimited';
    } else {
        lockupAllowanceDisplay = `${ethers.formatUnits(allowance.lockupAllowance, 18)} USDFC`;
    }

    console.log(`Rate Allowance: ${rateAllowanceDisplay}`);
    console.log(`Lockup Allowance: ${lockupAllowanceDisplay}`);

    console.log("\n✅ Payment setup complete! Your account is ready for storage operations.");
}

main().catch((err) => {
    console.error("Error during payment management:");
    console.error(err);
    process.exit(1);
});
