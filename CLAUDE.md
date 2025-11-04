# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SUT Token Lockup smart contract for managing token vesting schedules on Polygon. Implements time-based linear vesting with cliff periods, revocable lockups, and pull payment patterns for gas efficiency.

**Key Technologies:**

- Solidity 0.8.24 with IR-based optimizer
- Hardhat + TypeScript
- OpenZeppelin contracts (v5.0.0)
- Polygon (Mainnet + Amoy Testnet)

## Project Structure

### Directory Organization

**scripts/** (Root Level)

- **Purpose**: TypeScript scripts for local development and production deployment
- **Execution**: Direct Hardhat execution via `npx hardhat run scripts/*.ts`
- **Usage**: Local development, Polygon/Amoy production deployment, helper utilities
- **Files**:
  - `deploy.ts` - Production deployment (Polygon Mainnet/Amoy Testnet)
  - `deploy-test.ts` - Test environment deployment (used by Docker integration tests)
  - `check-lockup.ts` - Query lockup status and vesting progress
  - `calculate-vested.ts` - Calculate vesting timeline and milestones
  - `create-lockup-helper.ts` - Interactive lockup creation with validation

**docker/scripts/**

- **Purpose**: Shell script wrappers for Docker container execution
- **Execution**: Inside Docker containers with environment validation and colored output
- **Usage**: Docker Compose services (`hardhat-deploy`, `integration-tests`)
- **Function**: Wraps `scripts/*.ts` with container-specific logic (health checks, error handling)
- **Files**:
  - `deploy.sh` - Wrapper for `scripts/deploy.ts` (validates TOKEN_ADDRESS, waits for node)
  - `run-integration-tests.sh` - Deploys test contracts + runs full test suite

**docker/**

- `Dockerfile` - Multi-stage build (node/deploy/tests targets)
- `hardhat.config.integration.ts` - Hardhat configuration for Docker network
- `docker-compose.yml` - Orchestrates hardhat-node, hardhat-deploy, integration-tests

**Key Distinction**:

- `scripts/*.ts` = Direct Hardhat execution (local/production)
- `docker/scripts/*.sh` = Container-specific wrappers (Docker only)

## SUT Token Addresses

**Critical:** This project works with deployed SUT tokens, not deploying new ones.

- **Polygon Mainnet:** `0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55`
- **Polygon Amoy Testnet:** `0xE4C687167705Abf55d709395f92e254bdF5825a2`

**⚠️ IMPORTANT:** Always use the correct token address for your target network:

- ❌ **DO NOT** use Mainnet address on Amoy testnet
- ❌ **DO NOT** use Amoy address on Polygon mainnet
- ✅ The constructor will validate token exists and is ERC20 compliant
- ✅ Deployment will fail immediately if token address is invalid or doesn't exist on the network

Set `TOKEN_ADDRESS` in `.env` for deployment to the appropriate network. If empty, the deployment script will deploy MockERC20 for testing purposes.

## Development Commands

### Build & Test

```bash
pnpm compile              # Compile contracts + generate TypeChain types
pnpm test                 # Run full test suite (60 tests)
pnpm test:coverage        # Run tests with coverage report
REPORT_GAS=true pnpm test # Run tests with gas reporting

pnpm lint                 # Lint TypeScript
pnpm lint:fix             # Auto-fix lint issues
pnpm format               # Format code with Prettier
```

### Deployment

```bash
pnpm deploy:testnet       # Deploy to Polygon Amoy testnet
pnpm deploy:mainnet       # Deploy to Polygon mainnet

# Verify on PolygonScan
export CONTRACT_ADDRESS=0x...
export TOKEN_ADDRESS=0x...
pnpm verify:testnet       # Verify on Amoy
pnpm verify:mainnet       # Verify on mainnet
```

### Helper Scripts

```bash
# List all lockups
export LOCKUP_ADDRESS=0x...
npx hardhat run scripts/list-lockups.ts --network polygon
# or use: pnpm list-lockups --network polygon

# Check specific lockup status
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

**System Limits:**

- `MAX_LOCKUPS`: 100 - Maximum number of concurrent lockups
- `MAX_VESTING_DURATION`: 10 years - Maximum vesting period allowed

**Security Enhancements (Latest):**

Recent security improvements based on comprehensive audit (Grade: A-):

1. **Index Bounds Validation** (contracts/TokenLockup.sol:269-295)
   - Added dual-layer validation in `deleteLockup()` to prevent state corruption
   - Validates: `index > lastIndex` and `beneficiaries[index] != beneficiary`
   - Prevents array out-of-bounds access and synchronization issues between `beneficiaries` array and `beneficiaryIndex` mapping

2. **Enhanced Gas Documentation** (contracts/TokenLockup.sol:313-333)
   - Added comprehensive NatSpec documentation to `getAllLockups()` with gas cost warnings
   - Documented gas scaling: 10 lockups (~50K gas), 50 lockups (~250K gas), 100 lockups (~500K gas)
   - Recommends `getLockupsPaginated()` for production integrations with many lockups
   - Polygon block gas limit reference: 30M gas

3. **Proper Error Semantics** (contracts/TokenLockup.sol:52-64)
   - Added dedicated custom errors: `InvalidTokenAddress()`, `SameTokenAddress()`
   - Fixed `changeToken()` to use `InvalidTokenAddress` instead of generic `InvalidBeneficiary`
   - Improves debugging and error handling clarity

4. **Same-Token Validation** (contracts/TokenLockup.sol:255-265)
   - Added validation in `changeToken()` to prevent no-op token changes
   - Reverts with `SameTokenAddress()` if newToken == oldToken
   - Prevents accidental gas waste and improves operational safety

5. **Overflow Prevention** (contracts/TokenLockup.sol:358-376)
   - Added explicit overflow check in `getLockupsPaginated()`: `limit > type(uint256).max - offset`
   - Defense-in-depth measure (Solidity 0.8.24 already has built-in overflow protection)
   - Provides clear error message instead of revert with no context

6. **Constructor Error Type Fix** (contracts/TokenLockup.sol:71)
   - Fixed constructor to use `InvalidTokenAddress()` instead of `InvalidBeneficiary()`
   - Improves semantic clarity for token address validation
   - Enhances debugging experience and error tracking

7. **Reentrancy Protection on revoke()** (contracts/TokenLockup.sol:145)
   - Added `nonReentrant` modifier to revoke() function
   - Defense in Depth principle: prevents theoretical reentrancy attacks even with CEI pattern in place
   - Industry best practice for all token transfer functions
   - Gas cost increase: ~2,358 gas (+3.9%, still well within 130K threshold)
   - Addresses concerns from multiple independent security reviews

8. **Constructor Token Validation** (contracts/TokenLockup.sol:72-86)
   - Added comprehensive token address validation during deployment
   - Validates contract code exists at address using `extcodesize`
   - Verifies ERC20 interface compliance by calling `totalSupply()`
   - Prevents deployment with non-existent contracts or wrong network addresses
   - **Critical Fix:** Prevents network mismatch errors (e.g., using Mainnet address on Amoy testnet)
   - Deployment gas increase: ~18-22K gas (from ~1,244K to ~1,262K)
   - **Recovery:** No recovery mechanism needed - deployment fails immediately with clear error

9. **Explicit Vested Amount Storage on Revocation** (contracts/TokenLockup.sol:173-174, 232-233)
   - Added `vestedAtRevoke` field to `LockupInfo` struct to explicitly store vested amount at revocation time
   - Modified `revoke()` to store `vestedAtRevoke` when lockup is revoked
   - Modified `_vestedAmount()` to return stored `vestedAtRevoke` for revoked lockups instead of recalculating
   - **Benefits:** Improves transparency and auditability, prevents any ambiguity about frozen vesting amount
   - Original `totalAmount` and `vestingDuration` preserved for historical reference
   - Gas cost increase on revoke: ~18K gas (from ~61K to ~79K), acceptable for improved clarity

10. **Active Lockup Prevention in Token Change** (contracts/TokenLockup.sol:279-280)
    - Added `ActiveLockupsExist()` custom error for clear semantics
    - Added `beneficiaries.length > 0` check in `changeToken()` to prevent token changes with active lockups
    - Requires calling `deleteLockup()` for all completed lockups before token migration
    - **Benefits:** Prevents data inconsistency, ensures clean migration state, explicit operational requirement
    - Works with existing zero-balance check to provide comprehensive safety

11. **Beneficiary Address Restrictions** (contracts/TokenLockup.sol:119-120)
    - Added validation to prevent contract self-lock: `beneficiary == address(this)`
    - Added validation to prevent owner-beneficiary role conflicts: `beneficiary == owner()`
    - **Prevents CRITICAL vulnerability:** Contract cannot call `release()` on itself, causing permanent fund lock
    - **Prevents HIGH vulnerability:** Owner creating lockup for themselves and immediately revoking
    - Gas cost increase: ~2,700 gas per `createLockup()` (+1%)
    - Full test coverage: 2 new unit tests added (test/TokenLockup.test.ts:116-128)

12. **Improved Rounding Logic** (contracts/TokenLockup.sol:323-338)
    - Enhanced `_vestedAmount()` with banker's rounding to minimize cumulative token loss
    - Rounds up when remainder \* 2 >= divisor (i.e., remainder >= 50%)
    - Caps result at `totalAmount` to prevent overflow
    - **Impact:** Reduces cumulative loss from ~30K tokens (0.003%) to near zero for 100M token lockups
    - Gas cost increase: ~500 gas per `vestedAmount()` call
    - Test coverage: 3 new boundary tests (49.9%, 50.1%, extreme small amounts)

13. **Atomic deleteLockup()** (contracts/TokenLockup.sol:405)
    - Reordered operations to invalidate `beneficiaryIndex` first
    - Prevents theoretical race condition in concurrent `deleteLockup()` calls
    - Second call immediately fails with `NoLockupFound` due to index=0
    - **Benefits:** Atomic deletion semantics, no race condition window
    - Gas cost: No change (operation reordering only)
    - Test coverage: 1 new double-deletion test (test/LockupEnumeration.test.ts:357-376)

All improvements maintain gas efficiency while significantly enhancing security posture. Full test coverage: 97 unit tests + 70 integration tests passing.

**Security Grade: A (upgraded from A-)**

### Lockup Enumeration

**New Feature:** Track and query all lockups without knowing beneficiary addresses.

**State Variables:**

```solidity
address[] private beneficiaries;  // Array of all beneficiary addresses
mapping(address => uint256) private beneficiaryIndex;  // 1-based index for O(1) lookup
```

**Query Functions:**

1. `getLockupCount()` → Returns total number of active lockups
2. `getAllBeneficiaries()` → Returns array of all beneficiary addresses
3. `getAllLockups()` → Returns arrays of addresses and their lockup info
4. `getLockupsPaginated(offset, limit)` → Returns paginated lockup data

**Gas Considerations:**

- `getAllLockups()` gas cost scales with number of lockups (~250K gas for 50 lockups)
- Use `getLockupsPaginated()` for large numbers to avoid gas limits
- Array management adds ~20K gas to `createLockup()`
- `deleteLockup()` uses swap-and-pop pattern for efficient removal

**Address Reuse:**

Previously, beneficiary addresses could not be reused after lockup completion. Now, use `deleteLockup()` after a lockup is fully released to:

- Remove lockup data and free up the address
- Allow creating a new lockup for the same address
- Reduce storage and gas costs

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
  uint256 totalAmount; // Total locked tokens
  uint256 releasedAmount; // Already claimed tokens
  uint256 startTime; // Lockup start timestamp
  uint256 cliffDuration; // Cliff period in seconds
  uint256 vestingDuration; // Total vesting period in seconds
  bool revocable; // Can owner revoke?
  bool revoked; // Has been revoked?
  uint256 vestedAtRevoke; // Amount vested at revocation time (0 if not revoked)
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
     cliffDuration, // seconds
     vestingDuration, // seconds
     revocable // bool
   );
   ```

4. **Release Tokens** (Beneficiary claims vested tokens)
   ```typescript
   await tokenLockup.connect(beneficiary).release();
   ```

See `docs/lockup-procedure.md` for detailed step-by-step guide.

## Testing Strategy

**Test Coverage:** 50 passing tests covering:

- Deployment validation
- Lockup creation with various parameters
- Vesting calculations (before cliff, after cliff, midpoint, full vesting)
- Token release mechanisms
- Revocation logic
- Pause functionality
- Rounding error handling
- Token address change feature
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
- `ETHERSCAN_API_KEY`: Etherscan API V2 key - single key for 60+ chains (Ethereum, Polygon, BSC, etc.)
  - Get your key at: https://etherscan.io/myapikey
  - Migration deadline: May 31, 2025 (V1 will be disabled)

**Optional:**

- `POLYGON_RPC_URL`: Custom Polygon RPC (defaults to polygon-rpc.com)
- `AMOY_RPC_URL`: Custom Amoy RPC (defaults to rpc-amoy.polygon.technology)
- `REPORT_GAS`: Enable gas reporting in tests
- `COINMARKETCAP_API_KEY`: For gas reporter USD pricing
- `TIME_UNIT`: Time unit for lockup creation (month/day/minute/second, defaults to day)

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
const sutToken = await ethers.getContractAt('IERC20', process.env.TOKEN_ADDRESS!);
```

### Time Calculations

```typescript
const MONTH = 30 * 24 * 60 * 60; // 30 days in seconds
const cliffDuration = 1 * MONTH; // 1 month cliff
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
- `TokensStillLocked()`: Attempting to change token while contract has balance
- `ActiveLockupsExist()`: Attempting to change token while active lockups exist (even with zero balance)

### Token Address Change

Change token address when migrating to a new token:

```typescript
// Step 1: Ensure all lockups are completed (released or revoked)
const balance = await oldToken.balanceOf(await tokenLockup.getAddress());
console.log('Contract balance:', balance); // Must be 0

// Step 2: Delete all completed lockups to clear beneficiaries array
const beneficiaries = await tokenLockup.getAllBeneficiaries();
for (const beneficiary of beneficiaries) {
  await tokenLockup.deleteLockup(beneficiary);
}
console.log('Active lockups:', await tokenLockup.getLockupCount()); // Must be 0

// Step 3: Pause the contract
await tokenLockup.pause();

// Step 4: Change token address
await tokenLockup.changeToken(newTokenAddress);

// Step 5: Unpause for normal operations
await tokenLockup.unpause();

// Step 6: Create new lockups with new token
await newToken.approve(await tokenLockup.getAddress(), amount);
await tokenLockup.createLockup(beneficiary, amount, cliff, vesting, revocable);
```

### View Functions for UX

Query lockup status and progress for frontend integrations:

```typescript
// Get vesting progress as percentage (0-100)
const progress = await tokenLockup.getVestingProgress(beneficiary.address);
console.log(`Vesting progress: ${progress}%`);

// Get remaining vesting time in seconds
const remaining = await tokenLockup.getRemainingVestingTime(beneficiary.address);
const days = Math.floor(remaining / (24 * 60 * 60));
console.log(`Remaining time: ${days} days`);

// Get vested amount (tokens)
const vested = await tokenLockup.vestedAmount(beneficiary.address);
console.log(`Vested tokens: ${ethers.formatEther(vested)}`);

// Get releasable amount (unclaimed vested tokens)
const releasable = await tokenLockup.releasableAmount(beneficiary.address);
console.log(`Claimable tokens: ${ethers.formatEther(releasable)}`);

// Example: Display complete lockup status
const lockup = await tokenLockup.lockups(beneficiary.address);
const progress = await tokenLockup.getVestingProgress(beneficiary.address);
const remaining = await tokenLockup.getRemainingVestingTime(beneficiary.address);

console.log({
  total: ethers.formatEther(lockup.totalAmount),
  released: ethers.formatEther(lockup.releasedAmount),
  progress: `${progress}%`,
  remainingDays: Math.floor(remaining / (24 * 60 * 60)),
  revoked: lockup.revoked,
});
```

**Available View Functions:**

- `vestedAmount(address)` - Returns total vested tokens
- `releasableAmount(address)` - Returns claimable tokens (vested - released)
- `getVestingProgress(address)` - Returns vesting progress as percentage (0-100)
  - Returns 0 before cliff period
  - Returns 100 for revoked or completed lockups
- `getRemainingVestingTime(address)` - Returns remaining time in seconds
  - Returns 0 for revoked or completed lockups
- `lockups(address)` - Returns complete LockupInfo struct

## Owner Privileges and Responsibilities

**Critical Admin Functions (Owner-Only):**

The contract owner has significant privileges that require careful handling:

1. **createLockup()** - Create new token lockups
   - **Privilege:** Owner controls which addresses receive lockups and their terms
   - **Risk:** Centralized control over token distribution
   - **Mitigation:** Use multi-sig wallet (e.g., Gnosis Safe) for production deployments
   - **Gas Cost:** ~247K gas with nonReentrant protection

2. **revoke()** - Cancel lockups and reclaim unvested tokens
   - **Privilege:** Owner can revoke ANY revocable lockup at any time
   - **Risk:** Beneficiaries lose unvested tokens if revoked
   - **Mitigation:** Set `revocable=false` for immutable vesting schedules (investors, employees)
   - **Use Cases:**
     - `revocable=true`: Advisors, contractors, consultants (conditional grants)
     - `revocable=false`: Core team, investors (guaranteed vesting)
   - **Protection:** Beneficiaries can still claim all vested tokens up to revocation time

3. **pause() / unpause()** - Halt all contract operations
   - **Privilege:** Emergency stop affects ALL beneficiaries
   - **Risk:** Blocks release(), createLockup(), and revoke() for everyone
   - **Use Cases:**
     - Security incidents or vulnerabilities discovered
     - Token migration preparation
     - Contract upgrade coordination
   - **Protection:** Vesting continues during pause (time-based), only claims blocked

4. **changeToken()** - Migrate to new token address
   - **Privilege:** Changes the entire token being managed
   - **Risk:** Major operational change affecting all future lockups
   - **Requirements:**
     - Contract must be paused (safety check)
     - Token balance must be zero (all lockups settled)
     - All lockups must be deleted (no active beneficiaries)
   - **Use Case:** Migrating from old token to new token contract

5. **deleteLockup()** - Remove completed lockup records
   - **Privilege:** Cleanup function for completed vesting
   - **Risk:** Affects address reusability for future lockups
   - **Requirements:**
     - All tokens must be released (releasedAmount == totalAmount or vestedAtRevoke)
     - Lockup must be fully settled (no pending claims)
   - **Use Case:** Free up beneficiary address for new lockup, reduce storage costs

**Security Best Practices:**

✅ **Production Recommendations:**

- **Multi-Signature Wallet:** Use Gnosis Safe or similar for owner address
  - Recommended: 3-of-5 or 4-of-7 configuration
  - Prevents single point of failure
  - Adds transparency and accountability

- **Revocation Policy:** Document clearly before deployment
  - Specify which lockup types are revocable
  - Define conditions under which revocation may occur
  - Communicate policy to all beneficiaries upfront

- **Testing Protocol:**
  - Test ALL admin functions on Amoy testnet first
  - Verify multi-sig operations work correctly
  - Practice emergency procedures (pause/unpause)
  - Validate token change workflow with test tokens

- **Operational Security:**
  - Store private keys in hardware wallets (Ledger, Trezor)
  - Use multi-sig for mainnet owner operations
  - Implement time-locks for sensitive operations
  - Monitor contract events for unauthorized access attempts

**Trust Assumptions:**

⚠️ **Beneficiaries Must Trust Owner For:**

- Not revoking revocable lockups arbitrarily
- Not pausing contract unnecessarily
- Managing token migrations responsibly
- Deleting lockups only after full release

✅ **Trustless Guarantees:**

- Vesting schedule is immutable once created
- Non-revocable lockups cannot be cancelled
- Mathematical vesting calculations (time-based)
- Beneficiaries can always claim vested amounts (even after revocation)

## Important Constraints

1. **Single Beneficiary per Deployment:** TokenLockup contract supports one beneficiary per deployment. For multiple beneficiaries, deploy multiple contracts.

2. **Address Reuse After Lockup Deletion:** Each beneficiary address can have **one active lockup** at a time. After a lockup is completed:
   - Use `deleteLockup()` to remove the lockup data
   - This allows creating a **new lockup for the same address**
   - Requirements for deletion:
     - All tokens must be released (`releasedAmount == totalAmount`)
     - Only owner can delete
   - **Example workflow:**

     ```typescript
     // Complete first lockup
     await tokenLockup.connect(beneficiary).release(); // After vesting ends

     // Delete lockup to free address
     await tokenLockup.deleteLockup(beneficiary.address);

     // Create new lockup for same address
     await tokenLockup.createLockup(beneficiary.address, newAmount, cliff, vesting, revocable);
     ```

3. **Maximum Limits:** Contract enforces system-wide limits:
   - `MAX_LOCKUPS`: 100 concurrent lockups maximum
   - `MAX_VESTING_DURATION`: 10 years maximum vesting period
   - These limits prevent gas limit issues and accidental misconfigurations

4. **Immutable Schedule:** Once created, vesting schedule cannot be modified. Only option is revoke + delete + recreate.

5. **Token Compatibility:** Only standard ERC20 tokens supported. Does NOT support:

   **⚠️ CRITICAL SECURITY WARNING:**
   - **ERC-777 tokens:** ❌ NOT supported due to reentrancy risk via `tokensReceived()` and `tokensToSend()` hooks
     - While contract uses ReentrancyGuard and CEI pattern for defense-in-depth, ERC-777 hooks can still trigger during `safeTransferFrom()`
     - Hook functions can call back into contract during token transfer
     - **Risk:** Malicious hooks could manipulate state or drain funds
     - **Mitigation:** Constructor validates ERC20 interface, but cannot detect ERC-777 compatibility layer

   **Other Unsupported Token Types:**
   - **Rebasing tokens:** Balance changes automatically (e.g., Ampleforth, stETH)
   - **Fee-on-transfer tokens:** Deduct fees during transfers (actual received < specified amount)
   - **Deflationary tokens:** Total supply decreases over time

   **Pre-Deployment Verification Checklist:**

   ✅ **Required Steps Before Production Deployment:**
   1. **Verify Token Contract Code:**
      - Check token contract source code on PolygonScan
      - Look for ERC-777 interfaces: `tokensReceived`, `tokensToSend`, `ERC1820`
      - Look for transfer hooks, callback functions, or delegate calls
      - Verify it's a standard ERC-20 implementation

   2. **Test with Small Amounts First:**
      - Deploy to testnet (Amoy) with test tokens
      - Create small test lockup (e.g., 1-10 tokens)
      - Verify release mechanism works correctly
      - Monitor for unexpected behavior

   3. **Monitor Balance Changes:**
      - After `createLockup()`, verify exact amount transferred: `token.balanceOf(contract)`
      - Check no fees were deducted: `contractBalance == lockupAmount`
      - After `release()`, verify beneficiary received exact vested amount
      - Watch for any automatic balance changes over time

   4. **Verify Token Type on PolygonScan:**
      - **Mainnet SUT:** `0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55`
      - **Amoy SUT:** `0xE4C687167705Abf55d709395f92e254bdF5825a2`
      - Check "Contract" tab → "Read Contract" → verify standard ERC-20 functions only
      - Check "Contract" tab → "Code" → search for ERC-777 keywords

   **Recovery from Incompatible Token:**
   - ❌ No recovery mechanism if deployed with incompatible token
   - ✅ Constructor validation prevents deployment with non-existent addresses
   - ⚠️ Constructor cannot detect ERC-777 compatibility layer on top of ERC-20
   - 🔄 Use `changeToken()` to migrate to compatible token after all lockups complete

6. **No Partial Release in Current Version:** While PRD mentions partial release, current implementation does NOT include this feature. Only standard vesting + release.

7. **Token Address Change:** Token address can be changed by owner, but ONLY when:
   - Contract is paused (safety requirement)
   - Contract token balance is zero (all lockups completed/revoked)
   - All lockups are deleted (beneficiaries.length == 0)
   - Must call `deleteLockup()` for each completed lockup before token change
   - This ensures clean migration state with no active lockup data

8. **Beneficiary Address Restrictions:** The following addresses CANNOT be used as beneficiaries to prevent fund loss and role conflicts:
   - ❌ **address(0)** - Zero address (prevents accidental burns)
   - ❌ **address(this)** - Contract address itself (prevents permanent fund lock)
     - **Risk:** Contract cannot call `release()` on itself as msg.sender
     - **Impact:** Tokens permanently locked with no recovery mechanism
     - **Revocation:** Even `revoke()` cannot recover since beneficiary = contract
   - ❌ **owner()** - Owner address (prevents role separation violations)
     - **Risk:** Owner could create lockup for themselves and immediately revoke
     - **Impact:** Violates trust model where owner = admin, beneficiary = recipient
     - **Conflicts:** Owner has pause/unpause/changeToken privileges incompatible with beneficiary role

   All three validations are enforced in `createLockup()` and revert with `InvalidBeneficiary()` error.

## Documentation

- `docs/prd.md`: Product requirements and technical specifications
- `docs/lockup-procedure.md`: Step-by-step deployment and usage guide
- Test files contain inline documentation for complex scenarios

## Gas Optimization

Contract uses:

- IR-based compiler optimization (`viaIR: true`)
- Custom errors instead of revert strings
- Struct packing in `LockupInfo`
- `unchecked` blocks where overflow impossible
- Efficient balance check for token change validation (~36K gas)

Compiler runs optimized for 200 deployment runs (balanced for contract size and execution cost).

**Note:** Token address is no longer `immutable` to support `changeToken()` functionality. This adds minimal gas overhead (~100 gas per read) while enabling critical token migration capability.

## Task Master AI Instructions

**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md
