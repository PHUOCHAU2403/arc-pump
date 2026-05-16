"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, zeroAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { arcTestnet } from "@/lib/chains";
import { formatTokens, shortAddr } from "@/lib/blockchain";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);
const LOG_CHUNK_SIZE = 50_000n;

type Holder = {
  address: Address;
  balance: bigint;
  percent: number;
};

export function HoldersList({
  tokenAddress,
  totalSupply,
}: {
  tokenAddress: Address;
  totalSupply: bigint | undefined;
}) {
  const client = usePublicClient({ chainId: arcTestnet.id });

  const {
    data: holders,
    isLoading,
    isError,
    error,
  } = useQuery<Holder[]>({
    queryKey: ["holders", tokenAddress, totalSupply?.toString() ?? "unknown"],
    enabled: !!client && !!tokenAddress,
    refetchInterval: 20_000,
    queryFn: async () => {
      if (!client) return [];

      const latest = await client.getBlockNumber();
      const balances = new Map<string, bigint>();
      let fromBlock = 0n;

      while (fromBlock <= latest) {
        const toBlock =
          fromBlock + LOG_CHUNK_SIZE - 1n > latest
            ? latest
            : fromBlock + LOG_CHUNK_SIZE - 1n;

        const logs = await client.getLogs({
          address: tokenAddress,
          event: TRANSFER_EVENT,
          fromBlock,
          toBlock,
        });

        for (const log of logs) {
          const from = log.args.from;
          const to = log.args.to;
          const value = log.args.value;
          if (!from || !to || value === undefined) continue;

          if (from !== zeroAddress) {
            const key = from.toLowerCase();
            balances.set(key, (balances.get(key) ?? 0n) - value);
          }

          if (to !== zeroAddress) {
            const key = to.toLowerCase();
            balances.set(key, (balances.get(key) ?? 0n) + value);
          }
        }

        fromBlock = toBlock + 1n;
      }

      return Array.from(balances.entries())
        .filter(([, balance]) => balance > 0n)
        .map(([address, balance]) => ({
          address: address as Address,
          balance,
          percent:
            totalSupply && totalSupply > 0n
              ? Number((balance * 10_000n) / totalSupply) / 100
              : 0,
        }))
        .sort((a, b) => compareBigintDesc(a.balance, b.balance))
        .slice(0, 10);
    },
  });

  return (
    <section className="mt-16 sm:mt-20">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 pb-6 border-b border-line">
        <div>
          <div className="type-kicker mb-2">Ownership</div>
          <h2 className="type-headline">Top holders</h2>
        </div>
        <div className="text-xs text-ink-mute font-mono">
          {holders ? String(holders.length).padStart(2, "0") : "--"} accounts
        </div>
      </div>

      {isLoading ? (
        <LoadingRows />
      ) : isError ? (
        <Notice
          eyebrow="Holders unavailable"
          title="Ownership could not be loaded."
          body={error instanceof Error ? error.message : "Refresh the page to try again."}
        />
      ) : !holders || holders.length === 0 ? (
        <Notice
          eyebrow="No holders"
          title="No circulating balances yet."
          body="The first mint or transfer will appear here."
        />
      ) : (
        <div className="border border-line">
          <div className="hidden sm:grid grid-cols-[64px_1fr_1fr_96px] gap-4 px-4 py-3 bg-paper-soft border-b border-line type-kicker text-[10px]">
            <span>Rank</span>
            <span>Address</span>
            <span>Balance</span>
            <span className="text-right">Supply</span>
          </div>
          <div className="divide-y divide-line">
            {holders.map((holder, index) => (
              <div
                key={holder.address}
                className="grid grid-cols-1 sm:grid-cols-[64px_1fr_1fr_96px] gap-3 sm:gap-4 px-4 py-4 bg-paper"
              >
                <div>
                  <div className="sm:hidden type-kicker mb-1 text-[10px]">
                    Rank
                  </div>
                  <div className="type-mono-stat text-sm">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                </div>
                <div>
                  <div className="sm:hidden type-kicker mb-1 text-[10px]">
                    Address
                  </div>
                  <a
                    href={`https://testnet.arcscan.app/address/${holder.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-quiet font-mono text-xs"
                  >
                    {shortAddr(holder.address)}
                  </a>
                </div>
                <div>
                  <div className="sm:hidden type-kicker mb-1 text-[10px]">
                    Balance
                  </div>
                  <div className="type-mono-stat text-sm">
                    {formatTokens(holder.balance)}
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="sm:hidden type-kicker mb-1 text-[10px]">
                    Supply
                  </div>
                  <div className="type-mono-stat text-sm">
                    {holder.percent.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function LoadingRows() {
  return (
    <div className="border border-line divide-y divide-line">
      {Array.from({ length: 5 }).map((_, row) => (
        <div
          key={row}
          className="grid grid-cols-1 sm:grid-cols-[64px_1fr_1fr_96px] gap-3 sm:gap-4 px-4 py-4"
        >
          {Array.from({ length: 4 }).map((__, cell) => (
            <div
              key={cell}
              className="h-4 bg-paper-soft border border-line animate-pulse"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Notice({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="border border-line border-dashed py-16 px-6 text-center">
      <div className="type-kicker mb-3">{eyebrow}</div>
      <h3 className="type-headline mb-3">{title}</h3>
      <p className="text-ink-mute text-sm max-w-md mx-auto leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function compareBigintDesc(a: bigint, b: bigint): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}
