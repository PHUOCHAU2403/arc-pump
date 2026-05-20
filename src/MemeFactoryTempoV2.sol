// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MemeToken} from "./MemeToken.sol";
import {BondingCurveTempoV2} from "./BondingCurveTempoV2.sol";

/**
 * @title MemeFactoryTempoV2
 * @notice Tempo-native variant of Arc Pump's MemeFactoryV2.
 *
 * Tempo's EVM disables msg.value, so:
 *   - createFee is collected via approve+transferFrom of feeToken (USDC.e)
 *   - The deployed BondingCurveTempoV2 follows the same pattern for trades
 *
 * Constants tuned for USDC.e (6 decimals):
 *   - createFee: 10_000 wei = 0.01 USDC.e
 *   - DEFAULT_SLOPE: 1 (USDC.e wei per token²) — buy 1K tokens ~= 0.5 USDC.e
 *   - DEFAULT_START_PRICE: 0
 *
 * Caller flow:
 *   1. usdcE.approve(factory, createFee)
 *   2. factory.createToken(...)
 */
contract MemeFactoryTempoV2 is Ownable {
    IERC20 public immutable feeToken;
    address public immutable feeTokenAddr; // cached for cheaper passing to curves

    uint256 public createFee = 10_000; // 0.01 USDC.e

    uint256 public constant DEFAULT_START_PRICE = 0;
    uint256 public constant DEFAULT_SLOPE = 1;

    uint256 public constant MIN_MAX_SUPPLY = 1_000 * 1e18;
    uint256 public constant MAX_MAX_SUPPLY = 1_000_000_000_000 * 1e18;
    uint16 public constant MAX_TRADE_FEE_BPS = 500;

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

    error TransferFailed();
    error MaxSupplyOutOfRange();
    error TradeFeeTooHigh();

    constructor(address feeToken_) Ownable(msg.sender) {
        feeToken = IERC20(feeToken_);
        feeTokenAddr = feeToken_;
    }

    /// @notice Deploy a fresh meme token + bonding curve pair.
    /// @dev Caller must `feeToken.approve(factory, createFee)` first.
    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256 maxSupply,
        uint16 tradeFeeBps
    ) external returns (address token, address curve) {
        if (maxSupply < MIN_MAX_SUPPLY || maxSupply > MAX_MAX_SUPPLY) {
            revert MaxSupplyOutOfRange();
        }
        if (tradeFeeBps > MAX_TRADE_FEE_BPS) revert TradeFeeTooHigh();

        // Pull the launch fee. Reverts on insufficient allowance / balance.
        if (createFee > 0) {
            bool ok = feeToken.transferFrom(msg.sender, address(this), createFee);
            if (!ok) revert TransferFailed();
        }

        BondingCurveTempoV2 newCurve = new BondingCurveTempoV2(
            DEFAULT_START_PRICE,
            DEFAULT_SLOPE,
            maxSupply,
            msg.sender,
            owner(),
            tradeFeeBps,
            feeTokenAddr
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

    function withdrawLaunchFees(address to) external onlyOwner {
        uint256 bal = feeToken.balanceOf(address(this));
        if (bal == 0) return;
        bool ok = feeToken.transfer(to, bal);
        if (!ok) revert TransferFailed();
    }
}
