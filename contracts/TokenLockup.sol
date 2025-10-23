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

    IERC20 public immutable token;
    mapping(address => LockupInfo) public lockups;

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

    error InvalidAmount();
    error InvalidDuration();
    error InvalidBeneficiary();
    error LockupAlreadyExists();
    error NoLockupFound();
    error NoTokensAvailable();
    error NotRevocable();
    error AlreadyRevoked();
    error InsufficientBalance();

    /**
     * @notice Constructor
     * @param _token Address of the ERC20 token to be locked
     */
    constructor(address _token) Ownable(msg.sender) {
        if (_token == address(0)) revert InvalidBeneficiary();
        token = IERC20(_token);
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
    ) external onlyOwner {
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        if (amount == 0) revert InvalidAmount();
        if (vestingDuration == 0) revert InvalidDuration();
        if (cliffDuration > vestingDuration) revert InvalidDuration();
        if (lockups[beneficiary].totalAmount != 0) revert LockupAlreadyExists();

        lockups[beneficiary] = LockupInfo({
            totalAmount: amount,
            releasedAmount: 0,
            startTime: block.timestamp,
            cliffDuration: cliffDuration,
            vestingDuration: vestingDuration,
            revocable: revocable,
            revoked: false
        });

        token.safeTransferFrom(msg.sender, address(this), amount);

        emit TokensLocked(
            beneficiary,
            amount,
            block.timestamp,
            cliffDuration,
            vestingDuration,
            revocable
        );
    }

    /**
     * @notice Release vested tokens to beneficiary
     * @dev Beneficiaries can claim vested tokens even after revocation
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
     */
    function revoke(address beneficiary) external onlyOwner {
        LockupInfo storage lockup = lockups[beneficiary];
        if (lockup.startTime == 0) revert NoLockupFound();
        if (lockup.revoked) revert AlreadyRevoked();
        if (!lockup.revocable) revert NotRevocable();

        uint256 vested = _vestedAmount(beneficiary);
        uint256 refund = lockup.totalAmount - vested;

        lockup.revoked = true;
        // Freeze vesting at current amount by updating totalAmount
        lockup.totalAmount = vested;

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
     */
    function _releasableAmount(address beneficiary) private view returns (uint256) {
        return _vestedAmount(beneficiary) - lockups[beneficiary].releasedAmount;
    }

    /**
     * @notice Internal function to calculate vested amount
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
     * @notice Pause the contract - blocks token releases
     * @dev Only owner can pause. Used in emergency situations.
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
}
