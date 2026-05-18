// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMemeToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function totalSupply() external view returns (uint256);
}

/**
 * @title BondingCurveV2
 * @notice Linear bonding curve with creator + protocol fee split.
 * @dev v2 of BondingCurve. Adds:
 *   - Configurable tradeFeeBps (per-curve, set at deploy)
 *   - Fee split: 80% creator, 20% protocol
 *   - Creator and protocol can claim accrued fees independently
 *   - All other math identical to v1
 *
 * Fee math (basis points, 10000 = 100%):
 *   tradeFeeBps  : 0..500 (0%..5%, enforced by Factory)
 *   creator share: 80% of fee
 *   protocol share: 20% of fee
 *
 * Buy: user pays cost + fee. cost is added to reserve; fee is split.
 * Sell: refund = quote - fee. Fee is split. Reserve drops by full quote.
 */
contract BondingCurveV2 {
    IMemeToken public memeToken;

    uint256 public immutable startPrice;
    uint256 public immutable slope;
    uint256 public immutable maxSupply;

    address public immutable creator;
    address public immutable protocol;
    uint16 public immutable tradeFeeBps;

    uint16 public constant CREATOR_SHARE_BPS = 8000; // 80%
    uint16 public constant PROTOCOL_SHARE_BPS = 2000; // 20%
    uint16 public constant FEE_DENOMINATOR = 10000;

    uint256 public reserve; // USDC wei held to back the curve (no fees mixed in)
    uint256 public creatorFeesAccrued;
    uint256 public protocolFeesAccrued;

    event Buy(
        address indexed buyer,
        uint256 tokensOut,
        uint256 usdcIn,
        uint256 fee
    );
    event Sell(
        address indexed seller,
        uint256 tokensIn,
        uint256 usdcOut,
        uint256 fee
    );
    event CreatorFeesClaimed(address indexed to, uint256 amount);
    event ProtocolFeesClaimed(address indexed to, uint256 amount);

    error AlreadySet();
    error NotInitialized();
    error InvalidAmount();
    error MaxSupplyReached();
    error InsufficientPayment();
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
        uint16 tradeFeeBps_
    ) {
        startPrice = startPrice_;
        slope = slope_;
        maxSupply = maxSupply_;
        creator = creator_;
        protocol = protocol_;
        tradeFeeBps = tradeFeeBps_;
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

    /// @notice Fee charged for a hypothetical trade of `amount` tokens at current state.
    function feeFor(uint256 amount, bool isBuy) external view returns (uint256) {
        uint256 base = isBuy ? getBuyCost(amount) : getSellReturn(amount);
        return (base * tradeFeeBps) / FEE_DENOMINATOR;
    }

    // ============ Mutate ============

    function buy(uint256 amount) external payable {
        if (memeToken.totalSupply() + amount > maxSupply) revert MaxSupplyReached();

        uint256 cost = getBuyCost(amount);
        uint256 fee = (cost * tradeFeeBps) / FEE_DENOMINATOR;
        uint256 total = cost + fee;

        if (msg.value < total) revert InsufficientPayment();

        reserve += cost;

        if (fee > 0) {
            uint256 creatorCut = (fee * CREATOR_SHARE_BPS) / FEE_DENOMINATOR;
            creatorFeesAccrued += creatorCut;
            protocolFeesAccrued += (fee - creatorCut);
        }

        memeToken.mint(msg.sender, amount);

        uint256 refund = msg.value - total;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            if (!ok) revert TransferFailed();
        }

        emit Buy(msg.sender, amount, cost, fee);
    }

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

        (bool ok, ) = msg.sender.call{value: netRefund}("");
        if (!ok) revert TransferFailed();

        emit Sell(msg.sender, amount, netRefund, fee);
    }

    // ============ Fee claims ============

    function claimCreatorFees(address payable to) external {
        if (msg.sender != creator) revert OnlyCreator();
        uint256 amount = creatorFeesAccrued;
        if (amount == 0) revert NothingToClaim();

        creatorFeesAccrued = 0;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit CreatorFeesClaimed(to, amount);
    }

    function claimProtocolFees(address payable to) external {
        if (msg.sender != protocol) revert OnlyProtocol();
        uint256 amount = protocolFeesAccrued;
        if (amount == 0) revert NothingToClaim();

        protocolFeesAccrued = 0;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit ProtocolFeesClaimed(to, amount);
    }

    receive() external payable {}
}
