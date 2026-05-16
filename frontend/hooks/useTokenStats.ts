"use client";

import { useMemo } from "react";
import type { Address } from "viem";
import { useTradeHistory } from "./useTradeHistory";
import type { Trade, TokenStats } from "@/lib/types";
import { tradePrice } from "@/lib/events";

const SECONDS_24H = 24 * 60 * 60;

/**
 * Aggregated 24h stats for a token's BondingCurve.
 * Built on top of useTradeHistory — same query is cached and shared.
 */
export function useTokenStats(curveAddress: Address | undefined) {
  const tradesQuery = useTradeHistory(curveAddress, { limit: 500 });

  const stats: TokenStats | undefined = useMemo(() => {
    if (!tradesQuery.data) return undefined;

    const allTrades = tradesQuery.data;
    const cutoff = Math.floor(Date.now() / 1000) - SECONDS_24H;
    const trades24h = allTrades.filter((t) => t.timestamp >= cutoff);

    let volume24h = 0n;
    const traders = new Set<string>();
    for (const t of trades24h) {
      volume24h += t.usdcAmount;
      traders.add(t.trader.toLowerCase());
    }

    // Latest trade price.
    const latestTrade = allTrades[0]; // already sorted newest first
    const lastPrice = latestTrade
      ? bigintPriceFromTrade(latestTrade)
      : 0n;

    // Find trade at oldest end of 24h window for % change.
    const oldest24h = trades24h[trades24h.length - 1];
    const priceChange24hPct = computePctChange(latestTrade, oldest24h);

    return {
      volume24h,
      tradeCount24h: trades24h.length,
      uniqueTraders24h: traders.size,
      lastPrice,
      priceChange24hPct,
      trades: allTrades,
    };
  }, [tradesQuery.data]);

  return {
    stats,
    isLoading: tradesQuery.isLoading,
    error: tradesQuery.error,
    refetch: tradesQuery.refetch,
  };
}

/** Compute USDC wei per 1 whole token (1e18 wei) from a trade. */
function bigintPriceFromTrade(t: Trade): bigint {
  if (t.tokenAmount === 0n) return 0n;
  // (usdcAmount * 1e18) / tokenAmount = USDC wei per 1e18 wei of token = price per whole token.
  return (t.usdcAmount * 10n ** 18n) / t.tokenAmount;
}

function computePctChange(
  newest: Trade | undefined,
  oldest: Trade | undefined
): number {
  if (!newest || !oldest) return 0;
  const newP = tradePrice(newest);
  const oldP = tradePrice(oldest);
  if (oldP === 0) return 0;
  return ((newP - oldP) / oldP) * 100;
}
