// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MemeToken} from "./MemeToken.sol";
import {BondingCurveV2} from "./BondingCurveV2.sol";

/**
 * @title MemeFactoryV2
 * @notice v2 factory. Per-token configurable max supply and trade fee.
 *
 * What changed vs v1:
 *   - createToken() now accepts maxSupply and tradeFeeBps params
 *   - Deploys BondingCurveV2 with creator + protocol + fee
 *   - Owner of factory is the protocol address (collects 20% of trade fees per curve)
 *
 * Safety caps:
 *   - maxSupply: between 1_000 tokens and 1_000_000_000_000 tokens (1K..1T)
 *   - tradeFeeBps: 0..500 (0%..5%)
 *
 * Curve slope is still hardcoded — same linear math as v1.
 */
contract MemeFactoryV2 is Ownable {
    uint256 public createFee = 1e18; // 1 USDC launch fee
    uint256 public constant DEFAULT_START_PRICE = 0;
    uint256 public constant DEFAULT_SLOPE = 1e9;

    uint256 public constant MIN_MAX_SUPPLY = 1_000 * 1e18; // 1K tokens
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

        BondingCurveV2 newCurve =
            new BondingCurveV2(DEFAULT_START_PRICE, DEFAULT_SLOPE, maxSupply, msg.sender, owner(), tradeFeeBps);

        MemeToken newToken = new MemeToken(name, symbol, imageURI, description, maxSupply, address(newCurve));

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
            id, address(newToken), msg.sender, address(newCurve), name, symbol, imageURI, maxSupply, tradeFeeBps
        );

        uint256 refund = msg.value - createFee;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
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

    function tokensBatch(uint256 offset, uint256 limit) external view returns (TokenInfo[] memory) {
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
        (bool ok,) = to.call{value: balance}("");
        if (!ok) revert TransferFailed();
    }
}
