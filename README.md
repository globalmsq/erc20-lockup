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
├── contracts/              # Solidity contracts
│   ├── TokenLockup.sol    # Main lockup contract
│   └── MockERC20.sol      # Mock token for testing
│
├── scripts/               # TypeScript scripts (Hardhat direct execution)
│   ├── deploy.ts          # Production deployment (Polygon/Amoy)
│   ├── deploy-test.ts     # Test deployment (Docker integration tests)
│   ├── verify.ts          # PolygonScan contract verification
│   ├── check-lockup.ts    # Check lockup status helper
│   ├── calculate-vested.ts # Calculate vesting timeline
│   └── create-lockup-helper.ts # Interactive lockup creation
│
├── docker/                # Docker integration testing
│   ├── Dockerfile         # Multi-stage build for node/deploy/tests
│   ├── hardhat.config.integration.ts # Hardhat config for Docker
│   └── scripts/           # Shell wrappers (Docker container execution)
│       ├── deploy.sh      # Deploys contracts inside container
│       └── run-integration-tests.sh # Runs test suite inside container
│
├── test/                  # Test suite
│   ├── TokenLockup.test.ts # Unit tests (38 tests)
│   └── integration/       # Integration tests (49 tests)
│       ├── 01-FullLifecycle.test.ts
│       ├── 02-PeriodicRelease.test.ts
│       ├── 03-RevocationScenarios.test.ts
│       ├── 04-EdgeCases.test.ts
│       ├── 05-MultipleBeneficiaries.test.ts
│       └── 06-GasEfficiency.test.ts
│
└── docs/                  # Project documentation
    ├── prd.md             # Product requirements document
    └── lockup-procedure.md # Deployment and usage guide
```

### Script Directory Organization

**scripts/ (Root Level)**
- **Purpose**: TypeScript scripts for local development and production deployment
- **Execution**: Direct Hardhat execution (`npx hardhat run scripts/deploy.ts`)
- **Used by**: `pnpm deploy:polygon`, `pnpm verify:amoy`, local development commands

**docker/scripts/**
- **Purpose**: Shell script wrappers for Docker container execution
- **Execution**: Inside Docker containers with environment validation and colored output
- **Used by**: `docker-compose.yml` services (hardhat-deploy, integration-tests)
- **Function**: Wraps `scripts/*.ts` files with container-specific logic

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
# Run unit tests only (fast, for development)
pnpm test

# Run integration tests (local - for debugging)
pnpm test:integration

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
- Cliff duration (in configured time unit)
- Vesting duration (in configured time unit)
- Revocable flag

It validates inputs, checks token approval, and guides you through the creation process.

**Quick Testing on Testnet:**

For faster testing on testnet, use the `TIME_UNIT` environment variable:

```bash
# Fast testing: 1 minute = 1% vesting (100 minutes = full vesting)
export TIME_UNIT=minute
export LOCKUP_ADDRESS=<deployed_lockup_contract_address>
npx hardhat run scripts/create-lockup-helper.ts --network amoy

# Production: 1 month = 1% vesting (100 months = full vesting)
export TIME_UNIT=month
npx hardhat run scripts/create-lockup-helper.ts --network polygon
```

Supported TIME_UNIT values:
- `month` - 1 month = 30 days (production, 1% per month)
- `day` - 1 day (default)
- `minute` - 1 minute (testnet testing, 1% per minute)
- `second` - 1 second (rapid testing)

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

## Docker Integration Testing

The project includes comprehensive Docker-based integration testing infrastructure for rapid testing of the 1% periodic lockup release mechanism with time acceleration.

### Quick Start

```bash
# Run complete test suite (one-shot execution)
pnpm docker:up

# This will:
# 1. Start local Hardhat node
# 2. Deploy test contracts (MockERC20 + TokenLockup)
# 3. Run unit tests
# 4. Run all integration tests
```

### Docker Architecture

The project uses a multi-stage Dockerfile with three services:

**1. hardhat-node** - Local Hardhat blockchain
- Port: 8545
- Purpose: Provides deterministic blockchain for testing
- Lifecycle: Runs continuously until stopped

**2. hardhat-deploy** - Production deployment service
- Purpose: Deploys TokenLockup contract to real networks (Polygon/Amoy)
- Requires: `TOKEN_ADDRESS` environment variable
- Usage: `pnpm docker:deploy`

**3. integration-tests** - Integration test runner
- Purpose: Deploys test contracts and runs comprehensive test suite
- Features: Time acceleration (1 second = 1 month, 100 months = 100 seconds)
- Tests: 6 integration test suites covering all scenarios

### Docker Commands

```bash
# Build Docker images
pnpm docker:build

# Start all services (recommended - runs everything once)
pnpm docker:up

# Run integration tests only
pnpm docker:test

# Run production deployment
pnpm docker:deploy

# Stop and remove containers
pnpm docker:down

# View logs from all services
pnpm docker:logs

# View logs from specific service
pnpm docker:logs:node    # Hardhat node logs
pnpm docker:logs:deploy  # Deployment logs
pnpm docker:logs:tests   # Integration test logs
```

### Environment Configuration

Create `.env.docker.example` for Docker-specific settings:

```bash
# Token Address (required for hardhat-deploy service)
TOKEN_ADDRESS=0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55  # Polygon Mainnet SUT

# Deployment Network (for hardhat-deploy service)
# Options: localhost, polygon, amoy
DEPLOY_NETWORK=localhost
```

### Integration Test Suites

**Time Acceleration**: All integration tests use accelerated time where 1 second = 1 month, allowing 100-month vesting cycles to complete in 100 seconds.

**Test Coverage**:

1. **01-FullLifecycle.test.ts** - Complete vesting lifecycle
   - Tests 0% → 25% → 50% → 75% → 100% release progression
   - Validates token balances at each milestone
   - Verifies over-vesting period behavior

2. **02-PeriodicRelease.test.ts** - 1% monthly releases
   - Tests exact 1% release for all 100 months
   - Validates consistent vesting rate
   - Tests fractional month calculations
   - Measures gas efficiency over time

3. **03-RevocationScenarios.test.ts** - Revocation at various stages
   - Tests revocation at 0%, 25%, 50%, 75% vested
   - Validates refund calculations
   - Tests beneficiary claims after revocation
   - Tests non-revocable lockups

4. **04-EdgeCases.test.ts** - Boundary conditions
   - Minimum/maximum lockup amounts (1 wei to 1M tokens)
   - Extreme durations (1 second to 120 months)
   - Cliff edge cases (cliff = vesting, no cliff, 99% cliff)
   - Invalid operations and error conditions
   - Time precision and state consistency

5. **05-MultipleBeneficiaries.test.ts** - Multiple concurrent lockups
   - Separate contract instances for multiple beneficiaries
   - Independent revocations across contracts
   - Staggered vesting schedules
   - Contract isolation verification
   - Same beneficiary across multiple contracts

6. **06-GasEfficiency.test.ts** - Comprehensive gas analysis
   - Deployment costs
   - createLockup, release, revoke gas measurements
   - Sequential release gas tracking
   - Operation sequence comparisons
   - Gas threshold verification

### Troubleshooting

**Container fails to start**
```bash
# Check Docker daemon is running
docker ps

# View detailed logs
pnpm docker:logs

# Rebuild images
pnpm docker:build
pnpm docker:up
```

**Hardhat node not responding**
```bash
# Check node health
curl http://localhost:8545

# Restart services
pnpm docker:down
pnpm docker:up
```

**Tests timeout**
```bash
# Increase timeout in docker-compose.yml
# Edit healthcheck section in docker-compose.yml:
healthcheck:
  start_period: 10s  # Increase from 5s
  retries: 20        # Increase from 10
```

**Port 8545 already in use**
```bash
# Find process using port
lsof -i :8545

# Stop existing Hardhat node
pkill -f hardhat

# Or change port in docker-compose.yml
```

### Local Testing (Without Docker)

For local testing without Docker, run Hardhat node manually:

```bash
# Terminal 1: Start Hardhat node
npx hardhat node

# Terminal 2: Deploy test contracts
npx hardhat run scripts/deploy-test.ts --network localhost

# Terminal 3: Run integration tests
pnpm test:integration
```

## Testing

Test suite covers:
- Contract deployment
- Lockup creation with various parameters
- Vesting calculations
- Token release mechanisms
- Lockup revocation
- Edge cases and error conditions
- Full integration testing with time acceleration (Docker)

Run tests with:
```bash
# Unit tests only (fast, for development)
pnpm test

# Integration tests (local - for debugging)
pnpm test:integration

# Integration tests (Docker - recommended for CI/CD)
pnpm docker:test

# Complete test suite with Docker
pnpm docker:up
```

## Gas Optimization

- Uses Solidity 0.8.24 with IR-based optimizer
- Custom errors instead of revert strings
- Immutable variables where applicable
- Efficient storage patterns

## License

MIT
