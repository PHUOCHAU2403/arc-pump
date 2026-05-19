"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { arcTestnet } from "@/lib/chains";
import {
  FACTORY_V1_ABI,
  FACTORY_V1_ADDRESS,
  FACTORY_V2_ABI,
  FACTORY_V2_ADDRESS,
} from "@/lib/factory";
import type {
  RawTokenInfoV1,
  RawTokenInfoV2,
  TokenInfo,
} from "@/lib/types";

const V1_DEFAULT_MAX_SUPPLY = 1_000_000n * 10n ** 18n;
const V1_DEFAULT_TRADE_FEE_BPS = 0;

/**
 * Fetch ALL tokens across both MemeFactory versions and return as a unified list.
 *
 * v1 tokens are normalized: maxSupply defaults to 1M and tradeFeeBps to 0
 * (those values were hardcoded in the v1 contracts).
 *
 * Returned list is newest-first.
 */
export function useAllTokens() {
  const client = usePublicClient({ chainId: arcTestnet.id });

  return useQuery<TokenInfo[]>({
    queryKey: ["allTokens", FACTORY_V1_ADDRESS, FACTORY_V2_ADDRESS],
    enabled: !!client,
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!client) return [];

      // Probe both factories. We log on failure (instead of silently
      // returning 0n) so a misconfigured RPC / CORS issue is visible in the
      // browser console instead of presenting as "empty index".
      const [v1Total, v2Total] = await Promise.all([
        client
          .readContract({
            address: FACTORY_V1_ADDRESS,
            abi: FACTORY_V1_ABI,
            functionName: "totalTokens",
          })
          .catch((err) => {
            console.error("[useAllTokens] v1 totalTokens failed", err);
            return 0n;
          }) as Promise<bigint>,
        client
          .readContract({
            address: FACTORY_V2_ADDRESS,
            abi: FACTORY_V2_ABI,
            functionName: "totalTokens",
          })
          .catch((err) => {
            console.error("[useAllTokens] v2 totalTokens failed", err);
            return 0n;
          }) as Promise<bigint>,
      ]);

      if (process.env.NODE_ENV !== "production") {
        console.debug("[useAllTokens] totals", {
          v1: v1Total.toString(),
          v2: v2Total.toString(),
        });
      }

      const fetches: Promise<TokenInfo[]>[] = [];

      if (v1Total > 0n) {
        fetches.push(
          (client
            .readContract({
              address: FACTORY_V1_ADDRESS,
              abi: FACTORY_V1_ABI,
              functionName: "tokensBatch",
              args: [0n, v1Total],
            })
            .catch((err) => {
              console.error("[useAllTokens] v1 tokensBatch failed", err);
              return [] as RawTokenInfoV1[];
            }) as Promise<RawTokenInfoV1[]>).then((rows) =>
            rows.map((r) => normalizeV1(r))
          )
        );
      }

      if (v2Total > 0n) {
        fetches.push(
          (client
            .readContract({
              address: FACTORY_V2_ADDRESS,
              abi: FACTORY_V2_ABI,
              functionName: "tokensBatch",
              args: [0n, v2Total],
            })
            .catch((err) => {
              console.error("[useAllTokens] v2 tokensBatch failed", err);
              return [] as RawTokenInfoV2[];
            }) as Promise<RawTokenInfoV2[]>).then((rows) =>
            rows.map((r) => normalizeV2(r))
          )
        );
      }

      const groups = await Promise.all(fetches);
      const all = groups.flat();

      // Sort newest first.
      all.sort((a, b) => {
        if (a.createdAt === b.createdAt) return 0;
        return a.createdAt > b.createdAt ? -1 : 1;
      });

      return all;
    },
  });
}

function normalizeV1(raw: RawTokenInfoV1): TokenInfo {
  return {
    ...raw,
    version: 1,
    factory: FACTORY_V1_ADDRESS,
    maxSupply: V1_DEFAULT_MAX_SUPPLY,
    tradeFeeBps: V1_DEFAULT_TRADE_FEE_BPS,
  };
}

function normalizeV2(raw: RawTokenInfoV2): TokenInfo {
  return {
    ...raw,
    version: 2,
    factory: FACTORY_V2_ADDRESS,
  };
}

/**
 * Look up version + curve for a given token address by querying both factories.
 * Returns null if the token is unknown to both.
 */
export async function detectTokenVersion(
  client: ReturnType<typeof usePublicClient>,
  tokenAddress: Address
): Promise<{ version: 1 | 2; curve: Address; factory: Address } | null> {
  if (!client) return null;

  const [v2Curve, v1Curve] = await Promise.all([
    client
      .readContract({
        address: FACTORY_V2_ADDRESS,
        abi: FACTORY_V2_ABI,
        functionName: "curveOf",
        args: [tokenAddress],
      })
      .catch(() => "0x0000000000000000000000000000000000000000") as Promise<Address>,
    client
      .readContract({
        address: FACTORY_V1_ADDRESS,
        abi: FACTORY_V1_ABI,
        functionName: "curveOf",
        args: [tokenAddress],
      })
      .catch(() => "0x0000000000000000000000000000000000000000") as Promise<Address>,
  ]);

  const ZERO = "0x0000000000000000000000000000000000000000";

  if (v2Curve.toLowerCase() !== ZERO) {
    return {
      version: 2,
      curve: v2Curve,
      factory: FACTORY_V2_ADDRESS,
    };
  }

  if (v1Curve.toLowerCase() !== ZERO) {
    return {
      version: 1,
      curve: v1Curve,
      factory: FACTORY_V1_ADDRESS,
    };
  }

  return null;
}
