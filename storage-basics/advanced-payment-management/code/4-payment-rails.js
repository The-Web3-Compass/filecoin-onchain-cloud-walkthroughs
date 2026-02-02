import 'dotenv/config';
import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';

async function main() {
    console.log("Payment Rails Visualization\n");

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

    try {
        // Get all payment rails where user is the payer
        const payerRails = await synapse.payments.getRailsAsPayer(TOKENS.USDFC);

        if (payerRails.length === 0) {
            console.log("No active payment rails found.");
            console.log("  → Payment rails are created when you upload data");
            console.log("  → Complete the 'first-upload' tutorial to create rails\n");
        } else {
            console.log(`Found ${payerRails.length} payment rail(s):\n`);

            for (const rail of payerRails) {
                console.log(`Rail ID: ${rail.railId}`);
                console.log(`  Status: ${rail.isTerminated ? '✗ Terminated' : '✓ Active'}`);

                // Display addresses with defensive null checks
                if (rail.from) {
                    console.log(`  Payer: ${rail.from.substring(0, 10)}...${rail.from.substring(rail.from.length - 8)}`);
                }

                if (rail.to) {
                    console.log(`  Payee: ${rail.to.substring(0, 10)}...${rail.to.substring(rail.to.length - 8)}`);
                }

                if (rail.operator) {
                    console.log(`  Operator: ${rail.operator.substring(0, 10)}...${rail.operator.substring(rail.operator.length - 8)}`);
                }

                if (rail.paymentRate) {
                    console.log(`  Payment Rate: ${ethers.formatUnits(rail.paymentRate, 18)} USDFC/epoch`);
                }

                if (rail.lockupPeriod) {
                    const lockupDays = Number(rail.lockupPeriod) / Number(TIME_CONSTANTS.EPOCHS_PER_DAY);
                    console.log(`  Lockup Period: ${rail.lockupPeriod} epochs (~${lockupDays.toFixed(1)} days)`);
                }

                if (rail.settledUpTo !== undefined && rail.settledUpTo !== null) {
                    console.log(`  Settled Up To: Epoch ${rail.settledUpTo}`);
                }

                if (rail.endEpoch && rail.endEpoch > 0) {
                    console.log(`  Terminated At: Epoch ${rail.endEpoch}`);
                }

                console.log();
            }

            // Get detailed info for the first rail
            if (payerRails.length > 0 && payerRails[0].railId) {
                console.log("Detailed Information for First Rail:");
                const railDetails = await synapse.payments.getRail(payerRails[0].railId);

                console.log(`  Token: ${railDetails.token}`);
                console.log(`  Commission Rate: ${railDetails.commissionRateBps} basis points`);
                if (railDetails.serviceFeeRecipient && railDetails.serviceFeeRecipient !== ethers.ZeroAddress) {
                    console.log(`  Fee Recipient: ${railDetails.serviceFeeRecipient}`);
                }
                console.log();
            }

            console.log("✅ Payment rails visualization complete!");
        }
    } catch (error) {
        console.log("Could not retrieve payment rails.");
        console.log(`  Error: ${error.message}\n`);
    }
}

main().catch((err) => {
    console.error("Error visualizing payment rails:");
    console.error(err);
    process.exit(1);
});
