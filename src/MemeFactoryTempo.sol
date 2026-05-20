// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MemeToken} from "./MemeToken.sol";
import {BondingCurveV2} from "./BondingCurveV2.sol";

/**
 * @title MemeFactoryTempo
 * @notice Tempo-mainnet variant of MemeFactoryV2.
 *
 * Why a separate contract: Arc Network's native gas (USDC) uses 18 decimals,
 * but Tempo's native gas (USDC.e) uses 6 decimals. The curve math and the
 * launch fee both need to be re-scaled or the numbers blow up by 10^12.
 *
 * Re-scaled constants for Tempo (USDC.e, 6 decimals):
 *   - createFee: 0.01 USDC.e (10_000 wei)
 *   - DEFAULT_SLOPE: 1 (vs 1e9 on Arc) — gives ~0.005 USDC.e to buy 100 tokens
 *   - DEFAULT_START_PRICE: 0 (same)
 *   - MIN/MAX supply, fee cap: same logical values as Arc
 *
 * Everything else (deploy curve + token, register, refund excess gas, fee
 * split) is identical to MemeFactoryV2.
 */
contract MemeFactoryTempo is Ownable {
    // 0.01 USDC.e (USDC.e has 6 decimals on Tempo).
    uint256 public createFee = 10_000;

    uint256 public constant DEFAULT_START_PRICE = 0;
    // Slope = 1 wei USDC.e per token². With 6-decimal gas, buying 100 tokens
    // costs ~5_000 wei = 0.005 USDC.e. Buying 1_000 costs ~0.5 USDC.e.
    uint256 public constant DEFAULT_SLOPE = 1;

    uint256 public constant MIN_MAX_SUPPLY = 1_000 * 1e18; // 1K tokens (token wei, 18 dec)
    uint256 public constant MAX_MAX_SUPPLY = 1_000_000_000_000 * 1e18; // 1T tokens
    uint16 public constant MAX_TRADE_FEE_BPS = 500; // 5% cap

    struct TokenInfo {
        address token;
        address curve;
        address creator;
        string name;
        string symbol;
        string imageURI;
        uint256 createdAt;
        uint256 maxSupply;
        uint16 tradeFeeBps;
    }

    TokenInfo[] public tokens;
    mapping(address => address) public curveOf;

    event TokenCreated(
        uint256 indexed id,
        address indexed token,
        address indexed creator,
        address curve,
        string name,
        string symbol,
        string imageURI,
        uint256 maxSupply,
        uint16 tradeFeeBps
    );

    event CreateFeeUpdated(uint256 newFee);

    error InsufficientFee();
    error TransferFailed();
    error MaxSupplyOutOfRange();
    error TradeFeeTooHigh();

    constructor() Ownable(msg.sender) {}

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256 maxSupply,
        uint16 tradeFeeBps
    ) external payable returns (address token, address curve) {
        if (msg.value < createFee) revert InsufficientFee();
        if (maxSupply < MIN_MAX_SUPPLY || maxSupply > MAX_MAX_SUPPLY) {
            revert MaxSupplyOutOfRange();
        }
        if (tradeFeeBps > MAX_TRADE_FEE_BPS) revert TradeFeeTooHigh();

        BondingCurveV2 newCurve = new BondingCurveV2(
            DEFAULT_START_PRICE,
            DEFAULT_SLOPE,
            maxSupply,
            msg.sender,
            owner(),
            tradeFeeBps
        );

        MemeToken newToken = new MemeToken(
            name,
            symbol,
            imageURI,
            description,
            maxSupply,
            address(newCurve)
        );

        newCurve.setMemeToken(address(newToken));

        uint256 id = tokens.length;
        tokens.push(
            TokenInfo({
                token: address(newToken),
                curve: address(newCurve),
                creator: msg.sender,
                name: name,
                symbol: symbol,
                imageURI: imageURI,
                createdAt: block.timestamp,
                maxSupply: maxSupply,
                tradeFeeBps: tradeFeeBps
            })
        );
        curveOf[address(newToken)] = address(newCurve);

        emit TokenCreated(
            id,
            address(newToken),
            msg.sender,
            address(newCurve),
            name,
            symbol,
            imageURI,
            maxSupply,
            tradeFeeBps
        );

        uint256 refund = msg.value - createFee;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            if (!ok) revert TransferFailed();
        }

        return (address(newToken), address(newCurve));
    }

    // ============ View ============

    function totalTokens() external view returns (uint256) {
        return tokens.length;
    }

    function tokenAt(uint256 index) external view returns (TokenInfo memory) {
        return tokens[index];
    }

    function tokensBatch(uint256 offset, uint256 limit)
        external
        view
        returns (TokenInfo[] memory)
    {
        uint256 total = tokens.length;
        if (offset >= total) return new TokenInfo[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 size = end - offset;

        TokenInfo[] memory result = new TokenInfo[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = tokens[offset + i];
        }
        return result;
    }

    // ============ Admin ============

    function setCreateFee(uint256 newFee) external onlyOwner {
        createFee = newFee;
        emit CreateFeeUpdated(newFee);
    }

    function withdrawLaunchFees(address payable to) external onlyOwner {
        uint256 balance = address(this).balance;
        (bool ok, ) = to.call{value: balance}("");
        if (!ok) revert TransferFailed();
    }
}
