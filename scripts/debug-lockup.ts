import { ethers } from 'hardhat';

/**
 * Debug script to diagnose createLockup issues
 * Usage: npx hardhat run scripts/debug-lockup.ts --network <network>
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

  console.log('=== TokenLockup Contract Debug ===');
  console.log('Contract Address:', lockupAddress);
  console.log('Beneficiary Address:', beneficiaryAddress);
  console.log('');

  const [deployer] = await ethers.getSigners();
  console.log('📝 Deployer Info:');
  console.log('─'.repeat(50));
  console.log('Address:', deployer.address);
  console.log(
    'Balance:',
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    'MATIC'
  );
  console.log('');

  // Get contract instances
  const tokenLockup = await ethers.getContractAt('TokenLockup', lockupAddress);

  // 1. Check contract owner
  console.log('🔑 Contract Owner Check:');
  console.log('─'.repeat(50));
  try {
    const owner = await tokenLockup.owner();
    console.log('Contract Owner:', owner);
    console.log('Deployer Address:', deployer.address);
    const isOwner = owner.toLowerCase() === deployer.address.toLowerCase();
    console.log('Is Deployer Owner?:', isOwner ? '✅ YES' : '❌ NO');
    if (!isOwner) {
      console.log('⚠️  ERROR: Deployer is not the contract owner!');
    }
  } catch (error) {
    console.log('❌ Error checking owner:', error);
  }
  console.log('');

  // 2. Check paused status
  console.log('⏸️  Paused Status Check:');
  console.log('─'.repeat(50));
  try {
    const isPaused = await tokenLockup.paused();
    console.log('Contract Paused?:', isPaused ? '❌ YES (PAUSED)' : '✅ NO (ACTIVE)');
    if (isPaused) {
      console.log('⚠️  ERROR: Contract is paused! Call unpause() first.');
    }
  } catch (error) {
    console.log('❌ Error checking paused status:', error);
  }
  console.log('');

  // 3. Check token info
  console.log('🪙 Token Info:');
  console.log('─'.repeat(50));
  try {
    const tokenAddress = await tokenLockup.token();
    console.log('Token Address:', tokenAddress);

    const token = await ethers.getContractAt('IERC20', tokenAddress);
    const tokenBalance = await token.balanceOf(deployer.address);
    console.log('Deployer Token Balance:', ethers.formatEther(tokenBalance), 'tokens');

    const allowance = await token.allowance(deployer.address, lockupAddress);
    console.log('Current Allowance:', ethers.formatEther(allowance), 'tokens');

    if (tokenBalance === 0n) {
      console.log('⚠️  WARNING: Deployer has 0 token balance!');
    }
  } catch (error) {
    console.log('❌ Error checking token info:', error);
  }
  console.log('');

  // 4. Check beneficiary lockup
  console.log('👤 Beneficiary Lockup Check:');
  console.log('─'.repeat(50));
  try {
    const lockup = await tokenLockup.lockups(beneficiaryAddress);
    console.log('Total Amount:', ethers.formatEther(lockup.totalAmount), 'tokens');
    console.log('Released Amount:', ethers.formatEther(lockup.releasedAmount), 'tokens');
    console.log('Start Time:', Number(lockup.startTime));
    console.log('Revocable:', lockup.revocable);
    console.log('Revoked:', lockup.revoked);

    if (lockup.totalAmount > 0n) {
      console.log('⚠️  ERROR: Lockup already exists for this beneficiary!');
      console.log('    You cannot create a new lockup for the same address.');
    } else {
      console.log('✅ No existing lockup - OK to create new one');
    }
  } catch (error) {
    console.log('❌ Error checking beneficiary lockup:', error);
  }
  console.log('');

  // 5. Try to estimate gas for createLockup (dry run)
  console.log('🧪 Gas Estimation Test:');
  console.log('─'.repeat(50));
  try {
    const testAmount = ethers.parseEther('1');
    const testCliff = 3600;
    const testVesting = 86400;
    const testRevocable = true;

    const gasEstimate = await tokenLockup.createLockup.estimateGas(
      beneficiaryAddress,
      testAmount,
      testCliff,
      testVesting,
      testRevocable
    );

    console.log('✅ Gas Estimation Success:', gasEstimate.toString());
    console.log('   This suggests the transaction should work!');
  } catch (error: unknown) {
    console.log('❌ Gas Estimation Failed!');
    if (error instanceof Error) {
      console.log('   Error:', error.message);

      // Try to decode the error
      if (error.message.includes('LockupAlreadyExists')) {
        console.log('   → Reason: Lockup already exists for beneficiary');
      } else if (error.message.includes('ExpectedPause')) {
        console.log('   → Reason: Contract is paused');
      } else if (error.message.includes('OwnableUnauthorizedAccount')) {
        console.log('   → Reason: Caller is not the owner');
      } else if (error.message.includes('InvalidAmount')) {
        console.log('   → Reason: Invalid amount (zero or negative)');
      } else if (error.message.includes('InvalidDuration')) {
        console.log('   → Reason: Invalid duration (zero or cliff > vesting)');
      } else if (error.message.includes('InvalidBeneficiary')) {
        console.log('   → Reason: Invalid beneficiary address (zero address)');
      } else if (error.message.includes('ERC20InsufficientAllowance')) {
        console.log('   → Reason: Insufficient token allowance');
      } else if (error.message.includes('ERC20InsufficientBalance')) {
        console.log('   → Reason: Insufficient token balance');
      }
    }
  }
  console.log('');

  // Summary
  console.log('📋 Summary:');
  console.log('─'.repeat(50));
  console.log('Check the results above to identify the issue.');
  console.log('Common issues:');
  console.log('  1. Contract is paused → Call unpause()');
  console.log('  2. Deployer is not owner → Use correct owner account');
  console.log('  3. Lockup already exists → Use different beneficiary or revoke existing');
  console.log('  4. Insufficient allowance → Approve tokens first');
  console.log('  5. Insufficient balance → Add more tokens to deployer');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
