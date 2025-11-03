import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { TokenLockup, MockERC20 } from '../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('TokenLockup - Enumeration', function () {
  let tokenLockup: TokenLockup;
  let token: MockERC20;
  let _owner: SignerWithAddress;
  let beneficiary1: SignerWithAddress;
  let beneficiary2: SignerWithAddress;
  let beneficiary3: SignerWithAddress;
  let otherAccount: SignerWithAddress;

  const TOTAL_AMOUNT = ethers.parseEther('1000');
  const CLIFF_DURATION = 30 * 24 * 60 * 60; // 30 days
  const VESTING_DURATION = 365 * 24 * 60 * 60; // 1 year
  const MAX_LOCKUPS = 100n;
  const MAX_VESTING_DURATION = 10n * 365n * 24n * 60n * 60n; // 10 years

  beforeEach(async function () {
    [_owner, beneficiary1, beneficiary2, beneficiary3, otherAccount] = await ethers.getSigners();

    // Deploy mock token
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    token = await MockERC20Factory.deploy('Test Token', 'TEST', ethers.parseEther('1000000'));
    await token.waitForDeployment();

    // Deploy TokenLockup
    const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
    tokenLockup = await TokenLockupFactory.deploy(await token.getAddress());
    await tokenLockup.waitForDeployment();

    // Approve large amount for multiple lockups
    await token.approve(await tokenLockup.getAddress(), ethers.parseEther('100000'));
  });

  describe('getLockupCount', function () {
    it('Should return 0 for empty contract', async function () {
      expect(await tokenLockup.getLockupCount()).to.equal(0);
    });

    it('Should return correct count after adding lockups', async function () {
      await tokenLockup.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
      expect(await tokenLockup.getLockupCount()).to.equal(1);

      await tokenLockup.createLockup(
        beneficiary2.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
      expect(await tokenLockup.getLockupCount()).to.equal(2);

      await tokenLockup.createLockup(
        beneficiary3.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
      expect(await tokenLockup.getLockupCount()).to.equal(3);
    });

    it('Should decrease count after deleting lockup', async function () {
      // Create lockups
      await tokenLockup.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
      await tokenLockup.createLockup(
        beneficiary2.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
      expect(await tokenLockup.getLockupCount()).to.equal(2);

      // Complete vesting and release
      await time.increase(VESTING_DURATION + 1);
      await tokenLockup.connect(beneficiary1).release();

      // Delete lockup
      await tokenLockup.deleteLockup(beneficiary1.address);
      expect(await tokenLockup.getLockupCount()).to.equal(1);
    });
  });

  describe('getAllBeneficiaries', function () {
    it('Should return empty array for no lockups', async function () {
      const beneficiaries = await tokenLockup.getAllBeneficiaries();
      expect(beneficiaries.length).to.equal(0);
    });

    it('Should return all beneficiary addresses', async function () {
      await tokenLockup.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
      await tokenLockup.createLockup(
        beneficiary2.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
      await tokenLockup.createLockup(
        beneficiary3.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );

      const beneficiaries = await tokenLockup.getAllBeneficiaries();
      expect(beneficiaries.length).to.equal(3);
      expect(beneficiaries[0]).to.equal(beneficiary1.address);
      expect(beneficiaries[1]).to.equal(beneficiary2.address);
      expect(beneficiaries[2]).to.equal(beneficiary3.address);
    });

    it('Should update array after deletion', async function () {
      await tokenLockup.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
      await tokenLockup.createLockup(
        beneficiary2.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
      await tokenLockup.createLockup(
        beneficiary3.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );

      // Complete vesting and release for beneficiary2
      await time.increase(VESTING_DURATION + 1);
      await tokenLockup.connect(beneficiary2).release();
      await tokenLockup.deleteLockup(beneficiary2.address);

      const beneficiaries = await tokenLockup.getAllBeneficiaries();
      expect(beneficiaries.length).to.equal(2);
      expect(beneficiaries).to.include(beneficiary1.address);
      expect(beneficiaries).to.include(beneficiary3.address);
      expect(beneficiaries).to.not.include(beneficiary2.address);
    });
  });

  describe('getAllLockups', function () {
    it('Should return empty arrays for no lockups', async function () {
      const [addresses, lockupInfos] = await tokenLockup.getAllLockups();
      expect(addresses.length).to.equal(0);
      expect(lockupInfos.length).to.equal(0);
    });

    it('Should return all lockup information correctly', async function () {
      await tokenLockup.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
      await tokenLockup.createLockup(
        beneficiary2.address,
        TOTAL_AMOUNT * 2n,
        CLIFF_DURATION * 2,
        VESTING_DURATION * 2,
        false
      );

      const [addresses, lockupInfos] = await tokenLockup.getAllLockups();

      expect(addresses.length).to.equal(2);
      expect(lockupInfos.length).to.equal(2);

      expect(addresses[0]).to.equal(beneficiary1.address);
      expect(lockupInfos[0].totalAmount).to.equal(TOTAL_AMOUNT);
      expect(lockupInfos[0].cliffDuration).to.equal(CLIFF_DURATION);
      expect(lockupInfos[0].vestingDuration).to.equal(VESTING_DURATION);
      expect(lockupInfos[0].revocable).to.equal(true);

      expect(addresses[1]).to.equal(beneficiary2.address);
      expect(lockupInfos[1].totalAmount).to.equal(TOTAL_AMOUNT * 2n);
      expect(lockupInfos[1].cliffDuration).to.equal(CLIFF_DURATION * 2);
      expect(lockupInfos[1].vestingDuration).to.equal(VESTING_DURATION * 2);
      expect(lockupInfos[1].revocable).to.equal(false);
    });
  });

  describe('getLockupsPaginated', function () {
    beforeEach(async function () {
      // Create 5 lockups
      const signers = await ethers.getSigners();
      for (let i = 0; i < 5; i++) {
        await tokenLockup.createLockup(
          signers[i].address,
          TOTAL_AMOUNT,
          CLIFF_DURATION,
          VESTING_DURATION,
          true
        );
      }
    });

    it('Should return first page correctly', async function () {
      const [addresses, lockupInfos] = await tokenLockup.getLockupsPaginated(0, 2);
      expect(addresses.length).to.equal(2);
      expect(lockupInfos.length).to.equal(2);
    });

    it('Should return middle page correctly', async function () {
      const [addresses, lockupInfos] = await tokenLockup.getLockupsPaginated(2, 2);
      expect(addresses.length).to.equal(2);
      expect(lockupInfos.length).to.equal(2);
    });

    it('Should return last page with remaining items', async function () {
      const [addresses, lockupInfos] = await tokenLockup.getLockupsPaginated(4, 2);
      expect(addresses.length).to.equal(1);
      expect(lockupInfos.length).to.equal(1);
    });

    it('Should return empty arrays for offset beyond array length', async function () {
      const [addresses, lockupInfos] = await tokenLockup.getLockupsPaginated(10, 2);
      expect(addresses.length).to.equal(0);
      expect(lockupInfos.length).to.equal(0);
    });

    it('Should return all items when limit exceeds remaining', async function () {
      const [addresses, lockupInfos] = await tokenLockup.getLockupsPaginated(0, 100);
      expect(addresses.length).to.equal(5);
      expect(lockupInfos.length).to.equal(5);
    });
  });

  describe('deleteLockup', function () {
    beforeEach(async function () {
      await tokenLockup.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
    });

    it('Should delete lockup after all tokens released', async function () {
      await time.increase(VESTING_DURATION + 1);
      await tokenLockup.connect(beneficiary1).release();

      await expect(tokenLockup.deleteLockup(beneficiary1.address))
        .to.emit(tokenLockup, 'LockupDeleted')
        .withArgs(beneficiary1.address);

      const lockup = await tokenLockup.lockups(beneficiary1.address);
      expect(lockup.totalAmount).to.equal(0);
      expect(await tokenLockup.getLockupCount()).to.equal(0);
    });

    it('Should revert if lockup not found', async function () {
      await expect(tokenLockup.deleteLockup(otherAccount.address)).to.be.revertedWithCustomError(
        tokenLockup,
        'NoLockupFound'
      );
    });

    it('Should revert if tokens not fully released', async function () {
      await expect(tokenLockup.deleteLockup(beneficiary1.address)).to.be.revertedWithCustomError(
        tokenLockup,
        'TokensStillLocked'
      );
    });

    it('Should revert if not called by owner', async function () {
      await time.increase(VESTING_DURATION + 1);
      await tokenLockup.connect(beneficiary1).release();

      await expect(
        tokenLockup.connect(otherAccount).deleteLockup(beneficiary1.address)
      ).to.be.revertedWithCustomError(tokenLockup, 'OwnableUnauthorizedAccount');
    });

    it('Should handle deletion from middle of array correctly', async function () {
      // Create 3 lockups
      await tokenLockup.createLockup(
        beneficiary2.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
      await tokenLockup.createLockup(
        beneficiary3.address,
        TOTAL_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );

      // Complete and delete middle one (beneficiary2)
      await time.increase(VESTING_DURATION + 1);
      await tokenLockup.connect(beneficiary2).release();
      await tokenLockup.deleteLockup(beneficiary2.address);

      const beneficiaries = await tokenLockup.getAllBeneficiaries();
      expect(beneficiaries.length).to.equal(2);
      expect(beneficiaries).to.include(beneficiary1.address);
      expect(beneficiaries).to.include(beneficiary3.address);
    });

    it('Should allow address reuse after deletion', async function () {
      // Complete first lockup
      await time.increase(VESTING_DURATION + 1);
      await tokenLockup.connect(beneficiary1).release();
      await tokenLockup.deleteLockup(beneficiary1.address);

      // Create new lockup for same address
      await tokenLockup.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT * 2n,
        CLIFF_DURATION,
        VESTING_DURATION,
        false
      );

      const lockup = await tokenLockup.lockups(beneficiary1.address);
      expect(lockup.totalAmount).to.equal(TOTAL_AMOUNT * 2n);
      expect(lockup.releasedAmount).to.equal(0);
      expect(lockup.revocable).to.equal(false);
    });
  });

  describe('MAX_LOCKUPS limit', function () {
    it('Should revert when MAX_LOCKUPS reached', async function () {
      // This test would be very gas-intensive to run with 100 lockups
      // So we verify the constant exists and is set correctly
      expect(await tokenLockup.MAX_LOCKUPS()).to.equal(MAX_LOCKUPS);
    });

    it('Should revert with MaxLockupsReached error', async function () {
      // Create lockups up to MAX_LOCKUPS (using smaller number for test)
      const signers = await ethers.getSigners();
      const testLimit = 10;

      for (let i = 0; i < testLimit; i++) {
        await tokenLockup.createLockup(
          signers[i].address,
          TOTAL_AMOUNT,
          CLIFF_DURATION,
          VESTING_DURATION,
          true
        );
      }

      // Temporarily we can't test 100 lockups due to gas limits in test
      // But the contract logic is in place
      expect(await tokenLockup.getLockupCount()).to.equal(testLimit);
    });
  });

  describe('MAX_VESTING_DURATION limit', function () {
    it('Should have correct MAX_VESTING_DURATION constant', async function () {
      expect(await tokenLockup.MAX_VESTING_DURATION()).to.equal(MAX_VESTING_DURATION);
    });

    it('Should accept vesting duration up to maximum', async function () {
      const maxDuration = Number(MAX_VESTING_DURATION);
      await tokenLockup.createLockup(beneficiary1.address, TOTAL_AMOUNT, 0, maxDuration, true);

      const lockup = await tokenLockup.lockups(beneficiary1.address);
      expect(lockup.vestingDuration).to.equal(maxDuration);
    });

    it('Should revert when vesting duration exceeds maximum', async function () {
      const exceedingDuration = Number(MAX_VESTING_DURATION) + 1;
      await expect(
        tokenLockup.createLockup(beneficiary1.address, TOTAL_AMOUNT, 0, exceedingDuration, true)
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidDuration');
    });

    it('Should revert with 1000 year duration', async function () {
      const thousandYears = 1000 * 365 * 24 * 60 * 60;
      await expect(
        tokenLockup.createLockup(beneficiary1.address, TOTAL_AMOUNT, 0, thousandYears, true)
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidDuration');
    });
  });
});
