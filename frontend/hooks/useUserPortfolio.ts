"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { arcTestnet } from "@/lib/chains";
import {
  FACTORY_V1_ABI,
  FACTORY_V1_ADDRESS,
  FACTORY_V2_ABI,
  FACTORY_V2_ADDRESS,
} from "@/lib/factory";
import { TOKEN_ABI } from "@/lib/token";
import { CURVE_V1_ABI } from "@/lib/curve";
import type {
  Holding,
  Portfolio,
  RawTokenInfoV1,
  RawTokenInfoV2,
  TokenInfo,
} from "@/lib/types";

const V1_DEFAULT_MAX_SUPPLY = 1_000_000n * 10n ** 18n;
const V1_DEFAULT_TRADE_FEE_BPS = 0;
const WEI = 10n ** 18n;

/**
 * User's portfolio across BOTH MemeFactory v1 and v2 tokens.
 *
 * Strategy:
 *   1. Read totalTokens + tokensBatch from both factories.
 *   2. Normalize v1 rows (hardcoded maxSupply / fee).
 *   3. For each token, multicall balanceOf(user) and curve.spotPrice() in parallel.
 *   4. Filter zero balances and value at spot price.
 *
 * spotPrice + balanceOf have identical signatures across both curve versions,
 * so CURVE_V1_ABI works for either.
 */
export function useUserPortfolio() {
  const { address: user } = useAccount();
  const client = usePublicClient({ chainId: arcTestnet.id });

  return useQuery<Portfolio>({
    queryKey: ["portfolio", user, FACTORY_V1_ADDRESS, FACTORY_V2_ADDRESS],
    enabled: !!client && !!user,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!client || !user) {
        return emptyPortfolio();
      }

      // 1. totalTokens from both factories.
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

      if (v1Total === 0n && v2Total === 0n) return emptyPortfolio();

      // 2. tokensBatch from both factories.
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
        fetches.push(
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

      const groups = await Promise.all(fetches);
      const allTokens = groups.flat();

      // 3. balanceOf + spotPrice per token in parallel.
      const queries = allTokens.map(async (info) => {
        const [balance, spotPrice] = await Promise.all([
          client
            .readContract({
              address: info.token,
              abi: TOKEN_ABI,
              functionName: "balanceOf",
              args: [user],
            })
            .catch(() => 0n) as Promise<bigint>,
          client
            .readContract({
              address: info.curve,
              abi: CURVE_V1_ABI,
              functionName: "spotPrice",
            })
            .catch(() => 0n) as Promise<bigint>,
        ]);
        return { info, balance, spotPrice };
      });

      const results = await Promise.all(queries);

      // 4. Build holdings (filter zero balances).
      const holdings: Holding[] = [];
      let totalValueWei = 0n;
      for (const { info, balance, spotPrice } of results) {
        if (balance === 0n) continue;

        // valueWei = balance * spotPrice / 1e18
        const valueWei = (balance * spotPrice) / WEI;
        totalValueWei += valueWei;

        holdings.push({
          tokenAddress: info.token,
          info,
          balance,
          currentPriceWei: spotPrice,
          valueWei,
        });
      }

      // Sort by value descending.
      holdings.sort((a, b) => {
        if (a.valueWei === b.valueWei) return 0;
        return a.valueWei > b.valueWei ? -1 : 1;
      });

      return {
        holdings,
        totalValueWei,
        totalCostBasisWei: 0n, // TODO: compute from trade history
        totalPnlWei: 0n,
        totalPnlPct: 0,
      };
    },
  });
}

function emptyPortfolio(): Portfolio {
  return {
    holdings: [],
    totalValueWei: 0n,
    totalCostBasisWei: 0n,
    totalPnlWei: 0n,
    totalPnlPct: 0,
  };
}
