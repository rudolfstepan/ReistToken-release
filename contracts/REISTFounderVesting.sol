// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";
import {VestingWalletCliff} from "@openzeppelin/contracts/finance/VestingWalletCliff.sol";

/// @title REIST Founder Vesting
/// @notice Holds the founder allocation for a three-year linear schedule with a one-year cliff.
/// @dev At the cliff, one third is vested because the linear schedule starts at deployment.
contract REISTFounderVesting is VestingWalletCliff {
    uint64 public constant CLIFF_DURATION = 365 days;
    uint64 public constant VESTING_DURATION = 3 * 365 days;

    error OwnershipRenunciationDisabled();

    constructor(address beneficiary, uint64 startTimestamp)
        VestingWallet(beneficiary, startTimestamp, VESTING_DURATION)
        VestingWalletCliff(CLIFF_DURATION)
    {}

    /// @notice Prevents accidental permanent locking of unreleased tokens.
    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }
}
