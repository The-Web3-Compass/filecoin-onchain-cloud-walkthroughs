import 'dotenv/config';
import { Synapse, TOKENS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';

async function main() {
    console.log("Checking Operator Approvals\n");

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

    // Get operator address
    const operatorAddress = synapse.getWarmStorageAddress();
    console.log(`Warm Storage Operator: ${operatorAddress}\n`);

    // Check approval status
    const approval = await synapse.payments.serviceApproval(operatorAddress, TOKENS.USDFC);

    console.log("Approval Status:");
    console.log(`  Approved: ${approval.isApproved ? '✓ Yes' : '✗ No'}`);

    if (approval.isApproved) {
        // Format rate allowance
        let rateDisplay;
        if (approval.rateAllowance === ethers.MaxUint256) {
            rateDisplay = 'Unlimited';
        } else if (approval.rateAllowance === null || approval.rateAllowance === undefined) {
            rateDisplay = 'Not set';
        } else {
            rateDisplay = `${ethers.formatUnits(approval.rateAllowance, 18)} USDFC`;
        }

        // Format lockup allowance
        let lockupDisplay;
        if (approval.lockupAllowance === ethers.MaxUint256) {
            lockupDisplay = 'Unlimited';
        } else if (approval.lockupAllowance === null || approval.lockupAllowance === undefined) {
            lockupDisplay = 'Not set';
        } else {
            lockupDisplay = `${ethers.formatUnits(approval.lockupAllowance, 18)} USDFC`;
        }

        console.log(`  Rate Allowance: ${rateDisplay}`);
        console.log(`    → Maximum the operator can charge per epoch`);
        console.log(`  Lockup Allowance: ${lockupDisplay}`);
        console.log(`    → Maximum the operator can lock up\n`);

        console.log("✅ Operator is approved and ready to use!");
    } else {
        console.log("  ⚠️  Operator is not approved.");
        console.log("  → Run the payment-management tutorial first to approve the operator.\n");
    }
}

main().catch((err) => {
    console.error("Error checking operator approvals:");
    console.error(err);
    process.exit(1);
});
