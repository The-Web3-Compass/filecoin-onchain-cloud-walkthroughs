import 'dotenv/config';
import { Synapse, formatUnits } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';

const MAX_UINT256 = 2n ** 256n - 1n;

async function main() {
    console.log("Checking Operator Approvals\n");

    // Initialize the SDK
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

    const synapse = Synapse.create({
        account: privateKeyToAccount(formattedPrivateKey),
        source: 'operator-approvals'
    });

    console.log("✓ SDK initialized\n");

    // Check approval status for the WarmStorage operator
    // No address argument needed — the SDK resolves the operator automatically
    const approval = await synapse.payments.serviceApproval();

    console.log("Approval Status:");
    console.log(`  Approved: ${approval.isApproved ? '✓ Yes' : '✗ No'}`);

    if (approval.isApproved) {
        // Format rate allowance
        let rateDisplay;
        if (approval.rateAllowance === MAX_UINT256) {
            rateDisplay = 'Unlimited';
        } else if (approval.rateAllowance == null) {
            rateDisplay = 'Not set';
        } else {
            rateDisplay = `${formatUnits(approval.rateAllowance)} USDFC`;
        }

        // Format lockup allowance
        let lockupDisplay;
        if (approval.lockupAllowance === MAX_UINT256) {
            lockupDisplay = 'Unlimited';
        } else if (approval.lockupAllowance == null) {
            lockupDisplay = 'Not set';
        } else {
            lockupDisplay = `${formatUnits(approval.lockupAllowance)} USDFC`;
        }

        console.log(`  Rate Allowance: ${rateDisplay}`);
        console.log(`    → Maximum the operator can charge per epoch`);
        console.log(`    → Currently used: ${approval.rateUsage}`);
        console.log(`  Lockup Allowance: ${lockupDisplay}`);
        console.log(`    → Maximum the operator can lock up`);
        console.log(`    → Currently used: ${approval.lockupUsage}`);
        console.log(`  Max Lockup Period: ${approval.maxLockupPeriod} epochs\n`);

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
