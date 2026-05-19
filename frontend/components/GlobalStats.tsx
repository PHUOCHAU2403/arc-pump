"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import { formatUsdc } from "@/lib/blockchain";
import { CountUp } from "@/components/CountUp";

const SECONDS_24H = 24 * 60 * 60;

/**
 * Aggregate 24h activity across ALL tokens on the protocol.
 * Derives volume / trade count / unique traders / top mover from useActivityFeed.
 *
 * Renders as a 4-cell strip; hairline borders; mono numerals.
 */
export function GlobalStats() {
  const { data: feed, isLoading } = useActivityFeed(500);

  const stats = useMemo(() => {
    if (!feed || feed.length === 0) {
      return {
        volume24hWei: 0n,
        tradeCount24h: 0,
        uniqueTraders24h: 0,
        topToken: undefined as
          | { symbol: string; address: `0x${string}`; tradesIn24h: number }
          | undefined,
      };
    }

    const anchor = feed[0]?.timestamp ?? Math.floor(Date.now() / 1000);
    const cutoff = anchor - SECONDS_24H;
    const trades24h = feed.filter((f) => f.timestamp >= cutoff);

    let volume = 0n;
    const traders = new Set<string>();
    const perToken = new Map<
      string,
      { count: number; symbol: string; address: `0x${string}` }
    >();

    for (const t of trades24h) {
      volume += t.usdcAmount;
      traders.add(t.trader.toLowerCase());

      const entry = perToken.get(t.tokenAddress) || {
        count: 0,
        symbol: t.tokenSymbol,
        address: t.tokenAddress,
      };
      entry.count += 1;
      perToken.set(t.tokenAddress, entry);
    }

    let topToken:
      | { symbol: string; address: `0x${string}`; tradesIn24h: number }
      | undefined;
    for (const entry of perToken.values()) {
      if (!topToken || entry.count > topToken.tradesIn24h) {
        topToken = {
          symbol: entry.symbol,
          address: entry.address,
          tradesIn24h: entry.count,
        };
      }
    }

    return {
      volume24hWei: volume,
      tradeCount24h: trades24h.length,
      uniqueTraders24h: traders.size,
      topToken,
    };
  }, [feed]);

  return (
    <section className="border-y border-line bg-paper-soft">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 grid grid-cols-2 lg:grid-cols-4 divide-x divide-line">
        <Cell
          label="24h volume"
          value={formatUsdc(stats.volume24hWei, 2)}
          numericValue={Number(stats.volume24hWei) / 1e18}
          numericFormat={(v) =>
            v.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          }
          unit="USDC"
          loading={isLoading}
        />
        <Cell
          label="24h trades"
          value={String(stats.tradeCount24h)}
          numericValue={stats.tradeCount24h}
          unit="executed"
          loading={isLoading}
        />
        <Cell
          label="24h traders"
          value={String(stats.uniqueTraders24h)}
          numericValue={stats.uniqueTraders24h}
          unit="unique"
          loading={isLoading}
        />
        <TopTokenCell
          symbol={stats.topToken?.symbol}
          address={stats.topToken?.address}
          tradesIn24h={stats.topToken?.tradesIn24h}
          loading={isLoading}
        />
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  unit,
  loading,
  numericValue,
  numericFormat,
}: {
  label: string;
  value: string;
  unit?: string;
  loading?: boolean;
  /** Enables count-up animation when provided. */
  numericValue?: number;
  /** Custom formatter for the tweened in-flight value. */
  numericFormat?: (value: number) => string;
}) {
  const showCounter =
    !loading && typeof numericValue === "number" && numericValue > 0;

  return (
    <div className="px-6 sm:px-8 py-8 sm:py-10">
      <div className="type-kicker mb-3">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="type-mono-stat text-2xl sm:text-3xl text-ink">
          {loading ? (
            "—"
          ) : showCounter ? (
            <CountUp
              value={numericValue as number}
              format={
                numericFormat ?? ((v) => Math.round(v).toLocaleString())
              }
            />
          ) : (
            value
          )}
        </span>
        {unit && (
          <span className="text-sm text-ink-mute font-mono">{unit}</span>
        )}
      </div>
    </div>
  );
}

function TopTokenCell({
  symbol,
  address,
  tradesIn24h,
  loading,
}: {
  symbol: string | undefined;
  address: `0x${string}` | undefined;
  tradesIn24h: number | undefined;
  loading?: boolean;
}) {
  if (loading) {
    return <Cell label="Most traded" value="—" loading />;
  }

  if (!symbol || !address) {
    return (
      <div className="px-6 sm:px-8 py-8 sm:py-10">
        <div className="type-kicker mb-3">Most traded</div>
        <div className="text-sm text-ink-mute">—</div>
      </div>
    );
  }

  return (
    <div className="px-6 sm:px-8 py-8 sm:py-10">
      <div className="type-kicker mb-3">Most traded</div>
      <Link
        href={`/token/${address}`}
        className="block group"
      >
        <div className="type-mono-stat text-2xl sm:text-3xl text-ink group-hover:text-accent transition-colors">
          ${symbol}
        </div>
        <div className="text-xs text-ink-mute font-mono mt-1">
          {tradesIn24h} {tradesIn24h === 1 ? "trade" : "trades"}
        </div>
      </Link>
    </div>
  );
}
