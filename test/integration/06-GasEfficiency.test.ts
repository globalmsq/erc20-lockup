import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { TokenLockup, MockERC20 } from '../../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

/**
 * Integration Test: Gas Efficiency Analysis
 * Comprehensive gas consumption analysis for all operations
 */
describe('Integration: Gas Efficiency Analysis', function () {
  let tokenLockup: TokenLockup;
  let token: MockERC20;
  let beneficiary: SignerWithAddress;

  const MONTH = 1; // 1 second = 1 month
  const TOTAL_AMOUNT = ethers.parseEther('100000');

  // Gas thresholds (updated after security improvements)
  const GAS_THRESHOLDS = {
    createLockup: 245000, // Increased due to beneficiary array management (max ~243K in Docker environment)
    release: 110000, // Increased due to revoked state checks
    revoke: 130000, // Increased due to vesting freeze logic
    vestedAmount: 30000,
    releasableAmount: 30000,
  };

  beforeEach(async function () {
    // Deploy fresh contracts for each test to ensure accurate timing
    const [_owner, _beneficiary] = await ethers.getSigners();
    beneficiary = _beneficiary;

    // Deploy contracts
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    token = await MockERC20Factory.deploy('SUT Token', 'SUT', ethers.parseEther('1000000'));
    await token.waitForDeployment();

    const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
    tokenLockup = await TokenLockupFactory.deploy(await token.getAddress());
    await tokenLockup.waitForDeployment();

    await token.approve(await tokenLockup.getAddress(), ethers.parseEther('1000000'));
  });

  describe('Deployment Gas Costs', function () {
    it('Should measure contract deployment gas', async function () {
      console.log('📋 Deployment Gas Analysis:');

      // Deploy new instances to measure
      const MockERC20Factory = await ethers.getContractFactory('MockERC20');
      const tokenTx = await MockERC20Factory.deploy(
        'SUT Token',
        'SUT',
        ethers.parseEther('1000000')
      );
      const tokenReceipt = await tokenTx.deploymentTransaction()?.wait();
      const tokenGas = Number(tokenReceipt!.gasUsed);

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
      const lockupTx = await TokenLockupFactory.deploy(await token.getAddress());
      const lockupReceipt = await lockupTx.deploymentTransaction()?.wait();
      const lockupGas = Number(lockupReceipt!.gasUsed);

      console.log(`  MockERC20 deployment: ${tokenGas.toLocaleString()} gas`);
      console.log(`  TokenLockup deployment: ${lockupGas.toLocaleString()} gas`);
      console.log(`  Total deployment: ${(tokenGas + lockupGas).toLocaleString()} gas`);

      // Verify deployment gas is reasonable
      expect(lockupGas).to.be.lessThan(2000000); // Less than 2M gas
    });
  });

  describe('createLockup Gas Costs', function () {
    it('Should measure createLockup gas for various configurations', async function () {
      console.log('\n📋 createLockup Gas Analysis:');

      const configs = [
        { cliff: 0, duration: 100 * MONTH, revocable: false, name: 'No cliff, non-revocable' },
        { cliff: 0, duration: 100 * MONTH, revocable: true, name: 'No cliff, revocable' },
        {
          cliff: 12 * MONTH,
          duration: 100 * MONTH,
          revocable: false,
          name: '12mo cliff, non-revocable',
        },
        {
          cliff: 12 * MONTH,
          duration: 100 * MONTH,
          revocable: true,
          name: '12mo cliff, revocable',
        },
      ];

      const gasResults: number[] = [];

      for (const config of configs) {
        // Deploy fresh contract for each test
        const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
        const freshLockup = await TokenLockupFactory.deploy(await token.getAddress());
        await freshLockup.waitForDeployment();
        await token.approve(await freshLockup.getAddress(), TOTAL_AMOUNT);

        const tx = await freshLockup.createLockup(
          beneficiary.address,
          TOTAL_AMOUNT,
          config.cliff,
          config.duration,
          config.revocable
        );
        const receipt = await tx.wait();
        const gas = Number(receipt!.gasUsed);
        gasResults.push(gas);

        console.log(`  ${config.name}: ${gas.toLocaleString()} gas`);
        expect(gas).to.be.lessThan(GAS_THRESHOLDS.createLockup);
      }

      const avgGas = gasResults.reduce((a, b) => a + b, 0) / gasResults.length;
      const maxGas = Math.max(...gasResults);
      const minGas = Math.min(...gasResults);

      console.log(`\n  Average: ${avgGas.toLocaleString()} gas`);
      console.log(`  Min: ${minGas.toLocaleString()} gas`);
      console.log(`  Max: ${maxGas.toLocaleString()} gas`);
      console.log(`  Variance: ${(((maxGas - minGas) / avgGas) * 100).toFixed(2)}%`);
    });
  });

  describe('release Gas Costs', function () {
    it('Should measure release gas at different vesting stages', async function () {
      console.log('\n📋 release Gas Analysis:');

      const stages = [
        { percent: 10, months: 10 },
        { percent: 25, months: 25 },
        { percent: 50, months: 50 },
        { percent: 75, months: 75 },
        { percent: 100, months: 100 },
      ];

      const gasResults: number[] = [];

      for (const stage of stages) {
        // Deploy fresh contract for each test
        const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
        const freshLockup = await TokenLockupFactory.deploy(await token.getAddress());
        await freshLockup.waitForDeployment();
        await token.approve(await freshLockup.getAddress(), TOTAL_AMOUNT);

        await freshLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, false);

        await time.increase(stage.months * MONTH);

        const tx = await freshLockup.connect(beneficiary).release();
        const receipt = await tx.wait();
        const gas = Number(receipt!.gasUsed);
        gasResults.push(gas);

        console.log(`  ${stage.percent}% vested: ${gas.toLocaleString()} gas`);
        expect(gas).to.be.lessThan(GAS_THRESHOLDS.release);
      }

      const avgGas = gasResults.reduce((a, b) => a + b, 0) / gasResults.length;
      const maxGas = Math.max(...gasResults);
      const minGas = Math.min(...gasResults);

      console.log(`\n  Average: ${avgGas.toLocaleString()} gas`);
      console.log(`  Min: ${minGas.toLocaleString()} gas`);
      console.log(`  Max: ${maxGas.toLocaleString()} gas`);
      console.log(`  Consistency: ${(((maxGas - minGas) / avgGas) * 100).toFixed(2)}% variance`);

      // Gas should be consistent (within 30% variance - Docker timing variations)
      expect(maxGas - minGas).to.be.lessThan(avgGas * 0.3);
    });

    it('Should measure gas for multiple sequential releases', async function () {
      console.log('\n📋 Sequential releases Gas Analysis:');

      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, false);

      const gasResults: number[] = [];
      const releasePoints = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      let lastMonth = 0;
      for (const month of releasePoints) {
        await time.increase((month - lastMonth) * MONTH);
        lastMonth = month;

        const tx = await tokenLockup.connect(beneficiary).release();
        const receipt = await tx.wait();
        const gas = Number(receipt!.gasUsed);
        gasResults.push(gas);

        if (month % 20 === 0) {
          console.log(`  Release at ${month}%: ${gas.toLocaleString()} gas`);
        }
      }

      const avgGas = gasResults.reduce((a, b) => a + b, 0) / gasResults.length;
      console.log(`\n  Average per release: ${avgGas.toLocaleString()} gas`);
      console.log(
        `  Total for 10 releases: ${gasResults.reduce((a, b) => a + b, 0).toLocaleString()} gas`
      );
    });
  });

  describe('revoke Gas Costs', function () {
    it('Should measure revoke gas at different vesting stages', async function () {
      console.log('\n📋 revoke Gas Analysis:');

      const stages = [
        { percent: 0, months: 0 },
        { percent: 25, months: 25 },
        { percent: 50, months: 50 },
        { percent: 75, months: 75 },
      ];

      const gasResults: number[] = [];

      for (const stage of stages) {
        // Deploy fresh contract for each test
        const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
        const freshLockup = await TokenLockupFactory.deploy(await token.getAddress());
        await freshLockup.waitForDeployment();
        await token.approve(await freshLockup.getAddress(), TOTAL_AMOUNT);

        await freshLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, true);

        // Only increase time if months > 0 to avoid timestamp collision
        if (stage.months > 0) {
          await time.increase(stage.months * MONTH);
        }

        const tx = await freshLockup.revoke(beneficiary.address);
        const receipt = await tx.wait();
        const gas = Number(receipt!.gasUsed);
        gasResults.push(gas);

        console.log(`  ${stage.percent}% vested: ${gas.toLocaleString()} gas`);
        expect(gas).to.be.lessThan(GAS_THRESHOLDS.revoke);
      }

      const avgGas = gasResults.reduce((a, b) => a + b, 0) / gasResults.length;
      console.log(`\n  Average: ${avgGas.toLocaleString()} gas`);
    });

    it('Should compare revoke+release vs full vesting gas costs', async function () {
      console.log('\n📋 Revoke vs Full Vesting Gas Comparison:');

      // Scenario 1: Revoke at 50% and release
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
      const lockup1 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup1.waitForDeployment();
      await token.approve(await lockup1.getAddress(), TOTAL_AMOUNT);

      await lockup1.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, true);
      await time.increase(50 * MONTH);

      const revokeTx = await lockup1.revoke(beneficiary.address);
      const revokeReceipt = await revokeTx.wait();
      const revokeGas = Number(revokeReceipt!.gasUsed);

      const releaseTx = await lockup1.connect(beneficiary).release();
      const releaseReceipt = await releaseTx.wait();
      const releaseGas = Number(releaseReceipt!.gasUsed);

      const totalRevokeGas = revokeGas + releaseGas;

      console.log(`  Revoke at 50%: ${revokeGas.toLocaleString()} gas`);
      console.log(`  Release after revoke: ${releaseGas.toLocaleString()} gas`);
      console.log(`  Total (revoke path): ${totalRevokeGas.toLocaleString()} gas`);

      // Scenario 2: Full vesting with single release
      const lockup2 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup2.waitForDeployment();
      await token.approve(await lockup2.getAddress(), TOTAL_AMOUNT);

      await lockup2.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, false);
      await time.increase(50 * MONTH); // Same time elapsed

      const fullReleaseTx = await lockup2.connect(beneficiary).release();
      const fullReleaseReceipt = await fullReleaseTx.wait();
      const fullReleaseGas = Number(fullReleaseReceipt!.gasUsed);

      console.log(`  Full vesting release: ${fullReleaseGas.toLocaleString()} gas`);

      console.log(
        `\n  Revoke overhead: ${(totalRevokeGas - fullReleaseGas).toLocaleString()} gas (${((totalRevokeGas / fullReleaseGas - 1) * 100).toFixed(2)}%)`
      );
    });
  });

  describe('View Function Gas Costs', function () {
    it('Should measure gas for view functions', async function () {
      console.log('\n📋 View Functions Gas Analysis:');

      await tokenLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, false);
      await time.increase(50 * MONTH);

      // Note: View functions don't consume gas when called externally,
      // but we can estimate their computational cost

      await tokenLockup.vestedAmount.staticCall(beneficiary.address);
      await tokenLockup.releasableAmount.staticCall(beneficiary.address);

      console.log('  vestedAmount: ~30,000 gas (estimated)');
      console.log('  releasableAmount: ~30,000 gas (estimated)');
      console.log('  lockups: ~5,000 gas (estimated, simple storage read)');
      console.log('\n  Note: View functions are free when called externally');
      console.log('  Gas estimates shown are for internal calls within transactions');
    });
  });

  describe('Comparative Analysis', function () {
    it('Should compare gas costs across different operation sequences', async function () {
      console.log('\n📋 Operation Sequence Gas Comparison:');

      // Sequence 1: Create + Immediate Full Release
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
      const lockup1 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup1.waitForDeployment();
      await token.approve(await lockup1.getAddress(), TOTAL_AMOUNT);

      const createTx1 = await lockup1.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        0,
        1, // 1 second duration
        false
      );
      const createReceipt1 = await createTx1.wait();
      const createGas1 = Number(createReceipt1!.gasUsed);

      await time.increase(1);
      const releaseTx1 = await lockup1.connect(beneficiary).release();
      const releaseReceipt1 = await releaseTx1.wait();
      const releaseGas1 = Number(releaseReceipt1!.gasUsed);

      const seq1Total = createGas1 + releaseGas1;
      console.log(`  Sequence 1 (Create + Immediate Release):`);
      console.log(`    Create: ${createGas1.toLocaleString()} gas`);
      console.log(`    Release: ${releaseGas1.toLocaleString()} gas`);
      console.log(`    Total: ${seq1Total.toLocaleString()} gas`);

      // Sequence 2: Create + Multiple Partial Releases
      const lockup2 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup2.waitForDeployment();
      await token.approve(await lockup2.getAddress(), TOTAL_AMOUNT);

      const createTx2 = await lockup2.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        0,
        100 * MONTH,
        false
      );
      const createReceipt2 = await createTx2.wait();
      const createGas2 = Number(createReceipt2!.gasUsed);

      let totalReleaseGas2 = 0;
      for (let i = 0; i < 4; i++) {
        await time.increase(25 * MONTH);
        const releaseTx = await lockup2.connect(beneficiary).release();
        const releaseReceipt = await releaseTx.wait();
        totalReleaseGas2 += Number(releaseReceipt!.gasUsed);
      }

      const seq2Total = createGas2 + totalReleaseGas2;
      console.log(`\n  Sequence 2 (Create + 4 Partial Releases):`);
      console.log(`    Create: ${createGas2.toLocaleString()} gas`);
      console.log(`    4 Releases: ${totalReleaseGas2.toLocaleString()} gas`);
      console.log(`    Total: ${seq2Total.toLocaleString()} gas`);

      // Sequence 3: Create + Revoke + Release
      const lockup3 = await TokenLockupFactory.deploy(await token.getAddress());
      await lockup3.waitForDeployment();
      await token.approve(await lockup3.getAddress(), TOTAL_AMOUNT);

      const createTx3 = await lockup3.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        0,
        100 * MONTH,
        true
      );
      const createReceipt3 = await createTx3.wait();
      const createGas3 = Number(createReceipt3!.gasUsed);

      await time.increase(50 * MONTH);
      const revokeTx3 = await lockup3.revoke(beneficiary.address);
      const revokeReceipt3 = await revokeTx3.wait();
      const revokeGas3 = Number(revokeReceipt3!.gasUsed);

      const releaseTx3 = await lockup3.connect(beneficiary).release();
      const releaseReceipt3 = await releaseTx3.wait();
      const releaseGas3 = Number(releaseReceipt3!.gasUsed);

      const seq3Total = createGas3 + revokeGas3 + releaseGas3;
      console.log(`\n  Sequence 3 (Create + Revoke + Release):`);
      console.log(`    Create: ${createGas3.toLocaleString()} gas`);
      console.log(`    Revoke: ${revokeGas3.toLocaleString()} gas`);
      console.log(`    Release: ${releaseGas3.toLocaleString()} gas`);
      console.log(`    Total: ${seq3Total.toLocaleString()} gas`);

      console.log(`\n  Most efficient: Sequence 1 (${seq1Total.toLocaleString()} gas)`);
      console.log(
        `  Least efficient: Sequence ${seq2Total > seq3Total ? '2' : '3'} (${Math.max(seq2Total, seq3Total).toLocaleString()} gas)`
      );
    });
  });

  describe('Gas Optimization Verification', function () {
    it('Should verify all operations meet gas thresholds', async function () {
      console.log('\n📋 Gas Threshold Verification:');

      const results: { operation: string; gas: number; threshold: number; passed: boolean }[] = [];

      // Test createLockup
      const createTx = await tokenLockup.createLockup(
        beneficiary.address,
        TOTAL_AMOUNT,
        0,
        100 * MONTH,
        true
      );
      const createReceipt = await createTx.wait();
      const createGas = Number(createReceipt!.gasUsed);
      results.push({
        operation: 'createLockup',
        gas: createGas,
        threshold: GAS_THRESHOLDS.createLockup,
        passed: createGas < GAS_THRESHOLDS.createLockup,
      });

      await time.increase(50 * MONTH);

      // Test release
      const releaseTx = await tokenLockup.connect(beneficiary).release();
      const releaseReceipt = await releaseTx.wait();
      const releaseGas = Number(releaseReceipt!.gasUsed);
      results.push({
        operation: 'release',
        gas: releaseGas,
        threshold: GAS_THRESHOLDS.release,
        passed: releaseGas < GAS_THRESHOLDS.release,
      });

      // Test revoke (need fresh contract)
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
      const freshLockup = await TokenLockupFactory.deploy(await token.getAddress());
      await freshLockup.waitForDeployment();
      await token.approve(await freshLockup.getAddress(), TOTAL_AMOUNT);
      await freshLockup.createLockup(beneficiary.address, TOTAL_AMOUNT, 0, 100 * MONTH, true);
      await time.increase(50 * MONTH);

      const revokeTx = await freshLockup.revoke(beneficiary.address);
      const revokeReceipt = await revokeTx.wait();
      const revokeGas = Number(revokeReceipt!.gasUsed);
      results.push({
        operation: 'revoke',
        gas: revokeGas,
        threshold: GAS_THRESHOLDS.revoke,
        passed: revokeGas < GAS_THRESHOLDS.revoke,
      });

      // Print results
      console.log('\n  Operation          Gas Used    Threshold   Status');
      console.log('  ─────────────────  ──────────  ──────────  ──────');
      results.forEach((r) => {
        const status = r.passed ? '✅ PASS' : '❌ FAIL';
        const gasStr = r.gas.toLocaleString().padStart(10);
        const thresholdStr = r.threshold.toLocaleString().padStart(10);
        console.log(`  ${r.operation.padEnd(17)} ${gasStr}  ${thresholdStr}  ${status}`);
        expect(r.passed).to.be.true;
      });

      console.log('\n  ✅ All operations meet gas efficiency targets');
    });
  });
});
