// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMemeToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function totalSupply() external view returns (uint256);
}

/**
 * @title BondingCurveTempoV2
 * @notice Tempo-native bonding curve. Uses approve+transferFrom for buys
 *         and TIP-20 transfer for sells/claims, because Tempo's EVM
 *         disables msg.value, payable, BALANCE, and SELFBALANCE opcodes.
 *
 * Math is identical to BondingCurveV2 — only the payment plumbing differs:
 *   buy:  user must approve `cost + fee` of feeToken, curve pulls it via
 *         transferFrom. Cost goes into `reserve`, fee splits 80/20.
 *   sell: curve burns the user's tokens, then transfers `gross - fee`
 *         feeToken back to user. Fee splits 80/20.
 *   claim: creator/protocol pulls accrued fees out as TIP-20 transfer.
 *
 * `reserve` is a manual counter — we cannot read SELFBALANCE on Tempo.
 */
contract BondingCurveTempoV2 {
    IMemeToken public memeToken;
    IERC20 public immutable feeToken; // USDC.e (TIP-20) on Tempo

    uint256 public immutable startPrice;
    uint256 public immutable slope;
    uint256 public immutable maxSupply;

    address public immutable creator;
    address public immutable protocol;
    uint16 public immutable tradeFeeBps;

    uint16 public constant CREATOR_SHARE_BPS = 8000; // 80%
    uint16 public constant PROTOCOL_SHARE_BPS = 2000; // 20%
    uint16 public constant FEE_DENOMINATOR = 10000;

    uint256 public reserve; // feeToken backing the curve (no fees mixed in)
    uint256 public creatorFeesAccrued;
    uint256 public protocolFeesAccrued;

    event Buy(address indexed buyer, uint256 tokensOut, uint256 feeIn, uint256 fee);
    event Sell(address indexed seller, uint256 tokensIn, uint256 feeOut, uint256 fee);
    event CreatorFeesClaimed(address indexed to, uint256 amount);
    event ProtocolFeesClaimed(address indexed to, uint256 amount);

    error AlreadySet();
    error NotInitialized();
    error InvalidAmount();
    error MaxSupplyReached();
    error InsufficientLiquidity();
    error TransferFailed();
    error OnlyCreator();
    error OnlyProtocol();
    error NothingToClaim();

    constructor(
        uint256 startPrice_,
        uint256 slope_,
        uint256 maxSupply_,
        address creator_,
        address protocol_,
        uint16 tradeFeeBps_,
        address feeToken_
    ) {
        startPrice = startPrice_;
        slope = slope_;
        maxSupply = maxSupply_;
        creator = creator_;
        protocol = protocol_;
        tradeFeeBps = tradeFeeBps_;
        feeToken = IERC20(feeToken_);
    }

    function setMemeToken(address token) external {
        if (address(memeToken) != address(0)) revert AlreadySet();
        memeToken = IMemeToken(token);
    }

    // ============ View ============

    function getBuyCost(uint256 amount) public view returns (uint256) {
        if (address(memeToken) == address(0)) revert NotInitialized();
        if (amount == 0 || amount % 1e18 != 0) revert InvalidAmount();

        uint256 n = amount / 1e18;
        uint256 s = memeToken.totalSupply() / 1e18;
        return n * startPrice + slope * (n * s + (n * (n - 1)) / 2);
    }

    function getSellReturn(uint256 amount) public view returns (uint256) {
        if (address(memeToken) == address(0)) revert NotInitialized();
        if (amount == 0 || amount % 1e18 != 0) revert InvalidAmount();

        uint256 n = amount / 1e18;
        uint256 s = memeToken.totalSupply() / 1e18;
        if (s < n) revert InvalidAmount();
        return n * startPrice + (slope * n * (2 * s - n - 1)) / 2;
    }

    function spotPrice() external view returns (uint256) {
        if (address(memeToken) == address(0)) return startPrice;
        uint256 s = memeToken.totalSupply() / 1e18;
        return startPrice + slope * s;
    }

    function feeFor(uint256 amount, bool isBuy) external view returns (uint256) {
        uint256 base = isBuy ? getBuyCost(amount) : getSellReturn(amount);
        return (base * tradeFeeBps) / FEE_DENOMINATOR;
    }

    // ============ Mutate ============

    /// @notice Buy `amount` of meme tokens by paying `cost + fee` USDC.e.
    /// @dev Caller must `feeToken.approve(curve, cost + fee)` beforehand.
    function buy(uint256 amount) external {
        if (memeToken.totalSupply() + amount > maxSupply) revert MaxSupplyReached();

        uint256 cost = getBuyCost(amount);
        uint256 fee = (cost * tradeFeeBps) / FEE_DENOMINATOR;
        uint256 total = cost + fee;

        // Pull USDC.e from the buyer. Reverts if not approved or insufficient.
        bool ok = feeToken.transferFrom(msg.sender, address(this), total);
        if (!ok) revert TransferFailed();

        reserve += cost;

        if (fee > 0) {
            uint256 creatorCut = (fee * CREATOR_SHARE_BPS) / FEE_DENOMINATOR;
            creatorFeesAccrued += creatorCut;
            protocolFeesAccrued += (fee - creatorCut);
        }

        memeToken.mint(msg.sender, amount);

        emit Buy(msg.sender, amount, cost, fee);
    }

    /// @notice Sell `amount` meme tokens back to the curve.
    /// @dev Caller does NOT need to approve their meme tokens to the curve —
    ///      the curve calls `memeToken.burn(msg.sender, amount)` directly.
    function sell(uint256 amount) external {
        uint256 grossRefund = getSellReturn(amount);
        if (grossRefund > reserve) revert InsufficientLiquidity();

        uint256 fee = (grossRefund * tradeFeeBps) / FEE_DENOMINATOR;
        uint256 netRefund = grossRefund - fee;

        memeToken.burn(msg.sender, amount);
        reserve -= grossRefund;

        if (fee > 0) {
            uint256 creatorCut = (fee * CREATOR_SHARE_BPS) / FEE_DENOMINATOR;
            creatorFeesAccrued += creatorCut;
            protocolFeesAccrued += (fee - creatorCut);
        }

        bool ok = feeToken.transfer(msg.sender, netRefund);
        if (!ok) revert TransferFailed();

        emit Sell(msg.sender, amount, netRefund, fee);
    }

    // ============ Fee claims ============

    function claimCreatorFees(address to) external {
        if (msg.sender != creator) revert OnlyCreator();
        uint256 amount = creatorFeesAccrued;
        if (amount == 0) revert NothingToClaim();

        creatorFeesAccrued = 0;
        bool ok = feeToken.transfer(to, amount);
        if (!ok) revert TransferFailed();

        emit CreatorFeesClaimed(to, amount);
    }

    function claimProtocolFees(address to) external {
        if (msg.sender != protocol) revert OnlyProtocol();
        uint256 amount = protocolFeesAccrued;
        if (amount == 0) revert NothingToClaim();

        protocolFeesAccrued = 0;
        bool ok = feeToken.transfer(to, amount);
        if (!ok) revert TransferFailed();

        emit ProtocolFeesClaimed(to, amount);
    }
}
