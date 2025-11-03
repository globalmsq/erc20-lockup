import { ethers } from 'hardhat';

/**
 * List all lockups in the contract
 * Usage: npx hardhat run scripts/list-lockups.ts --network <network>
 * Set LOCKUP_ADDRESS in environment
 */
async function main() {
  const lockupAddress = process.env.LOCKUP_ADDRESS;

  if (!lockupAddress) {
    throw new Error('LOCKUP_ADDRESS environment variable is required');
  }

  console.log('=== TokenLockup - All Lockups ===');
  console.log('Contract Address:', lockupAddress);
  console.log('');

  // Get contract instance
  const tokenLockup = await ethers.getContractAt('TokenLockup', lockupAddress);

  // Get lockup count
  const count = await tokenLockup.getLockupCount();
  console.log(`📊 Total Lockups: ${count}`);

  if (count === 0n) {
    console.log('\n✨ No lockups found');
    return;
  }

  console.log('─'.repeat(80));

  // Get all lockups
  const [addresses, lockupInfos] = await tokenLockup.getAllLockups();

  const currentTime = Math.floor(Date.now() / 1000);

  // Display each lockup
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const lockup = lockupInfos[i];

    console.log(`\n[${i + 1}] Beneficiary: ${address}`);
    console.log('─'.repeat(80));

    // Token amounts
    const totalAmount = ethers.formatEther(lockup.totalAmount);
    const releasedAmount = ethers.formatEther(lockup.releasedAmount);
    const remainingAmount = ethers.formatEther(lockup.totalAmount - lockup.releasedAmount);

    console.log(`  💰 Total Amount:     ${totalAmount} tokens`);
    console.log(
      `  ✅ Released Amount:  ${releasedAmount} tokens (${((Number(lockup.releasedAmount) / Number(lockup.totalAmount)) * 100).toFixed(2)}%)`
    );
    console.log(`  ⏳ Remaining Amount: ${remainingAmount} tokens`);

    // Vesting schedule
    const startDate = new Date(Number(lockup.startTime) * 1000).toLocaleString();
    const cliffEnd = Number(lockup.startTime) + Number(lockup.cliffDuration);
    const vestingEnd = Number(lockup.startTime) + Number(lockup.vestingDuration);

    console.log(`\n  📅 Start Time:       ${startDate}`);
    console.log(`  ⏰ Cliff Duration:   ${Number(lockup.cliffDuration) / (24 * 60 * 60)} days`);
    console.log(`  ⏰ Vesting Duration: ${Number(lockup.vestingDuration) / (24 * 60 * 60)} days`);

    // Status
    if (lockup.revoked) {
      console.log('\n  ⚠️  Status: REVOKED');
    } else if (currentTime < cliffEnd) {
      const daysUntilCliff = Math.ceil((cliffEnd - currentTime) / (24 * 60 * 60));
      console.log(`\n  ⏸️  Status: In Cliff Period (${daysUntilCliff} days remaining)`);
    } else if (currentTime < vestingEnd) {
      const vestedPercent =
        ((currentTime - Number(lockup.startTime)) / Number(lockup.vestingDuration)) * 100;
      const daysUntilEnd = Math.ceil((vestingEnd - currentTime) / (24 * 60 * 60));
      console.log(
        `\n  🔄 Status: Vesting (${vestedPercent.toFixed(2)}% complete, ${daysUntilEnd} days remaining)`
      );
    } else {
      if (lockup.releasedAmount === lockup.totalAmount) {
        console.log('\n  ✅ Status: COMPLETED (All tokens released)');
      } else {
        console.log('\n  ⚡ Status: FULLY VESTED (Tokens ready to claim)');
      }
    }

    console.log(`  🔐 Revocable: ${lockup.revocable ? 'Yes' : 'No'}`);

    // Calculate current vested and releasable amounts
    try {
      const vestedAmount = await tokenLockup.vestedAmount(address);
      const releasableAmount = await tokenLockup.releasableAmount(address);

      console.log(`\n  📊 Vested Amount: ${ethers.formatEther(vestedAmount)} tokens`);
      if (releasableAmount > 0n) {
        console.log(`  💎 Available to Claim: ${ethers.formatEther(releasableAmount)} tokens`);
      }
    } catch (error) {
      // Continue even if individual queries fail
    }
  }

  console.log('\n' + '─'.repeat(80));
  console.log(`\n📈 Summary:`);
  console.log(`   Total Lockups:  ${count}`);

  // Calculate totals
  let totalLocked = 0n;
  let totalReleased = 0n;
  let completedCount = 0;
  let activeCount = 0;
  let revokedCount = 0;

  for (const lockup of lockupInfos) {
    totalLocked += lockup.totalAmount;
    totalReleased += lockup.releasedAmount;
    if (lockup.revoked) {
      revokedCount++;
    } else if (lockup.releasedAmount === lockup.totalAmount) {
      completedCount++;
    } else {
      activeCount++;
    }
  }

  console.log(`   Active Lockups: ${activeCount}`);
  console.log(`   Completed:      ${completedCount}`);
  console.log(`   Revoked:        ${revokedCount}`);
  console.log(`\n   💰 Total Locked:   ${ethers.formatEther(totalLocked)} tokens`);
  console.log(`   ✅ Total Released: ${ethers.formatEther(totalReleased)} tokens`);
  console.log(`   ⏳ Total Remaining: ${ethers.formatEther(totalLocked - totalReleased)} tokens`);

  console.log('\n✨ Done!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
