// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title TokenLockup
 * @notice Manages token lockup with vesting schedules
 * @dev Implements linear vesting with cliff period
 */
contract TokenLockup is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct LockupInfo {
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 startTime;
        uint256 cliffDuration;
        uint256 vestingDuration;
        bool revocable;
        bool revoked;
    }

    IERC20 public token;
    mapping(address => LockupInfo) public lockups;

    // Enumeration support
    address[] private beneficiaries;
    mapping(address => uint256) private beneficiaryIndex; // 1-based index (0 = not exists)

    // Constants
    uint256 public constant MAX_LOCKUPS = 100;
    uint256 public constant MAX_VESTING_DURATION = 10 * 365 days; // 10 years

    event TokensLocked(
        address indexed beneficiary,
        uint256 amount,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 vestingDuration,
        bool revocable
    );
    event TokensReleased(address indexed beneficiary, uint256 amount);
    event LockupRevoked(address indexed beneficiary, uint256 refundAmount);
    event TokenChanged(address indexed oldToken, address indexed newToken);
    event LockupDeleted(address indexed beneficiary);

    error InvalidAmount();
    error InvalidDuration();
    error InvalidBeneficiary();
    error InvalidTokenAddress();
    error SameTokenAddress();
    error LockupAlreadyExists();
    error NoLockupFound();
    error NoTokensAvailable();
    error NotRevocable();
    error AlreadyRevoked();
    error InsufficientBalance();
    error TokensStillLocked();
    error MaxLockupsReached();

    /**
     * @notice Constructor
     * @param _token Address of the ERC20 token to be locked
     * @dev Validates that token address contains contract code and implements ERC20 interface
     * @custom:security Prevents deployment with non-existent or invalid token addresses
     */
    constructor(address _token) Ownable(msg.sender) {
        if (_token == address(0)) revert InvalidTokenAddress();

        // Verify contract code exists at the address
        uint256 size;
        assembly {
            size := extcodesize(_token)
        }
        if (size == 0) revert InvalidTokenAddress();

        // Verify ERC20 interface compliance by calling totalSupply()
        try IERC20(_token).totalSupply() returns (uint256) {
            token = IERC20(_token);
        } catch {
            revert InvalidTokenAddress();
        }
    }

    /**
     * @notice Create a new lockup for a beneficiary
     * @param beneficiary Address that will receive the tokens
     * @param amount Total amount of tokens to lock
     * @param cliffDuration Duration of cliff period in seconds
     * @param vestingDuration Total vesting duration in seconds (including cliff)
     * @param revocable Whether the lockup can be revoked by owner
     */
    function createLockup(
        address beneficiary,
        uint256 amount,
        uint256 cliffDuration,
        uint256 vestingDuration,
        bool revocable
    ) external onlyOwner whenNotPaused {
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        if (amount == 0) revert InvalidAmount();
        if (vestingDuration == 0) revert InvalidDuration();
        if (vestingDuration > MAX_VESTING_DURATION) revert InvalidDuration();
        if (cliffDuration > vestingDuration) revert InvalidDuration();
        if (lockups[beneficiary].totalAmount != 0) revert LockupAlreadyExists();
        if (beneficiaries.length >= MAX_LOCKUPS) revert MaxLockupsReached();

        lockups[beneficiary] = LockupInfo({
            totalAmount: amount,
            releasedAmount: 0,
            startTime: block.timestamp,
            cliffDuration: cliffDuration,
            vestingDuration: vestingDuration,
            revocable: revocable,
            revoked: false
        });

        // Add to beneficiaries array
        beneficiaries.push(beneficiary);
        beneficiaryIndex[beneficiary] = beneficiaries.length; // 1-based index

        token.safeTransferFrom(msg.sender, address(this), amount);

        emit TokensLocked(beneficiary, amount, block.timestamp, cliffDuration, vestingDuration, revocable);
    }

    /**
     * @notice Release vested tokens to beneficiary
     * @dev Beneficiaries can claim vested tokens even after revocation.
     *      After full vesting period, all remaining tokens (including rounding dust) are released.
     *      Uses pull payment pattern for gas efficiency.
     * @custom:security Protected by ReentrancyGuard and Pausable
     */
    function release() external nonReentrant whenNotPaused {
        LockupInfo storage lockup = lockups[msg.sender];
        if (lockup.totalAmount == 0) revert NoLockupFound();

        uint256 releasable = _releasableAmount(msg.sender);
        if (releasable == 0) revert NoTokensAvailable();

        lockup.releasedAmount += releasable;
        token.safeTransfer(msg.sender, releasable);

        emit TokensReleased(msg.sender, releasable);
    }

    /**
     * @notice Revoke a lockup and return unvested tokens to owner
     * @param beneficiary Address of the beneficiary whose lockup to revoke
     * @dev Freezes vesting at current amount. Beneficiary can still claim vested tokens.
     *      Sets vestingDuration to 0 as additional safety measure.
     * @custom:security Only revocable lockups can be revoked. Cannot be revoked twice.
     *      Protected by ReentrancyGuard for defense-in-depth.
     */
    function revoke(address beneficiary) external onlyOwner whenNotPaused nonReentrant {
        LockupInfo storage lockup = lockups[beneficiary];
        if (lockup.startTime == 0) revert NoLockupFound();
        if (lockup.revoked) revert AlreadyRevoked();
        if (!lockup.revocable) revert NotRevocable();

        uint256 vested = _vestedAmount(beneficiary);
        uint256 refund = lockup.totalAmount - vested;

        lockup.revoked = true;
        // Freeze vesting at current amount by updating totalAmount
        lockup.totalAmount = vested;
        // Additional safety: make vesting calculation impossible
        lockup.vestingDuration = 0;

        if (refund > 0) {
            token.safeTransfer(owner(), refund);
        }

        emit LockupRevoked(beneficiary, refund);
    }

    /**
     * @notice Get the amount of tokens that can be released
     * @param beneficiary Address to check
     * @return Amount of releasable tokens
     */
    function releasableAmount(address beneficiary) external view returns (uint256) {
        return _releasableAmount(beneficiary);
    }

    /**
     * @notice Get the amount of vested tokens
     * @param beneficiary Address to check
     * @return Amount of vested tokens
     */
    function vestedAmount(address beneficiary) external view returns (uint256) {
        return _vestedAmount(beneficiary);
    }

    /**
     * @notice Internal function to calculate releasable amount
     * @dev At the end of vesting period, releases all remaining tokens to eliminate rounding dust
     */
    function _releasableAmount(address beneficiary) private view returns (uint256) {
        LockupInfo storage lockup = lockups[beneficiary];
        uint256 vested = _vestedAmount(beneficiary);

        // If fully vested and not revoked, release all remaining tokens (eliminates rounding errors)
        if (!lockup.revoked && block.timestamp >= lockup.startTime + lockup.vestingDuration) {
            return lockup.totalAmount - lockup.releasedAmount;
        }

        return vested - lockup.releasedAmount;
    }

    /**
     * @notice Internal function to calculate vested amount
     * @dev Uses linear vesting formula: (totalAmount × timeFromStart) / vestingDuration
     *      Note: Integer division may cause minor rounding down during vesting period.
     *      This is compensated by releasing all remaining tokens at the end.
     */
    function _vestedAmount(address beneficiary) private view returns (uint256) {
        LockupInfo memory lockup = lockups[beneficiary];

        if (lockup.totalAmount == 0) {
            return 0;
        }

        // If revoked, totalAmount is frozen at revocation time - just return it
        if (lockup.revoked) {
            return lockup.totalAmount;
        }

        if (block.timestamp < lockup.startTime + lockup.cliffDuration) {
            return 0;
        }

        if (block.timestamp >= lockup.startTime + lockup.vestingDuration) {
            return lockup.totalAmount;
        }

        uint256 timeFromStart = block.timestamp - lockup.startTime;
        return (lockup.totalAmount * timeFromStart) / lockup.vestingDuration;
    }

    /**
     * @notice Pause the contract - blocks token releases and state changes
     * @dev Only owner can pause. Used in emergency situations.
     *      Blocks: release(), createLockup(), revoke()
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract - restores normal operations
     * @dev Only owner can unpause
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Change the token address
     * @param newToken Address of the new ERC20 token
     * @dev Only owner can change token address
     *      Contract must be paused for safety
     *      Contract must have zero token balance (all lockups completed)
     * @custom:security Requires paused state and zero balance verification
     */
    function changeToken(address newToken) external onlyOwner whenPaused {
        if (newToken == address(0)) revert InvalidTokenAddress();

        address oldToken = address(token);
        if (newToken == oldToken) revert SameTokenAddress();
        if (token.balanceOf(address(this)) != 0) revert TokensStillLocked();

        token = IERC20(newToken);

        emit TokenChanged(oldToken, newToken);
    }

    /**
     * @notice Delete a completed lockup to allow address reuse
     * @param beneficiary Address of the beneficiary whose lockup to delete
     * @dev Only callable when all tokens have been released or revoked and claimed
     * @custom:security Only owner can delete. Lockup must be fully completed.
     */
    function deleteLockup(address beneficiary) external onlyOwner {
        LockupInfo storage lockup = lockups[beneficiary];
        if (lockup.totalAmount == 0) revert NoLockupFound();

        // Ensure lockup is fully completed (all tokens released)
        if (lockup.releasedAmount != lockup.totalAmount) revert TokensStillLocked();

        // Remove from beneficiaries array using swap and pop
        uint256 index = beneficiaryIndex[beneficiary] - 1; // Convert to 0-based
        uint256 lastIndex = beneficiaries.length - 1;

        // Security: Validate index bounds and synchronization
        if (index > lastIndex) revert InvalidBeneficiary();
        if (beneficiaries[index] != beneficiary) revert InvalidBeneficiary();

        if (index != lastIndex) {
            address lastBeneficiary = beneficiaries[lastIndex];
            beneficiaries[index] = lastBeneficiary;
            beneficiaryIndex[lastBeneficiary] = index + 1; // Update to 1-based
        }

        beneficiaries.pop();
        delete beneficiaryIndex[beneficiary];
        delete lockups[beneficiary];

        emit LockupDeleted(beneficiary);
    }

    /**
     * @notice Get the total number of active lockups
     * @return Number of beneficiaries with active lockups
     */
    function getLockupCount() external view returns (uint256) {
        return beneficiaries.length;
    }

    /**
     * @notice Get all beneficiary addresses
     * @return Array of all beneficiary addresses
     */
    function getAllBeneficiaries() external view returns (address[] memory) {
        return beneficiaries;
    }

    /**
     * @notice Get all lockups information
     * @return addresses Array of beneficiary addresses
     * @return lockupInfos Array of corresponding lockup information
     *
     * @dev View function - free to call externally, but consumes gas if called internally
     *
     * @custom:gas-warning Gas cost scales with number of lockups:
     *   - 10 lockups: ~50,000 gas
     *   - 50 lockups: ~250,000 gas
     *   - 100 lockups: ~500,000 gas
     *
     * @custom:recommendation For production integrations with many lockups,
     *   use getLockupsPaginated() to avoid potential gas limit issues.
     *   Block gas limit on Polygon: 30,000,000 gas
     */
    function getAllLockups() external view returns (address[] memory addresses, LockupInfo[] memory lockupInfos) {
        uint256 count = beneficiaries.length;
        addresses = new address[](count);
        lockupInfos = new LockupInfo[](count);

        for (uint256 i = 0; i < count; i++) {
            addresses[i] = beneficiaries[i];
            lockupInfos[i] = lockups[beneficiaries[i]];
        }

        return (addresses, lockupInfos);
    }

    /**
     * @notice Get lockups information with pagination
     * @param offset Starting index (0-based)
     * @param limit Maximum number of results to return
     * @return addresses Array of beneficiary addresses
     * @return lockupInfos Array of corresponding lockup information
     * @dev Use this function to avoid gas limit issues with large numbers of lockups
     */
    function getLockupsPaginated(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory addresses, LockupInfo[] memory lockupInfos) {
        uint256 count = beneficiaries.length;

        if (offset >= count) {
            return (new address[](0), new LockupInfo[](0));
        }

        // Security: Prevent overflow in pagination calculation
        if (limit > type(uint256).max - offset) revert InvalidAmount();

        uint256 end = offset + limit;
        if (end > count) {
            end = count;
        }

        uint256 resultCount = end - offset;
        addresses = new address[](resultCount);
        lockupInfos = new LockupInfo[](resultCount);

        for (uint256 i = 0; i < resultCount; i++) {
            addresses[i] = beneficiaries[offset + i];
            lockupInfos[i] = lockups[beneficiaries[offset + i]];
        }

        return (addresses, lockupInfos);
    }
}
