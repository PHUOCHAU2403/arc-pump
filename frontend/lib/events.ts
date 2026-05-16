// Event ABIs + log-decoding helpers.

import {
  decodeEventLog,
  type Address,
  type Log,
} from "viem";
import type { Trade } from "./types";

/** Standalone Buy event ABI (so we can pass it to getLogs `event`). */
export const BUY_EVENT = {
  type: "event",
  name: "Buy",
  inputs: [
    { name: "buyer", type: "address", indexed: true },
    { name: "tokensOut", type: "uint256", indexed: false },
    { name: "usdcIn", type: "uint256", indexed: false },
  ],
} as const;

/** Standalone Sell event ABI. */
export const SELL_EVENT = {
  type: "event",
  name: "Sell",
  inputs: [
    { name: "seller", type: "address", indexed: true },
    { name: "tokensIn", type: "uint256", indexed: false },
    { name: "usdcOut", type: "uint256", indexed: false },
  ],
} as const;

/** TokenCreated event ABI (for factory-level indexing). */
export const TOKEN_CREATED_EVENT = {
  type: "event",
  name: "TokenCreated",
  inputs: [
    { name: "id", type: "uint256", indexed: true },
    { name: "token", type: "address", indexed: true },
    { name: "creator", type: "address", indexed: true },
    { name: "curve", type: "address", indexed: false },
    { name: "name", type: "string", indexed: false },
    { name: "symbol", type: "string", indexed: false },
    { name: "imageURI", type: "string", indexed: false },
  ],
} as const;

const BUY_TOPIC =
  "0x" +
  // keccak256("Buy(address,uint256,uint256)") — let viem compute at runtime instead.
  "" as `0x${string}`; // placeholder; we use viem to filter by event signature.

/**
 * Decode a Buy/Sell log into a structured Trade.
 * Returns null if log doesn't match either event.
 */
export function decodeTradeLog(
  log: Log,
  approxTimestamp: number
): Trade | null {
  try {
    // Try Buy first
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
    // not a Buy event, try Sell
  }

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
    // not a Sell event either
  }

  return null;
}

/**
 * Effective execution price for a trade (USDC per 1 whole token, as float).
 * Returns 0 if tokenAmount is zero (shouldn't happen).
 */
export function tradePrice(trade: Trade): number {
  if (trade.tokenAmount === 0n) return 0;
  // (usdcAmount / 1e18) / (tokenAmount / 1e18) = usdcAmount / tokenAmount
  return Number(trade.usdcAmount) / Number(trade.tokenAmount);
}
