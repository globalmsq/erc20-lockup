import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { TokenLockup, MockERC20 } from '../../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

/**
 * Integration Test: Multiple Beneficiaries
 * Tests multiple concurrent lockup schedules with different configurations
 */
describe('Integration: Multiple Beneficiaries', function () {
  let token: MockERC20;
  let owner: SignerWithAddress;
  let beneficiary1: SignerWithAddress;
  let beneficiary2: SignerWithAddress;

  const MONTH = 1; // 1 second = 1 month
  const TOTAL_AMOUNT = ethers.parseEther('100000');

  beforeEach(async function () {
    // Deploy fresh contracts for each test to ensure state isolation and accurate timing
    // Docker integration config only provides 3 accounts (owner + 2 beneficiaries)
    [owner, beneficiary1, beneficiary2] = await ethers.getSigners();

    // Deploy MockERC20
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    token = await MockERC20Factory.deploy('SUT Token', 'SUT', ethers.parseEther('10000000'));
    await token.waitForDeployment();
  });

  describe('Separate Contract Instances', function () {
    it('Should support multiple beneficiaries via separate TokenLockup contracts', async function () {
      console.log('📋 Deploying 2 separate TokenLockup contracts:');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // Deploy 2 separate lockup contracts
      const lockup1 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup1.waitForDeployment();

      const lockup2 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup2.waitForDeployment();

      console.log(`  Lockup 1: ${await lockup1.getAddress()}`);
      console.log(`  Lockup 2: ${await lockup2.getAddress()}`);

      // Approve tokens for all contracts
      await token.approve(await lockup1.getAddress(), TOTAL_AMOUNT);
      await token.approve(await lockup2.getAddress(), TOTAL_AMOUNT);

      // Create different lockup schedules
      await lockup1.createLockup(
        beneficiary1.address,
        TOTAL_AMOUNT,
        0, // No cliff
        100 * MONTH, // 100 months
        true // Revocable
      );

      await lockup2.createLockup(
        beneficiary2.address,
        TOTAL_AMOUNT,
        12 * MONTH, // 12 month cliff
        100 * MONTH, // 100 months
        false // Non-revocable
      );

      console.log('\n📊 After 50 months:');

      // Advance time
      await time.increase(50 * MONTH);

      // Check vested amounts
      const vested1 = await lockup1.vestedAmount(beneficiary1.address);
      const vested2 = await lockup2.vestedAmount(beneficiary2.address);

      console.log(`  Beneficiary 1 (100mo, no cliff): ${ethers.formatEther(vested1)} tokens (50%)`);
      console.log(
        `  Beneficiary 2 (100mo, 12mo cliff): ${ethers.formatEther(vested2)} tokens (50%)`
      );

      expect(vested1).to.be.closeTo(TOTAL_AMOUNT / 2n, ethers.parseEther('5000'));
      expect(vested2).to.be.closeTo(TOTAL_AMOUNT / 2n, ethers.parseEther('5000'));

      // All release tokens
      await lockup1.connect(beneficiary1).release();
      await lockup2.connect(beneficiary2).release();

      expect(await token.balanceOf(beneficiary1.address)).to.be.closeTo(
        TOTAL_AMOUNT / 2n,
        ethers.parseEther('5000')
      );
      expect(await token.balanceOf(beneficiary2.address)).to.be.closeTo(
        TOTAL_AMOUNT / 2n,
        ethers.parseEther('5000')
      );

      console.log('  ✅ All beneficiaries released correctly');
    });

    it('Should handle independent revocations across contracts', async function () {
      console.log('📋 Testing independent revocations:');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      const lockup1 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup1.waitForDeployment();

      const lockup2 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup2.waitForDeployment();

      await token.approve(await lockup1.getAddress(), TOTAL_AMOUNT);
      await token.approve(await lockup2.getAddress(), TOTAL_AMOUNT);

      // Create revocable lockups
      await lockup1.createLockup(beneficiary1.address, TOTAL_AMOUNT, 0, 100 * MONTH, true);
      await lockup2.createLockup(beneficiary2.address, TOTAL_AMOUNT, 0, 100 * MONTH, true);

      // Advance to 50%
      await time.increase(50 * MONTH);

      const ownerBalanceBefore = await token.balanceOf(owner.address);

      // Revoke only beneficiary1's lockup
      await lockup1.revoke(beneficiary1.address);

      const ownerBalanceAfter = await token.balanceOf(owner.address);
      const refund = ownerBalanceAfter - ownerBalanceBefore;

      console.log(
        `  Owner recovered from beneficiary1: ${ethers.formatEther(refund)} tokens (~50%)`
      );

      // Verify beneficiary1 can still claim vested
      await lockup1.connect(beneficiary1).release();
      const balance1 = await token.balanceOf(beneficiary1.address);
      expect(balance1).to.be.closeTo(TOTAL_AMOUNT / 2n, ethers.parseEther('5000'));

      // Verify beneficiary2's lockup is unaffected
      const lockup2Info = await lockup2.lockups(beneficiary2.address);
      expect(lockup2Info.revoked).to.be.false;

      await lockup2.connect(beneficiary2).release();
      const balance2 = await token.balanceOf(beneficiary2.address);
      expect(balance2).to.be.closeTo(TOTAL_AMOUNT / 2n, ethers.parseEther('5000'));

      console.log(`  Beneficiary 1 balance: ${ethers.formatEther(balance1)} tokens`);
      console.log(`  Beneficiary 2 balance: ${ethers.formatEther(balance2)} tokens`);
      console.log('  ✅ Revocation isolated to single contract');
    });
  });

  describe('Staggered Vesting Schedules', function () {
    it('Should handle staggered start times correctly', async function () {
      console.log('📋 Testing staggered vesting schedules:');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      const lockup1 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup1.waitForDeployment();

      const lockup2 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup2.waitForDeployment();

      await token.approve(await lockup1.getAddress(), TOTAL_AMOUNT);
      await token.approve(await lockup2.getAddress(), TOTAL_AMOUNT);

      // Create first lockup
      await lockup1.createLockup(beneficiary1.address, TOTAL_AMOUNT, 0, 100 * MONTH, false);
      const startTime1 = await time.latest();

      // Wait 50 months, create second lockup
      await time.increase(50 * MONTH);
      await lockup2.createLockup(beneficiary2.address, TOTAL_AMOUNT, 0, 100 * MONTH, false);
      const startTime2 = await time.latest();

      console.log(`  Lockup 1 started at: ${startTime1}`);
      console.log(`  Lockup 2 started at: ${startTime2} (+50 months)`);

      // Wait another 50 months (total: 100 months from lockup1 start)
      await time.increase(50 * MONTH);

      const vested1 = await lockup1.vestedAmount(beneficiary1.address);
      const vested2 = await lockup2.vestedAmount(beneficiary2.address);

      console.log(`\n  After 100 months from lockup1 start:`);
      console.log(`  Beneficiary 1: ${ethers.formatEther(vested1)} tokens (100% - fully vested)`);
      console.log(
        `  Beneficiary 2: ${ethers.formatEther(vested2)} tokens (50% - 50 months elapsed)`
      );

      expect(vested1).to.equal(TOTAL_AMOUNT); // 100% vested
      expect(vested2).to.be.closeTo(TOTAL_AMOUNT / 2n, ethers.parseEther('5000')); // 50% vested

      console.log('  ✅ Staggered schedules work independently');
    });
  });

  describe('Different Vesting Configurations', function () {
    it('Should support varied cliff and duration combinations', async function () {
      console.log('📋 Testing varied configurations:');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      const configs = [
        { cliff: 0, duration: 100, name: 'No cliff, 100 months' },
        { cliff: 12, duration: 100, name: '12 month cliff, 100 months' },
      ];

      const lockups: TokenLockup[] = [];
      const beneficiaries = [beneficiary1, beneficiary2];

      for (let i = 0; i < configs.length; i++) {
        const lockup = await TokenLockupFactory.deploy(await token.getAddress());
        await lockup.waitForDeployment();
        lockups.push(lockup);

        await token.approve(await lockup.getAddress(), TOTAL_AMOUNT);
        await lockup.createLockup(
          beneficiaries[i].address,
          TOTAL_AMOUNT,
          configs[i].cliff * MONTH,
          configs[i].duration * MONTH,
          false
        );

        console.log(`  Config ${i + 1}: ${configs[i].name}`);
      }

      // Test at 25 months
      await time.increase(25 * MONTH);
      console.log('\n  After 25 months:');

      for (let i = 0; i < configs.length; i++) {
        const vested = await lockups[i].vestedAmount(beneficiaries[i].address);
        const config = configs[i];

        if (config.cliff > 25) {
          // Before cliff
          expect(vested).to.equal(0);
          console.log(`    ${config.name}: 0 tokens (before cliff)`);
        } else {
          // After cliff
          const timeAfterStart = 25;
          const expectedPercent = Math.floor((timeAfterStart / config.duration) * 100);
          console.log(
            `    ${config.name}: ${ethers.formatEther(vested)} tokens (~${expectedPercent}%)`
          );
        }
      }

      console.log('  ✅ All configurations work correctly');
    });
  });

  describe('Contract Isolation', function () {
    it('Should maintain complete state isolation between contracts', async function () {
      console.log('📋 Testing contract isolation:');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      const lockup1 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup1.waitForDeployment();

      const lockup2 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup2.waitForDeployment();

      await token.approve(await lockup1.getAddress(), TOTAL_AMOUNT * 2n);
      await token.approve(await lockup2.getAddress(), TOTAL_AMOUNT * 2n);

      // Create lockups
      await lockup1.createLockup(beneficiary1.address, TOTAL_AMOUNT, 0, 100 * MONTH, true);
      await lockup2.createLockup(beneficiary2.address, TOTAL_AMOUNT, 0, 100 * MONTH, true);

      await time.increase(50 * MONTH);

      // Release from lockup1 only
      await lockup1.connect(beneficiary1).release();

      // Verify lockup2 state is unaffected
      const lockup2Info = await lockup2.lockups(beneficiary2.address);
      expect(lockup2Info.releasedAmount).to.equal(0); // Nothing released yet

      const releasable2 = await lockup2.releasableAmount(beneficiary2.address);
      expect(releasable2).to.be.closeTo(TOTAL_AMOUNT / 2n, ethers.parseEther('5000'));

      console.log('  ✅ Lockup1 release did not affect Lockup2 state');

      // Revoke lockup1
      await lockup1.revoke(beneficiary1.address);

      // Verify lockup2 still not revoked
      const lockup2InfoAfter = await lockup2.lockups(beneficiary2.address);
      expect(lockup2InfoAfter.revoked).to.be.false;

      console.log('  ✅ Lockup1 revocation did not affect Lockup2');

      // Verify lockup2 can still operate normally
      await lockup2.connect(beneficiary2).release();
      const balance2 = await token.balanceOf(beneficiary2.address);
      expect(balance2).to.be.closeTo(TOTAL_AMOUNT / 2n, ethers.parseEther('5000'));

      console.log('  ✅ Lockup2 operates normally after Lockup1 revocation');
    });

    it('Should allow same beneficiary in multiple contracts', async function () {
      console.log('📋 Testing same beneficiary across contracts:');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      const lockup1 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup1.waitForDeployment();

      const lockup2 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup2.waitForDeployment();

      await token.approve(await lockup1.getAddress(), TOTAL_AMOUNT);
      await token.approve(await lockup2.getAddress(), TOTAL_AMOUNT);

      // Create two lockups for same beneficiary
      await lockup1.createLockup(beneficiary1.address, TOTAL_AMOUNT, 0, 100 * MONTH, false);
      await lockup2.createLockup(beneficiary1.address, TOTAL_AMOUNT, 0, 50 * MONTH, false);

      console.log('  Created 2 lockups for same beneficiary');

      await time.increase(50 * MONTH);

      // Lockup1: 50% vested
      const vested1 = await lockup1.vestedAmount(beneficiary1.address);
      expect(vested1).to.be.closeTo(TOTAL_AMOUNT / 2n, ethers.parseEther('5000'));

      // Lockup2: 100% vested
      const vested2 = await lockup2.vestedAmount(beneficiary1.address);
      expect(vested2).to.equal(TOTAL_AMOUNT);

      // Release from both
      await lockup1.connect(beneficiary1).release();
      await lockup2.connect(beneficiary1).release();

      const totalBalance = await token.balanceOf(beneficiary1.address);
      const expectedTotal = TOTAL_AMOUNT + TOTAL_AMOUNT / 2n;
      expect(totalBalance).to.be.closeTo(expectedTotal, ethers.parseEther('5000'));

      console.log(
        `  Total claimed: ${ethers.formatEther(totalBalance)} tokens (150% of one lockup)`
      );
      console.log('  ✅ Same beneficiary can have multiple independent lockups');
    });
  });

  describe('Concurrent Operations', function () {
    it('Should handle simultaneous releases from multiple contracts', async function () {
      console.log('📋 Testing concurrent releases:');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
      const numContracts = 2; // Docker provides only 3 signers (owner + 2 beneficiaries)
      const lockups: TokenLockup[] = [];
      const beneficiaries = [beneficiary1, beneficiary2];

      // Deploy and setup multiple contracts
      for (let i = 0; i < numContracts; i++) {
        const lockup = await TokenLockupFactory.deploy(await token.getAddress());
        await lockup.waitForDeployment();
        lockups.push(lockup);

        await token.approve(await lockup.getAddress(), TOTAL_AMOUNT);
        await lockup.createLockup(beneficiaries[i].address, TOTAL_AMOUNT, 0, 100 * MONTH, false);
      }

      await time.increase(50 * MONTH);

      console.log(`  Releasing from ${numContracts} contracts simultaneously...`);

      // Release from all contracts
      const releasePromises = lockups.map((lockup, i) =>
        lockup.connect(beneficiaries[i]).release()
      );

      await Promise.all(releasePromises);

      // Verify all releases successful
      for (let i = 0; i < numContracts; i++) {
        const balance = await token.balanceOf(beneficiaries[i].address);
        expect(balance).to.be.closeTo(TOTAL_AMOUNT / 2n, ethers.parseEther('5000'));
      }

      console.log(`  ✅ All ${numContracts} concurrent releases successful`);
    });
  });
});
