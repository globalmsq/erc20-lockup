import { ethers } from 'hardhat';

/**
 * Calculate vested amounts at different time points
 * Usage: npx hardhat run scripts/calculate-vested.ts --network <network>
 * Set LOCKUP_ADDRESS and BENEFICIARY_ADDRESS in environment
 */
async function main() {
  const lockupAddress = process.env.LOCKUP_ADDRESS;
  const beneficiaryAddress = process.env.BENEFICIARY_ADDRESS;

  if (!lockupAddress) {
    throw new Error('LOCKUP_ADDRESS environment variable is required');
  }

  if (!beneficiaryAddress) {
    throw new Error('BENEFICIARY_ADDRESS environment variable is required');
  }

  console.log('=== Vesting Timeline Calculator ===');
  console.log('Lockup Contract:', lockupAddress);
  console.log('Beneficiary:', beneficiaryAddress);
  console.log('');

  // Get contract instance
  const tokenLockup = await ethers.getContractAt('TokenLockup', lockupAddress);

  // Get lockup info
  const lockup = await tokenLockup.lockups(beneficiaryAddress);

  if (lockup.totalAmount === 0n) {
    console.log('❌ No lockup found for this beneficiary');
    return;
  }

  const startTime = Number(lockup.startTime);
  const cliffDuration = Number(lockup.cliffDuration);
  const vestingDuration = Number(lockup.vestingDuration);
  const totalAmount = lockup.totalAmount;

  console.log('📊 Lockup Parameters:');
  console.log('─'.repeat(70));
  console.log('Total Amount:', ethers.formatEther(totalAmount), 'tokens');
  console.log('Start Time:', new Date(startTime * 1000).toISOString());
  console.log('Cliff Duration:', cliffDuration / 86400, 'days');
  console.log('Vesting Duration:', vestingDuration / 86400, 'days');
  console.log('');

  console.log('📅 Vesting Timeline:');
  console.log('─'.repeat(70));
  console.log(
    'Date'.padEnd(25),
    'Elapsed'.padEnd(15),
    'Vested %'.padEnd(12),
    'Vested Amount'
  );
  console.log('─'.repeat(70));

  // Calculate vesting at different milestones
  const milestones = [
    { label: 'Start', time: startTime },
    { label: 'Cliff End', time: startTime + cliffDuration },
    { label: '25% Duration', time: startTime + vestingDuration * 0.25 },
    { label: '50% Duration', time: startTime + vestingDuration * 0.5 },
    { label: '75% Duration', time: startTime + vestingDuration * 0.75 },
    { label: 'Vesting End', time: startTime + vestingDuration },
  ];

  for (const milestone of milestones) {
    const time = Math.floor(milestone.time);
    let vestedAmount: bigint;

    // Calculate vested amount based on time
    if (time < startTime + cliffDuration) {
      vestedAmount = 0n;
    } else if (time >= startTime + vestingDuration) {
      vestedAmount = totalAmount;
    } else {
      const timeFromStart = time - startTime;
      vestedAmount = (totalAmount * BigInt(timeFromStart)) / BigInt(vestingDuration);
    }

    const vestedPercent = (Number(vestedAmount) / Number(totalAmount)) * 100;
    const elapsedDays = Math.floor((time - startTime) / 86400);
    const dateStr = new Date(time * 1000).toISOString().split('T')[0];

    console.log(
      dateStr.padEnd(25),
      `${elapsedDays}d`.padEnd(15),
      `${vestedPercent.toFixed(1)}%`.padEnd(12),
      ethers.formatEther(vestedAmount)
    );
  }

  console.log('─'.repeat(70));
  console.log('');

  // Monthly breakdown if vesting is longer than 3 months
  if (vestingDuration > 90 * 86400) {
    console.log('📈 Monthly Vesting Breakdown:');
    console.log('─'.repeat(70));
    console.log('Month'.padEnd(10), 'Date'.padEnd(25), 'Vested %'.padEnd(12), 'Vested Amount');
    console.log('─'.repeat(70));

    const monthlyPeriods = Math.min(12, Math.floor(vestingDuration / (30 * 86400))); // Show up to 12 months
    for (let month = 1; month <= monthlyPeriods; month++) {
      const time = startTime + month * 30 * 86400;

      let vestedAmount: bigint;
      if (time < startTime + cliffDuration) {
        vestedAmount = 0n;
      } else if (time >= startTime + vestingDuration) {
        vestedAmount = totalAmount;
      } else {
        const timeFromStart = time - startTime;
        vestedAmount = (totalAmount * BigInt(timeFromStart)) / BigInt(vestingDuration);
      }

      const vestedPercent = (Number(vestedAmount) / Number(totalAmount)) * 100;
      const dateStr = new Date(time * 1000).toISOString().split('T')[0];

      console.log(
        `${month}`.padEnd(10),
        dateStr.padEnd(25),
        `${vestedPercent.toFixed(1)}%`.padEnd(12),
        ethers.formatEther(vestedAmount)
      );
    }

    console.log('─'.repeat(70));
  }

  // Current status
  const currentTime = Math.floor(Date.now() / 1000);
  const currentVested = await tokenLockup.vestedAmount(beneficiaryAddress);
  const currentReleased = lockup.releasedAmount;

  console.log('');
  console.log('📍 Current Status (Now):');
  console.log('─'.repeat(70));
  console.log('Current Time:', new Date().toISOString());
  console.log('Vested Amount:', ethers.formatEther(currentVested), 'tokens');
  console.log('Released Amount:', ethers.formatEther(currentReleased), 'tokens');
  console.log(
    'Releasable Amount:',
    ethers.formatEther(currentVested - currentReleased),
    'tokens'
  );

  if (currentTime < startTime + cliffDuration) {
    const daysUntilCliff = Math.ceil((startTime + cliffDuration - currentTime) / 86400);
    console.log('Status: ⏳ Cliff Period -', daysUntilCliff, 'days remaining');
  } else if (currentTime < startTime + vestingDuration) {
    const daysUntilVested = Math.ceil((startTime + vestingDuration - currentTime) / 86400);
    const progress = ((currentTime - startTime) / vestingDuration) * 100;
    console.log(
      'Status: 🔄 Vesting in Progress -',
      progress.toFixed(1) + '%,',
      daysUntilVested,
      'days until fully vested'
    );
  } else {
    console.log('Status: ✅ Fully Vested');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
