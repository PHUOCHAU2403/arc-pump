"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { arcTestnet } from "@/lib/chains";
import { FACTORY_ABI, FACTORY_ADDRESS } from "@/lib/factory";
import { BUY_EVENT, SELL_EVENT, decodeTradeLog } from "@/lib/events";
import {
  approxTimestamp,
  DEFAULT_LOOKBACK_BLOCKS,
} from "@/lib/blockchain";
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
 * Queries every BondingCurve known to the factory and merges trade events.
 *
 * Best for the home page; for a single token use useTradeHistory directly.
 */
export function useActivityFeed(limit: number = 30) {
  const client = usePublicClient({ chainId: arcTestnet.id });

  return useQuery<FeedItem[]>({
    queryKey: ["activityFeed", limit],
    enabled: !!client,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!client) return [];

      // 1. Get all tokens from factory.
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

      // 2. Anchor for timestamp approximation.
      const latest = await client.getBlock({ blockTag: "latest" });
      const head = latest.number;
      const fromBlock =
        head > DEFAULT_LOOKBACK_BLOCKS
          ? head - DEFAULT_LOOKBACK_BLOCKS
          : 0n;

      // 3. Fetch logs for every curve in parallel.
      const logsPerToken = await Promise.all(
        allTokens.map(async (info) => {
          const [buys, sells] = await Promise.all([
            client.getLogs({
              address: info.curve,
              event: BUY_EVENT,
              fromBlock,
              toBlock: head,
            }),
            client.getLogs({
              address: info.curve,
              event: SELL_EVENT,
              fromBlock,
              toBlock: head,
            }),
          ]);
          return { info, logs: [...buys, ...sells] };
        })
      );

      // 4. Merge + decode + enrich with token metadata.
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

      // 5. Sort newest first.
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
