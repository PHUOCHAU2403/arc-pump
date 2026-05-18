"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, Log, PublicClient } from "viem";
import { arcTestnet } from "@/lib/chains";
import {
  FACTORY_V1_ABI,
  FACTORY_V1_ADDRESS,
  FACTORY_V2_ABI,
  FACTORY_V2_ADDRESS,
} from "@/lib/factory";
import { decodeTradeLog } from "@/lib/events";
import { approxTimestamp } from "@/lib/blockchain";
import type {
  RawTokenInfoV1,
  RawTokenInfoV2,
  Trade,
  TokenInfo,
} from "@/lib/types";

const V1_DEFAULT_MAX_SUPPLY = 1_000_000n * 10n ** 18n;
const V1_DEFAULT_TRADE_FEE_BPS = 0;

/** A trade enriched with the token it belongs to (for the global activity feed). */
export type FeedItem = Trade & {
  tokenAddress: Address;
  tokenSymbol: string;
  tokenName: string;
  tokenImage: string;
  tokenVersion: 1 | 2;
};

/**
 * Global activity feed across ALL tokens (v1 + v2).
 * Uses chunked getLogs (Arc RPC has a 413 limit on big windows).
 *
 * decodeTradeLog handles both v1 and v2 event signatures, so a single
 * curve query covers both versions transparently.
 */
export function useActivityFeed(limit: number = 30) {
  const client = usePublicClient({ chainId: arcTestnet.id });

  return useQuery<FeedItem[]>({
    queryKey: ["activityFeed", limit, FACTORY_V1_ADDRESS, FACTORY_V2_ADDRESS],
    enabled: !!client,
    refetchInterval: 20_000,
    queryFn: async () => {
      if (!client) return [];

      // Fetch token lists from both factories in parallel.
      const [v1Total, v2Total] = await Promise.all([
        client
          .readContract({
            address: FACTORY_V1_ADDRESS,
            abi: FACTORY_V1_ABI,
            functionName: "totalTokens",
          })
          .catch(() => 0n) as Promise<bigint>,
        client
          .readContract({
            address: FACTORY_V2_ADDRESS,
            abi: FACTORY_V2_ABI,
            functionName: "totalTokens",
          })
          .catch(() => 0n) as Promise<bigint>,
      ]);

      if (v1Total === 0n && v2Total === 0n) return [];

      const tokenFetches: Promise<TokenInfo[]>[] = [];

      if (v1Total > 0n) {
        tokenFetches.push(
          (client
            .readContract({
              address: FACTORY_V1_ADDRESS,
              abi: FACTORY_V1_ABI,
              functionName: "tokensBatch",
              args: [0n, v1Total],
            })
            .catch(() => []) as Promise<RawTokenInfoV1[]>).then((rows) =>
            rows.map((r) => ({
              ...r,
              version: 1 as const,
              factory: FACTORY_V1_ADDRESS,
              maxSupply: V1_DEFAULT_MAX_SUPPLY,
              tradeFeeBps: V1_DEFAULT_TRADE_FEE_BPS,
            }))
          )
        );
      }

      if (v2Total > 0n) {
        tokenFetches.push(
          (client
            .readContract({
              address: FACTORY_V2_ADDRESS,
              abi: FACTORY_V2_ABI,
              functionName: "tokensBatch",
              args: [0n, v2Total],
            })
            .catch(() => []) as Promise<RawTokenInfoV2[]>).then((rows) =>
            rows.map((r) => ({
              ...r,
              version: 2 as const,
              factory: FACTORY_V2_ADDRESS,
            }))
          )
        );
      }

      const tokenGroups = await Promise.all(tokenFetches);
      const allTokens = tokenGroups.flat();
      if (allTokens.length === 0) return [];

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
            tokenVersion: info.version,
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
