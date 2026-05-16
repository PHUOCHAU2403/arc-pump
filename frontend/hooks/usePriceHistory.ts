"use client";

import { useMemo } from "react";
import type { Address } from "viem";
import { useTradeHistory } from "./useTradeHistory";
import { tradePrice } from "@/lib/events";
import type { PricePoint } from "@/lib/types";

type UsePriceHistoryOpts = {
  /** Max points to render (sample-down if more trades). Default 200. */
  maxPoints?: number;
};

/**
 * Price history points suitable for charting.
 * - Uses effective execution price per trade.
 * - Sorted oldest → newest (chart-friendly order).
 * - Downsamples to maxPoints if there are too many trades.
 */
export function usePriceHistory(
  curveAddress: Address | undefined,
  opts: UsePriceHistoryOpts = {}
) {
  const { maxPoints = 200 } = opts;
  const tradesQuery = useTradeHistory(curveAddress, { limit: 1000 });

  const points: PricePoint[] = useMemo(() => {
    if (!tradesQuery.data) return [];

    // useTradeHistory returns newest-first; reverse for chart.
    const chrono = [...tradesQuery.data].reverse();

    const raw: PricePoint[] = chrono
      .map((t) => ({
        time: t.timestamp,
        price: tradePrice(t),
        blockNumber: t.blockNumber,
      }))
      .filter((p) => p.price > 0);

    if (raw.length <= maxPoints) return raw;

    // Simple downsample: take every Nth point.
    const step = Math.ceil(raw.length / maxPoints);
    const sampled: PricePoint[] = [];
    for (let i = 0; i < raw.length; i += step) {
      sampled.push(raw[i]);
    }
    // Always include the latest point.
    if (sampled[sampled.length - 1] !== raw[raw.length - 1]) {
      sampled.push(raw[raw.length - 1]);
    }
    return sampled;
  }, [tradesQuery.data, maxPoints]);

  return {
    points,
    isLoading: tradesQuery.isLoading,
    error: tradesQuery.error,
  };
}
