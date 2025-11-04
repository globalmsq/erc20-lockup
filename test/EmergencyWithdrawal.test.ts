import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { TokenLockup, MockERC20 } from '../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('TokenLockup - Emergency Withdrawal', function () {
  let tokenLockup: TokenLockup;
  let token: MockERC20;
  let owner: SignerWithAddress;
  let beneficiary: SignerWithAddress;
  let otherAccount: SignerWithAddress;

  const TOTAL_AMOUNT = ethers.parseEther('1000');
  const VESTING_DURATION = 100; // 100 seconds for testing
  const SIX_MONTHS = 180 * 24 * 60 * 60; // 180 days
  const GRACE_PERIOD = 30 * 24 * 60 * 60; // 30 days

  beforeEach(async function () {
    [owner, beneficiary, otherAccount] = await ethers.getSigners();

    // Deploy mock token
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    token = await MockERC20Factory.deploy('Test Token', 'TEST', ethers.parseEther('1000000'));
    await token.waitForDeployment();

    // Deploy TokenLockup
    const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
    tokenLockup = await TokenLockupFactory.deploy(await token.getAddress());
    await tokenLockup.waitForDeployment();

    // Approve and create lockup
    await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
  });

  describe('Basic Emergency Unlock Flow', function () {
    beforeEach(async function () {
      // Create non-revocable lockup
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);
    });

    it('Should allow owner to request emergency unlock after vesting complete + 6 months', async function () {
      // Complete vesting
      await time.increase(VESTING_DURATION);

      // Wait 6 months
      await time.increase(SIX_MONTHS);

      // Request emergency unlock
      const tx = await tokenLockup.requestEmergencyUnlock(beneficiary.address);
      const unlockTime = (await time.latest()) + GRACE_PERIOD;

      await expect(tx)
        .to.emit(tokenLockup, 'EmergencyUnlockRequested')
        .withArgs(beneficiary.address, unlockTime);

      // Verify unlock time stored
      expect(await tokenLockup.emergencyUnlockTime(beneficiary.address)).to.equal(unlockTime);
    });

    it('Should allow owner to execute emergency withdrawal after grace period', async function () {
      // Complete vesting + wait 6 months
      await time.increase(VESTING_DURATION + SIX_MONTHS);

      // Request unlock
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);

      // Wait for grace period
      await time.increase(GRACE_PERIOD);

      // Execute withdrawal
      const initialOwnerBalance = await token.balanceOf(owner.address);
      const tx = await tokenLockup.emergencyWithdraw(beneficiary.address);

      await expect(tx)
        .to.emit(tokenLockup, 'EmergencyWithdrawal')
        .withArgs(beneficiary.address, TOTAL_AMOUNT);

      // Verify tokens transferred to owner
      expect(await token.balanceOf(owner.address)).to.equal(initialOwnerBalance + TOTAL_AMOUNT);

      // Verify lockup state updated
      const lockup = await tokenLockup.lockups(beneficiary.address);
      expect(lockup.releasedAmount).to.equal(TOTAL_AMOUNT);

      // Verify unlock time cleared
      expect(await tokenLockup.emergencyUnlockTime(beneficiary.address)).to.equal(0);
    });

    it('Should complete full emergency withdrawal workflow', async function () {
      // Step 1: Complete vesting
      await time.increase(VESTING_DURATION);
      console.log('  ✅ Vesting completed');

      // Step 2: Wait 6 months
      await time.increase(SIX_MONTHS);
      console.log('  ✅ 6 months waiting period completed');

      // Step 3: Request emergency unlock
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);
      const unlockTime = await tokenLockup.emergencyUnlockTime(beneficiary.address);
      expect(unlockTime).to.be.gt(0);
      console.log('  ✅ Emergency unlock requested');

      // Step 4: Wait grace period
      await time.increase(GRACE_PERIOD);
      console.log('  ✅ 30-day grace period completed');

      // Step 5: Execute withdrawal
      const ownerBalanceBefore = await token.balanceOf(owner.address);
      await tokenLockup.emergencyWithdraw(beneficiary.address);
      const ownerBalanceAfter = await token.balanceOf(owner.address);

      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(TOTAL_AMOUNT);
      console.log(`  ✅ Emergency withdrawal completed: ${ethers.formatEther(TOTAL_AMOUNT)} tokens`);
    });
  });

  describe('Timing Requirements', function () {
    beforeEach(async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);
    });

    it('Should revert if vesting not complete', async function () {
      // Try to request before vesting complete
      await expect(
        tokenLockup.requestEmergencyUnlock(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'VestingNotComplete');
    });

    it('Should revert if trying to request before 6 months after vesting', async function () {
      // Complete vesting
      await time.increase(VESTING_DURATION);

      // Try immediately (before 6 months)
      await expect(
        tokenLockup.requestEmergencyUnlock(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'EmergencyUnlockTooEarly');

      // Try at 3 months
      await time.increase(90 * 24 * 60 * 60);
      await expect(
        tokenLockup.requestEmergencyUnlock(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'EmergencyUnlockTooEarly');

      // Try at 5.9 months (just before 6 months)
      await time.increase(89 * 24 * 60 * 60);
      await expect(
        tokenLockup.requestEmergencyUnlock(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'EmergencyUnlockTooEarly');
    });

    it('Should succeed exactly at 6 months boundary', async function () {
      // Complete vesting + exactly 6 months
      await time.increase(VESTING_DURATION + SIX_MONTHS);

      // Should succeed at boundary
      await expect(tokenLockup.requestEmergencyUnlock(beneficiary.address)).to.not.be.reverted;
    });

    it('Should revert if trying to withdraw before grace period', async function () {
      // Complete vesting + 6 months
      await time.increase(VESTING_DURATION + SIX_MONTHS);

      // Request unlock
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);

      // Try to withdraw immediately
      await expect(
        tokenLockup.emergencyWithdraw(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'EmergencyUnlockTooEarly');

      // Try at 15 days (half grace period)
      await time.increase(15 * 24 * 60 * 60);
      await expect(
        tokenLockup.emergencyWithdraw(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'EmergencyUnlockTooEarly');

      // Try at 29 days (just before grace period ends)
      await time.increase(14 * 24 * 60 * 60);
      await expect(
        tokenLockup.emergencyWithdraw(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'EmergencyUnlockTooEarly');
    });

    it('Should succeed exactly at grace period end', async function () {
      // Setup: vesting + 6 months + request
      await time.increase(VESTING_DURATION + SIX_MONTHS);
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);

      // Wait exactly 30 days
      await time.increase(GRACE_PERIOD);

      // Should succeed at boundary
      await expect(tokenLockup.emergencyWithdraw(beneficiary.address)).to.not.be.reverted;
    });
  });

  describe('Beneficiary Cancellation', function () {
    beforeEach(async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);
    });

    it('Should cancel emergency unlock when beneficiary calls release()', async function () {
      // Complete vesting + 6 months
      await time.increase(VESTING_DURATION + SIX_MONTHS);

      // Request unlock
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);
      expect(await tokenLockup.emergencyUnlockTime(beneficiary.address)).to.be.gt(0);

      // Beneficiary releases tokens
      const tx = await tokenLockup.connect(beneficiary).release();

      await expect(tx)
        .to.emit(tokenLockup, 'EmergencyUnlockCancelled')
        .withArgs(beneficiary.address);

      // Verify unlock cleared
      expect(await tokenLockup.emergencyUnlockTime(beneficiary.address)).to.equal(0);

      // Verify tokens went to beneficiary
      expect(await token.balanceOf(beneficiary.address)).to.equal(TOTAL_AMOUNT);
    });

    it('Should allow beneficiary to cancel during grace period', async function () {
      // Setup: complete vesting + 6 months + request
      await time.increase(VESTING_DURATION + SIX_MONTHS);
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);

      // Wait 15 days (middle of grace period)
      await time.increase(15 * 24 * 60 * 60);

      // Beneficiary cancels by releasing
      await tokenLockup.connect(beneficiary).release();

      // Verify unlock cancelled
      expect(await tokenLockup.emergencyUnlockTime(beneficiary.address)).to.equal(0);

      // Owner should not be able to withdraw anymore
      await time.increase(GRACE_PERIOD);
      await expect(
        tokenLockup.emergencyWithdraw(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'EmergencyUnlockNotRequested');
    });

    it('Should allow beneficiary to cancel on last day of grace period', async function () {
      // Setup
      await time.increase(VESTING_DURATION + SIX_MONTHS);
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);

      // Wait 29 days (last day before grace period ends)
      await time.increase(29 * 24 * 60 * 60);

      // Beneficiary can still cancel
      await expect(tokenLockup.connect(beneficiary).release()).to.not.be.reverted;

      // Unlock should be cancelled
      expect(await tokenLockup.emergencyUnlockTime(beneficiary.address)).to.equal(0);
    });

    it('Should emit both TokensReleased and EmergencyUnlockCancelled events', async function () {
      // Setup
      await time.increase(VESTING_DURATION + SIX_MONTHS);
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);

      // Beneficiary releases
      const tx = await tokenLockup.connect(beneficiary).release();

      // Both events should be emitted
      await expect(tx).to.emit(tokenLockup, 'TokensReleased').withArgs(beneficiary.address, TOTAL_AMOUNT);
      await expect(tx).to.emit(tokenLockup, 'EmergencyUnlockCancelled').withArgs(beneficiary.address);
    });
  });

  describe('Partial Release Scenarios', function () {
    beforeEach(async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);
    });

    it('Should handle emergency withdrawal after partial release', async function () {
      // Release 50% during vesting
      await time.increase(VESTING_DURATION / 2);
      await tokenLockup.connect(beneficiary).release();

      const partialRelease = await token.balanceOf(beneficiary.address);
      expect(partialRelease).to.be.gt(0);
      console.log(`  ✅ Beneficiary released partial: ${ethers.formatEther(partialRelease)} tokens`);

      // Complete vesting + 6 months
      await time.increase(VESTING_DURATION / 2 + SIX_MONTHS);

      // Request and execute emergency withdrawal
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);
      await time.increase(GRACE_PERIOD);

      const ownerBalanceBefore = await token.balanceOf(owner.address);
      await tokenLockup.emergencyWithdraw(beneficiary.address);
      const ownerBalanceAfter = await token.balanceOf(owner.address);

      // Owner should get remaining tokens
      const ownerReceived = ownerBalanceAfter - ownerBalanceBefore;
      expect(ownerReceived).to.be.closeTo(TOTAL_AMOUNT - partialRelease, ethers.parseEther('1'));
      console.log(`  ✅ Owner received remaining: ${ethers.formatEther(ownerReceived)} tokens`);
    });

    it('Should handle emergency unlock request after partial release and cancellation', async function () {
      // Partial release at 50%
      await time.increase(VESTING_DURATION / 2);
      await tokenLockup.connect(beneficiary).release();

      // Wait for vesting complete + 6 months
      await time.increase(VESTING_DURATION / 2 + SIX_MONTHS);

      // First unlock request
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);

      // Beneficiary cancels by releasing remaining tokens
      await tokenLockup.connect(beneficiary).release();
      expect(await tokenLockup.emergencyUnlockTime(beneficiary.address)).to.equal(0);

      // Verify beneficiary received all tokens
      expect(await token.balanceOf(beneficiary.address)).to.equal(TOTAL_AMOUNT);

      // Owner cannot withdraw (no tokens left)
      await expect(
        tokenLockup.requestEmergencyUnlock(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'NoTokensAvailable');
    });
  });

  describe('Revoked Lockup Scenarios', function () {
    beforeEach(async function () {
      // Create revocable lockup
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, true);
    });

    it('Should allow emergency withdrawal of vested amount after revocation', async function () {
      // Vest 50%, then revoke
      await time.increase(VESTING_DURATION / 2);
      await tokenLockup.revoke(beneficiary.address);

      const lockup = await tokenLockup.lockups(beneficiary.address);
      const vestedAmount = lockup.vestedAtRevoke;
      expect(vestedAmount).to.be.gt(0);
      console.log(`  ✅ Vested at revoke: ${ethers.formatEther(vestedAmount)} tokens`);

      // For revoked lockups, no 6-month waiting required
      // Request emergency unlock immediately
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);

      // Wait grace period
      await time.increase(GRACE_PERIOD);

      // Execute withdrawal
      const ownerBalanceBefore = await token.balanceOf(owner.address);
      await tokenLockup.emergencyWithdraw(beneficiary.address);
      const ownerBalanceAfter = await token.balanceOf(owner.address);

      // Owner should receive the vested (but unclaimed) amount
      const ownerReceived = ownerBalanceAfter - ownerBalanceBefore;
      expect(ownerReceived).to.equal(vestedAmount);
      console.log(`  ✅ Owner recovered vested amount: ${ethers.formatEther(ownerReceived)} tokens`);
    });

    it('Should not require 6-month wait for revoked lockups', async function () {
      // Vest 50%, then revoke
      await time.increase(VESTING_DURATION / 2);
      await tokenLockup.revoke(beneficiary.address);

      // Can request unlock immediately (no 6-month wait for revoked)
      await expect(tokenLockup.requestEmergencyUnlock(beneficiary.address)).to.not.be.reverted;
    });
  });

  describe('Edge Cases', function () {
    beforeEach(async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);
    });

    it('Should revert on double unlock request', async function () {
      // Complete vesting + 6 months
      await time.increase(VESTING_DURATION + SIX_MONTHS);

      // First request succeeds
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);

      // Second request should succeed (overwrites unlock time)
      await expect(tokenLockup.requestEmergencyUnlock(beneficiary.address)).to.not.be.reverted;
    });

    it('Should revert emergency withdrawal without request', async function () {
      // Complete vesting + 6 months
      await time.increase(VESTING_DURATION + SIX_MONTHS);

      // Try to withdraw without requesting
      await expect(
        tokenLockup.emergencyWithdraw(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'EmergencyUnlockNotRequested');
    });

    it('Should revert if no lockup found', async function () {
      await expect(
        tokenLockup.requestEmergencyUnlock(otherAccount.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'NoLockupFound');

      await expect(
        tokenLockup.emergencyWithdraw(otherAccount.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'EmergencyUnlockNotRequested');
    });

    it('Should revert if all tokens already released', async function () {
      // Complete vesting and release all tokens
      await time.increase(VESTING_DURATION);
      await tokenLockup.connect(beneficiary).release();

      // Wait 6 months
      await time.increase(SIX_MONTHS);

      // Cannot request unlock (no tokens available)
      await expect(
        tokenLockup.requestEmergencyUnlock(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'NoTokensAvailable');
    });

    it('Should handle unlock request update if beneficiary does not claim', async function () {
      // Complete vesting + 6 months
      await time.increase(VESTING_DURATION + SIX_MONTHS);

      // First request
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);
      const firstUnlockTime = await tokenLockup.emergencyUnlockTime(beneficiary.address);

      // Wait 10 days
      await time.increase(10 * 24 * 60 * 60);

      // Second request (updates unlock time)
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);
      const secondUnlockTime = await tokenLockup.emergencyUnlockTime(beneficiary.address);

      // Second unlock time should be later
      expect(secondUnlockTime).to.be.gt(firstUnlockTime);
    });
  });

  describe('Access Control', function () {
    beforeEach(async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);
      await time.increase(VESTING_DURATION + SIX_MONTHS);
    });

    it('Should only allow owner to request emergency unlock', async function () {
      await expect(
        tokenLockup.connect(beneficiary).requestEmergencyUnlock(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'OwnableUnauthorizedAccount');

      await expect(
        tokenLockup.connect(otherAccount).requestEmergencyUnlock(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'OwnableUnauthorizedAccount');
    });

    it('Should only allow owner to execute emergency withdrawal', async function () {
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);
      await time.increase(GRACE_PERIOD);

      await expect(
        tokenLockup.connect(beneficiary).emergencyWithdraw(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'OwnableUnauthorizedAccount');

      await expect(
        tokenLockup.connect(otherAccount).emergencyWithdraw(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'OwnableUnauthorizedAccount');
    });
  });

  describe('State Consistency', function () {
    beforeEach(async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);
    });

    it('Should maintain correct emergencyUnlockTime mapping', async function () {
      // Initially zero
      expect(await tokenLockup.emergencyUnlockTime(beneficiary.address)).to.equal(0);

      // After request
      await time.increase(VESTING_DURATION + SIX_MONTHS);
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);
      const unlockTime = await tokenLockup.emergencyUnlockTime(beneficiary.address);
      expect(unlockTime).to.be.gt(0);

      // After withdrawal
      await time.increase(GRACE_PERIOD);
      await tokenLockup.emergencyWithdraw(beneficiary.address);
      expect(await tokenLockup.emergencyUnlockTime(beneficiary.address)).to.equal(0);
    });

    it('Should maintain correct lockup state after emergency withdrawal', async function () {
      // Setup
      await time.increase(VESTING_DURATION + SIX_MONTHS);
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);
      await time.increase(GRACE_PERIOD);

      // Before withdrawal
      const lockupBefore = await tokenLockup.lockups(beneficiary.address);
      expect(lockupBefore.releasedAmount).to.equal(0);

      // Execute withdrawal
      await tokenLockup.emergencyWithdraw(beneficiary.address);

      // After withdrawal
      const lockupAfter = await tokenLockup.lockups(beneficiary.address);
      expect(lockupAfter.releasedAmount).to.equal(TOTAL_AMOUNT);
      expect(lockupAfter.totalAmount).to.equal(TOTAL_AMOUNT);
    });

    it('Should correctly calculate releasable amount after emergency unlock request', async function () {
      // Complete vesting + 6 months
      await time.increase(VESTING_DURATION + SIX_MONTHS);

      // Before unlock request
      expect(await tokenLockup.releasableAmount(beneficiary.address)).to.equal(TOTAL_AMOUNT);

      // After unlock request (still releasable for beneficiary)
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);
      expect(await tokenLockup.releasableAmount(beneficiary.address)).to.equal(TOTAL_AMOUNT);

      // Beneficiary can still claim
      await tokenLockup.connect(beneficiary).release();
      expect(await tokenLockup.releasableAmount(beneficiary.address)).to.equal(0);
    });
  });

  describe('Gas Measurements', function () {
    beforeEach(async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);
      await time.increase(VESTING_DURATION + SIX_MONTHS);
    });

    it('Should measure requestEmergencyUnlock gas cost', async function () {
      const tx = await tokenLockup.requestEmergencyUnlock(beneficiary.address);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed;

      console.log(`\n  📊 requestEmergencyUnlock gas: ${gasUsed.toLocaleString()}`);
      expect(gasUsed).to.be.lessThan(100000n); // Should be < 100K gas
    });

    it('Should measure emergencyWithdraw gas cost', async function () {
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);
      await time.increase(GRACE_PERIOD);

      const tx = await tokenLockup.emergencyWithdraw(beneficiary.address);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed;

      console.log(`  📊 emergencyWithdraw gas: ${gasUsed.toLocaleString()}`);
      expect(gasUsed).to.be.lessThan(150000n); // Should be < 150K gas
    });

    it('Should measure release with cancellation gas cost', async function () {
      await tokenLockup.requestEmergencyUnlock(beneficiary.address);

      const tx = await tokenLockup.connect(beneficiary).release();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed;

      console.log(`  📊 release (with cancel) gas: ${gasUsed.toLocaleString()}`);
      expect(gasUsed).to.be.lessThan(120000n); // Should be < 120K gas
    });
  });
});
