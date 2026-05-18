// Event ABIs + log-decoding helpers.
//
// We define events via parseAbiItem (viem helper) instead of raw object
// literals — this guarantees the runtime shape that viem's getLogs `event`
// param expects.

import { decodeEventLog, parseAbiItem, type Log } from "viem";
import type { Address } from "viem";
import type { Trade } from "./types";

// v1 curve events (no fee field).
export const BUY_EVENT = parseAbiItem(
  "event Buy(address indexed buyer, uint256 tokensOut, uint256 usdcIn)"
);

export const SELL_EVENT = parseAbiItem(
  "event Sell(address indexed seller, uint256 tokensIn, uint256 usdcOut)"
);

// v2 curve events (with fee field, different topic[0] selector).
export const BUY_EVENT_V2 = parseAbiItem(
  "event Buy(address indexed buyer, uint256 tokensOut, uint256 usdcIn, uint256 fee)"
);

export const SELL_EVENT_V2 = parseAbiItem(
  "event Sell(address indexed seller, uint256 tokensIn, uint256 usdcOut, uint256 fee)"
);

export const TOKEN_CREATED_EVENT = parseAbiItem(
  "event TokenCreated(uint256 indexed id, address indexed token, address indexed creator, address curve, string name, string symbol, string imageURI)"
);

/**
 * Decode a Buy/Sell log (v1 OR v2) into a structured Trade.
 * Returns null if the log doesn't match any known trade event.
 *
 * v1 and v2 events share names (Buy/Sell) but differ in signature — v2
 * appends a `fee` field — so they have distinct topic[0] selectors. We try
 * v2 first (newer + more permissive on the fee field) then fall back to v1.
 */
export function decodeTradeLog(
  log: Log,
  approxTimestamp: number
): Trade | null {
  // Try v2 Buy.
  try {
    const ev = decodeEventLog({
      abi: [BUY_EVENT_V2],
      data: log.data,
      topics: log.topics,
    });
    if (ev.eventName === "Buy") {
      const args = ev.args as {
        buyer: Address;
        tokensOut: bigint;
        usdcIn: bigint;
        fee: bigint;
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
    /* not v2 Buy */
  }

  // Try v2 Sell.
  try {
    const ev = decodeEventLog({
      abi: [SELL_EVENT_V2],
      data: log.data,
      topics: log.topics,
    });
    if (ev.eventName === "Sell") {
      const args = ev.args as {
        seller: Address;
        tokensIn: bigint;
        usdcOut: bigint;
        fee: bigint;
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
    /* not v2 Sell */
  }

  // Try v1 Buy.
  try {
    const ev = decodeEventLog({
      abi: [BUY_EVENT],
      data: log.data,
      topics: log.topics,
    });
    if (ev.eventName === "Buy") {
      const args = ev.args as {
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
    /* not v1 Buy */
  }

  // Try v1 Sell.
  try {
    const ev = decodeEventLog({
      abi: [SELL_EVENT],
      data: log.data,
      topics: log.topics,
    });
    if (ev.eventName === "Sell") {
      const args = ev.args as {
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
    /* not v1 Sell */
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
