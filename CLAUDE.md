# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SUT Token Lockup smart contract for managing token vesting schedules on Polygon. Implements time-based linear vesting with cliff periods, revocable lockups, and pull payment patterns for gas efficiency.

**Key Technologies:**
- Solidity 0.8.24 with IR-based optimizer
- Hardhat + TypeScript
- OpenZeppelin contracts (v5.0.0)
- Polygon (Mainnet + Amoy Testnet)

## SUT Token Addresses

**Critical:** This project works with deployed SUT tokens, not deploying new ones.

- **Polygon Mainnet:** `0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55`
- **Polygon Amoy Testnet:** `0xE4C687167705Abf55d709395f92e254bdF5825a2`

Set `TOKEN_ADDRESS` in `.env` for deployment to the appropriate network. If empty, the deployment script will deploy MockERC20 for testing purposes.

## Development Commands

### Build & Test
```bash
pnpm compile              # Compile contracts + generate TypeChain types
pnpm test                 # Run full test suite (29 tests)
pnpm test:coverage        # Run tests with coverage report
REPORT_GAS=true pnpm test # Run tests with gas reporting

pnpm lint                 # Lint TypeScript
pnpm lint:fix             # Auto-fix lint issues
pnpm format               # Format code with Prettier
```

### Deployment
```bash
pnpm deploy:amoy          # Deploy to Polygon Amoy testnet
pnpm deploy:polygon       # Deploy to Polygon mainnet

# Verify on PolygonScan
export CONTRACT_ADDRESS=0x...
export TOKEN_ADDRESS=0x...
pnpm verify:amoy          # Verify on Amoy
pnpm verify:polygon       # Verify on mainnet
```

### Helper Scripts
```bash
# Check lockup status
export LOCKUP_ADDRESS=0x...
export BENEFICIARY_ADDRESS=0x...
npx hardhat run scripts/check-lockup.ts --network polygon

# Calculate vesting timeline
npx hardhat run scripts/calculate-vested.ts --network polygon

# Interactive lockup creation
npx hardhat run scripts/create-lockup-helper.ts --network polygon
```

## Architecture

### Contract Design

**Single Beneficiary Model:** TokenLockup contract supports one beneficiary per deployment. For multiple beneficiaries, deploy multiple contracts.

**Key Components:**
- `TokenLockup.sol`: Main lockup contract with linear vesting
- `MockERC20.sol`: Test token (only for local/test environments)

**Security Patterns:**
- ReentrancyGuard on all token transfer functions
- SafeERC20 for token operations
- Ownable for admin functions
- Custom errors for gas efficiency

### Vesting Mechanism

**Linear Vesting Formula:**
```solidity
vestedAmount = (totalAmount × timeFromStart) / vestingDuration
```

**Key Features:**
- Cliff period: No tokens vest before cliff ends
- Time-based: Uses `block.timestamp` for calculations
- Pull payment: Beneficiary calls `release()` to claim tokens
- Revocable: Owner can cancel lockup and reclaim unvested tokens

### State Structure

```solidity
struct LockupInfo {
    uint256 totalAmount;      // Total locked tokens
    uint256 releasedAmount;   // Already claimed tokens
    uint256 startTime;        // Lockup start timestamp
    uint256 cliffDuration;    // Cliff period in seconds
    uint256 vestingDuration;  // Total vesting period in seconds
    bool revocable;           // Can owner revoke?
    bool revoked;             // Has been revoked?
}
```

Stored in `mapping(address => LockupInfo) public lockups`.

## Deployment Flow

**Critical Steps:**

1. **Deploy TokenLockup** with SUT token address
   - Script auto-detects `TOKEN_ADDRESS` from env
   - If empty, deploys MockERC20 for testing

2. **Approve Tokens** (Owner must approve before creating lockup)
   ```typescript
   await sutToken.approve(tokenLockupAddress, lockupAmount);
   ```

3. **Create Lockup** (Owner only)
   ```typescript
   await tokenLockup.createLockup(
     beneficiaryAddress,
     amount,
     cliffDuration,    // seconds
     vestingDuration,  // seconds
     revocable         // bool
   );
   ```

4. **Release Tokens** (Beneficiary claims vested tokens)
   ```typescript
   await tokenLockup.connect(beneficiary).release();
   ```

See `docs/lockup-procedure.md` for detailed step-by-step guide.

## Testing Strategy

**Test Coverage:** 29 passing tests covering:
- Deployment validation
- Lockup creation with various parameters
- Vesting calculations (before cliff, after cliff, midpoint, full vesting)
- Token release mechanisms
- Revocation logic
- Error conditions and edge cases

**Run specific test:**
```bash
npx hardhat test --grep "Should release vested tokens"
```

**Important:** Tests use time manipulation via `@nomicfoundation/hardhat-network-helpers`. Vesting calculations use `closeTo()` assertions due to block timestamp precision.

## Network Configuration

**Hardhat Networks:**
- `hardhat`: Local development (chainId: 31337) - for testing only
- `polygon`: Polygon Mainnet (chainId: 137)
- `amoy`: Polygon Amoy Testnet (chainId: 80002)

**Gas Settings:** All networks use `gasPrice: 'auto'` for Polygon networks.

## Environment Variables

**Required for production:**
- `PRIVATE_KEY`: Deployer wallet private key (without 0x prefix)
- `TOKEN_ADDRESS`: SUT token address (Mainnet or Amoy)
- `POLYGONSCAN_API_KEY`: For contract verification

**Optional:**
- `POLYGON_RPC_URL`: Custom Polygon RPC (defaults to polygon-rpc.com)
- `AMOY_RPC_URL`: Custom Amoy RPC (defaults to rpc-amoy.polygon.technology)
- `REPORT_GAS`: Enable gas reporting in tests
- `COINMARKETCAP_API_KEY`: For gas reporter USD pricing

## Common Patterns

### Accessing Contracts in Scripts

```typescript
import { ethers } from 'hardhat';

// Get deployed contract
const tokenLockup = await ethers.getContractAt(
  'TokenLockup',
  '0x...' // deployed address
);

// Get SUT token
const sutToken = await ethers.getContractAt(
  'IERC20',
  process.env.TOKEN_ADDRESS!
);
```

### Time Calculations

```typescript
const MONTH = 30 * 24 * 60 * 60;  // 30 days in seconds
const cliffDuration = 1 * MONTH;   // 1 month cliff
const vestingDuration = 100 * MONTH; // 100 months total vesting (1% per month)
```

### Error Handling

Contract uses custom errors for gas efficiency. Common errors:
- `InvalidAmount()`: Zero amount or invalid value
- `InvalidDuration()`: Zero duration or cliff > vesting
- `LockupAlreadyExists()`: Beneficiary already has a lockup
- `NoTokensAvailable()`: No tokens vested yet or already claimed
- `NotRevocable()`: Attempting to revoke non-revocable lockup
- `AlreadyRevoked()`: Lockup already revoked

## Important Constraints

1. **Single Beneficiary:** One lockup per beneficiary address. To change lockup, must revoke (if revocable) and create new one.

2. **Immutable Schedule:** Once created, vesting schedule cannot be modified. Only option is revoke + recreate.

3. **Token Compatibility:** Only standard ERC20 tokens supported. Does NOT support:
   - Rebasing tokens
   - Fee-on-transfer tokens
   - Deflationary tokens

4. **No Partial Release in Current Version:** While PRD mentions partial release, current implementation does NOT include this feature. Only standard vesting + release.

5. **No Emergency Pause in Current Version:** Current implementation does NOT include pausable functionality mentioned in PRD.

## Documentation

- `docs/prd.md`: Product requirements and technical specifications
- `docs/lockup-procedure.md`: Step-by-step deployment and usage guide
- Test files contain inline documentation for complex scenarios

## Gas Optimization

Contract uses:
- IR-based compiler optimization (`viaIR: true`)
- Custom errors instead of revert strings
- `immutable` for token address
- Struct packing in `LockupInfo`
- `unchecked` blocks where overflow impossible

Compiler runs optimized for 200 deployment runs (balanced for contract size and execution cost).

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md
