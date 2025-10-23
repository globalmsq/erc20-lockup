import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { TokenLockup, MockERC20 } from '../../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

/**
 * Integration Test: Full Vesting Lifecycle
 * Tests complete vesting cycle from creation to 100% release
 */
describe('Integration: Full Vesting Lifecycle', function () {
  let tokenLockup: TokenLockup;
  let token: MockERC20;
  let beneficiary: SignerWithAddress;
  let initialSnapshot: string;

  // Using accelerated time: 1 second = 1 month
  const MONTH = 1; // 1 second = 1 month for accelerated testing
  const TOTAL_MONTHS = 100; // 100 months total vesting
  const CLIFF_MONTHS = 0; // No cliff for this test
  const TOTAL_AMOUNT = ethers.parseEther('100000'); // 100k tokens
  const FIXED_TIME_OFFSET = 10000; // Offset from current time for consistent testing

  before(async function () {
    // Take initial snapshot before any tests run
    initialSnapshot = await ethers.provider.send('evm_snapshot', []);
  });

  beforeEach(async function () {
    // Revert to initial state before each test
    await ethers.provider.send('evm_revert', [initialSnapshot]);
    // Take new snapshot for next test
    initialSnapshot = await ethers.provider.send('evm_snapshot', []);

    // Set timestamp to current + fixed offset for consistency
    const baseTime = await time.latest();
    await time.setNextBlockTimestamp(baseTime + FIXED_TIME_OFFSET);

    const [_owner, _beneficiary] = await ethers.getSigners();
    beneficiary = _beneficiary;

    // Deploy contracts
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    token = await MockERC20Factory.deploy('SUT Token', 'SUT', ethers.parseEther('1000000'));
    await token.waitForDeployment();

    const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
    tokenLockup = await TokenLockupFactory.deploy(await token.getAddress());
    await tokenLockup.waitForDeployment();

    // Approve tokens (owner is first signer, contract deployer)
    await token.approve(await tokenLockup.getAddress(), TOTAL_AMOUNT);
  });

  describe('Complete Vesting Cycle', function () {
    it('Should complete full vesting lifecycle from 0% to 100%', async function () {
      // Create lockup
      await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        CLIFF_MONTHS * MONTH,
        TOTAL_MONTHS * MONTH,
        true
      );

      console.log('✅ Lockup created');
      console.log(`  Total Amount: ${ethers.formatEther(TOTAL_AMOUNT)} tokens`);
      console.log(`  Vesting Duration: ${TOTAL_MONTHS} months (${TOTAL_MONTHS} seconds)`);

      // Verify initial state
      expect(await tokenLockup.vestedAmount(beneficiary.address)).to.equal(0);
      expect(await tokenLockup.releasableAmount(beneficiary.address)).to.equal(0);

      // Test at 25% vested (25 months)
      await time.increase(25 * MONTH);
      const vested25 = await tokenLockup.vestedAmount(beneficiary.address);
      const expected25 = (TOTAL_AMOUNT * 25n) / 100n;
      expect(vested25).to.be.closeTo(expected25, ethers.parseEther('2000')); // 1% tolerance for timing

      console.log(`\n📊 25% Vested (25 months):`);
      console.log(`  Expected: ${ethers.formatEther(expected25)} tokens`);
      console.log(`  Actual: ${ethers.formatEther(vested25)} tokens`);

      // Release 25%
      await tokenLockup.connect(beneficiary).release();
      expect(await token.balanceOf(beneficiary.address)).to.be.closeTo(
        expected25,
        ethers.parseEther('2000')
      );

      // Test at 50% vested (25 more months)
      await time.increase(25 * MONTH);
      const vested50 = await tokenLockup.vestedAmount(beneficiary.address);
      const expected50 = (TOTAL_AMOUNT * 50n) / 100n;
      expect(vested50).to.be.closeTo(expected50, ethers.parseEther('2000'));

      console.log(`\n📊 50% Vested (50 months):`);
      console.log(`  Expected: ${ethers.formatEther(expected50)} tokens`);
      console.log(`  Actual: ${ethers.formatEther(vested50)} tokens`);

      // Release another 25%
      await tokenLockup.connect(beneficiary).release();

      // Test at 75% vested (25 more months)
      await time.increase(25 * MONTH);
      const vested75 = await tokenLockup.vestedAmount(beneficiary.address);
      const expected75 = (TOTAL_AMOUNT * 75n) / 100n;
      expect(vested75).to.be.closeTo(expected75, ethers.parseEther('2000'));

      console.log(`\n📊 75% Vested (75 months):`);
      console.log(`  Expected: ${ethers.formatEther(expected75)} tokens`);
      console.log(`  Actual: ${ethers.formatEther(vested75)} tokens`);

      // Release another 25%
      await tokenLockup.connect(beneficiary).release();

      // Test at 100% vested (25 more months)
      await time.increase(25 * MONTH);
      const vested100 = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vested100).to.equal(TOTAL_AMOUNT);

      console.log(`\n📊 100% Vested (100 months):`);
      console.log(`  Expected: ${ethers.formatEther(TOTAL_AMOUNT)} tokens`);
      console.log(`  Actual: ${ethers.formatEther(vested100)} tokens`);

      // Final release
      await tokenLockup.connect(beneficiary).release();

      // Verify final state
      const finalBalance = await token.balanceOf(beneficiary.address);
      expect(finalBalance).to.equal(TOTAL_AMOUNT);

      const lockup = await tokenLockup.lockups(beneficiary.address);
      expect(lockup.releasedAmount).to.equal(TOTAL_AMOUNT);

      console.log(`\n✅ Full lifecycle completed successfully`);
      console.log(`  Final beneficiary balance: ${ethers.formatEther(finalBalance)} tokens`);
    });

    it('Should handle over-vesting period correctly', async function () {
      // Create lockup
      await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        CLIFF_MONTHS * MONTH,
        TOTAL_MONTHS * MONTH,
        false
      );

      // Advance beyond vesting period (150 months)
      await time.increase(150 * MONTH);

      // Should cap at 100%
      const vestedAmount = await tokenLockup.vestedAmount(beneficiary.address);
      expect(vestedAmount).to.equal(TOTAL_AMOUNT);

      // Release all
      await tokenLockup.connect(beneficiary).release();

      // Verify no more tokens are releasable
      expect(await tokenLockup.releasableAmount(beneficiary.address)).to.equal(0);

      // Attempting to release again should fail
      await expect(tokenLockup.connect(beneficiary).release()).to.be.revertedWithCustomError(
        tokenLockup,
        'NoTokensAvailable'
      );
    });

    it('Should emit correct events throughout lifecycle', async function () {
      // Create lockup event
      await expect(
        tokenLockup.createLockup(
          beneficiary.address,
          TOTAL_AMOUNT,
          CLIFF_MONTHS * MONTH,
          TOTAL_MONTHS * MONTH,
          true
        )
      ).to.emit(tokenLockup, 'TokensLocked');

      // Release events at different stages
      await time.increase(25 * MONTH);

      // Get releasable amount and release in same transaction context
      const tx = await tokenLockup.connect(beneficiary).release();
      await expect(tx).to.emit(tokenLockup, 'TokensReleased');

      await time.increase(75 * MONTH);
      await expect(tokenLockup.connect(beneficiary).release()).to.emit(
        tokenLockup,
        'TokensReleased'
      );
    });
  });
});
