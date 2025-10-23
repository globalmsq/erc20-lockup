import { ethers } from 'hardhat';
import * as readline from 'readline';

/**
 * Interactive helper for revoking lockups
 * Usage: npx hardhat run scripts/revoke-helper.ts --network <network>
 * Set LOCKUP_ADDRESS in environment
 * IMPORTANT: Owner-only operation with 2-step confirmation
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

  console.log('=== Lockup Revocation Helper ===');
  console.log('Lockup Contract:', lockupAddress);
  console.log('');

  const [owner] = await ethers.getSigners();
  console.log('Your Address (Owner):', owner.address);
  console.log(
    'Your Balance:',
    ethers.formatEther(await ethers.provider.getBalance(owner.address)),
    'MATIC'
  );
  console.log('');

  // Get contract instance
  const tokenLockup = await ethers.getContractAt('TokenLockup', lockupAddress);

  // Verify caller is owner
  const contractOwner = await tokenLockup.owner();
  if (contractOwner.toLowerCase() !== owner.address.toLowerCase()) {
    console.log('❌ Error: You are not the contract owner');
    console.log('   Contract Owner:', contractOwner);
    console.log('   Your Address:', owner.address);
    console.log('');
    console.log('💡 Only the contract owner can revoke lockups');
    rl.close();
    return;
  }

  // Get beneficiary address
  console.log('🔍 Enter Beneficiary Address');
  console.log('─'.repeat(50));
  const beneficiaryInput = await question('Beneficiary Address: ');
  const beneficiary = beneficiaryInput.trim();

  if (!ethers.isAddress(beneficiary)) {
    throw new Error('Invalid beneficiary address');
  }

  console.log('');

  // Get lockup info
  const lockup = await tokenLockup.lockups(beneficiary);

  if (lockup.totalAmount === 0n) {
    console.log('❌ No lockup found for this beneficiary');
    rl.close();
    return;
  }

  if (lockup.revoked) {
    console.log('❌ This lockup has already been revoked');
    rl.close();
    return;
  }

  if (!lockup.revocable) {
    console.log('❌ This lockup is NOT revocable');
    console.log('');
    console.log('💡 Lockup was created with revocable: false');
    console.log('   Cannot revoke non-revocable lockups');
    rl.close();
    return;
  }

  // Get vested and releasable amounts
  const vestedAmount = await tokenLockup.vestedAmount(beneficiary);
  const releasableAmount = await tokenLockup.releasableAmount(beneficiary);
  const unvestedAmount = lockup.totalAmount - vestedAmount;

  // Calculate percentages
  const vestedPercent = (Number(vestedAmount) / Number(lockup.totalAmount)) * 100;
  const releasedPercent = (Number(lockup.releasedAmount) / Number(lockup.totalAmount)) * 100;

  console.log('📊 Lockup Information:');
  console.log('─'.repeat(50));
  console.log('Beneficiary:', beneficiary);
  console.log('Total Amount:', ethers.formatEther(lockup.totalAmount), 'tokens');
  console.log('Already Released:', ethers.formatEther(lockup.releasedAmount), 'tokens');
  console.log('Currently Vested:', ethers.formatEther(vestedAmount), 'tokens');
  console.log('Currently Unvested:', ethers.formatEther(unvestedAmount), 'tokens');
  console.log('');
  console.log('Progress:');
  console.log('  Vested:', vestedPercent.toFixed(2) + '%');
  console.log('  Released:', releasedPercent.toFixed(2) + '%');
  console.log('');
  console.log('Status:');
  console.log('  Revocable:', lockup.revocable ? '✅ Yes' : '❌ No');
  console.log('  Revoked:', lockup.revoked ? '❌ Yes' : '✅ No');
  console.log('');

  // Show revocation impact
  console.log('💰 Revocation Impact:');
  console.log('─'.repeat(50));
  console.log('Owner will receive:', ethers.formatEther(unvestedAmount), 'tokens (unvested)');
  console.log(
    'Beneficiary keeps:',
    ethers.formatEther(lockup.releasedAmount),
    'tokens (already released)'
  );
  console.log(
    'Beneficiary can still claim:',
    ethers.formatEther(releasableAmount),
    'tokens (vested but not released)'
  );
  console.log('');

  // Warning
  console.log('⚠️  WARNING: This action CANNOT be undone!');
  console.log('─'.repeat(50));
  console.log('After revoke:');
  console.log('  • No more tokens will vest for this beneficiary');
  console.log('  • Beneficiary can still claim currently vested tokens');
  console.log('  • You will receive', ethers.formatEther(unvestedAmount), 'tokens back');
  console.log('');

  // Two-step confirmation
  console.log('🔐 Confirmation Required (Step 1/2)');
  console.log('─'.repeat(50));
  const addressConfirm = await question('Type the beneficiary address again to confirm: ');

  if (addressConfirm.trim().toLowerCase() !== beneficiary.toLowerCase()) {
    console.log('❌ Address mismatch - Revocation cancelled');
    rl.close();
    return;
  }

  console.log('');
  console.log('🔐 Final Confirmation (Step 2/2)');
  console.log('─'.repeat(50));
  const finalConfirm = await question("Type 'REVOKE' in capital letters to proceed: ");

  if (finalConfirm.trim() !== 'REVOKE') {
    console.log('❌ Confirmation failed - Revocation cancelled');
    rl.close();
    return;
  }

  rl.close();

  console.log('');
  console.log('🚀 Revoking lockup...');

  try {
    const tx = await tokenLockup.revoke(beneficiary);
    console.log('Transaction Hash:', tx.hash);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log('✅ Success! Lockup revoked');
    console.log('Block Number:', receipt?.blockNumber);
    console.log('Gas Used:', receipt?.gasUsed.toString());
    console.log('');

    // Show final status
    const tokenAddress = await tokenLockup.token();
    const token = await ethers.getContractAt('IERC20', tokenAddress);
    const ownerBalance = await token.balanceOf(owner.address);

    console.log('📊 Final Status:');
    console.log('─'.repeat(50));
    console.log('Refund Received:', ethers.formatEther(unvestedAmount), 'tokens');
    console.log('Your Token Balance:', ethers.formatEther(ownerBalance), 'tokens');
    console.log('');

    // Verify revoked status
    const revokedLockup = await tokenLockup.lockups(beneficiary);
    console.log('Lockup Status:');
    console.log('  Revoked:', revokedLockup.revoked ? '✅ Yes' : '❌ No');
    console.log('  Frozen at:', ethers.formatEther(revokedLockup.totalAmount), 'tokens vested');
    console.log('');

    if (releasableAmount > 0n) {
      console.log(
        '💡 Note: Beneficiary can still claim',
        ethers.formatEther(releasableAmount),
        'tokens'
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error revoking lockup:', errorMessage);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    rl.close();
    process.exit(1);
  });
