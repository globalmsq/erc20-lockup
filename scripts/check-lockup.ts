import { ethers } from 'hardhat';

/**
 * Check lockup information for a beneficiary
 * Usage: npx hardhat run scripts/check-lockup.ts --network <network>
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

  console.log('=== Lockup Status Check ===');
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

  // Get vested and releasable amounts
  const vestedAmount = await tokenLockup.vestedAmount(beneficiaryAddress);
  const releasableAmount = await tokenLockup.releasableAmount(beneficiaryAddress);

  // Calculate percentages
  const vestedPercent = (Number(vestedAmount) / Number(lockup.totalAmount)) * 100;
  const releasedPercent = (Number(lockup.releasedAmount) / Number(lockup.totalAmount)) * 100;

  // Get current time
  const currentTime = Math.floor(Date.now() / 1000);
  const cliffEnd = Number(lockup.startTime) + Number(lockup.cliffDuration);
  const vestingEnd = Number(lockup.startTime) + Number(lockup.vestingDuration);

  console.log('📊 Lockup Information:');
  console.log('─'.repeat(50));
  console.log('Total Amount:', ethers.formatEther(lockup.totalAmount), 'tokens');
  console.log('Released Amount:', ethers.formatEther(lockup.releasedAmount), 'tokens');
  console.log('Vested Amount:', ethers.formatEther(vestedAmount), 'tokens');
  console.log('Releasable Amount:', ethers.formatEther(releasableAmount), 'tokens');
  console.log('');
  console.log('Progress:');
  console.log('  Vested:', vestedPercent.toFixed(2) + '%');
  console.log('  Released:', releasedPercent.toFixed(2) + '%');
  console.log('');
  console.log('⏰ Timeline:');
  console.log('─'.repeat(50));
  console.log('Start Time:', new Date(Number(lockup.startTime) * 1000).toISOString());
  console.log('Cliff End:', new Date(cliffEnd * 1000).toISOString());
  console.log('Vesting End:', new Date(vestingEnd * 1000).toISOString());
  console.log('');
  console.log('Status:');
  if (currentTime < cliffEnd) {
    const daysUntilCliff = Math.ceil((cliffEnd - currentTime) / 86400);
    console.log('  ⏳ Cliff Period -', daysUntilCliff, 'days remaining');
  } else if (currentTime < vestingEnd) {
    const daysUntilVested = Math.ceil((vestingEnd - currentTime) / 86400);
    console.log('  🔄 Vesting -', daysUntilVested, 'days until fully vested');
  } else {
    console.log('  ✅ Fully Vested');
  }
  console.log('');
  console.log('🔧 Configuration:');
  console.log('─'.repeat(50));
  console.log('Cliff Duration:', Number(lockup.cliffDuration) / 86400, 'days');
  console.log('Vesting Duration:', Number(lockup.vestingDuration) / 86400, 'days');
  console.log('Revocable:', lockup.revocable ? 'Yes' : 'No');
  console.log('Revoked:', lockup.revoked ? 'Yes ❌' : 'No');

  if (releasableAmount > 0n) {
    console.log('');
    console.log('💡 Action Available:');
    console.log('─'.repeat(50));
    console.log(
      'You can release',
      ethers.formatEther(releasableAmount),
      'tokens by calling release()'
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
