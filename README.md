# SUT Token Lockup Contract

Smart contract for managing SUT token lockup with vesting schedules on Polygon.

## Features

- **Linear Vesting**: Tokens vest linearly over a specified duration
- **Cliff Period**: Optional cliff period before vesting begins
- **Revocable Lockups**: Owner can revoke lockups and reclaim unvested tokens
- **Gas Optimized**: Built with Solidity 0.8.24 and optimizations enabled
- **Secure**: Uses OpenZeppelin contracts and includes comprehensive tests

## Documentation

- **[PRD (Product Requirements Document)](docs/prd.md)** - SUT token lockup requirements and specifications
- **[Lockup Procedure](docs/lockup-procedure.md)** - Step-by-step guide for SUT token lockup process

## Project Structure

```
sut-lockup-contract/
├── contracts/           # Solidity contracts
│   ├── TokenLockup.sol # Main lockup contract
│   └── MockERC20.sol   # Mock token for testing
├── scripts/            # Deployment and utility scripts
│   ├── deploy.ts       # Main deployment script
│   ├── verify.ts       # Contract verification script
│   ├── check-lockup.ts # Check lockup status
│   ├── calculate-vested.ts # Calculate vesting timeline
│   └── create-lockup-helper.ts # Interactive lockup creation
├── test/               # Test suite
│   └── TokenLockup.test.ts
└── docs/               # Project documentation
    ├── prd.md          # Product requirements document
    └── lockup-procedure.md # Deployment and usage guide
```

## Prerequisites

- Node.js >= 20
- pnpm

## Installation

```bash
pnpm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Configure environment variables:
```env
# Required
PRIVATE_KEY=your_private_key_here
POLYGONSCAN_API_KEY=your_polygonscan_api_key_here

# Token Address (Required for production deployment)
# SUT Token on Polygon Mainnet: 0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55
# SUT Token on Polygon Amoy Testnet: 0xE4C687167705Abf55d709395f92e254bdF5825a2
TOKEN_ADDRESS=

# Optional (uses defaults if not specified)
POLYGON_RPC_URL=https://polygon-rpc.com
AMOY_RPC_URL=https://rpc-amoy.polygon.technology
```

**Note**:
- `TOKEN_ADDRESS` must be set to the appropriate SUT token address for the target network
- For testing without real SUT tokens, the deployment script will deploy a MockERC20 if `TOKEN_ADDRESS` is empty

## Development

### Compile Contracts

```bash
pnpm compile
```

### Run Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run with gas reporting
REPORT_GAS=true pnpm test
```

### Lint & Format

```bash
# Lint TypeScript
pnpm lint

# Fix lint issues
pnpm lint:fix

# Format code
pnpm format
```

## Deployment

### Deploy to Polygon Amoy Testnet

```bash
pnpm deploy:amoy
```

### Deploy to Polygon Mainnet

```bash
pnpm deploy:polygon
```

### Verify Contract on PolygonScan

After deployment, verify your contract:

```bash
# Set contract addresses
export CONTRACT_ADDRESS=<deployed_contract_address>
export TOKEN_ADDRESS=<token_address>

# Verify on Amoy testnet
pnpm verify:amoy

# Verify on Polygon mainnet
pnpm verify:polygon
```

Or use the manual verification command:

```bash
npx hardhat verify --network polygon <CONTRACT_ADDRESS> <TOKEN_ADDRESS>
```

## Helper Scripts

The project includes utility scripts for common lockup operations:

### Check Lockup Status

Query lockup information and vesting progress for a beneficiary:

```bash
# Set environment variables
export LOCKUP_ADDRESS=<deployed_lockup_contract_address>
export BENEFICIARY_ADDRESS=<beneficiary_address>

# Run check script
npx hardhat run scripts/check-lockup.ts --network polygon
```

This displays:
- Total, released, vested, and releasable amounts
- Vesting progress percentage
- Timeline (start, cliff end, vesting end)
- Current status and days remaining

### Calculate Vesting Timeline

Calculate and display vested amounts at different time points:

```bash
# Set environment variables
export LOCKUP_ADDRESS=<deployed_lockup_contract_address>
export BENEFICIARY_ADDRESS=<beneficiary_address>

# Run calculation script
npx hardhat run scripts/calculate-vested.ts --network polygon
```

This shows:
- Vesting milestones (start, cliff, 25%, 50%, 75%, end)
- Monthly vesting breakdown
- Current vesting status and progress

### Interactive Lockup Creation

Create a lockup with interactive prompts and validation:

```bash
# Set lockup contract address
export LOCKUP_ADDRESS=<deployed_lockup_contract_address>

# Run interactive creation script
npx hardhat run scripts/create-lockup-helper.ts --network polygon
```

The script will prompt for:
- Beneficiary address
- Total token amount
- Cliff duration (days)
- Vesting duration (days)
- Revocable flag

It validates inputs, checks token approval, and guides you through the creation process.

## Usage

### Creating a Lockup (Programmatic)

```typescript
const lockupContract = await ethers.getContractAt('TokenLockup', lockupAddress);

await lockupContract.createLockup(
  beneficiaryAddress,      // Address that will receive tokens
  ethers.parseEther('1000'), // Total amount to lock
  30 * 24 * 60 * 60,       // Cliff duration (30 days)
  365 * 24 * 60 * 60,      // Vesting duration (1 year)
  true                     // Revocable
);
```

### Releasing Vested Tokens

```typescript
// Beneficiary calls release to claim vested tokens
await lockupContract.connect(beneficiary).release();
```

### Revoking a Lockup

```typescript
// Owner can revoke and reclaim unvested tokens
await lockupContract.revoke(beneficiaryAddress);
```

## Contract Architecture

### TokenLockup.sol

Main contract implementing token lockup functionality:

- `createLockup()`: Create a new lockup for a beneficiary
- `release()`: Release vested tokens to beneficiary
- `revoke()`: Revoke lockup and return unvested tokens to owner
- `vestedAmount()`: View total vested amount
- `releasableAmount()`: View currently releasable amount

### Security Features

- **ReentrancyGuard**: Protects against reentrancy attacks
- **SafeERC20**: Safe token transfers
- **Ownable**: Access control for administrative functions
- **Custom Errors**: Gas-efficient error handling

## Testing

Test suite covers:
- Contract deployment
- Lockup creation with various parameters
- Vesting calculations
- Token release mechanisms
- Lockup revocation
- Edge cases and error conditions

Run tests with:
```bash
pnpm test
```

## Gas Optimization

- Uses Solidity 0.8.24 with IR-based optimizer
- Custom errors instead of revert strings
- Immutable variables where applicable
- Efficient storage patterns

## License

MIT
