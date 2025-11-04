import { expect } from 'chai';
import { ethers } from 'hardhat';
import { MockERC20 } from '../../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

/**
 * Integration Test: Deployment Validation
 * Tests constructor token address validation and network mismatch prevention
 */
describe('Integration: Deployment Validation', function () {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let validToken: MockERC20;
  let initialSnapshot: string;

  before(async function () {
    // Take initial snapshot before any tests run
    initialSnapshot = await ethers.provider.send('evm_snapshot', []);
  });

  beforeEach(async function () {
    // Revert to initial state before each test
    await ethers.provider.send('evm_revert', [initialSnapshot]);
    // Take new snapshot for next test
    initialSnapshot = await ethers.provider.send('evm_snapshot', []);

    [owner, user] = await ethers.getSigners();

    // Deploy valid MockERC20 token
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    validToken = await MockERC20Factory.deploy('Test Token', 'TEST', ethers.parseEther('1000000'));
    await validToken.waitForDeployment();
  });

  describe('Invalid Token Address Detection', function () {
    it('Should reject zero address during deployment', async function () {
      console.log('📋 Test: Zero address rejection');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      await expect(TokenLockupFactory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );

      console.log('  ✅ Zero address correctly rejected with InvalidTokenAddress');
    });

    it('Should reject EOA address during deployment', async function () {
      console.log('📋 Test: EOA address rejection');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // Use regular wallet address (EOA) which has no contract code
      await expect(TokenLockupFactory.deploy(user.address)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );

      console.log('  ✅ EOA address correctly rejected with InvalidTokenAddress');
    });

    it('Should reject non-existent contract address during deployment', async function () {
      console.log('📋 Test: Non-existent address rejection');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // Use an address that looks like a contract but has no code
      const fakeAddress = '0x1234567890123456789012345678901234567890';

      await expect(TokenLockupFactory.deploy(fakeAddress)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );

      console.log('  ✅ Non-existent address correctly rejected with InvalidTokenAddress');
    });

    it('Should reject non-ERC20 contract during deployment', async function () {
      console.log('📋 Test: Non-ERC20 contract rejection');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // Deploy a simple non-ERC20 contract (use TokenLockup itself as non-ERC20 example)
      const nonERC20Contract = await TokenLockupFactory.deploy(await validToken.getAddress());
      await nonERC20Contract.waitForDeployment();

      // Try to deploy TokenLockup with the non-ERC20 contract address
      // This should fail because TokenLockup doesn't implement totalSupply()
      await expect(TokenLockupFactory.deploy(await nonERC20Contract.getAddress())).to.be.reverted;

      console.log('  ✅ Non-ERC20 contract correctly rejected');
    });

    it('Should accept valid ERC20 token during deployment', async function () {
      console.log('📋 Test: Valid ERC20 acceptance');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      const tokenLockup = await TokenLockupFactory.deploy(await validToken.getAddress());
      await tokenLockup.waitForDeployment();

      expect(await tokenLockup.token()).to.equal(await validToken.getAddress());
      expect(await tokenLockup.owner()).to.equal(owner.address);

      console.log('  ✅ Valid ERC20 token accepted');
      console.log(`    Token address: ${await validToken.getAddress()}`);
      console.log(`    TokenLockup address: ${await tokenLockup.getAddress()}`);
    });
  });

  describe('Network Mismatch Prevention', function () {
    it('Should reject Polygon Mainnet SUT token address on local network', async function () {
      console.log('📋 Test: Mainnet token on testnet rejection');

      // Polygon Mainnet SUT token address
      const POLYGON_MAINNET_SUT = '0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55';

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // On local hardhat network, this address has no code, so deployment should fail
      await expect(TokenLockupFactory.deploy(POLYGON_MAINNET_SUT)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );

      console.log('  ✅ Mainnet address correctly rejected on local network');
      console.log(`    Address: ${POLYGON_MAINNET_SUT}`);
      console.log('    Reason: No contract code at address on local network');
    });

    it('Should reject Amoy Testnet SUT token address on local network', async function () {
      console.log('📋 Test: Amoy token on local network rejection');

      // Amoy Testnet SUT token address
      const AMOY_TESTNET_SUT = '0xE4C687167705Abf55d709395f92e254bdF5825a2';

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // On local hardhat network, this address has no code, so deployment should fail
      await expect(TokenLockupFactory.deploy(AMOY_TESTNET_SUT)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );

      console.log('  ✅ Amoy address correctly rejected on local network');
      console.log(`    Address: ${AMOY_TESTNET_SUT}`);
      console.log('    Reason: No contract code at address on local network');
    });
  });

  describe('Real-world Deployment Scenarios', function () {
    it('Should demonstrate correct deployment workflow', async function () {
      console.log('📋 Test: Correct deployment workflow');

      // Step 1: Deploy token
      const MockERC20Factory = await ethers.getContractFactory('MockERC20');
      const sutToken = await MockERC20Factory.deploy(
        'SUT Token',
        'SUT',
        ethers.parseEther('1000000')
      );
      await sutToken.waitForDeployment();
      console.log(`  Step 1: SUT token deployed at ${await sutToken.getAddress()}`);

      // Step 2: Deploy TokenLockup with correct token address
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
      const tokenLockup = await TokenLockupFactory.deploy(await sutToken.getAddress());
      await tokenLockup.waitForDeployment();
      console.log(`  Step 2: TokenLockup deployed at ${await tokenLockup.getAddress()}`);

      // Step 3: Verify deployment
      expect(await tokenLockup.token()).to.equal(await sutToken.getAddress());
      expect(await tokenLockup.owner()).to.equal(owner.address);
      console.log('  Step 3: Deployment verified');

      // Step 4: Verify token interface works
      const tokenAddress = await tokenLockup.token();
      const tokenContract = await ethers.getContractAt('IERC20', tokenAddress);
      const totalSupply = await tokenContract.totalSupply();
      expect(totalSupply).to.equal(ethers.parseEther('1000000'));
      console.log(
        `  Step 4: Token interface verified (totalSupply: ${ethers.formatEther(totalSupply)})`
      );

      console.log('  ✅ Complete deployment workflow successful');
    });

    it('Should prevent common deployment mistakes', async function () {
      console.log('📋 Test: Common deployment mistake prevention');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // Mistake 1: Using owner address instead of token address
      console.log('  Mistake 1: Using owner address...');
      await expect(TokenLockupFactory.deploy(owner.address)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );
      console.log('    ✅ Prevented: InvalidTokenAddress');

      // Mistake 2: Using zero address
      console.log('  Mistake 2: Using zero address...');
      await expect(TokenLockupFactory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );
      console.log('    ✅ Prevented: InvalidTokenAddress');

      // Mistake 3: Using wrong network token address
      console.log('  Mistake 3: Using mainnet address on testnet...');
      await expect(
        TokenLockupFactory.deploy('0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55')
      ).to.be.revertedWithCustomError(TokenLockupFactory, 'InvalidTokenAddress');
      console.log('    ✅ Prevented: InvalidTokenAddress (no code at address)');

      console.log('  ✅ All common mistakes correctly prevented');
    });
  });

  describe('Gas Cost Impact', function () {
    it('Should measure deployment gas cost with validation', async function () {
      console.log('📋 Test: Deployment gas cost measurement');

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      const tx = await TokenLockupFactory.deploy(await validToken.getAddress());
      const receipt = await tx.deploymentTransaction()?.wait();

      if (receipt) {
        console.log(`  Gas used: ${receipt.gasUsed.toString()}`);
        console.log(`  Block number: ${receipt.blockNumber}`);
        console.log('  ✅ Deployment successful with validation');
      }
    });
  });
});
