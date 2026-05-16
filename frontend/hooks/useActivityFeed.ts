"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, Log, PublicClient } from "viem";
import { arcTestnet } from "@/lib/chains";
import { FACTORY_ABI, FACTORY_ADDRESS } from "@/lib/factory";
import { decodeTradeLog } from "@/lib/events";
import { approxTimestamp } from "@/lib/blockchain";
import type { Trade, TokenInfo } from "@/lib/types";

/** A trade enriched with the token it belongs to (for the global activity feed). */
export type FeedItem = Trade & {
  tokenAddress: Address;
  tokenSymbol: string;
  tokenName: string;
  tokenImage: string;
};

/**
 * Global activity feed across ALL tokens.
 * Uses chunked getLogs (Arc RPC has a 413 limit on big windows).
 */
export function useActivityFeed(limit: number = 30) {
  const client = usePublicClient({ chainId: arcTestnet.id });

  return useQuery<FeedItem[]>({
    queryKey: ["activityFeed", limit],
    enabled: !!client,
    refetchInterval: 20_000,
    queryFn: async () => {
      if (!client) return [];

      const total = (await client.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "totalTokens",
      })) as bigint;
      if (total === 0n) return [];

      const allTokens = (await client.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "tokensBatch",
        args: [0n, total],
      })) as TokenInfo[];

      const latest = await client.getBlock({ blockTag: "latest" });
      const head = latest.number;
      const LOOKBACK = 5_000n;
      const CHUNK = 500n;
      const fromBlock = head > LOOKBACK ? head - LOOKBACK : 0n;

      // Fetch logs for every curve in parallel — each curve query is itself chunked.
      const logsPerToken = await Promise.all(
        allTokens.map(async (info) => {
          const logs = await chunkedGetLogs(
            client,
            info.curve,
            fromBlock,
            head,
            CHUNK
          );
          return { info, logs };
        })
      );

      const feed: FeedItem[] = [];
      for (const { info, logs } of logsPerToken) {
        for (const log of logs) {
          const ts = approxTimestamp(
            log.blockNumber ?? head,
            head,
            latest.timestamp
          );
          const t = decodeTradeLog(log, ts);
          if (!t) continue;
          feed.push({
            ...t,
            tokenAddress: info.token,
            tokenSymbol: info.symbol,
            tokenName: info.name,
            tokenImage: info.imageURI,
          });
        }
      }

      feed.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
          return Number(b.blockNumber - a.blockNumber);
        }
        return b.logIndex - a.logIndex;
      });

      return feed.slice(0, limit);
    },
  });
}

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
        console.warn(
          `[useActivityFeed] getLogs failed for ${from}-${to}:`,
          err
        );
        return [] as Log[];
      }
    })
  );

  return results.flat();
}
