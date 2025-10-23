import { run } from 'hardhat';

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const tokenAddress = process.env.TOKEN_ADDRESS;

  if (!contractAddress) {
    throw new Error('Please set CONTRACT_ADDRESS environment variable');
  }

  if (!tokenAddress) {
    throw new Error('Please set TOKEN_ADDRESS environment variable');
  }

  console.log('Verifying TokenLockup contract...');
  console.log('Contract address:', contractAddress);
  console.log('Token address:', tokenAddress);

  try {
    await run('verify:verify', {
      address: contractAddress,
      constructorArguments: [tokenAddress],
    });
    console.log('✅ Contract verified successfully!');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.toLowerCase().includes('already verified')) {
      console.log('✅ Contract already verified!');
    } else {
      console.error('❌ Verification failed:', error);
      throw error;
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
