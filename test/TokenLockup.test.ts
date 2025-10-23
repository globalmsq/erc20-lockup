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
        'InvalidBeneficiary'
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

    it('Should allow revoke to work when paused', async function () {
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

      // Revoke should still work (for emergency recovery)
      await expect(tokenLockup.revoke(otherAccount.address)).to.not.be.reverted;
    });

    it('Should emit Paused event', async function () {
      await expect(tokenLockup.pause()).to.emit(tokenLockup, 'Paused').withArgs(owner.address);
    });

    it('Should emit Unpaused event', async function () {
      await tokenLockup.pause();
      await expect(tokenLockup.unpause()).to.emit(tokenLockup, 'Unpaused').withArgs(owner.address);
    });
  });
});
