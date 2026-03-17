import { Synapse, TOKENS, TIME_CONSTANTS, calibration, formatUnits, parseUnits } from '@filoz/synapse-sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { http } from 'viem';
import dotenv from 'dotenv';

dotenv.config();

async function fundPaymentAccount() {
    console.log('======================================================================');
    console.log('  Funding Payment Account');
    console.log('======================================================================\n');

    // Initialize SDK
    const account = privateKeyToAccount(process.env.PRIVATE_KEY);
    const synapse = Synapse.create({
        chain: calibration,
        transport: http("https://api.calibration.node.glif.io/rpc/v1"),
        account,
        source: null
    });

    console.log('Wallet address:', synapse.client.account.address);

    // Check current balances
    const walletBalance = await synapse.payments.walletBalance({ token: TOKENS.USDFC });
    const paymentBalance = await synapse.payments.balance({ token: TOKENS.USDFC });

    console.log(`\nCurrent wallet balance: ${formatUnits(walletBalance, 18)} USDFC`);
    console.log(`Current payment account balance: ${formatUnits(paymentBalance, 18)} USDFC\n`);

    if (walletBalance === 0n) {
        console.log('⚠️  Your wallet has no USDFC. Please visit the faucet first:');
        console.log('   https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc\n');
        process.exit(1);
    }

    // Deposit and approve operator
    console.log('Depositing 2.5 USDFC to payment account and approving operator...');

    const hash = await synapse.payments.depositWithPermitAndApproveOperator({
        amount: parseUnits("2.5"),
        operator: synapse.chain.contracts.fwss.address,
        rateAllowance: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        lockupAllowance: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
        maxLockupPeriod: TIME_CONSTANTS.EPOCHS_PER_MONTH
    });

    console.log('Transaction submitted. Waiting for confirmation...');
    await synapse.client.waitForTransactionReceipt({ hash });

    // Verify new balance
    const newPaymentBalance = await synapse.payments.balance({ token: TOKENS.USDFC });
    console.log(`\n✅ Payment account funded successfully!`);
    console.log(`New payment account balance: ${formatUnits(newPaymentBalance, 18)} USDFC\n`);
}

fundPaymentAccount().catch(console.error);
