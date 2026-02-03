import { Synapse, TOKENS, TIME_CONSTANTS } from '@filoz/synapse-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function fundPaymentAccount() {
    console.log('======================================================================');
    console.log('  Funding Payment Account');
    console.log('======================================================================\n');

    // Initialize SDK
    const synapse = await Synapse.create({
        privateKey: process.env.PRIVATE_KEY,
        rpcURL: "https://api.calibration.node.glif.io/rpc/v1"
    });

    console.log('Wallet address:', synapse.address);

    // Check current balances
    const walletBalance = await synapse.wallet.balance(TOKENS.USDFC);
    const paymentBalance = await synapse.payments.balance(TOKENS.USDFC);

    console.log(`\nCurrent wallet balance: ${ethers.formatUnits(walletBalance, 18)} USDFC`);
    console.log(`Current payment account balance: ${ethers.formatUnits(paymentBalance, 18)} USDFC\n`);

    if (walletBalance === 0n) {
        console.log('⚠️  Your wallet has no USDFC. Please visit the faucet first:');
        console.log('   https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc\n');
        process.exit(1);
    }

    // Deposit and approve operator
    console.log('Depositing 2.5 USDFC to payment account and approving operator...');

    const tx = await synapse.payments.depositWithPermitAndApproveOperator(
        ethers.parseUnits("2.5", 18),           // Deposit 2.5 USDFC
        synapse.getWarmStorageAddress(),         // Storage operator address
        ethers.MaxUint256,                       // Unlimited rate allowance
        ethers.MaxUint256,                       // Unlimited lockup allowance
        TIME_CONSTANTS.EPOCHS_PER_MONTH          // 30-day lockup period
    );

    console.log('Transaction submitted. Waiting for confirmation...');
    await tx.wait();

    // Verify new balance
    const newPaymentBalance = await synapse.payments.balance(TOKENS.USDFC);
    console.log(`\n✅ Payment account funded successfully!`);
    console.log(`New payment account balance: ${ethers.formatUnits(newPaymentBalance, 18)} USDFC\n`);
}

fundPaymentAccount().catch(console.error);
