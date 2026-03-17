import { Synapse, TOKENS, TIME_CONSTANTS, calibration, parseUnits } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { http } from 'viem';
import 'dotenv/config';

async function main() {
    console.log("Initializing Funding Operation...");

    // 1. Initialize the SDK with Calibration Testnet
    const account = privateKeyToAccount(process.env.PRIVATE_KEY);
    const synapse = Synapse.create({
        chain: calibration,
        transport: http("https://api.calibration.node.glif.io/rpc/v1"),
        account,
        source: null
    });

    console.log("SDK Initialized. Preparing Deposit...");

    // 2. Deposit & Approve
    // We use 'depositWithPermitAndApproveOperator' for atomic safety.
    // It is safer than doing a deposit() and then an approve() separately.
    const hash = await synapse.payments.depositWithPermitAndApproveOperator({
        amount: parseUnits("2.0"),
        operator: synapse.chain.contracts.fwss.address,
        rateAllowance: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        lockupAllowance: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        maxLockupPeriod: TIME_CONSTANTS.EPOCHS_PER_MONTH
    });

    console.log("Transaction sent. Waiting for confirmation...");
    await synapse.client.waitForTransactionReceipt({ hash });
    console.log("✅ Payment Channel Funded: 2.0 USDFC");
}

main().catch(console.error);
