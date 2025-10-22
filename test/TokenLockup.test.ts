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
      await expect(
        TokenLockupFactory.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidBeneficiary');
    });
  });

  describe('Create Lockup', function () {
    it('Should create a lockup successfully', async function () {
      await expect(
        tokenLockup.createLockup(
          beneficiary.address,
          TOTAL_AMOUNT,
          CLIFF_DURATION,
          VESTING_DURATION,
          true
        )
      )
        .to.emit(tokenLockup, 'TokensLocked')
        .withArgs(
          beneficiary.address,
          TOTAL_AMOUNT,
          await time.latest(),
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
      await expect(
        tokenLockup.connect(beneficiary).release()
      ).to.be.revertedWithCustomError(tokenLockup, 'NoTokensAvailable');
    });

    it('Should revert when no lockup exists', async function () {
      await expect(
        tokenLockup.connect(otherAccount).release()
      ).to.be.revertedWithCustomError(tokenLockup, 'NoLockupFound');
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

      await expect(
        tokenLockup.revoke(otherAccount.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'NotRevocable');
    });

    it('Should revert when already revoked', async function () {
      await tokenLockup.revoke(beneficiary.address);

      await expect(
        tokenLockup.revoke(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'AlreadyRevoked');
    });

    it('Should revert when lockup does not exist', async function () {
      await expect(
        tokenLockup.revoke(otherAccount.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'NoLockupFound');
    });

    it('Should revert when called by non-owner', async function () {
      await expect(
        tokenLockup.connect(otherAccount).revoke(beneficiary.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'OwnableUnauthorizedAccount');
    });

    it('Should prevent release after revoke', async function () {
      await tokenLockup.revoke(beneficiary.address);

      await expect(
        tokenLockup.connect(beneficiary).release()
      ).to.be.revertedWithCustomError(tokenLockup, 'AlreadyRevoked');
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
});
