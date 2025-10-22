import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying contracts with account:', deployer.address);
  console.log('Account balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Get token address from environment or deploy mock for testing
  let tokenAddress = process.env.TOKEN_ADDRESS;

  if (!tokenAddress) {
    console.log('\nNo TOKEN_ADDRESS found, deploying MockERC20 for testing...');
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const mockToken = await MockERC20.deploy(
      'Test Token',
      'TEST',
      ethers.parseEther('1000000')
    );
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

  // Save deployment info
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    tokenAddress: tokenAddress,
    tokenLockupAddress: lockupAddress,
    timestamp: new Date().toISOString(),
  };

  console.log('\n=== Deployment Summary ===');
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log('\n✅ Deployment completed successfully!');

  // Verification instructions
  if (process.env.POLYGONSCAN_API_KEY) {
    console.log('\n=== Verification Command ===');
    console.log(`npx hardhat verify --network ${deploymentInfo.network} ${lockupAddress} ${tokenAddress}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
