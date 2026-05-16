"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { arcTestnet } from "@/lib/chains";
import {
  BUY_EVENT,
  SELL_EVENT,
  decodeTradeLog,
} from "@/lib/events";
import {
  approxTimestamp,
  DEFAULT_LOOKBACK_BLOCKS,
} from "@/lib/blockchain";
import type { Trade } from "@/lib/types";

type UseTradeHistoryOpts = {
  /** Number of recent trades to return. Default 100. */
  limit?: number;
  /** Block lookback window. Default ~24h on Arc. */
  lookbackBlocks?: bigint;
  /** Refetch interval in ms. Default 10s. 0 = no auto refetch. */
  refetchInterval?: number;
};

/**
 * Trade history (Buy + Sell merged) for a single BondingCurve.
 * Trades are sorted newest first.
 *
 * Implementation:
 *   - Queries last `lookbackBlocks` for Buy/Sell logs in parallel.
 *   - Approximates timestamps from the latest block (avoids N+1 RPC).
 *
 * Returns React Query result: { data, isLoading, error, refetch }.
 */
export function useTradeHistory(
  curveAddress: Address | undefined,
  opts: UseTradeHistoryOpts = {}
) {
  const {
    limit = 100,
    lookbackBlocks = DEFAULT_LOOKBACK_BLOCKS,
    refetchInterval = 10_000,
  } = opts;

  const client = usePublicClient({ chainId: arcTestnet.id });

  return useQuery<Trade[]>({
    queryKey: [
      "tradeHistory",
      curveAddress,
      limit,
      lookbackBlocks.toString(),
    ],
    enabled: !!client && !!curveAddress,
    refetchInterval: refetchInterval || undefined,
    queryFn: async () => {
      if (!client || !curveAddress) return [];

      // Anchor for timestamp approximation.
      const latest = await client.getBlock({ blockTag: "latest" });
      const head = latest.number;
      const fromBlock = head > lookbackBlocks ? head - lookbackBlocks : 0n;

      const [buys, sells] = await Promise.all([
        client.getLogs({
          address: curveAddress,
          event: BUY_EVENT,
          fromBlock,
          toBlock: head,
        }),
        client.getLogs({
          address: curveAddress,
          event: SELL_EVENT,
          fromBlock,
          toBlock: head,
        }),
      ]);

      const trades: Trade[] = [];
      for (const log of [...buys, ...sells]) {
        const ts = approxTimestamp(
          log.blockNumber ?? head,
          head,
          latest.timestamp
        );
        const t = decodeTradeLog(log, ts);
        if (t) trades.push(t);
      }

      // Newest first: by block desc, then logIndex desc.
      trades.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
          return Number(b.blockNumber - a.blockNumber);
        }
        return b.logIndex - a.logIndex;
      });

      return trades.slice(0, limit);
    },
  });
}
