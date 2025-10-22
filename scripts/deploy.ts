import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with account:', deployer.address);
  console.log(
    'Account balance:',
    ethers.formatEther(await ethers.provider.getBalance(deployer.address))
  );

  // Get token address from environment or deploy mock for testing
  let tokenAddress = process.env.TOKEN_ADDRESS;

  if (!tokenAddress) {
    console.log('\nNo TOKEN_ADDRESS found, deploying MockERC20 for testing...');
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const mockToken = await MockERC20.deploy('Test Token', 'TEST', ethers.parseEther('1000000'));
    await mockToken.waitForDeployment();
    tokenAddress = await mockToken.getAddress();
    console.log('MockERC20 deployed to:', tokenAddress);
  }

  // Deploy TokenLockup
  console.log('\nDeploying TokenLockup...');
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
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;

  if (chainId === 137n || chainId === 80002n) {
    const expectedTokens: { [key: string]: string } = {
      '137': '0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55', // Polygon Mainnet SUT
      '80002': '0xE4C687167705Abf55d709395f92e254bdF5825a2', // Amoy Testnet SUT
    };

    const expectedToken = expectedTokens[chainId.toString()];
    if (
      expectedToken &&
      tokenAddress.toLowerCase() !== expectedToken.toLowerCase() &&
      process.env.TOKEN_ADDRESS
    ) {
      console.log('\n⚠️  Warning: Token address does not match expected SUT token address');
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
  if (process.env.POLYGONSCAN_API_KEY) {
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
