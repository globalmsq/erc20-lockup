import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { TokenLockup, MockERC20 } from '../../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

/**
 * Integration Test: Edge Cases and Boundary Conditions
 * Tests extreme values, zero amounts, and unusual configurations
 */
describe('Integration: Edge Cases and Boundary Conditions', function () {
  let tokenLockup: TokenLockup;
  let token: MockERC20;
  let beneficiary: SignerWithAddress;
  let initialSnapshot: string;

  const MONTH = 1; // 1 second = 1 month
  const TOTAL_AMOUNT = ethers.parseEther('100000');

  before(async function () {
    // Take initial snapshot before any tests run
    initialSnapshot = await ethers.provider.send('evm_snapshot', []);
  });

  beforeEach(async function () {
    // Revert to initial state before each test
    await ethers.provider.send('evm_revert', [initialSnapshot]);
    // Take new snapshot for next test
    initialSnapshot = await ethers.provider.send('evm_snapshot', []);

    const [_owner, _beneficiary] = await ethers.getSigners();
    beneficiary = _beneficiary;

    // Deploy contracts
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    token = await MockERC20Factory.deploy('TEST Token', 'TEST', ethers.parseEther('1000000'));
    await token.waitForDeployment();

    const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
    tokenLockup = await TokenLockupFactory.deploy(await token.getAddress());
    await tokenLockup.waitForDeployment();

    await token.approve(await tokenLockup.getAddress(), ethers.parseEther('1000000'));
  });

  describe('Minimum and Maximum Values', function () {
    it('Should handle minimum lockup amount (1 wei)', async function () {
      const minAmount = 1n;

      await tokenLockup.createLockup(beneficiary.address, minAmount, 0, 100 * MONTH, false);

      console.log('📋 Minimum lockup:');
      console.log(`  Amount: ${minAmount} wei`);

      await time.increase(100 * MONTH);
      const vested = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vested).to.equal(minAmount);

      await tokenLockup.connect(beneficiary).release();
      expect(await token.balanceOf(beneficiary.address)).to.equal(minAmount);

      console.log('  ✅ 1 wei lockup works correctly');
    });

    it('Should handle very large lockup amount', async function () {
      const largeAmount = ethers.parseEther('1000000'); // 1M tokens

      await tokenLockup.createLockup(beneficiary.address, largeAmount, 0, 100 * MONTH, false);

      console.log('📋 Large lockup:');
      console.log(`  Amount: ${ethers.formatEther(largeAmount)} tokens`);

      await time.increase(50 * MONTH);
      const vested = await tokenLockup.vestedAmount(beneficiary.address);
      const expected = largeAmount / 2n;

      expect(vested).to.be.closeTo(expected, ethers.parseEther('2000'));
      console.log(`  ✅ 50% vested: ${ethers.formatEther(vested)} tokens`);
    });

    it('Should handle very short vesting period (1 second)', async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 1, false);

      console.log('📋 Instant vesting (1 second):');

      await time.increase(1);
      const vested = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vested).to.equal(TOTAL_AMOUNT);

      await tokenLockup.connect(beneficiary).release();
      expect(await token.balanceOf(beneficiary.address)).to.equal(TOTAL_AMOUNT);

      console.log('  ✅ All tokens vested immediately');
    });

    it('Should handle very long vesting period (10 years = 120 months)', async function () {
      const longVesting = 120 * MONTH;

      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, longVesting, false);

      console.log('📋 Long vesting (120 months):');

      // Test at 25% (30 months)
      await time.increase(30 * MONTH);
      const vested25 = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vested25).to.be.closeTo((TOTAL_AMOUNT * 25n) / 100n, ethers.parseEther('2000'));

      console.log(`  ✅ 25% vested after 30 months: ${ethers.formatEther(vested25)} tokens`);
    });
  });

  describe('Cliff Edge Cases', function () {
    it('Should handle cliff equal to vesting duration', async function () {
      const duration = 100 * MONTH;

      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, duration, duration, false);

      console.log('📋 Cliff = Vesting duration:');

      // Nothing vests before cliff
      await time.increase(99 * MONTH);
      expect(await tokenLockup.vestedAmount(beneficiary.address)).to.equal(0);
      console.log('  ✅ 0% vested at 99% of cliff');

      // Everything vests at cliff
      await time.increase(MONTH);
      expect(await tokenLockup.vestedAmount(beneficiary.address)).to.equal(TOTAL_AMOUNT);
      console.log('  ✅ 100% vested at cliff end');
    });

    it('Should handle no cliff (cliff = 0)', async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, false);

      console.log('📋 No cliff period:');

      // Tokens should vest immediately
      await time.increase(1);
      const vested = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vested).to.be.gt(0);
      console.log(
        `  ✅ Tokens vest immediately: ${ethers.formatEther(vested)} tokens after 1 second`
      );
    });

    it('Should handle cliff at 99% of vesting period', async function () {
      const vesting = 100 * MONTH;
      const cliff = 99 * MONTH;

      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, cliff, vesting, false);

      console.log('📋 Cliff at 99% of vesting:');

      // Nothing vests before cliff
      await time.increase(98 * MONTH);
      expect(await tokenLockup.vestedAmount(beneficiary.address)).to.equal(0);

      // At cliff, 99% should be vested
      await time.increase(MONTH);
      const vestedAtCliff = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vestedAtCliff).to.be.closeTo((TOTAL_AMOUNT * 99n) / 100n, ethers.parseEther('2000'));
      console.log(`  ✅ 99% vested at cliff: ${ethers.formatEther(vestedAtCliff)} tokens`);

      // At end, 100% should be vested
      await time.increase(MONTH);
      expect(await tokenLockup.vestedAmount(beneficiary.address)).to.equal(TOTAL_AMOUNT);
      console.log('  ✅ 100% vested at end');
    });
  });

  describe('Invalid Operations', function () {
    it('Should reject zero amount', async function () {
      await expect(
        tokenLockup.createLockup(beneficiary.address, 0, 0, 100 * MONTH, false)
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidAmount');

      console.log('✅ Zero amount rejected');
    });

    it('Should reject zero vesting duration', async function () {
      await expect(
        tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 0, false)
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidDuration');

      console.log('✅ Zero vesting duration rejected');
    });

    it('Should reject cliff greater than vesting duration', async function () {
      await expect(
        tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 100 * MONTH, 50 * MONTH, false)
      ).to.be.revertedWithCustomError(tokenLockup, 'InvalidDuration');

      console.log('✅ Cliff > vesting duration rejected');
    });

    it('Should reject duplicate lockup for same beneficiary', async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, false);

      await expect(
        tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, false)
      ).to.be.revertedWithCustomError(tokenLockup, 'LockupAlreadyExists');

      console.log('✅ Duplicate lockup rejected');
    });

    it('Should reject release when no tokens available', async function () {
      await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        10 * MONTH,
        100 * MONTH,
        false
      );

      // Before cliff - no tokens available
      await expect(tokenLockup.connect(beneficiary).release()).to.be.revertedWithCustomError(
        tokenLockup,
        'NoTokensAvailable'
      );

      console.log('✅ Release before cliff rejected');

      // After release - no more tokens
      await time.increase(100 * MONTH);
      await tokenLockup.connect(beneficiary).release();

      await expect(tokenLockup.connect(beneficiary).release()).to.be.revertedWithCustomError(
        tokenLockup,
        'NoTokensAvailable'
      );

      console.log('✅ Double release rejected');
    });
  });

  describe('Time Precision Edge Cases', function () {
    it('Should handle fractional month calculations correctly', async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, false);

      console.log('📋 Fractional month testing:');

      // Test at 33.33% (33 seconds + 1/3 second)
      await time.increase(33 * MONTH);
      const vested33 = await tokenLockup.vestedAmount(beneficiary.address);
      const expected33 = (TOTAL_AMOUNT * 33n) / 100n;
      expect(vested33).to.be.closeTo(expected33, ethers.parseEther('2000'));
      console.log(`  33%: ${ethers.formatEther(vested33)} tokens`);

      // Test at 66.66% (66 seconds + 2/3 second)
      await time.increase(33 * MONTH);
      const vested66 = await tokenLockup.vestedAmount(beneficiary.address);
      const expected66 = (TOTAL_AMOUNT * 66n) / 100n;
      expect(vested66).to.be.closeTo(expected66, ethers.parseEther('2000'));
      console.log(`  66%: ${ethers.formatEther(vested66)} tokens`);

      console.log('  ✅ Fractional calculations work correctly');
    });

    it('Should handle vesting end boundary precisely', async function () {
      const vesting = 100 * MONTH;
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, vesting, false);

      console.log('📋 Vesting end boundary:');

      // Just before vesting end
      await time.increase(vesting - 1);
      const vestedBefore = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vestedBefore).to.be.lt(TOTAL_AMOUNT);
      console.log(`  Before end: ${ethers.formatEther(vestedBefore)} tokens`);

      // Exactly at vesting end
      await time.increase(1);
      const vestedAtEnd = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vestedAtEnd).to.equal(TOTAL_AMOUNT);
      console.log(`  At end: ${ethers.formatEther(vestedAtEnd)} tokens`);

      // After vesting end
      await time.increase(10 * MONTH);
      const vestedAfter = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vestedAfter).to.equal(TOTAL_AMOUNT);
      console.log('  ✅ Capped at 100% after vesting end');
    });
  });

  describe('State Consistency', function () {
    it('Should maintain consistent state across multiple queries', async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, false);

      await time.increase(50 * MONTH);

      // Query multiple times
      const vested1 = await tokenLockup.vestedAmount(beneficiary.address);
      const vested2 = await tokenLockup.vestedAmount(beneficiary.address);
      const vested3 = await tokenLockup.vestedAmount(beneficiary.address);

      expect(vested1).to.equal(vested2);
      expect(vested2).to.equal(vested3);

      console.log('✅ Consistent vested amounts across queries');
    });

    it('Should maintain correct accounting after partial releases', async function () {
      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, false);

      console.log('📋 Accounting verification:');

      // Release at 25%
      await time.increase(25 * MONTH);
      await tokenLockup.connect(beneficiary).release();
      const released25 = await token.balanceOf(beneficiary.address);

      // Release at 50%
      await time.increase(25 * MONTH);
      await tokenLockup.connect(beneficiary).release();
      const released50 = await token.balanceOf(beneficiary.address);

      // Release at 100%
      await time.increase(50 * MONTH);
      await tokenLockup.connect(beneficiary).release();
      const released100 = await token.balanceOf(beneficiary.address);

      // Verify total
      expect(released100).to.equal(TOTAL_AMOUNT);

      const lockup = await tokenLockup.lockups(beneficiary.address);
      expect(lockup.releasedAmount).to.equal(TOTAL_AMOUNT);

      console.log(`  25%: ${ethers.formatEther(released25)} tokens`);
      console.log(`  50%: ${ethers.formatEther(released50)} tokens`);
      console.log(`  100%: ${ethers.formatEther(released100)} tokens`);
      console.log('  ✅ Accounting consistent across releases');
    });
  });
});
