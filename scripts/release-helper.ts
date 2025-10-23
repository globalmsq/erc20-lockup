import { ethers } from 'hardhat';
import * as readline from 'readline';

/**
 * Interactive helper for releasing vested tokens
 * Usage: npx hardhat run scripts/release-helper.ts --network <network>
 * Set LOCKUP_ADDRESS in environment
 */
async function main() {
  const lockupAddress = process.env.LOCKUP_ADDRESS;

  if (!lockupAddress) {
    throw new Error('LOCKUP_ADDRESS environment variable is required');
  }

  console.log('=== Token Release Helper ===');
  console.log('Lockup Contract:', lockupAddress);
  console.log('');

  const [beneficiary] = await ethers.getSigners();
  console.log('Your Address:', beneficiary.address);
  console.log(
    'Your Balance:',
    ethers.formatEther(await ethers.provider.getBalance(beneficiary.address)),
    'MATIC'
  );
  console.log('');

  // Get contract instance
  const tokenLockup = await ethers.getContractAt('TokenLockup', lockupAddress);

  // Get lockup info
  const lockup = await tokenLockup.lockups(beneficiary.address);

  if (lockup.totalAmount === 0n) {
    console.log('❌ No lockup found for your address');
    console.log('');
    console.log('💡 Tip: This script releases tokens to the caller address.');
    console.log('   Make sure you are calling with the beneficiary address.');
    return;
  }

  // Get vested and releasable amounts
  const vestedAmount = await tokenLockup.vestedAmount(beneficiary.address);
  const releasableAmount = await tokenLockup.releasableAmount(beneficiary.address);

  // Calculate percentages
  const vestedPercent = (Number(vestedAmount) / Number(lockup.totalAmount)) * 100;
  const releasedPercent = (Number(lockup.releasedAmount) / Number(lockup.totalAmount)) * 100;

  // Get current time
  const currentTime = Math.floor(Date.now() / 1000);
  const cliffEnd = Number(lockup.startTime) + Number(lockup.cliffDuration);
  const vestingEnd = Number(lockup.startTime) + Number(lockup.vestingDuration);

  console.log('📊 Your Lockup Status:');
  console.log('─'.repeat(50));
  console.log('Total Locked:', ethers.formatEther(lockup.totalAmount), 'tokens');
  console.log('Already Released:', ethers.formatEther(lockup.releasedAmount), 'tokens');
  console.log('Currently Vested:', ethers.formatEther(vestedAmount), 'tokens');
  console.log('');
  console.log('Progress:');
  console.log('  Vested:', vestedPercent.toFixed(2) + '%');
  console.log('  Released:', releasedPercent.toFixed(2) + '%');
  console.log('');

  // Check if can release
  if (currentTime < cliffEnd) {
    const daysUntilCliff = Math.ceil((cliffEnd - currentTime) / 86400);
    console.log('⏳ Status: Cliff Period');
    console.log('');
    console.log('❌ Cannot release tokens yet');
    console.log('   Cliff ends in', daysUntilCliff, 'days');
    console.log('   Cliff End:', new Date(cliffEnd * 1000).toISOString());
    return;
  }

  if (releasableAmount === 0n) {
    console.log('✅ Status: All vested tokens have been released');
    console.log('');
    if (currentTime < vestingEnd) {
      const daysUntilVested = Math.ceil((vestingEnd - currentTime) / 86400);
      console.log('⏳ Vesting in Progress');
      console.log('   Fully vested in', daysUntilVested, 'days');
      console.log('   Vesting End:', new Date(vestingEnd * 1000).toISOString());
    } else {
      console.log('🎉 Fully Vested - All tokens have been claimed');
    }
    return;
  }

  // Show releasable amount
  console.log('💰 Releasable Amount:');
  console.log('─'.repeat(50));
  console.log('You can claim:', ethers.formatEther(releasableAmount), 'tokens');
  console.log('');

  // Estimate gas
  try {
    const gasEstimate = await tokenLockup.release.estimateGas();
    const feeData = await ethers.provider.getFeeData();
    const gasCost = gasEstimate * (feeData.gasPrice || 0n);
    console.log('⛽ Estimated Gas:');
    console.log('  Gas Units:', gasEstimate.toString());
    console.log('  Gas Cost:', ethers.formatEther(gasCost), 'MATIC');
    console.log('');
  } catch (error) {
    console.log('⚠️  Could not estimate gas');
    console.log('');
  }

  // Confirm release
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  const confirm = await question('Proceed with releasing tokens? (yes/no): ');
  rl.close();

  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('❌ Release cancelled');
    return;
  }

  console.log('');
  console.log('🚀 Releasing tokens...');

  try {
    const tx = await tokenLockup.release();
    console.log('Transaction Hash:', tx.hash);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log('✅ Success! Tokens released');
    console.log('Block Number:', receipt?.blockNumber);
    console.log('Gas Used:', receipt?.gasUsed.toString());
    console.log('');

    // Show updated status
    const newLockup = await tokenLockup.lockups(beneficiary.address);
    const newVested = await tokenLockup.vestedAmount(beneficiary.address);
    const newReleasable = await tokenLockup.releasableAmount(beneficiary.address);

    console.log('📊 Updated Status:');
    console.log('─'.repeat(50));
    console.log('Total Released:', ethers.formatEther(newLockup.releasedAmount), 'tokens');
    console.log('Currently Vested:', ethers.formatEther(newVested), 'tokens');
    console.log('Still Releasable:', ethers.formatEther(newReleasable), 'tokens');
    console.log('');

    if (newReleasable > 0n) {
      console.log('💡 You can call this script again to release more tokens');
    } else if (currentTime < vestingEnd) {
      console.log('⏳ More tokens will vest over time');
    } else {
      console.log('🎉 All tokens have been claimed!');
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error releasing tokens:', errorMessage);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
