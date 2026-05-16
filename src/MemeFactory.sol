// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MemeToken} from "./MemeToken.sol";
import {BondingCurve} from "./BondingCurve.sol";

/**
 * @title MemeFactory
 * @notice Deploys (MemeToken + BondingCurve) pairs. Charges a flat USDC fee per launch.
 * @dev Uses native USDC (Arc's native gas token) for fees and trading.
 */
contract MemeFactory is Ownable {
    /// @notice Native USDC fee charged per token launch (default: 1 USDC).
    uint256 public createFee = 1e18;

    // Default curve params — tune for desired pump dynamics.
    uint256 public constant DEFAULT_START_PRICE = 0;
    uint256 public constant DEFAULT_SLOPE = 1e9;
    uint256 public constant DEFAULT_MAX_SUPPLY = 1_000_000 * 1e18; // 1M tokens

    struct TokenInfo {
        address token;
        address curve;
        address creator;
        string name;
        string symbol;
        string imageURI;
        uint256 createdAt;
    }

    TokenInfo[] public tokens;
    mapping(address => address) public curveOf; // memeToken => bondingCurve

    event TokenCreated(
        uint256 indexed id,
        address indexed token,
        address indexed creator,
        address curve,
        string name,
        string symbol,
        string imageURI
    );

    event CreateFeeUpdated(uint256 newFee);

    error InsufficientFee();
    error TransferFailed();

    constructor() Ownable(msg.sender) {}

    /// @notice Launch a new MemeToken + paired BondingCurve.
    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description
    ) external payable returns (address token, address curve) {
        if (msg.value < createFee) revert InsufficientFee();

        // 1. Deploy BondingCurve first (needs to exist before MemeToken can reference it).
        BondingCurve newCurve = new BondingCurve(
            DEFAULT_START_PRICE,
            DEFAULT_SLOPE,
            DEFAULT_MAX_SUPPLY
        );

        // 2. Deploy MemeToken bound to that curve.
        MemeToken newToken = new MemeToken(
            name,
            symbol,
            imageURI,
            description,
            DEFAULT_MAX_SUPPLY,
            address(newCurve)
        );

        // 3. Wire curve to know about its token.
        newCurve.setMemeToken(address(newToken));

        // 4. Track in registry.
        uint256 id = tokens.length;
        tokens.push(
            TokenInfo({
                token: address(newToken),
                curve: address(newCurve),
                creator: msg.sender,
                name: name,
                symbol: symbol,
                imageURI: imageURI,
                createdAt: block.timestamp
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
            imageURI
        );

        // 5. Refund any excess payment beyond createFee.
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

    /// @notice Paginated read for frontend. Returns at most `limit` tokens starting from `offset`.
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

    function withdrawFees(address payable to) external onlyOwner {
        uint256 balance = address(this).balance;
        (bool ok, ) = to.call{value: balance}("");
        if (!ok) revert TransferFailed();
    }
}
