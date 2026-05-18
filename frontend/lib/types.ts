// Shared types for arc-pump frontend.

import type { Address } from "viem";

/** A single trade event (Buy or Sell) decoded from chain logs. */
export type Trade = {
  type: "buy" | "sell";
  trader: Address;
  tokenAmount: bigint;     // MemeToken wei in/out
  usdcAmount: bigint;      // USDC wei paid/received
  blockNumber: bigint;
  txHash: `0x${string}`;
  timestamp: number;       // approximate (unix seconds)
  logIndex: number;
};

/**
 * TokenInfo unified across factory versions.
 *
 * v1 tokens: `version = 1`, `maxSupply = 1_000_000 * 1e18` (hardcoded), `tradeFeeBps = 0`.
 * v2 tokens: `version = 2`, both fields come from on-chain TokenInfo.
 *
 * `factory` records which factory minted the token so downstream code can
 * pick the matching curve ABI.
 */
export type TokenInfo = {
  token: Address;
  curve: Address;
  creator: Address;
  name: string;
  symbol: string;
  imageURI: string;
  createdAt: bigint;
  version: 1 | 2;
  factory: Address;
  maxSupply: bigint;
  tradeFeeBps: number;
};

/** Raw TokenInfo as returned by MemeFactory v1 (legacy fields only). */
export type RawTokenInfoV1 = {
  token: Address;
  curve: Address;
  creator: Address;
  name: string;
  symbol: string;
  imageURI: string;
  createdAt: bigint;
};

/** Raw TokenInfo as returned by MemeFactory v2 (full fields). */
export type RawTokenInfoV2 = RawTokenInfoV1 & {
  maxSupply: bigint;
  tradeFeeBps: number;
};

/** Aggregated stats for a single token (24h window). */
export type TokenStats = {
  volume24h: bigint;        // USDC wei traded in last 24h
  tradeCount24h: number;
  uniqueTraders24h: number;
  lastPrice: bigint;        // USDC wei per 1 whole token (latest trade)
  priceChange24hPct: number; // e.g. +12.5 means +12.5%
  trades: Trade[];          // most recent first
};

/** One point on the price chart. */
export type PricePoint = {
  time: number;             // unix seconds
  price: number;            // USDC per token (float, not wei)
  blockNumber: bigint;
};

/** User's holding of a single token. */
export type Holding = {
  tokenAddress: Address;
  info: TokenInfo;
  balance: bigint;          // MemeToken wei
  currentPriceWei: bigint;  // USDC wei per 1 whole token
  valueWei: bigint;         // balance valued at current spot price
  costBasisWei?: bigint;    // approx USDC invested (from trade history)
  pnlWei?: bigint;          // valueWei - costBasisWei
  pnlPct?: number;
};

/** Full user portfolio. */
export type Portfolio = {
  holdings: Holding[];
  totalValueWei: bigint;
  totalCostBasisWei: bigint;
  totalPnlWei: bigint;
  totalPnlPct: number;
};
