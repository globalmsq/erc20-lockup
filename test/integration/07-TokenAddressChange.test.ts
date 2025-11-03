import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { TokenLockup, MockERC20 } from '../../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

/**
 * Integration Test: Token Address Change
 * Tests token migration scenarios with complete lifecycle
 */
describe('Integration: Token Address Change', function () {
  let tokenLockup: TokenLockup;
  let oldToken: MockERC20;
  let newToken: MockERC20;
  let _owner: SignerWithAddress;
  let beneficiary1: SignerWithAddress;
  let beneficiary2: SignerWithAddress;
  let otherAccount: SignerWithAddress;
  let initialSnapshot: string;

  // Using accelerated time: 1 second = 1 month
  const MONTH = 1; // 1 second = 1 month for accelerated testing
  const TOTAL_AMOUNT = ethers.parseEther('100000'); // 100k tokens
  const VESTING_DURATION = 100 * MONTH; // 100 months
  const FIXED_TIME_OFFSET = 10000;

  before(async function () {
    initialSnapshot = await ethers.provider.send('evm_snapshot', []);
  });

  beforeEach(async function () {
    await ethers.provider.send('evm_revert', [initialSnapshot]);
    initialSnapshot = await ethers.provider.send('evm_snapshot', []);

    const baseTime = await time.latest();
    await time.setNextBlockTimestamp(baseTime + FIXED_TIME_OFFSET);

    [_owner, beneficiary1, beneficiary2, otherAccount] = await ethers.getSigners();

    // Deploy old token
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    oldToken = await MockERC20Factory.deploy('Old Token', 'OLD', ethers.parseEther('1000000'));
    await oldToken.waitForDeployment();

    // Deploy new token
    newToken = await MockERC20Factory.deploy('New Token', 'NEW', ethers.parseEther('1000000'));
    await newToken.waitForDeployment();

    // Deploy TokenLockup with old token
    const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
    tokenLockup = await TokenLockupFactory.deploy(await oldToken.getAddress());
    await tokenLockup.waitForDeployment();
  });

  describe('Basic Token Change Flow', function () {
    it('Should successfully change token after all lockups are completed', async function () {
      console.log('\n📋 Testing basic token change flow:');
      console.log(`  Old Token: ${await oldToken.getAddress()}`);
      console.log(`  New Token: ${await newToken.getAddress()}`);

      // Create lockup with old token
      await oldToken.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      await tokenLockup.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT,
        0,
        VESTING_DURATION,
        false
      );

      console.log(
        `\n  ✅ Created lockup with old token: ${ethers.formatEther(TOTAL_AMOUNT)} tokens`
      );

      // Complete vesting
      await time.increase(VESTING_DURATION);

      // Release all tokens
      await tokenLockup.connect(beneficiary1).release();
      const balance = await oldToken.balanceOf(beneficiary1.address);
      expect(balance).to.equal(TOTAL_AMOUNT);

      console.log(`  ✅ Released all tokens: ${ethers.formatEther(balance)} tokens`);

      // Verify contract has zero balance
      const contractBalance = await oldToken.balanceOf(await tokenLockup.getAddress());
      expect(contractBalance).to.equal(0);

      console.log(`  ✅ Contract balance: ${ethers.formatEther(contractBalance)} tokens`);

      // Pause and change token
      await tokenLockup.pause();
      await tokenLockup.changeToken(await newToken.getAddress());
      await tokenLockup.unpause();

      console.log(`  ✅ Token changed successfully`);

      // Verify token changed
      expect(await tokenLockup.token()).to.equal(await newToken.getAddress());

      // Create new lockup with new token
      await newToken.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      await tokenLockup.createLockup(
        beneficiary2.address,
        TOTAL_AMOUNT,
        0,
        VESTING_DURATION,
        false
      );

      console.log(
        `  ✅ Created new lockup with new token: ${ethers.formatEther(TOTAL_AMOUNT)} tokens`
      );

      // Verify new lockup works
      await time.increase(VESTING_DURATION);
      await tokenLockup.connect(beneficiary2).release();
      const newBalance = await newToken.balanceOf(beneficiary2.address);
      expect(newBalance).to.equal(TOTAL_AMOUNT);

      console.log(`  ✅ Released from new lockup: ${ethers.formatEther(newBalance)} tokens`);
    });

    it('Should emit TokenChanged event with correct parameters', async function () {
      await tokenLockup.pause();

      await expect(tokenLockup.changeToken(await newToken.getAddress()))
        .to.emit(tokenLockup, 'TokenChanged')
        .withArgs(await oldToken.getAddress(), await newToken.getAddress());

      console.log('  ✅ TokenChanged event emitted correctly');
    });
  });

  describe('Failure Scenarios', function () {
    it('Should revert when trying to change token with active lockups', async function () {
      console.log('\n📋 Testing failure: active lockups');

      // Create lockup
      await oldToken.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      await tokenLockup.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT,
        0,
        VESTING_DURATION,
        false
      );

      console.log(`  ✅ Created active lockup`);

      // Try to change token - should fail
      await tokenLockup.pause();
      await expect(
        tokenLockup.changeToken(await newToken.getAddress())
      ).to.be.revertedWithCustomError(tokenLockup, 'TokensStillLocked');

      console.log(`  ✅ Correctly rejected: TokensStillLocked`);
    });

    it('Should revert when not paused', async function () {
      // Try to change without pausing
      await expect(
        tokenLockup.changeToken(await newToken.getAddress())
      ).to.be.revertedWithCustomError(tokenLockup, 'ExpectedPause');

      console.log('  ✅ Correctly rejected: ExpectedPause');
    });

    it('Should revert when called by non-owner', async function () {
      await tokenLockup.pause();

      await expect(
        tokenLockup.connect(otherAccount).changeToken(await newToken.getAddress())
      ).to.be.revertedWithCustomError(tokenLockup, 'OwnableUnauthorizedAccount');

      console.log('  ✅ Correctly rejected: OwnableUnauthorizedAccount');
    });

    it('Should revert when new token address is zero', async function () {
      await tokenLockup.pause();

      await expect(tokenLockup.changeToken(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        tokenLockup,
        'InvalidTokenAddress'
      );

      console.log('  ✅ Correctly rejected: InvalidTokenAddress (zero address)');
    });
  });

  describe('Complex Scenarios', function () {
    it('Should handle token change after mixed release and revoke', async function () {
      console.log('\n📋 Testing mixed release + revoke scenario:');

      // Create two lockups
      await oldToken.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT * 2n);
      await tokenLockup.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT,
        0,
        VESTING_DURATION,
        false
      );
      await tokenLockup.createLockup(beneficiary2.address, TOTAL_AMOUNT, 0, VESTING_DURATION, true);

      console.log('  ✅ Created 2 lockups');

      // Advance to 50%
      await time.increase(Math.floor(VESTING_DURATION * 0.5));

      // Beneficiary1 releases partial
      await tokenLockup.connect(beneficiary1).release();
      const partial = await oldToken.balanceOf(beneficiary1.address);
      console.log(`  ✅ Beneficiary1 released partial: ${ethers.formatEther(partial)} tokens`);

      // Revoke beneficiary2's lockup
      await tokenLockup.revoke(beneficiary2.address);
      console.log('  ✅ Revoked beneficiary2 lockup');

      // Complete beneficiary1's vesting and release
      await time.increase(Math.floor(VESTING_DURATION * 0.5));
      await tokenLockup.connect(beneficiary1).release();

      // Beneficiary2 claims vested portion
      await tokenLockup.connect(beneficiary2).release();

      console.log('  ✅ All tokens released/claimed');

      // Verify zero balance
      const balance = await oldToken.balanceOf(await tokenLockup.getAddress());
      expect(balance).to.equal(0);

      // Change token
      await tokenLockup.pause();
      await tokenLockup.changeToken(await newToken.getAddress());
      await tokenLockup.unpause();

      console.log('  ✅ Token changed successfully after mixed operations');
    });

    it('Should prevent creating lockup with old token after change', async function () {
      // Change token
      await tokenLockup.pause();
      await tokenLockup.changeToken(await newToken.getAddress());
      await tokenLockup.unpause();

      // Try to approve and create lockup with old token - transfer will succeed but different token
      await oldToken.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);

      // This should not work because contract expects newToken
      // The contract will try to transfer newToken from owner (which isn't approved)
      await expect(
        tokenLockup.createLockup(beneficiary1.address, TOTAL_AMOUNT, 0, VESTING_DURATION, false)
      ).to.be.reverted; // Will revert on transferFrom

      console.log('  ✅ Old token lockup creation prevented');
    });

    it('Should support multiple token migrations', async function () {
      console.log('\n📋 Testing multiple token migrations:');

      // Third token for second migration
      const MockERC20Factory = await ethers.getContractFactory('MockERC20');
      const thirdToken = await MockERC20Factory.deploy(
        'Third Token',
        'THIRD',
        ethers.parseEther('1000000')
      );

      // First migration: old → new
      await tokenLockup.pause();
      await tokenLockup.changeToken(await newToken.getAddress());
      await tokenLockup.unpause();

      console.log('  ✅ First migration: old → new');

      // Create lockup with new token and complete it
      await newToken.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      await tokenLockup.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT,
        0,
        VESTING_DURATION,
        false
      );
      await time.increase(VESTING_DURATION);
      await tokenLockup.connect(beneficiary1).release();

      // Second migration: new → third
      await tokenLockup.pause();
      await tokenLockup.changeToken(await thirdToken.getAddress());
      await tokenLockup.unpause();

      console.log('  ✅ Second migration: new → third');

      // Verify final token
      expect(await tokenLockup.token()).to.equal(await thirdToken.getAddress());

      console.log('  ✅ Multiple migrations completed successfully');
    });
  });

  describe('Gas Efficiency', function () {
    it('Should measure changeToken gas cost', async function () {
      await tokenLockup.pause();

      const tx = await tokenLockup.changeToken(await newToken.getAddress());
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed;

      console.log('\n📊 changeToken Gas Analysis:');
      console.log(`  Gas used: ${gasUsed.toLocaleString()}`);
      console.log(`  Expected: ~36,000 gas`);

      // Should be around 36K gas
      expect(gasUsed).to.be.lessThan(50000n);

      console.log('  ✅ Gas efficiency verified');
    });

    it('Should compare gas before and after token change', async function () {
      console.log('\n📊 Comparing createLockup gas before/after token change:');

      // Measure with old token
      await oldToken.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      const tx1 = await tokenLockup.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT,
        0,
        VESTING_DURATION,
        false
      );
      const receipt1 = await tx1.wait();
      const gasBefore = receipt1!.gasUsed;

      console.log(`  Old token createLockup: ${gasBefore.toLocaleString()} gas`);

      // Complete and release
      await time.increase(VESTING_DURATION);
      await tokenLockup.connect(beneficiary1).release();

      // Change token
      await tokenLockup.pause();
      await tokenLockup.changeToken(await newToken.getAddress());
      await tokenLockup.unpause();

      // Measure with new token
      await newToken.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
      const tx2 = await tokenLockup.createLockup(
        beneficiary2.address,
        TOTAL_AMOUNT,
        0,
        VESTING_DURATION,
        false
      );
      const receipt2 = await tx2.wait();
      const gasAfter = receipt2!.gasUsed;

      console.log(`  New token createLockup: ${gasAfter.toLocaleString()} gas`);

      // Gas should be similar (within 10%)
      const diff = gasBefore > gasAfter ? gasBefore - gasAfter : gasAfter - gasBefore;
      const percentDiff = (diff * 100n) / gasBefore;

      console.log(`  Difference: ${percentDiff}%`);
      console.log('  ✅ Gas costs remain consistent');

      expect(percentDiff).to.be.lessThan(10n);
    });
  });
});
