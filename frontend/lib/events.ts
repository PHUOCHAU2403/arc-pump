// Event ABIs + log-decoding helpers.
//
// We define events via parseAbiItem (viem helper) instead of raw object
// literals — this guarantees the runtime shape that viem's getLogs `event`
// param expects.

import { decodeEventLog, parseAbiItem, type Log } from "viem";
import type { Address } from "viem";
import type { Trade } from "./types";

export const BUY_EVENT = parseAbiItem(
  "event Buy(address indexed buyer, uint256 tokensOut, uint256 usdcIn)"
);

export const SELL_EVENT = parseAbiItem(
  "event Sell(address indexed seller, uint256 tokensIn, uint256 usdcOut)"
);

export const TOKEN_CREATED_EVENT = parseAbiItem(
  "event TokenCreated(uint256 indexed id, address indexed token, address indexed creator, address curve, string name, string symbol, string imageURI)"
);

/**
 * Decode a Buy/Sell log into a structured Trade.
 * Returns null if log doesn't match either event.
 */
export function decodeTradeLog(
  log: Log,
  approxTimestamp: number
): Trade | null {
  // Try Buy first.
  try {
    const buy = decodeEventLog({
      abi: [BUY_EVENT],
      data: log.data,
      topics: log.topics,
    });
    if (buy.eventName === "Buy") {
      const args = buy.args as {
        buyer: Address;
        tokensOut: bigint;
        usdcIn: bigint;
      };
      return {
        type: "buy",
        trader: args.buyer,
        tokenAmount: args.tokensOut,
        usdcAmount: args.usdcIn,
        blockNumber: log.blockNumber ?? 0n,
        txHash: log.transactionHash ?? "0x",
        timestamp: approxTimestamp,
        logIndex: log.logIndex ?? 0,
      };
    }
  } catch {
    // not a Buy event — fall through
  }

  // Try Sell.
  try {
    const sell = decodeEventLog({
      abi: [SELL_EVENT],
      data: log.data,
      topics: log.topics,
    });
    if (sell.eventName === "Sell") {
      const args = sell.args as {
        seller: Address;
        tokensIn: bigint;
        usdcOut: bigint;
      };
      return {
        type: "sell",
        trader: args.seller,
        tokenAmount: args.tokensIn,
        usdcAmount: args.usdcOut,
        blockNumber: log.blockNumber ?? 0n,
        txHash: log.transactionHash ?? "0x",
        timestamp: approxTimestamp,
        logIndex: log.logIndex ?? 0,
      };
    }
  } catch {
    // not a Sell event — return null below
  }

  return null;
}

/**
 * Effective execution price for a trade (USDC per 1 whole token, as float).
 * Returns 0 if tokenAmount is zero (shouldn't happen).
 */
export function tradePrice(trade: Trade): number {
  if (trade.tokenAmount === 0n) return 0;
  return Number(trade.usdcAmount) / Number(trade.tokenAmount);
}
