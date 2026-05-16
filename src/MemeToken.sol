// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MemeToken
 * @notice Simple ERC-20 token launched via ARC.PUMP bonding curve.
 * @dev Mint/burn restricted to its paired BondingCurve.
 */
contract MemeToken is ERC20 {
    address public immutable bondingCurve;
    uint256 public immutable MAX_SUPPLY;

    string public imageURI;
    string public description;

    error OnlyBondingCurve();
    error MaxSupplyExceeded();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory imageURI_,
        string memory description_,
        uint256 maxSupply_,
        address bondingCurve_
    ) ERC20(name_, symbol_) {
        imageURI = imageURI_;
        description = description_;
        MAX_SUPPLY = maxSupply_;
        bondingCurve = bondingCurve_;
    }

    /// @notice Curve mints tokens to buyers. Only curve can call.
    function mint(address to, uint256 amount) external {
        if (msg.sender != bondingCurve) revert OnlyBondingCurve();
        if (totalSupply() + amount > MAX_SUPPLY) revert MaxSupplyExceeded();
        _mint(to, amount);
    }

    /// @notice Curve burns tokens when sellers sell back. Only curve can call.
    function burn(address from, uint256 amount) external {
        if (msg.sender != bondingCurve) revert OnlyBondingCurve();
        _burn(from, amount);
    }
}
