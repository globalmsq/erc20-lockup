import { ethers } from 'hardhat';

/**
 * Test deployment script for integration testing
 * Deploys MockERC20 + TokenLockup with deterministic addresses
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('🧪 Test Deployment Starting...');
  console.log('Deploying contracts with account:', deployer.address);
  console.log(
    'Account balance:',
    ethers.formatEther(await ethers.provider.getBalance(deployer.address))
  );

  // Deploy MockERC20 for testing
  console.log('\n📦 Deploying MockERC20...');
  const MockERC20 = await ethers.getContractFactory('MockERC20');
  const mockToken = await MockERC20.deploy(
    'TEST Token',
    'TEST',
    ethers.parseEther('1000000') // 1M tokens
  );
  await mockToken.waitForDeployment();
  const tokenAddress = await mockToken.getAddress();
  console.log('✅ MockERC20 deployed to:', tokenAddress);

  // Deploy TokenLockup
  console.log('\n🔒 Deploying TokenLockup...');
  const TokenLockup = await ethers.getContractFactory('TokenLockup');
  const tokenLockup = await TokenLockup.deploy(tokenAddress);
  await tokenLockup.waitForDeployment();
  const lockupAddress = await tokenLockup.getAddress();
  console.log('✅ TokenLockup deployed to:', lockupAddress);

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

  // Get network info
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: chainId.toString(),
    deployer: deployer.address,
    mockTokenAddress: tokenAddress,
    tokenLockupAddress: lockupAddress,
    owner: verifiedOwner,
    paused: isPaused,
    timestamp: new Date().toISOString(),
  };

  console.log('\n=== Test Deployment Summary ===');
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Export contract addresses as environment variables
  console.log('\n=== Environment Variables ===');
  console.log(`export MOCK_TOKEN_ADDRESS=${tokenAddress}`);
  console.log(`export TOKEN_LOCKUP_ADDRESS=${lockupAddress}`);

  console.log('\n✅ Test deployment completed and validated successfully!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
