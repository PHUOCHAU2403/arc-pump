"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { arcTestnet } from "@/lib/chains";
import { FACTORY_ABI, FACTORY_ADDRESS } from "@/lib/factory";
import { TOKEN_ABI } from "@/lib/token";
import { CURVE_ABI } from "@/lib/curve";
import type { Holding, Portfolio, TokenInfo } from "@/lib/types";

/**
 * User's portfolio across ALL tokens launched on the factory.
 *
 * Strategy:
 *   1. Read all TokenInfo from factory.tokensBatch().
 *   2. For each token, multicall balanceOf(user) and curve.spotPrice() in parallel.
 *   3. Filter out zero balances.
 *   4. Compute total value at spot price.
 *
 * Note: Cost-basis / P&L computation is left for a follow-up — would require
 * per-token trade history aggregation. For now, valueWei only.
 */
export function useUserPortfolio() {
  const { address: user } = useAccount();
  const client = usePublicClient({ chainId: arcTestnet.id });

  return useQuery<Portfolio>({
    queryKey: ["portfolio", user],
    enabled: !!client && !!user,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!client || !user) {
        return emptyPortfolio();
      }

      // 1. Get total tokens count and all token info.
      const total = (await client.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "totalTokens",
      })) as bigint;

      if (total === 0n) return emptyPortfolio();

      const allTokens = (await client.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "tokensBatch",
        args: [0n, total],
      })) as TokenInfo[];

      // 2. Multicall balanceOf + spotPrice for each token in parallel.
      const queries = allTokens.map(async (info) => {
        const [balance, spotPrice] = await Promise.all([
          client.readContract({
            address: info.token,
            abi: TOKEN_ABI,
            functionName: "balanceOf",
            args: [user],
          }) as Promise<bigint>,
          client.readContract({
            address: info.curve,
            abi: CURVE_ABI,
            functionName: "spotPrice",
          }) as Promise<bigint>,
        ]);
        return { info, balance, spotPrice };
      });

      const results = await Promise.all(queries);

      // 3. Build holdings (filter zero balances).
      const holdings: Holding[] = [];
      let totalValueWei = 0n;
      for (const { info, balance, spotPrice } of results) {
        if (balance === 0n) continue;

        // valueWei = balance * spotPrice / 1e18
        const valueWei = (balance * spotPrice) / 10n ** 18n;
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
      holdings.sort((a, b) => Number(b.valueWei - a.valueWei));

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
