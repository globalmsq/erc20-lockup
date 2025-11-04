import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { TokenLockup, MockERC20 } from '../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('TokenLockup', function () {
  let tokenLockup: TokenLockup;
  let token: MockERC20;
  let owner: SignerWithAddress;
  let beneficiary: SignerWithAddress;
  let otherAccount: SignerWithAddress;

  const TOTAL_AMOUNT = ethers.parseEther('1000');
  const CLIFF_DURATION = 30 * 24 * 60 * 60; // 30 days
  const VESTING_DURATION = 365 * 24 * 60 * 60; // 1 year

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

    // Approve tokens for lockup contract
    await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
  });

  describe('Deployment', function () {
    it('Should set the correct token address', async function () {
      expect(await tokenLockup.token()).to.equal(await token.getAddress());
    });

    it('Should set the correct owner', async function () {
      expect(await tokenLockup.owner()).to.equal(owner.address);
    });

    it('Should revert with zero token address', async function () {
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
      await expect(TokenLockupFactory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        tokenLockup,
        'InvalidTokenAddress'
      );
    });
  });

  describe('Create Lockup', function () {
    it('Should create a lockup successfully', async function () {
      // Execute transaction first
      const tx = await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
      const receipt = await tx.wait();

      // Get actual timestamp from the block where transaction was mined
      const block = await ethers.provider.getBlock(receipt!.blockNumber!);
      const actualStartTime = block!.timestamp;

      // Verify event with actual timestamp
      await expect(tx)
        .to.emit(tokenLockup, 'TokensLocked')
        .withArgs(
          beneficiary.address,
          TOTAL_AMOUNT,
          actualStartTime,
          CLIFF_DURATION,
          VESTING_DURATION,
          true
        );

      const lockup = await tokenLockup.lockups(beneficiary.address);
      expect(lockup.totalAmount).to.equal(TOTAL_AMOUNT);
      expect(lockup.releasedAmount).to.equal(0);
      expect(lockup.revocable).to.equal(true);
      expect(lockup.revoked).to.equal(false);
    });

    it('Should transfer tokens from owner to contract', async function () {
      const initialBalance = await token.balanceOf(await tokenLockup.getAddress());

      await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );

      expect(await token.balanceOf(await tokenLockup.getAddress())).to.equal(
        initialBalance + TOTAL_AMOUNT
      );
    });

    it('Should revert with zero beneficiary address', async function () {
      await expect(
        tokenLockup.createLockup(
          ethers.ZeroAddress,
          TOTAL_AMOUNT,
          CLIFF_DURATION,
          VESTING_DURATION,
          true
        )
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidBeneficiary');
    });

    it('Should revert when beneficiary is contract address (self-lock prevention)', async function () {
      const lockupAddress = await tokenLockup.getAddress();

      await expect(
        tokenLockup.createLockup(
          lockupAddress,
          TOTAL_AMOUNT,
          CLIFF_DURATION,
          VESTING_DURATION,
          true
        )
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidBeneficiary');
    });

    it('Should revert when beneficiary is owner address', async function () {
      await expect(
        tokenLockup.createLockup(
          owner.address,
          TOTAL_AMOUNT,
          CLIFF_DURATION,
          VESTING_DURATION,
          true
        )
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidBeneficiary');
    });

    it('Should revert with zero amount', async function () {
      await expect(
        tokenLockup.createLockup(beneficiary.address, 0, CLIFF_DURATION, VESTING_DURATION, true)
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidAmount');
    });

    it('Should revert with zero vesting duration', async function () {
      await expect(
        tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, CLIFF_DURATION, 0, true)
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidDuration');
    });

    it('Should revert when cliff is longer than vesting', async function () {
      await expect(
        tokenLockup.createLockup(
          beneficiary.address,
          TOTAL_AMOUNT,
          VESTING_DURATION + 1,
          VESTING_DURATION,
          true
        )
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidDuration');
    });

    it('Should revert when lockup already exists', async function () {
      await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );

      await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);

      await expect(
        tokenLockup.createLockup(
          beneficiary.address,
          TOTAL_AMOUNT,
          CLIFF_DURATION,
          VESTING_DURATION,
          true
        )
      ).to.be.revertedWithCustomError(tokenLockup, 'LockupAlreadyExists');
    });

    it('Should revert when called by non-owner', async function () {
      await expect(
        tokenLockup
          .connect(otherAccount)
          .createLockup(beneficiary.address, TOTAL_AMOUNT, CLIFF_DURATION, VESTING_DURATION, true)
      ).to.be.revertedWithCustomError(tokenLockup, 'OwnableUnauthorizedAccount');
    });
  });

  describe('Vesting', function () {
    beforeEach(async function () {
      await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
    });

    it('Should return zero vested amount before cliff', async function () {
      expect(await tokenLockup.vestedAmount(beneficiary.address)).to.equal(0);
    });

    it('Should return correct vested amount after cliff', async function () {
      await time.increase(CLIFF_DURATION);
      const vested = await tokenLockup.vestedAmount(beneficiary.address);
      const expected = (TOTAL_AMOUNT * BigInt(CLIFF_DURATION)) / BigInt(VESTING_DURATION);
      expect(vested).to.be.closeTo(expected, ethers.parseEther('1'));
    });

    it('Should return total amount after vesting period', async function () {
      await time.increase(VESTING_DURATION);
      expect(await tokenLockup.vestedAmount(beneficiary.address)).to.equal(TOTAL_AMOUNT);
    });

    it('Should calculate correct vested amount at midpoint', async function () {
      const halfDuration = VESTING_DURATION / 2;
      await time.increase(halfDuration);
      const vested = await tokenLockup.vestedAmount(beneficiary.address);
      const expected = TOTAL_AMOUNT / 2n;
      expect(vested).to.be.closeTo(expected, ethers.parseEther('1'));
    });

    it('Should return zero for non-existent beneficiary', async function () {
      // Test vestedAmount for address with no lockup (covers early return case)
      expect(await tokenLockup.vestedAmount(otherAccount.address)).to.equal(0);
      expect(await tokenLockup.releasableAmount(otherAccount.address)).to.equal(0);
    });
  });

  describe('Release', function () {
    beforeEach(async function () {
      await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
    });

    it('Should release vested tokens successfully', async function () {
      await time.increase(VESTING_DURATION / 2);

      const vestedAmount = await tokenLockup.vestedAmount(beneficiary.address);
      const initialBalance = await token.balanceOf(beneficiary.address);

      await tokenLockup.connect(beneficiary).release();

      const finalBalance = await token.balanceOf(beneficiary.address);
      expect(finalBalance).to.be.closeTo(initialBalance + vestedAmount, ethers.parseEther('1'));
    });

    it('Should revert when no tokens are available for release', async function () {
      await expect(tokenLockup.connect(beneficiary).release()).to.be.revertedWithCustomError(
        tokenLockup,
        'NoTokensAvailable'
      );
    });

    it('Should revert when no lockup exists', async function () {
      await expect(tokenLockup.connect(otherAccount).release()).to.be.revertedWithCustomError(
        tokenLockup,
        'NoLockupFound'
      );
    });

    it('Should allow multiple releases', async function () {
      await time.increase(VESTING_DURATION / 4);
      await tokenLockup.connect(beneficiary).release();

      await time.increase(VESTING_DURATION / 4);
      await tokenLockup.connect(beneficiary).release();

      const lockup = await tokenLockup.lockups(beneficiary.address);
      expect(lockup.releasedAmount).to.be.gt(0);
    });

    it('Should release all tokens after vesting period', async function () {
      await time.increase(VESTING_DURATION);

      const initialBalance = await token.balanceOf(beneficiary.address);
      await tokenLockup.connect(beneficiary).release();

      expect(await token.balanceOf(beneficiary.address)).to.equal(initialBalance + TOTAL_AMOUNT);

      const lockup = await tokenLockup.lockups(beneficiary.address);
      expect(lockup.releasedAmount).to.equal(TOTAL_AMOUNT);
    });
  });

  describe('Revoke', function () {
    beforeEach(async function () {
      await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
    });

    it('Should revoke lockup successfully', async function () {
      await time.increase(VESTING_DURATION / 2);

      const vestedAmount = await tokenLockup.vestedAmount(beneficiary.address);
      const refundAmount = TOTAL_AMOUNT - vestedAmount;
      const ownerBalanceBefore = await token.balanceOf(owner.address);

      await tokenLockup.revoke(beneficiary.address);

      const lockup = await tokenLockup.lockups(beneficiary.address);
      expect(lockup.revoked).to.equal(true);

      const ownerBalanceAfter = await token.balanceOf(owner.address);
      expect(ownerBalanceAfter).to.be.closeTo(
        ownerBalanceBefore + refundAmount,
        ethers.parseEther('1')
      );
    });

    it('Should revert when lockup is not revocable', async function () {
      await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      await tokenLockup.createLockup(
        otherAccount.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        false
      );

      await expect(tokenLockup.revoke(otherAccount.address)).to.be.revertedWithCustomError(
        tokenLockup,
        'NotRevocable'
      );
    });

    it('Should revert when already revoked', async function () {
      await tokenLockup.revoke(beneficiary.address);

      await expect(tokenLockup.revoke(beneficiary.address)).to.be.revertedWithCustomError(
        tokenLockup,
        'AlreadyRevoked'
      );
    });

    it('Should revert when lockup does not exist', async function () {
      await expect(tokenLockup.revoke(otherAccount.address)).to.be.revertedWithCustomError(
        tokenLockup,
        'NoLockupFound'
      );
    });

    it('Should revert when called by non-owner', async function () {
      await expect(
        tokenLockup.connect(otherAccount).revoke(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'OwnableUnauthorizedAccount');
    });

    it('Should allow beneficiary to claim vested tokens after revoke', async function () {
      // Advance past cliff to some point in vesting
      await time.increase(CLIFF_DURATION + VESTING_DURATION / 2);

      // Revoke lockup (vesting freezes at this point)
      await tokenLockup.revoke(beneficiary.address);

      // Get the actual releasable amount after revoke
      const releasableAfterRevoke = await tokenLockup.releasableAmount(beneficiary.address);
      expect(releasableAfterRevoke).to.be.gt(0); // Should have some tokens to release

      // Beneficiary should still be able to claim vested tokens
      const tx = await tokenLockup.connect(beneficiary).release();
      await expect(tx).to.emit(tokenLockup, 'TokensReleased');

      const beneficiaryBalance = await token.balanceOf(beneficiary.address);

      // Verify some tokens were vested and claimed (exact amount depends on timing)
      expect(beneficiaryBalance).to.be.gt(TOTAL_AMOUNT / 4n); // At least 25%
      expect(beneficiaryBalance).to.be.lt((TOTAL_AMOUNT * 3n) / 4n); // Less than 75%

      // No more tokens should be available after claiming vested amount
      await expect(tokenLockup.connect(beneficiary).release()).to.be.revertedWithCustomError(
        tokenLockup,
        'NoTokensAvailable'
      );
    });

    it('Should store vestedAtRevoke correctly', async function () {
      // Advance to 50% vesting
      await time.increase(CLIFF_DURATION + VESTING_DURATION / 2);

      // Get vested amount before revoke
      const vestedBefore = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vestedBefore).to.be.gt(0);
      expect(vestedBefore).to.be.closeTo(TOTAL_AMOUNT / 2n, ethers.parseEther('100'));

      // Revoke the lockup
      await tokenLockup.revoke(beneficiary.address);

      // Check lockup info - vestedAtRevoke should be stored
      const lockup = await tokenLockup.lockups(beneficiary.address);
      expect(lockup.revoked).to.be.true;
      expect(lockup.vestedAtRevoke).to.be.closeTo(vestedBefore, ethers.parseEther('1')); // Allow small timing difference
      expect(lockup.totalAmount).to.equal(TOTAL_AMOUNT); // Original totalAmount unchanged
      expect(lockup.vestingDuration).to.equal(VESTING_DURATION); // Original vestingDuration unchanged

      // Verify vested amount stays frozen at revoke point
      await time.increase(VESTING_DURATION); // Advance time further
      const vestedAfter = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vestedAfter).to.be.closeTo(vestedBefore, ethers.parseEther('1')); // Should not increase after revoke
      expect(vestedAfter).to.equal(lockup.vestedAtRevoke); // Matches stored value exactly
    });

    it('Should not allow vesting to increase after revoke', async function () {
      // Advance to 30% vesting
      await time.increase(CLIFF_DURATION + (VESTING_DURATION * 3) / 10);
      const vestedAtRevoke = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vestedAtRevoke).to.be.closeTo((TOTAL_AMOUNT * 3n) / 10n, ethers.parseEther('100'));

      // Revoke
      await tokenLockup.revoke(beneficiary.address);

      // Advance to would-be 100% vesting
      await time.increase(VESTING_DURATION);

      // Vested amount should still be 30%, not 100%
      const vestedAfter = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vestedAfter).to.be.closeTo(vestedAtRevoke, ethers.parseEther('1'));
      expect(vestedAfter).to.be.lt(TOTAL_AMOUNT); // Less than total amount
    });
  });

  describe('View Functions', function () {
    beforeEach(async function () {
      await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
    });

    it('Should return correct releasable amount', async function () {
      await time.increase(VESTING_DURATION / 2);

      const vestedAmount = await tokenLockup.vestedAmount(beneficiary.address);
      const releasableAmount = await tokenLockup.releasableAmount(beneficiary.address);

      expect(releasableAmount).to.equal(vestedAmount);
    });

    it('Should return zero releasable amount before cliff', async function () {
      expect(await tokenLockup.releasableAmount(beneficiary.address)).to.equal(0);
    });

    it('Should return correct releasable amount after partial release', async function () {
      await time.increase(VESTING_DURATION / 2);
      await tokenLockup.connect(beneficiary).release();

      await time.increase(VESTING_DURATION / 4);

      const vestedAmount = await tokenLockup.vestedAmount(beneficiary.address);
      const lockup = await tokenLockup.lockups(beneficiary.address);
      const releasableAmount = await tokenLockup.releasableAmount(beneficiary.address);

      expect(releasableAmount).to.equal(vestedAmount - lockup.releasedAmount);
    });
  });

  describe('Pause Functionality', function () {
    beforeEach(async function () {
      // Create a lockup for testing pause functionality
      await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        false
      );
    });

    it('Should allow owner to pause the contract', async function () {
      await expect(tokenLockup.pause()).to.not.be.reverted;
      expect(await tokenLockup.paused()).to.equal(true);
    });

    it('Should allow owner to unpause the contract', async function () {
      await tokenLockup.pause();
      await expect(tokenLockup.unpause()).to.not.be.reverted;
      expect(await tokenLockup.paused()).to.equal(false);
    });

    it('Should prevent non-owner from pausing', async function () {
      await expect(tokenLockup.connect(beneficiary).pause()).to.be.revertedWithCustomError(
        tokenLockup,
        'OwnableUnauthorizedAccount'
      );
    });

    it('Should prevent non-owner from unpausing', async function () {
      await tokenLockup.pause();
      await expect(tokenLockup.connect(beneficiary).unpause()).to.be.revertedWithCustomError(
        tokenLockup,
        'OwnableUnauthorizedAccount'
      );
    });

    it('Should block release when paused', async function () {
      // Fast forward past cliff
      await time.increase(VESTING_DURATION / 2);

      // Pause the contract
      await tokenLockup.pause();

      // Try to release tokens - should fail
      await expect(tokenLockup.connect(beneficiary).release()).to.be.revertedWithCustomError(
        tokenLockup,
        'EnforcedPause'
      );
    });

    it('Should allow release after unpause', async function () {
      // Fast forward past cliff
      await time.increase(VESTING_DURATION / 2);

      // Pause and unpause
      await tokenLockup.pause();
      await tokenLockup.unpause();

      // Release should work now
      await expect(tokenLockup.connect(beneficiary).release()).to.not.be.reverted;
    });

    it('Should block revoke when paused', async function () {
      // Create a revocable lockup
      await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      await tokenLockup.createLockup(
        otherAccount.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true // revocable
      );

      // Pause the contract
      await tokenLockup.pause();

      // Revoke should be blocked when paused (consistent with other state changes)
      await expect(tokenLockup.revoke(otherAccount.address)).to.be.revertedWithCustomError(
        tokenLockup,
        'EnforcedPause'
      );
    });

    it('Should emit Paused event', async function () {
      await expect(tokenLockup.pause()).to.emit(tokenLockup, 'Paused').withArgs(owner.address);
    });

    it('Should emit Unpaused event', async function () {
      await tokenLockup.pause();
      await expect(tokenLockup.unpause()).to.emit(tokenLockup, 'Unpaused').withArgs(owner.address);
    });

    it('Should block createLockup when paused', async function () {
      await tokenLockup.pause();

      await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      await expect(
        tokenLockup.createLockup(
          otherAccount.address,
          TOTAL_AMOUNT,
          CLIFF_DURATION,
          VESTING_DURATION,
          true
        )
      ).to.be.revertedWithCustomError(tokenLockup, 'EnforcedPause');
    });
  });

  describe('Rounding Error Handling', function () {
    it('Should release exactly totalAmount after full vesting (no dust)', async function () {
      // Create lockup with amount that doesn't divide evenly
      const oddAmount = ethers.parseEther('1000') + 3n; // 1000.000000000000000003
      await token.approve(await tokenLockup.getAddress(), oddAmount);
      await tokenLockup.createLockup(beneficiary.address, oddAmount, 0, VESTING_DURATION, false);

      // Advance to end of vesting period
      await time.increase(VESTING_DURATION);

      // Check releasable amount equals total amount (no rounding loss)
      const releasable = await tokenLockup.releasableAmount(beneficiary.address);
      expect(releasable).to.equal(oddAmount);

      // Release all tokens
      await tokenLockup.connect(beneficiary).release();

      // Verify beneficiary received exactly totalAmount
      const beneficiaryBalance = await token.balanceOf(beneficiary.address);
      expect(beneficiaryBalance).to.equal(oddAmount);

      // Verify no dust left in contract
      const remainingReleasable = await tokenLockup.releasableAmount(beneficiary.address);
      expect(remainingReleasable).to.equal(0);
    });

    it('Should handle multiple releases with no accumulated rounding errors', async function () {
      // Create lockup
      await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        false
      );

      // Release 1: After cliff
      await time.increase(CLIFF_DURATION);
      const releasable1 = await tokenLockup.releasableAmount(beneficiary.address);
      await tokenLockup.connect(beneficiary).release();

      // Release 2: Midpoint
      await time.increase((VESTING_DURATION - CLIFF_DURATION) / 2);
      const releasable2 = await tokenLockup.releasableAmount(beneficiary.address);
      await tokenLockup.connect(beneficiary).release();

      // Release 3: End of vesting
      await time.increase((VESTING_DURATION - CLIFF_DURATION) / 2);
      const releasable3 = await tokenLockup.releasableAmount(beneficiary.address);
      await tokenLockup.connect(beneficiary).release();

      // Total released should equal totalAmount exactly
      const totalReleased = releasable1 + releasable2 + releasable3;
      const beneficiaryBalance = await token.balanceOf(beneficiary.address);
      expect(beneficiaryBalance).to.equal(TOTAL_AMOUNT);
      expect(totalReleased).to.be.closeTo(TOTAL_AMOUNT, ethers.parseEther('1')); // Allow small variance during vesting
    });

    it('Should release remaining dust at final vesting even with odd division', async function () {
      // Amount that creates significant rounding errors: 1000 / 3 seconds
      const testAmount = ethers.parseEther('1000');
      const shortVesting = 3; // 3 seconds - creates 333.33... per second
      await token.approve(await tokenLockup.getAddress(), testAmount);
      await tokenLockup.createLockup(beneficiary.address, testAmount, 0, shortVesting, false);

      // Advance to end of vesting period
      await time.increase(shortVesting);

      // At end of vesting, releasable should be exactly totalAmount (no rounding loss)
      const releasableAtEnd = await tokenLockup.releasableAmount(beneficiary.address);
      expect(releasableAtEnd).to.equal(testAmount);

      // Release all tokens
      await tokenLockup.connect(beneficiary).release();
      const finalBalance = await token.balanceOf(beneficiary.address);

      // Final balance must be exactly totalAmount (proves no dust left behind)
      expect(finalBalance).to.equal(testAmount);

      // Verify no tokens stuck in contract
      const remaining = await tokenLockup.releasableAmount(beneficiary.address);
      expect(remaining).to.equal(0);
    });

    it('Should apply rounding correctly at 49.9% and 50.1% boundaries', async function () {
      const testAmount = ethers.parseEther('1000');
      const testVesting = 1000; // 1000 seconds
      await token.approve(await tokenLockup.getAddress(), testAmount);
      await tokenLockup.createLockup(beneficiary.address, testAmount, 0, testVesting, false);

      // At 49.9% (499 seconds): 499/1000 = 0.499, no rounding up
      await time.increase(499);
      const vested499 = await tokenLockup.vestedAmount(beneficiary.address);
      // 1000 * 499 / 1000 = 499, remainder = 0 (< 500), no rounding
      expect(vested499).to.equal(ethers.parseEther('499'));

      // At 50.1% (501 seconds): 501/1000 = 0.501, rounds up
      await time.increase(2); // Total 501 seconds
      const vested501 = await tokenLockup.vestedAmount(beneficiary.address);
      // 1000 * 501 / 1000 = 501, remainder = 0 (< 500), no rounding needed (exact division)
      expect(vested501).to.equal(ethers.parseEther('501'));
    });

    it('Should handle extreme small amounts with rounding', async function () {
      // Test with 1 wei over 10 seconds
      const tinyAmount = 1n;
      const shortVesting = 10;
      await token.approve(await tokenLockup.getAddress(), tinyAmount);
      await tokenLockup.createLockup(beneficiary.address, tinyAmount, 0, shortVesting, false);

      // At 4 seconds: 1 * 4 / 10 = 0, remainder = 4 (< 5), no rounding
      await time.increase(4);
      const vested4 = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vested4).to.equal(0n);

      // At 5 seconds: 1 * 5 / 10 = 0, remainder = 5 (= 5), rounds up to 1
      await time.increase(1);
      const vested5 = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vested5).to.equal(1n);

      // Verify can release
      await tokenLockup.connect(beneficiary).release();
      const balance = await token.balanceOf(beneficiary.address);
      expect(balance).to.equal(1n);
    });

    it('Should handle 10 wei amount with precise rounding', async function () {
      const smallAmount = 10n;
      const testVesting = 3; // 10 wei / 3 seconds = 3.333... per second
      await token.approve(await tokenLockup.getAddress(), smallAmount);
      await tokenLockup.createLockup(beneficiary.address, smallAmount, 0, testVesting, false);

      // At 1 second: 10 * 1 / 3 = 3, remainder = 1 (< 1.5), no rounding
      await time.increase(1);
      const vested1 = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vested1).to.equal(3n);

      // At 2 seconds: 10 * 2 / 3 = 6, remainder = 2 (>= 1.5), rounds up to 7
      await time.increase(1);
      const vested2 = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vested2).to.equal(7n);

      // At 3 seconds: Full vesting, should return totalAmount
      await time.increase(1);
      const vested3 = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vested3).to.equal(10n);
    });
  });

  describe('Token Address Change', function () {
    let newToken: MockERC20;

    beforeEach(async function () {
      // Deploy a new mock token for testing token change
      const MockERC20Factory = await ethers.getContractFactory('MockERC20');
      newToken = await MockERC20Factory.deploy('New Token', 'NEW', ethers.parseEther('1000000'));
      await newToken.waitForDeployment();
    });

    it('Should revert when contract has non-zero balance', async function () {
      // Create a lockup so contract has tokens
      await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);

      // Try to change token - should fail
      await tokenLockup.pause();
      await expect(
        tokenLockup.changeToken(await newToken.getAddress())
      ).to.be.revertedWithCustomError(tokenLockup, 'TokensStillLocked');
    });

    it('Should revert when called by non-owner', async function () {
      await tokenLockup.pause();
      await expect(
        tokenLockup.connect(otherAccount).changeToken(await newToken.getAddress())
      ).to.be.revertedWithCustomError(tokenLockup, 'OwnableUnauthorizedAccount');
    });

    it('Should revert when contract is not paused', async function () {
      // Contract balance is 0, but not paused
      await expect(
        tokenLockup.changeToken(await newToken.getAddress())
      ).to.be.revertedWithCustomError(tokenLockup, 'ExpectedPause');
    });

    it('Should revert when new token address is zero', async function () {
      await tokenLockup.pause();
      await expect(tokenLockup.changeToken(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        tokenLockup,
        'InvalidTokenAddress'
      );
    });

    it('Should successfully change token when balance is zero', async function () {
      // Ensure contract has no tokens
      const balance = await token.balanceOf(await tokenLockup.getAddress());
      expect(balance).to.equal(0);

      // Pause and change token
      await tokenLockup.pause();
      await tokenLockup.changeToken(await newToken.getAddress());

      // Verify token changed
      expect(await tokenLockup.token()).to.equal(await newToken.getAddress());
    });

    it('Should emit TokenChanged event', async function () {
      await tokenLockup.pause();
      await expect(tokenLockup.changeToken(await newToken.getAddress()))
        .to.emit(tokenLockup, 'TokenChanged')
        .withArgs(await token.getAddress(), await newToken.getAddress());
    });

    it('Should allow creating lockup with new token after change', async function () {
      // Change token
      await tokenLockup.pause();
      await tokenLockup.changeToken(await newToken.getAddress());
      await tokenLockup.unpause();

      // Approve and create lockup with new token
      await newToken.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);

      // Verify lockup created with new token
      const lockup = await tokenLockup.lockups(beneficiary.address);
      expect(lockup.totalAmount).to.equal(TOTAL_AMOUNT);

      // Verify new tokens transferred to contract
      const contractBalance = await newToken.balanceOf(await tokenLockup.getAddress());
      expect(contractBalance).to.equal(TOTAL_AMOUNT);
    });

    it('Should revert when active lockups exist even with zero balance', async function () {
      // Create a lockup
      await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);

      // Complete vesting and release all tokens (contract balance becomes 0)
      await time.increase(VESTING_DURATION);
      await tokenLockup.connect(beneficiary).release();

      // Verify balance is 0
      const balance = await token.balanceOf(await tokenLockup.getAddress());
      expect(balance).to.equal(0);

      // Try to change token - should fail because lockup data still exists
      await tokenLockup.pause();
      await expect(
        tokenLockup.changeToken(await newToken.getAddress())
      ).to.be.revertedWithCustomError(tokenLockup, 'ActiveLockupsExist');
    });

    it('Should succeed after all lockups are deleted', async function () {
      // Create a lockup
      await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);

      // Complete vesting and release
      await time.increase(VESTING_DURATION);
      await tokenLockup.connect(beneficiary).release();

      // Delete the completed lockup
      await tokenLockup.deleteLockup(beneficiary.address);

      // Now changeToken should succeed
      await tokenLockup.pause();
      await tokenLockup.changeToken(await newToken.getAddress());

      // Verify token changed
      expect(await tokenLockup.token()).to.equal(await newToken.getAddress());
    });

    it('Should revert with multiple lockups even if all released', async function () {
      // Create two lockups
      await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT * 2n);
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false);
      await tokenLockup.createLockup(
        otherAccount.address,
        TOTAL_AMOUNT,
        0,
        VESTING_DURATION,
        false
      );

      // Complete vesting and release all
      await time.increase(VESTING_DURATION);
      await tokenLockup.connect(beneficiary).release();
      await tokenLockup.connect(otherAccount).release();

      // Contract balance is 0 but lockup data exists
      const balance = await token.balanceOf(await tokenLockup.getAddress());
      expect(balance).to.equal(0);

      // Should fail - active lockups exist
      await tokenLockup.pause();
      await expect(
        tokenLockup.changeToken(await newToken.getAddress())
      ).to.be.revertedWithCustomError(tokenLockup, 'ActiveLockupsExist');

      // Delete both lockups
      await tokenLockup.deleteLockup(beneficiary.address);
      await tokenLockup.deleteLockup(otherAccount.address);

      // Now should succeed
      await tokenLockup.changeToken(await newToken.getAddress());
      expect(await tokenLockup.token()).to.equal(await newToken.getAddress());
    });

    it('Should revert when new token is an EOA (not a contract)', async function () {
      await tokenLockup.pause();
      // Try to change to an EOA address (otherAccount)
      await expect(tokenLockup.changeToken(otherAccount.address)).to.be.revertedWithCustomError(
        tokenLockup,
        'InvalidTokenAddress'
      );
    });

    it('Should revert when new token does not implement ERC20', async function () {
      await tokenLockup.pause();
      // Try to change to the TokenLockup contract itself (not an ERC20)
      await expect(
        tokenLockup.changeToken(await tokenLockup.getAddress())
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidTokenAddress');
    });
  });
});
