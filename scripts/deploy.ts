import { ethers } from 'hardhat';

/**
 * Validates that the token is compatible with TokenLockup contract.
 * Performs automated checks to detect incompatible token types (ERC-777).
 *
 * @param tokenAddress - Address of the ERC20 token to validate
 * @param ethers - Ethers instance for contract interactions
 * @throws Error if token is incompatible (ERC-777, etc.)
 */
async function validateTokenCompatibility(
  tokenAddress: string,
  ethers: typeof import('hardhat').ethers
): Promise<void> {
  console.log('  Checking for ERC-777 interface...');

  // ERC-777 Detection: Try calling granularity() function
  // Standard ERC-20 tokens don't have this function
  try {
    const tokenContract = await ethers.getContractAt(
      [
        'function granularity() view returns (uint256)',
        'function totalSupply() view returns (uint256)',
      ],
      tokenAddress
    );

    // If this succeeds, it's likely ERC-777
    const granularity = await tokenContract.granularity();

    throw new Error(
      '\n❌ ERROR: ERC-777 token detected!\n\n' +
        `This token implements ERC-777 interface (granularity: ${granularity}).\n` +
        'ERC-777 tokens have hooks (tokensReceived/tokensToSend) which are\n' +
        'incompatible with TokenLockup contract due to reentrancy risks.\n\n' +
        'Please use a standard ERC-20 token instead.\n'
    );
  } catch (error: unknown) {
    // If granularity() call fails, it's likely a standard ERC-20 (good)
    if (error instanceof Error && error.message.includes('ERC-777 token detected')) {
      throw error; // Re-throw our custom error
    }
    // Expected error for ERC-20 tokens (function doesn't exist)
    console.log('    ✅ Not an ERC-777 token');
  }

  // Check ERC1820 Registry for ERC777Token interface
  console.log('  Checking ERC1820 Registry...');
  try {
    const ERC1820_REGISTRY = '0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24';
    const ERC777_INTERFACE_HASH = ethers.keccak256(ethers.toUtf8Bytes('ERC777Token'));

    const registryContract = await ethers.getContractAt(
      [
        'function getInterfaceImplementer(address addr, bytes32 interfaceHash) view returns (address)',
      ],
      ERC1820_REGISTRY
    );

    const implementer = await registryContract.getInterfaceImplementer(
      tokenAddress,
      ERC777_INTERFACE_HASH
    );

    if (implementer !== ethers.ZeroAddress) {
      throw new Error(
        '\n❌ ERROR: ERC-777 token detected via ERC1820 Registry!\n\n' +
          `Token ${tokenAddress} is registered as ERC777Token implementer.\n` +
          'ERC-777 tokens are incompatible with TokenLockup contract due to reentrancy risks.\n\n' +
          'Please use a standard ERC-20 token instead.\n'
      );
    }
    console.log('    ✅ No ERC-777 registration found');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('ERC-777 token detected')) {
      throw error; // Re-throw our custom error
    }
    // If registry doesn't exist on this network, that's fine
    console.log('    ℹ️  ERC1820 Registry not available on this network (skipped)');
  }

  console.log('  ✅ Token compatibility check passed');
}

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with account:', deployer.address);
  console.log(
    'Account balance:',
    ethers.formatEther(await ethers.provider.getBalance(deployer.address))
  );

  // Get token address from environment (REQUIRED for production deployment)
  const tokenAddress = process.env.TOKEN_ADDRESS;

  if (!tokenAddress) {
    throw new Error(
      'TOKEN_ADDRESS environment variable is required for production deployment.\n' +
        'For Polygon Mainnet: 0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55\n' +
        'For Amoy Testnet: 0xE4C687167705Abf55d709395f92e254bdF5825a2\n' +
        'For testing with MockERC20, use scripts/deploy-test.ts instead.'
    );
  }

  console.log('\nUsing TEST Token at:', tokenAddress);

  // Get network info for validation
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;

  // ============================================================================
  // TOKEN COMPATIBILITY VALIDATION
  // ============================================================================
  console.log('\n🔍 Validating token compatibility...');

  // Automated ERC-777 detection (BLOCKING)
  await validateTokenCompatibility(tokenAddress, ethers);

  console.log('✅ Token validation passed!\n');
  // ============================================================================

  // Deploy TokenLockup
  console.log('Deploying TokenLockup...');
  const TokenLockup = await ethers.getContractFactory('TokenLockup');
  const tokenLockup = await TokenLockup.deploy(tokenAddress);
  await tokenLockup.waitForDeployment();

  const lockupAddress = await tokenLockup.getAddress();
  console.log('TokenLockup deployed to:', lockupAddress);

  // Post-deployment validation
  console.log('\n🔍 Validating deployment...');
  const verifiedToken = await tokenLockup.token();
  const verifiedOwner = await tokenLockup.owner();
  const isPaused = await tokenLockup.paused();

  console.log('Token Address (from contract):', verifiedToken);
  console.log('Owner:', verifiedOwner);
  console.log('Paused:', isPaused);

  // Validation checks
  const checks = {
    tokenAddressMatch: verifiedToken.toLowerCase() === tokenAddress.toLowerCase(),
    ownerIsDeployer: verifiedOwner.toLowerCase() === deployer.address.toLowerCase(),
    notPaused: !isPaused,
  };

  console.log('\n✓ Validation Results:');
  console.log('  Token address correct:', checks.tokenAddressMatch ? '✅' : '❌');
  console.log('  Owner set correctly:', checks.ownerIsDeployer ? '✅' : '❌');
  console.log('  Contract not paused:', checks.notPaused ? '✅' : '❌');

  if (!checks.tokenAddressMatch || !checks.ownerIsDeployer || !checks.notPaused) {
    throw new Error('Deployment validation failed!');
  }

  // Network-specific validation
  if (chainId === 137n || chainId === 80002n) {
    const expectedTokens: { [key: string]: string } = {
      '137': '0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55', // Polygon Mainnet TEST
      '80002': '0xE4C687167705Abf55d709395f92e254bdF5825a2', // Amoy Testnet TEST
    };

    const expectedToken = expectedTokens[chainId.toString()];
    if (
      expectedToken &&
      tokenAddress.toLowerCase() !== expectedToken.toLowerCase() &&
      process.env.TOKEN_ADDRESS
    ) {
      console.log('\n⚠️  Warning: Token address does not match expected TEST token address');
      console.log('  Expected:', expectedToken);
      console.log('  Actual:', tokenAddress);
    }
  }

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: chainId.toString(),
    deployer: deployer.address,
    tokenAddress: tokenAddress,
    tokenLockupAddress: lockupAddress,
    owner: verifiedOwner,
    paused: isPaused,
    timestamp: new Date().toISOString(),
  };

  console.log('\n=== Deployment Summary ===');
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log('\n✅ Deployment completed and validated successfully!');

  // Verification instructions
  if (process.env.ETHERSCAN_API_KEY) {
    console.log('\n=== Verification Command ===');
    console.log(
      `npx hardhat verify --network ${deploymentInfo.network} ${lockupAddress} ${tokenAddress}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
