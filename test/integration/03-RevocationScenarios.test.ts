import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { TokenLockup, MockERC20 } from '../../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

/**
 * Integration Test: Revocation Scenarios
 * Tests lockup revocation at various vesting stages
 */
describe('Integration: Revocation Scenarios', function () {
  let tokenLockup: TokenLockup;
  let token: MockERC20;
  let owner: SignerWithAddress;
  let beneficiary: SignerWithAddress;

  const MONTH = 1; // 1 second = 1 month
  const TOTAL_MONTHS = 100;
  const CLIFF_MONTHS = 0;
  const TOTAL_AMOUNT = ethers.parseEther('100000');

  beforeEach(async function () {
    [owner, beneficiary] = await ethers.getSigners();

    // Deploy fresh contracts for each test to ensure complete state isolation
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    token = await MockERC20Factory.deploy('SUT Token', 'SUT', ethers.parseEther('1000000'));
    await token.waitForDeployment();

    const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
    tokenLockup = await TokenLockupFactory.deploy(await token.getAddress());
    await tokenLockup.waitForDeployment();

    await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);

    // Create revocable lockup for all tests
    await tokenLockup.createLockup(
      beneficiary.address,
      TOTAL_AMOUNT,
      CLIFF_MONTHS * MONTH,
      TOTAL_MONTHS * MONTH,
      true // revocable
    );
  });

  describe('Revocation at Different Vesting Stages', function () {
    it('Should revoke at 0% vested (immediately after creation)', async function () {
      console.log('📋 Revocation at 0% vested:');
      console.log(`  Total locked: ${ethers.formatEther(TOTAL_AMOUNT)} tokens`);

      const ownerBalanceBefore = await token.balanceOf(owner.address);

      // Revoke immediately (note: some time has passed during deployment transactions)
      await tokenLockup.revoke(beneficiary.address);

      // Owner should receive all unvested tokens back (with small tolerance for transaction timestamps)
      const ownerBalanceAfter = await token.balanceOf(owner.address);
      const refundedAmount = ownerBalanceAfter - ownerBalanceBefore;

      // Allow 2% tolerance for deployment transaction timestamps
      expect(refundedAmount).to.be.closeTo(TOTAL_AMOUNT, ethers.parseEther('2000'));

      // Lockup should be marked as revoked
      const lockup = await tokenLockup.lockups(beneficiary.address);
      expect(lockup.revoked).to.be.true;

      console.log(`  ✅ Owner recovered: ${ethers.formatEther(refundedAmount)} tokens`);
    });

    it('Should revoke at 25% vested', async function () {
      // Advance to 25% vested
      await time.increase(25 * MONTH);

      const vestedBefore = await tokenLockup.vestedAmount(beneficiary.address);
      const expected25Percent = (TOTAL_AMOUNT * 25n) / 100n;

      console.log('\n📋 Revocation at 25% vested:');
      console.log(`  Vested amount: ${ethers.formatEther(vestedBefore)} tokens`);
      console.log(`  Expected 25%: ${ethers.formatEther(expected25Percent)} tokens`);

      const ownerBalanceBefore = await token.balanceOf(owner.address);

      // Revoke
      await tokenLockup.revoke(beneficiary.address);

      // Owner should receive unvested tokens (75%)
      const ownerBalanceAfter = await token.balanceOf(owner.address);
      const refundAmount = ownerBalanceAfter - ownerBalanceBefore;
      const expectedRefund = TOTAL_AMOUNT - vestedBefore;

      expect(refundAmount).to.be.closeTo(expectedRefund, ethers.parseEther('2000'));

      console.log(`  ✅ Owner recovered: ${ethers.formatEther(refundAmount)} tokens (~75%)`);

      // Beneficiary should still be able to claim vested tokens
      await tokenLockup.connect(beneficiary).release();
      const beneficiaryBalance = await token.balanceOf(beneficiary.address);

      expect(beneficiaryBalance).to.be.closeTo(vestedBefore, ethers.parseEther('2000'));
      console.log(
        `  ✅ Beneficiary claimed: ${ethers.formatEther(beneficiaryBalance)} tokens (~25%)`
      );

      // Verify no more tokens can be claimed
      await expect(tokenLockup.connect(beneficiary).release()).to.be.revertedWithCustomError(
        tokenLockup,
        'NoTokensAvailable'
      );
    });

    it('Should revoke at 50% vested', async function () {
      // Advance to 50% vested
      await time.increase(50 * MONTH);

      const vestedBefore = await tokenLockup.vestedAmount(beneficiary.address);

      console.log('\n📋 Revocation at 50% vested:');
      console.log(`  Vested amount: ${ethers.formatEther(vestedBefore)} tokens`);

      const ownerBalanceBefore = await token.balanceOf(owner.address);

      // Revoke
      await tokenLockup.revoke(beneficiary.address);

      // Owner receives 50%
      const ownerBalanceAfter = await token.balanceOf(owner.address);
      const refundAmount = ownerBalanceAfter - ownerBalanceBefore;
      const expectedRefund = TOTAL_AMOUNT - vestedBefore;

      expect(refundAmount).to.be.closeTo(expectedRefund, ethers.parseEther('2000'));
      console.log(`  ✅ Owner recovered: ${ethers.formatEther(refundAmount)} tokens (~50%)`);

      // Beneficiary can claim 50%
      await tokenLockup.connect(beneficiary).release();
      const beneficiaryBalance = await token.balanceOf(beneficiary.address);
      expect(beneficiaryBalance).to.be.closeTo(vestedBefore, ethers.parseEther('2000'));
      console.log(
        `  ✅ Beneficiary claimed: ${ethers.formatEther(beneficiaryBalance)} tokens (~50%)`
      );
    });

    it('Should revoke at 75% vested', async function () {
      // Advance to 75% vested
      await time.increase(75 * MONTH);

      const vestedBefore = await tokenLockup.vestedAmount(beneficiary.address);

      console.log('\n📋 Revocation at 75% vested:');
      console.log(`  Vested amount: ${ethers.formatEther(vestedBefore)} tokens`);

      const ownerBalanceBefore = await token.balanceOf(owner.address);

      // Revoke
      await tokenLockup.revoke(beneficiary.address);

      // Owner receives 25%
      const ownerBalanceAfter = await token.balanceOf(owner.address);
      const refundAmount = ownerBalanceAfter - ownerBalanceBefore;

      expect(refundAmount).to.be.closeTo((TOTAL_AMOUNT * 25n) / 100n, ethers.parseEther('2000'));
      console.log(`  ✅ Owner recovered: ${ethers.formatEther(refundAmount)} tokens (~25%)`);

      // Beneficiary can claim 75%
      await tokenLockup.connect(beneficiary).release();
      const beneficiaryBalance = await token.balanceOf(beneficiary.address);
      expect(beneficiaryBalance).to.be.closeTo(vestedBefore, ethers.parseEther('2000'));
      console.log(
        `  ✅ Beneficiary claimed: ${ethers.formatEther(beneficiaryBalance)} tokens (~75%)`
      );
    });

    it('Should handle revocation when beneficiary has already claimed some tokens', async function () {
      // Advance to 30% and claim
      await time.increase(30 * MONTH);
      await tokenLockup.connect(beneficiary).release();
      const claimedAmount = await token.balanceOf(beneficiary.address);

      console.log('\n📋 Revocation after partial claim:');
      console.log(`  Already claimed: ${ethers.formatEther(claimedAmount)} tokens`);

      // Advance to 60% and revoke
      await time.increase(30 * MONTH);

      const vestedAtRevocation = await tokenLockup.vestedAmount(beneficiary.address);
      const lockupBeforeRevoke = await tokenLockup.lockups(beneficiary.address);

      console.log(`  Vested at revocation: ${ethers.formatEther(vestedAtRevocation)} tokens`);
      console.log(
        `  Already released: ${ethers.formatEther(lockupBeforeRevoke.releasedAmount)} tokens`
      );

      const ownerBalanceBefore = await token.balanceOf(owner.address);

      // Revoke
      await tokenLockup.revoke(beneficiary.address);

      const ownerBalanceAfter = await token.balanceOf(owner.address);
      const refundAmount = ownerBalanceAfter - ownerBalanceBefore;

      // Owner should receive unvested amount (40%)
      const expectedRefund = TOTAL_AMOUNT - vestedAtRevocation;
      expect(refundAmount).to.be.closeTo(expectedRefund, ethers.parseEther('2000'));

      console.log(`  ✅ Owner recovered: ${ethers.formatEther(refundAmount)} tokens (~40%)`);

      // Beneficiary can claim remaining vested tokens (30% more)
      await tokenLockup.connect(beneficiary).release();

      const finalBeneficiaryBalance = await token.balanceOf(beneficiary.address);
      expect(finalBeneficiaryBalance).to.be.closeTo(vestedAtRevocation, ethers.parseEther('2000'));

      console.log(
        `  ✅ Beneficiary total: ${ethers.formatEther(finalBeneficiaryBalance)} tokens (~60%)`
      );
    });
  });

  describe('Non-Revocable Lockups', function () {
    let nonRevocableTokenLockup: TokenLockup;
    let nonRevocableBeneficiary: SignerWithAddress;

    beforeEach(async function () {
      // Get a different beneficiary for non-revocable tests
      const signers = await ethers.getSigners();
      nonRevocableBeneficiary = signers[2]; // Use 3rd signer

      // Deploy new TokenLockup for non-revocable test
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
      nonRevocableTokenLockup = await TokenLockupFactory.deploy(await token.getAddress());
      await nonRevocableTokenLockup.waitForDeployment();

      await token.approve(await nonRevocableTokenLockup.getAddress(), TOTAL_AMOUNT);

      // Create NON-revocable lockup
      await nonRevocableTokenLockup.createLockup(
        nonRevocableBeneficiary.address,
        TOTAL_AMOUNT,
        CLIFF_MONTHS * MONTH,
        TOTAL_MONTHS * MONTH,
        false // NOT revocable
      );
    });

    it('Should not allow revocation of non-revocable lockup', async function () {
      await time.increase(50 * MONTH);

      // Attempt to revoke should fail
      await expect(
        nonRevocableTokenLockup.revoke(nonRevocableBeneficiary.address)
      ).to.be.revertedWithCustomError(nonRevocableTokenLockup, 'NotRevocable');

      console.log('✅ Non-revocable lockup cannot be revoked');
    });
  });

  describe('Revocation Edge Cases', function () {
    it('Should not allow double revocation', async function () {
      await time.increase(50 * MONTH);

      // First revocation
      await tokenLockup.revoke(beneficiary.address);

      // Second revocation should fail with AlreadyRevoked error
      await expect(tokenLockup.revoke(beneficiary.address)).to.be.revertedWithCustomError(
        tokenLockup,
        'AlreadyRevoked'
      );

      console.log('✅ Double revocation prevented');
    });

    it('Should calculate refund correctly at exact percentage boundaries', async function () {
      const testCases = [
        { percent: 10, months: 10 },
        { percent: 33, months: 33 },
        { percent: 50, months: 50 },
        { percent: 66, months: 66 },
        { percent: 90, months: 90 },
      ];

      for (const testCase of testCases) {
        // Fresh deployment for each test
        const MockERC20Factory = await ethers.getContractFactory('MockERC20');
        const freshToken = await MockERC20Factory.deploy(
          'SUT Token',
          'SUT',
          ethers.parseEther('10000000')
        );
        await freshToken.waitForDeployment();

        const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
        const freshLockup = await TokenLockupFactory.deploy(await freshToken.getAddress());
        await freshLockup.waitForDeployment();

        await freshToken.approve(await freshLockup.getAddress(), TOTAL_AMOUNT);

        await freshLockup.createLockup(
          beneficiary.address,
          TOTAL_AMOUNT,
          CLIFF_MONTHS * MONTH,
          TOTAL_MONTHS * MONTH,
          true
        );

        await time.increase(testCase.months * MONTH);

        const vestedAmount = await freshLockup.vestedAmount(beneficiary.address);

        const ownerBalanceBefore = await freshToken.balanceOf(owner.address);
        await freshLockup.revoke(beneficiary.address);
        const ownerBalanceAfter = await freshToken.balanceOf(owner.address);

        const refund = ownerBalanceAfter - ownerBalanceBefore;
        const expectedRefund = TOTAL_AMOUNT - vestedAmount;

        expect(refund).to.be.closeTo(expectedRefund, ethers.parseEther('2000'));

        console.log(
          `  ${testCase.percent}% vested: refund ${ethers.formatEther(refund)} tokens (~${100 - testCase.percent}%)`
        );
      }
    });
  });
});
