import { ethers } from 'hardhat';
import * as readline from 'readline';

/**
 * Interactive helper for creating token lockups
 * Usage: npx hardhat run scripts/create-lockup-helper.ts --network <network>
 * Set LOCKUP_ADDRESS in environment
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  const lockupAddress = process.env.LOCKUP_ADDRESS;

  if (!lockupAddress) {
    throw new Error('LOCKUP_ADDRESS environment variable is required');
  }

  console.log('=== Interactive Lockup Creation ===');
  console.log('Lockup Contract:', lockupAddress);
  console.log('');

  const [deployer] = await ethers.getSigners();
  console.log('Your Address:', deployer.address);
  console.log(
    'Your Balance:',
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    'MATIC'
  );
  console.log('');

  // Get contract instances
  const tokenLockup = await ethers.getContractAt('TokenLockup', lockupAddress);
  const tokenAddress = await tokenLockup.token();
  const token = await ethers.getContractAt('IERC20', tokenAddress);

  console.log('Token Address:', tokenAddress);
  const tokenBalance = await token.balanceOf(deployer.address);
  console.log('Your Token Balance:', ethers.formatEther(tokenBalance), 'tokens');
  console.log('');

  // Gather lockup parameters
  console.log('📝 Enter Lockup Parameters:');
  console.log('─'.repeat(50));

  const beneficiary = await question('Beneficiary Address: ');
  if (!ethers.isAddress(beneficiary)) {
    throw new Error('Invalid beneficiary address');
  }

  // Check if lockup already exists
  const existingLockup = await tokenLockup.lockups(beneficiary);
  if (existingLockup.totalAmount > 0n) {
    throw new Error('Lockup already exists for this beneficiary');
  }

  const amountStr = await question('Total Amount (in tokens): ');
  const amount = ethers.parseEther(amountStr);

  if (amount <= 0n) {
    throw new Error('Amount must be greater than 0');
  }

  if (amount > tokenBalance) {
    throw new Error(
      `Insufficient balance. You have ${ethers.formatEther(tokenBalance)} tokens, but need ${amountStr} tokens`
    );
  }

  const cliffDaysStr = await question('Cliff Duration (in days): ');
  const cliffDays = parseInt(cliffDaysStr);
  const cliffDuration = cliffDays * 24 * 60 * 60;

  const vestingDaysStr = await question('Total Vesting Duration (in days): ');
  const vestingDays = parseInt(vestingDaysStr);
  const vestingDuration = vestingDays * 24 * 60 * 60;

  if (vestingDuration <= 0) {
    throw new Error('Vesting duration must be greater than 0');
  }

  if (cliffDuration > vestingDuration) {
    throw new Error('Cliff duration cannot be longer than vesting duration');
  }

  const revocableStr = await question('Revocable? (yes/no): ');
  const revocable = revocableStr.toLowerCase() === 'yes' || revocableStr.toLowerCase() === 'y';

  console.log('');
  console.log('📊 Lockup Summary:');
  console.log('─'.repeat(50));
  console.log('Beneficiary:', beneficiary);
  console.log('Amount:', ethers.formatEther(amount), 'tokens');
  console.log('Cliff Duration:', cliffDays, 'days');
  console.log('Vesting Duration:', vestingDays, 'days');
  console.log('Revocable:', revocable ? 'Yes' : 'No');
  console.log('');

  // Calculate vesting rate
  const dailyVestingRate = (Number(amount) / vestingDays).toFixed(6);
  console.log('💡 Vesting Rate:', dailyVestingRate, 'tokens per day');
  console.log('');

  const confirm = await question('Proceed with creating this lockup? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('❌ Lockup creation cancelled');
    rl.close();
    return;
  }

  console.log('');
  console.log('🔍 Checking token approval...');

  // Check allowance
  const allowance = await token.allowance(deployer.address, lockupAddress);
  console.log('Current Allowance:', ethers.formatEther(allowance), 'tokens');

  if (allowance < amount) {
    console.log('');
    console.log('⚠️  Insufficient allowance. Approving tokens...');
    const approveTx = await token.approve(lockupAddress, amount);
    console.log('Approval Transaction:', approveTx.hash);
    await approveTx.wait();
    console.log('✅ Token approval confirmed');
  } else {
    console.log('✅ Sufficient allowance already exists');
  }

  console.log('');
  console.log('🚀 Creating lockup...');

  try {
    const tx = await tokenLockup.createLockup(
      beneficiary,
      amount,
      cliffDuration,
      vestingDuration,
      revocable
    );
    console.log('Transaction Hash:', tx.hash);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log('✅ Lockup created successfully!');
    console.log('Block Number:', receipt?.blockNumber);
    console.log('Gas Used:', receipt?.gasUsed.toString());
    console.log('');

    // Display lockup info
    console.log('📋 Lockup Details:');
    console.log('─'.repeat(50));
    const lockup = await tokenLockup.lockups(beneficiary);
    const startTime = Number(lockup.startTime);
    const cliffEnd = startTime + cliffDuration;
    const vestingEnd = startTime + vestingDuration;

    console.log('Start Time:', new Date(startTime * 1000).toISOString());
    console.log('Cliff End:', new Date(cliffEnd * 1000).toISOString());
    console.log('Vesting End:', new Date(vestingEnd * 1000).toISOString());
    console.log('');
    console.log(
      '💡 The beneficiary can call release() to claim vested tokens after the cliff period'
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error creating lockup:', errorMessage);
    throw error;
  } finally {
    rl.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    rl.close();
    process.exit(1);
  });
