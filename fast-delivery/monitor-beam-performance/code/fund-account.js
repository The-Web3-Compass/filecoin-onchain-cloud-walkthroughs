import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';
import 'dotenv/config';

async function main() {
    console.log("Initializing Funding Operation...");

    // 1. Initialize the SDK with Calibration Testnet
    const synapse = await Synapse.create({
        privateKey: process.env.PRIVATE_KEY,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log("SDK Initialized. Preparing Deposit...");

    // 2. Deposit & Approve
    // We use 'depositWithPermitAndApproveOperator' for atomic safety.
    // It is safer than doing a deposit() and then an approve() separately.
    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
        ethers.parseUnits("2.0", 18), // 2.0 USDFC
        synapse.getWarmStorageAddress(),
        ethers.MaxUint256, // Unlimited Rate Allowance (Safe, as usage is metered)
        ethers.MaxUint256, // Unlimited Lockup Allowance
        TIME_CONSTANTS.EPOCHS_PER_MONTH // Valid for 1 Month
    );

    console.log("Transaction sent. Waiting for confirmation...");
    await tx.wait();
    console.log("✅ Payment Channel Funded: 2.0 USDFC");
}

main().catch(console.error);
