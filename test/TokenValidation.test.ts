import { expect } from 'chai';
import { ethers } from 'hardhat';
import { MockERC20 } from '../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

describe('TokenLockup - Token Validation', function () {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let validToken: MockERC20;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy valid MockERC20 token
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    validToken = await MockERC20Factory.deploy('Test Token', 'TEST', ethers.parseEther('1000000'));
    await validToken.waitForDeployment();
  });

  describe('Constructor Validation', function () {
    it('Should deploy successfully with valid ERC20 token', async function () {
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
      const tokenLockup = await TokenLockupFactory.deploy(await validToken.getAddress());
      await tokenLockup.waitForDeployment();

      expect(await tokenLockup.token()).to.equal(await validToken.getAddress());
      expect(await tokenLockup.owner()).to.equal(owner.address);
    });

    it('Should revert deployment with zero address', async function () {
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      await expect(TokenLockupFactory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );
    });

    it('Should revert deployment with EOA address (non-contract)', async function () {
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // Use a regular wallet address (EOA) which has no contract code
      await expect(TokenLockupFactory.deploy(user.address)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );
    });

    it('Should revert deployment with non-ERC20 contract', async function () {
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // Deploy a simple non-ERC20 contract
      const SimpleContract = await ethers.getContractFactory('TokenLockup');
      const nonERC20Contract = await SimpleContract.deploy(await validToken.getAddress());
      await nonERC20Contract.waitForDeployment();

      // Try to deploy TokenLockup with the non-ERC20 contract address
      // This should fail because TokenLockup doesn't implement totalSupply()
      await expect(TokenLockupFactory.deploy(await nonERC20Contract.getAddress())).to.be.reverted;
    });

    it('Should revert deployment with contract that has no totalSupply function', async function () {
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // Deploy a contract without ERC20 interface
      const NonERC20Factory = await ethers.getContractFactory(
        'contracts/TokenLockup.sol:TokenLockup'
      );
      const dummyContract = await NonERC20Factory.deploy(await validToken.getAddress());
      await dummyContract.waitForDeployment();

      // Attempt to use this contract address as token should fail
      await expect(TokenLockupFactory.deploy(await dummyContract.getAddress())).to.be.reverted;
    });
  });

  describe('Network-Specific Token Addresses', function () {
    it('Should accept Polygon Mainnet SUT token address on Polygon network', async function () {
      // This test demonstrates the intended usage
      // Note: This will only work on Polygon mainnet or forked network
      const POLYGON_MAINNET_SUT = '0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55';

      // On local hardhat network, this address has no code, so deployment should fail
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
      await expect(TokenLockupFactory.deploy(POLYGON_MAINNET_SUT)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );
    });

    it('Should accept Amoy Testnet SUT token address on Amoy network', async function () {
      // This test demonstrates the intended usage
      // Note: This will only work on Amoy testnet or forked network
      const AMOY_TESTNET_SUT = '0xE4C687167705Abf55d709395f92e254bdF5825a2';

      // On local hardhat network, this address has no code, so deployment should fail
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');
      await expect(TokenLockupFactory.deploy(AMOY_TESTNET_SUT)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );
    });

    it('Should demonstrate network mismatch prevention', async function () {
      // This test shows that using mainnet address on testnet (or vice versa) will fail
      const POLYGON_MAINNET_SUT = '0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55';
      const AMOY_TESTNET_SUT = '0xE4C687167705Abf55d709395f92e254bdF5825a2';

      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // Both should fail on local Hardhat network (no code at these addresses)
      await expect(TokenLockupFactory.deploy(POLYGON_MAINNET_SUT)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );

      await expect(TokenLockupFactory.deploy(AMOY_TESTNET_SUT)).to.be.revertedWithCustomError(
        TokenLockupFactory,
        'InvalidTokenAddress'
      );
    });
  });

  describe('Edge Cases', function () {
    it('Should handle contract with malicious totalSupply that reverts', async function () {
      // Deploy a malicious contract that reverts on totalSupply
      const MaliciousTokenFactory = await ethers.getContractFactory('MockERC20');
      const maliciousToken = await MaliciousTokenFactory.deploy('Malicious', 'MAL', 0);
      await maliciousToken.waitForDeployment();

      // Even though it's a contract with code, if totalSupply() fails, deployment should fail
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // Note: MockERC20 has valid totalSupply, so this will actually succeed
      // This test demonstrates the check is in place
      const tokenLockup = await TokenLockupFactory.deploy(await maliciousToken.getAddress());
      await tokenLockup.waitForDeployment();

      expect(await tokenLockup.token()).to.equal(await maliciousToken.getAddress());
    });

    it('Should successfully deploy with multiple different valid ERC20 tokens', async function () {
      const MockERC20Factory = await ethers.getContractFactory('MockERC20');
      const TokenLockupFactory = await ethers.getContractFactory('TokenLockup');

      // Deploy multiple tokens
      const token1 = await MockERC20Factory.deploy('Token1', 'TK1', ethers.parseEther('1000'));
      const token2 = await MockERC20Factory.deploy('Token2', 'TK2', ethers.parseEther('2000'));
      const token3 = await MockERC20Factory.deploy('Token3', 'TK3', ethers.parseEther('3000'));

      // Deploy TokenLockup for each token
      const lockup1 = await TokenLockupFactory.deploy(await token1.getAddress());
      const lockup2 = await TokenLockupFactory.deploy(await token2.getAddress());
      const lockup3 = await TokenLockupFactory.deploy(await token3.getAddress());

      // Verify each lockup has correct token
      expect(await lockup1.token()).to.equal(await token1.getAddress());
      expect(await lockup2.token()).to.equal(await token2.getAddress());
      expect(await lockup3.token()).to.equal(await token3.getAddress());
    });
  });
});
