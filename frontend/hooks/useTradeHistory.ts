"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, Log, PublicClient } from "viem";
import { arcTestnet } from "@/lib/chains";
import { BUY_EVENT, SELL_EVENT, decodeTradeLog } from "@/lib/events";
import { approxTimestamp } from "@/lib/blockchain";
import type { Trade } from "@/lib/types";

type UseTradeHistoryOpts = {
  /** Number of recent trades to return. Default 100. */
  limit?: number;
  /** Block lookback window. Default 5000 (~42 min on Arc). */
  lookbackBlocks?: bigint;
  /** Chunk size for getLogs queries. Default 500 (Arc RPC-safe). */
  chunkSize?: bigint;
  /** Refetch interval in ms. Default 15s. 0 = no auto refetch. */
  refetchInterval?: number;
};

/**
 * Trade history (Buy + Sell merged) for a single BondingCurve.
 * Trades are sorted newest first.
 *
 * Arc Testnet's public RPC rejects large getLogs queries with HTTP 413
 * ("Content Too Large"). We work around this by:
 *   - Capping default lookback to 5k blocks (~42 min of history).
 *   - Chunking the query into 500-block batches.
 *   - Running batches in parallel (Promise.all).
 *
 * For deeper history we'll move to a dedicated indexer later.
 */
export function useTradeHistory(
  curveAddress: Address | undefined,
  opts: UseTradeHistoryOpts = {}
) {
  const {
    limit = 100,
    lookbackBlocks = 5_000n,
    chunkSize = 500n,
    refetchInterval = 15_000,
  } = opts;

  const client = usePublicClient({ chainId: arcTestnet.id });

  return useQuery<Trade[]>({
    queryKey: [
      "tradeHistory",
      curveAddress,
      limit,
      lookbackBlocks.toString(),
      chunkSize.toString(),
    ],
    enabled: !!client && !!curveAddress,
    refetchInterval: refetchInterval || undefined,
    queryFn: async () => {
      if (!client || !curveAddress) return [];

      const latest = await client.getBlock({ blockTag: "latest" });
      const head = latest.number;
      const fromBlock = head > lookbackBlocks ? head - lookbackBlocks : 0n;

      const logs = await chunkedGetLogs(
        client,
        curveAddress,
        fromBlock,
        head,
        chunkSize
      );

      const trades: Trade[] = [];
      for (const log of logs) {
        const ts = approxTimestamp(
          log.blockNumber ?? head,
          head,
          latest.timestamp
        );
        const t = decodeTradeLog(log, ts);
        if (t) trades.push(t);
      }

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

/**
 * Run `getLogs` in N-block chunks in parallel.
 * Skips chunks that error (e.g. RPC still rejects); logs to console.
 */
async function chunkedGetLogs(
  client: PublicClient,
  address: Address,
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: bigint
): Promise<Log[]> {
  const ranges: Array<{ from: bigint; to: bigint }> = [];
  let from = fromBlock;
  while (from <= toBlock) {
    const to = from + chunkSize - 1n > toBlock ? toBlock : from + chunkSize - 1n;
    ranges.push({ from, to });
    from = to + 1n;
  }

  const results = await Promise.all(
    ranges.map(async ({ from, to }) => {
      try {
        return await client.getLogs({
          address,
          fromBlock: from,
          toBlock: to,
        });
      } catch (err) {
        // RPC rejected this chunk — skip it but don't crash the whole query.
        console.warn(
          `[useTradeHistory] getLogs failed for ${from}-${to}:`,
          err
        );
        return [] as Log[];
      }
    })
  );

  return results.flat();
}

// Keep imports referenced so unused-import linters don't trip.
export const _events = { BUY_EVENT, SELL_EVENT };
