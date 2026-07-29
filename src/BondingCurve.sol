// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMemeToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function totalSupply() external view returns (uint256);
}

/**
 * @title BondingCurve
 * @notice Linear bonding curve: price(supply) = startPrice + slope * supply.
 * @dev Holds native USDC (Arc native gas). Mints / burns paired MemeToken.
 *
 * Math (whole tokens, where 1 token = 1e18 wei):
 *   Cost to buy n tokens at current supply s:
 *     cost = n * startPrice + slope * (n * s + n*(n-1)/2)
 *
 *   Refund for selling n tokens at current supply s:
 *     refund = n * startPrice + slope * n * (2s - n - 1) / 2
 */
contract BondingCurve {
    IMemeToken public memeToken;

    uint256 public immutable startPrice; // USDC wei per 1 whole token at supply=0
    uint256 public immutable slope; // USDC wei increase per token-sold
    uint256 public immutable maxSupply; // total tokens in wei available on the curve

    uint256 public reserve; // USDC wei currently held by the curve

    event Buy(address indexed buyer, uint256 tokensOut, uint256 usdcIn);
    event Sell(address indexed seller, uint256 tokensIn, uint256 usdcOut);

    error AlreadySet();
    error NotInitialized();
    error InvalidAmount();
    error MaxSupplyReached();
    error InsufficientPayment();
    error InsufficientLiquidity();
    error TransferFailed();

    constructor(uint256 startPrice_, uint256 slope_, uint256 maxSupply_) {
        startPrice = startPrice_;
        slope = slope_;
        maxSupply = maxSupply_;
    }

    /// @notice Wire up the paired MemeToken. Callable once by Factory.
    function setMemeToken(address token) external {
        if (address(memeToken) != address(0)) revert AlreadySet();
        memeToken = IMemeToken(token);
    }

    // ============ View ============

    /// @notice USDC wei required to buy `amount` wei of MemeToken.
    function getBuyCost(uint256 amount) public view returns (uint256) {
        if (address(memeToken) == address(0)) revert NotInitialized();
        if (amount == 0 || amount % 1e18 != 0) revert InvalidAmount();

        uint256 n = amount / 1e18;
        uint256 s = memeToken.totalSupply() / 1e18;

        // cost = n * startPrice + slope * (n*s + n*(n-1)/2)
        return n * startPrice + slope * (n * s + (n * (n - 1)) / 2);
    }

    /// @notice USDC wei refunded for selling `amount` wei of MemeToken.
    function getSellReturn(uint256 amount) public view returns (uint256) {
        if (address(memeToken) == address(0)) revert NotInitialized();
        if (amount == 0 || amount % 1e18 != 0) revert InvalidAmount();

        uint256 n = amount / 1e18;
        uint256 s = memeToken.totalSupply() / 1e18;
        if (s < n) revert InvalidAmount();

        // refund = n * startPrice + slope * n * (2s - n - 1) / 2
        return n * startPrice + (slope * n * (2 * s - n - 1)) / 2;
    }

    /// @notice Current spot price (USDC wei per 1 whole token).
    function spotPrice() external view returns (uint256) {
        if (address(memeToken) == address(0)) return startPrice;
        uint256 s = memeToken.totalSupply() / 1e18;
        return startPrice + slope * s;
    }

    // ============ Mutate ============

    /// @notice Buy `amount` wei of MemeToken by sending native USDC.
    function buy(uint256 amount) external payable {
        if (memeToken.totalSupply() + amount > maxSupply) revert MaxSupplyReached();

        uint256 cost = getBuyCost(amount);
        if (msg.value < cost) revert InsufficientPayment();

        reserve += cost;
        memeToken.mint(msg.sender, amount);

        // Refund excess native USDC to buyer.
        uint256 refund = msg.value - cost;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert TransferFailed();
        }

        emit Buy(msg.sender, amount, cost);
    }

    /// @notice Sell `amount` wei of MemeToken back to the curve.
    function sell(uint256 amount) external {
        uint256 refund = getSellReturn(amount);
        if (refund > reserve) revert InsufficientLiquidity();

        memeToken.burn(msg.sender, amount);
        reserve -= refund;

        (bool ok,) = msg.sender.call{value: refund}("");
        if (!ok) revert TransferFailed();

        emit Sell(msg.sender, amount, refund);
    }

    receive() external payable {}
}
