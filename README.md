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
│   ├── create-lockup-helper.ts # Interactive lockup creation
│   ├── check-lockup.ts    # Check lockup status
│   ├── calculate-vested.ts # Calculate vesting timeline
│   ├── release-helper.ts  # Release vested tokens (beneficiary)
│   └── revoke-helper.ts   # Revoke lockup (owner only)
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
- **Used by**: `pnpm deploy:mainnet`, `pnpm verify:testnet`, local development commands

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

# Etherscan API V2 - Single key for 60+ chains (Ethereum, Polygon, BSC, etc.)
# Get your key at: https://etherscan.io/myapikey
ETHERSCAN_API_KEY=your_etherscan_api_key_here

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
# Run unit tests only (fast, located in test/TokenLockup.test.ts)
pnpm test

# Run integration tests only (slower, located in test/integration/*.test.ts)
pnpm test:integration

# Run all tests (unit + integration)
pnpm test:all

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
pnpm deploy:testnet
```

### Deploy to Polygon Mainnet

```bash
pnpm deploy:mainnet
```

### Verify Contract on PolygonScan

After deployment, verify your contract using the command printed by the deployment script:

```bash
# Verify on Amoy testnet
npx hardhat verify --network amoy <CONTRACT_ADDRESS> <TOKEN_ADDRESS>

# Verify on Polygon mainnet
npx hardhat verify --network polygon <CONTRACT_ADDRESS> <TOKEN_ADDRESS>

# Example (from deployment output):
npx hardhat verify --network amoy 0xe64dAbdEF5037942853cFC18017dfAB1649D8DF3 0xE4C687167705Abf55d709395f92e254bdF5825a2
```

**Note**: The deployment script (`scripts/deploy.ts`) automatically prints the correct verification command with actual addresses. Simply copy and run it.

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
- Cliff duration (in seconds)
- Vesting duration (in seconds)
- Revocable flag

It validates inputs, checks token approval, and guides you through the creation process.

**Example input for testnet**:

- Cliff Duration: `60` (1 minute)
- Vesting Duration: `6000` (100 minutes)

### Release Vested Tokens

Beneficiary can release vested tokens using the interactive helper:

```bash
# Set lockup contract address
export LOCKUP_ADDRESS=<deployed_lockup_contract_address>

# Run as beneficiary
npx hardhat run scripts/release-helper.ts --network polygon
```

The script will:

- Show your current lockup status (total, vested, released, releasable)
- Check if cliff period has passed
- Estimate gas cost
- Prompt for confirmation
- Execute release transaction
- Display updated status after release

**Features**:

- Automatic validation (cliff period, releasable amount)
- Gas estimation before transaction
- Clear status reporting (before and after)
- Safe: Only works for caller's own lockup

### Revoke a Lockup

Owner can revoke a lockup and reclaim unvested tokens:

```bash
# Set lockup contract address
export LOCKUP_ADDRESS=<deployed_lockup_contract_address>

# Run as owner
npx hardhat run scripts/revoke-helper.ts --network polygon
```

The script will:

- Verify you are the contract owner
- Prompt for beneficiary address
- Show lockup details and revocation impact
- Calculate refund amount (unvested tokens)
- Require 2-step confirmation (address + "REVOKE")
- Execute revoke transaction
- Display final status

**Important**:

- ⚠️ Revoke is permanent and cannot be undone
- Only works on revocable lockups (`revocable: true`)
- Owner receives unvested tokens immediately
- Beneficiary can still claim vested but unreleased tokens
- Already released tokens remain with beneficiary

## Usage

> **⚠️ IMPORTANT: Token Approval Required**
>
> Before creating a lockup, the owner MUST approve tokens first:
>
> ```typescript
> // Step 1: Approve tokens (REQUIRED)
> await sutToken.approve(lockupAddress, amount);
>
> // Step 2: Create lockup
> await tokenLockup.createLockup(...);
> ```
>
> **Using PolygonScan?** Go to the [SUT token contract](https://polygonscan.com/address/0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55#writeContract), approve tokens first, then create the lockup at the TokenLockup contract.

### Creating a Lockup (Programmatic)

> **⚠️ onlyOwner**: Only the contract owner can call `createLockup()`. If you're the beneficiary, you cannot create your own lockup - the owner must do it for you.

```typescript
const lockupContract = await ethers.getContractAt('TokenLockup', lockupAddress);

await lockupContract.createLockup(
  beneficiaryAddress, // Address that will receive tokens
  ethers.parseEther('1000'), // Total amount to lock
  2592000, // Cliff duration (30 days = 2,592,000 seconds)
  31536000, // Vesting duration (365 days = 31,536,000 seconds)
  true // Revocable
);
```

> **Note**: All duration parameters are in **seconds**. Common conversions:
>
> - 1 day = 86,400 seconds
> - 30 days = 2,592,000 seconds
> - 365 days = 31,536,000 seconds

### Releasing Vested Tokens

```typescript
// Beneficiary calls release to claim vested tokens
await lockupContract.connect(beneficiary).release();
```

### Revoking a Lockup

Owner can revoke a lockup and reclaim unvested tokens:

```typescript
// Owner revokes lockup
await lockupContract.revoke(beneficiaryAddress);
```

**Token flow after revoke**:

1. **Unvested tokens** → Immediately transferred to owner
2. **Vested but unreleased tokens** → Beneficiary can still claim
3. **Already released tokens** → Irreversible (beneficiary keeps them)

**Example scenario**:

- Total lockup: 100 SUT
- Current vested: 20.5 SUT
- Already released: 14.13 SUT
- **After revoke**:
  - Owner receives: 100 - 20.5 = **79.5 SUT** (unvested)
  - Beneficiary keeps: **14.13 SUT** (already released)
  - Beneficiary can still claim: 20.5 - 14.13 = **6.37 SUT** (vested but not released)

> **⚠️ Warning**: Revoke is permanent and cannot be undone. Only works on lockups created with `revocable: true`.

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
docker compose up

# This will:
# 1. Start local Hardhat node
# 2. Deploy test contracts (MockERC20 + TokenLockup)
# 3. Run unit tests
# 4. Run all integration tests
```

### Docker Architecture

The project uses a hybrid approach for integration testing:

**Docker Services** (via Docker Compose):

**1. hardhat-node** - Local Hardhat blockchain

- Port: 8545 (exposed to localhost)
- Purpose: Provides deterministic blockchain for testing
- Lifecycle: Runs in background during tests

**2. hardhat-deploy** - Contract deployment service

- Purpose: Deploys test contracts (MockERC20 + TokenLockup) to hardhat-node
- Runs automatically after hardhat-node is healthy
- Exit after deployment completes

**Local Test Execution**:

**3. Integration Tests** - Run locally via `pnpm test:integration`

- Purpose: Executes comprehensive test suite against Docker services
- Connection: `http://localhost:8545` (connects to hardhat-node container)
- Features: Time acceleration (1 second = 1 month, 100 months = 100 seconds)
- Tests: 6 integration test suites covering all scenarios
- **Advantages**:
  - ✅ Instant code changes (no Docker rebuild)
  - ✅ Fast feedback loop for development
  - ✅ Easy debugging in local environment
  - ✅ IDE integration support

### Docker Commands

```bash
# Build Docker images
docker compose build

# Start all services (recommended - runs everything once)
docker compose up

# Run integration tests (with proper exit code handling)
pnpm integration-tests

# Run production deployment
docker compose up hardhat-deploy

# Stop and remove containers
docker compose down

# View logs from all services
docker compose logs -f

# View logs from specific service
docker compose logs -f hardhat-node     # Hardhat node logs
docker compose logs -f hardhat-deploy   # Deployment logs
```

#### Exit Code Handling

When running integration tests, use the shorthand command for proper exit code handling and automatic cleanup:

```bash
pnpm integration-tests
```

This command executes `scripts/run-integration-tests.sh` which:

1. **Start Docker services** in background:

   ```bash
   docker compose up -d hardhat-node hardhat-deploy
   ```

2. **Wait for readiness**:
   - Hardhat node health check (polls `localhost:8545`)
   - Contract deployment completion

3. **Run tests locally**:

   ```bash
   pnpm test:integration
   ```

   - Tests connect to `localhost:8545`
   - Code changes apply immediately (no rebuild)

4. **Capture exit code** from local test execution

5. **Automatic cleanup** - Removes all containers, networks, and volumes:

   ```bash
   docker compose down -v
   ```

6. **Returns test exit code** for CI/CD integration

**Exit codes**:

- `0`: All tests passed ✅
- Non-zero: Tests failed ❌

**Benefits**:

- ✅ **Instant feedback** - No Docker rebuild needed
- ✅ **Fast development** - Code changes apply immediately
- ✅ **Clean state** - Full cleanup after every run
- ✅ **CI/CD-friendly** - Proper exit code handling
- ✅ **Easy debugging** - Local execution with IDE support

**Example usage with error handling**:

```bash
# Run tests and check result
pnpm integration-tests

if [ $? -eq 0 ]; then
  echo "✅ All tests passed!"
else
  echo "❌ Tests failed!"
  exit 1
fi

# Cleanup
docker compose down -v
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
docker compose logs -f

# Rebuild images
docker compose build
docker compose up
```

**Hardhat node not responding**

```bash
# Check node health
curl http://localhost:8545

# Restart services
docker compose down
docker compose up
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

# Integration tests (Docker - recommended for automation)
pnpm integration-tests

# Complete test suite with Docker
docker compose up
```

## Gas Optimization

- Uses Solidity 0.8.24 with IR-based optimizer
- Custom errors instead of revert strings
- Immutable variables where applicable
- Efficient storage patterns

## Troubleshooting

### PolygonScan Read Contract Returns "Returned values aren't valid"

**Issue**: Functions like `lockups()`, `vestedAmount()`, `releasableAmount()` fail on PolygonScan UI but work via Hardhat scripts.

**Cause**: PolygonScan RPC node synchronization or browser caching issues.

**Solution**: Use Hardhat scripts instead:

```bash
export LOCKUP_ADDRESS=<deployed_lockup_contract_address>
export BENEFICIARY_ADDRESS=<beneficiary_address>

# Check lockup status
npx hardhat run scripts/check-lockup.ts --network polygon

# Calculate vesting timeline
npx hardhat run scripts/calculate-vested.ts --network polygon
```

### PolygonScan Write Contract Doesn't Show Errors

**Issue**: Invalid transactions don't show error messages before submission on PolygonScan UI.

**Cause**: PolygonScan UI doesn't perform pre-validation (staticCall).

**Solution**:

- **Recommended**: Use helper scripts which validate inputs before submission:
  ```bash
  npx hardhat run scripts/create-lockup-helper.ts --network polygon
  ```
- **For custom frontends**: Use `contract.createLockup.staticCall()` before actual transaction
- **Check contract state**: Verify token approval and existing lockup status before calling functions

### createLockup Transaction Reverts

**Common causes**:

1. **Missing token approval** (most common):

   ```bash
   # Solution: Approve tokens first on PolygonScan
   # Go to SUT token contract → Write Contract → approve(spender, amount)
   ```

2. **Called with wrong address**:
   - Error: `OwnableUnauthorizedAccount`
   - Solution: Must call with owner address, not beneficiary address

3. **Lockup already exists**:
   - Error: `LockupAlreadyExists`
   - Solution: Each beneficiary can only have one lockup per contract. Deploy new contract or revoke existing lockup.

4. **Invalid parameters**:
   - Error: `InvalidDuration` - Check that `cliffDuration <= vestingDuration`
   - Error: `InvalidAmount` - Check that amount > 0

## License

MIT
