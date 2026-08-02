// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {REISTFounderVesting} from "./REISTFounderVesting.sol";

/// @title REIST Research Token
/// @notice Fixed-supply ERC-20 for transparent rewards in the REIST Division research ecosystem.
/// @dev The token is separate from the mathematical REIST Division framework. It has no owner,
///      minting, pausing, tax, blacklist, upgrade, or transfer-hook functionality.
contract REISTToken is ERC20 {
    uint256 public constant MAX_SUPPLY = 1_000_000 ether;
    uint256 public constant RESEARCH_REWARDS_ALLOCATION = 700_000 ether;
    uint256 public constant ECOSYSTEM_TREASURY_ALLOCATION = 200_000 ether;
    uint256 public constant FOUNDER_ALLOCATION = 100_000 ether;

    REISTFounderVesting public immutable founderVesting;
    address public immutable researchRewardsTreasury;
    address public immutable ecosystemTreasury;

    error InvalidAllocationAddress();
    error DuplicateAllocationAddress();
    error DeployerIsAllocationRecipient();

    /// @param founderBeneficiary Beneficiary of the locked founder allocation.
    /// @param researchRewardsTreasury_ Treasury for reviewed research and implementation rewards.
    /// @param ecosystemTreasury_ Treasury for documented project operations and ecosystem work.
    constructor(
        address founderBeneficiary,
        address researchRewardsTreasury_,
        address ecosystemTreasury_
    ) ERC20("REIST Research Token", "REIST") {
        if (
            founderBeneficiary == address(0) ||
            researchRewardsTreasury_ == address(0) ||
            ecosystemTreasury_ == address(0)
        ) {
            revert InvalidAllocationAddress();
        }

        if (
            founderBeneficiary == msg.sender ||
            researchRewardsTreasury_ == msg.sender ||
            ecosystemTreasury_ == msg.sender
        ) {
            revert DeployerIsAllocationRecipient();
        }

        if (
            founderBeneficiary == researchRewardsTreasury_ ||
            founderBeneficiary == ecosystemTreasury_ ||
            researchRewardsTreasury_ == ecosystemTreasury_
        ) {
            revert DuplicateAllocationAddress();
        }

        researchRewardsTreasury = researchRewardsTreasury_;
        ecosystemTreasury = ecosystemTreasury_;
        founderVesting = new REISTFounderVesting(
            founderBeneficiary,
            uint64(block.timestamp)
        );

        _mint(researchRewardsTreasury_, RESEARCH_REWARDS_ALLOCATION);
        _mint(ecosystemTreasury_, ECOSYSTEM_TREASURY_ALLOCATION);
        _mint(address(founderVesting), FOUNDER_ALLOCATION);

        assert(totalSupply() == MAX_SUPPLY);
    }
}
