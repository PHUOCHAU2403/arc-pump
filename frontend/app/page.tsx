"use client";

import { useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { FACTORY_ABI, FACTORY_ADDRESS } from "@/lib/factory";
import { Navbar } from "@/components/Navbar";
import Link from "next/link";

type TokenInfo = {
  token: `0x${string}`;
  curve: `0x${string}`;
  creator: `0x${string}`;
  name: string;
  symbol: string;
  imageURI: string;
  createdAt: bigint;
};

export default function Home() {
  const [search, setSearch] = useState("");

  const { data: totalCount } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "totalTokens",
    query: { refetchInterval: 8000 },
  });

  const { data: tokensData } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "tokensBatch",
    args: [0n, 50n],
    query: { refetchInterval: 8000 },
  });

  const tokens = useMemo(
    () => (tokensData as TokenInfo[] | undefined) || [],
    [tokensData]
  );
  const sorted = useMemo(() => [...tokens].reverse(), [tokens]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sorted;

    return sorted.filter((token) => {
      return (
        token.name.toLowerCase().includes(query) ||
        token.symbol.toLowerCase().includes(query) ||
        token.token.toLowerCase().includes(query)
      );
    });
  }, [search, sorted]);

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* ============ HERO ============ */}
      <section className="max-w-6xl mx-auto px-6 sm:px-8 pt-20 sm:pt-32 pb-20">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-8">
            <span className="dot-live" />
            <span className="type-kicker">Live on Arc Testnet</span>
          </div>

          <h1 className="type-display mb-8 text-ink">
            Capital formation
            <br />
            for{" "}
            <span className="font-display italic text-accent">ideas.</span>
          </h1>

          <p className="text-lg sm:text-xl text-ink-mute max-w-2xl leading-relaxed mb-10">
            ARC PUMP is a memecoin launchpad on Arc Network. Linear bonding
            curve, USDC&#8209;native, fixed one&#8209;USDC fee to launch. No
            graduation theater, no hidden levers.
          </p>

          <div className="flex flex-wrap items-center gap-6">
            <Link
              href="/create"
              className="btn-primary px-7 py-3.5 text-sm font-medium tracking-wide rounded-sm"
            >
              Launch a token →
            </Link>
            <Link
              href={`https://testnet.arcscan.app/address/${FACTORY_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="link-quiet text-sm"
            >
              View factory on chain
            </Link>
          </div>
        </div>
      </section>

      {/* ============ STAT STRIP ============ */}
      <section className="border-y border-line bg-paper-soft">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 grid grid-cols-3 divide-x divide-line">
          <Stat
            value={
              totalCount !== undefined ? totalCount.toString() : "—"
            }
            label="Tokens launched"
          />
          <Stat value="1.00" label="Launch fee" unit="USDC" />
          <Stat value="0.00" label="Trading fee" unit="%" />
        </div>
      </section>

      {/* ============ TOKEN LIST ============ */}
      <section className="max-w-6xl mx-auto px-6 sm:px-8 py-20 sm:py-28">
        <div className="flex flex-col gap-6 mb-10 pb-6 border-b border-line">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
            <div>
              <div className="type-kicker mb-2">Index</div>
              <h2 className="type-headline">Recent launches</h2>
            </div>
            <div className="text-sm text-ink-mute font-mono">
              {String(filtered.length).padStart(3, "0")} shown
            </div>
          </div>

          <div className="max-w-sm">
            <label className="type-kicker mb-2 block text-[10px]">
              Search tokens
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, ticker, or address"
              className="w-full bg-transparent border-b border-line py-3 text-sm focus:outline-none focus:border-ink placeholder:text-ink-faint"
            />
          </div>
        </div>

        {tokens.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <SearchEmptyState query={search} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-line border border-line">
            {filtered.map((t) => (
              <TokenRow key={t.token} token={t} />
            ))}
          </div>
        )}
      </section>

      <Footer />
    </div>
  );
}

function Stat({
  value,
  label,
  unit,
}: {
  value: string;
  label: string;
  unit?: string;
}) {
  return (
    <div className="px-6 sm:px-8 py-8 sm:py-10">
      <div className="type-kicker mb-3">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="type-mono-stat text-3xl sm:text-4xl text-ink">
          {value}
        </span>
        {unit && (
          <span className="text-sm text-ink-mute font-mono">{unit}</span>
        )}
      </div>
    </div>
  );
}

function TokenRow({ token }: { token: TokenInfo }) {
  const fallbackImg = `https://api.dicebear.com/9.x/initials/svg?seed=${token.symbol}&backgroundColor=ebebe3&textColor=0a0a0a`;
  const img = token.imageURI || fallbackImg;

  return (
    <Link
      href={`/token/${token.token}`}
      className="group block bg-paper hover:bg-paper-soft p-6 transition-colors"
    >
      <div className="flex items-start gap-4 mb-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img}
          alt={token.name}
          className="w-12 h-12 object-cover border border-line"
          onError={(e) => {
            (e.target as HTMLImageElement).src = fallbackImg;
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-display text-lg text-ink truncate">
            {token.name}
          </div>
          <div className="text-xs text-ink-mute font-mono mt-0.5">
            ${token.symbol}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-end text-xs text-ink-mute pt-4 border-t border-line">
        <span className="font-mono">{shortAddr(token.creator)}</span>
        <span className="font-mono">{ageString(token.createdAt)}</span>
      </div>

      <div className="mt-3 text-xs text-ink group-hover:text-accent">
        Trade →
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="border border-line border-dashed py-24 text-center">
      <div className="type-kicker mb-3">No launches yet</div>
      <h3 className="type-headline mb-3">An empty market is an open one.</h3>
      <p className="text-ink-mute text-sm max-w-md mx-auto mb-8">
        Be the first to seed liquidity on Arc Testnet.
      </p>
      <Link
        href="/create"
        className="btn-primary inline-block px-6 py-3 text-sm font-medium rounded-sm"
      >
        Launch the first token →
      </Link>
    </div>
  );
}

function SearchEmptyState({ query }: { query: string }) {
  return (
    <div className="border border-line border-dashed py-16 px-6 text-center">
      <div className="type-kicker mb-3">No match</div>
      <h3 className="type-headline mb-3">No market matches that search.</h3>
      <p className="text-ink-mute text-sm max-w-md mx-auto">
        Try a token name, ticker, or contract fragment. Current query:{" "}
        <span className="font-mono text-ink">{query}</span>.
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="max-w-6xl mx-auto px-6 sm:px-8 py-12 border-t border-line">
      <div className="flex flex-col sm:flex-row justify-between gap-6 text-xs text-ink-mute">
        <div className="font-display text-base text-ink">
          Arc<span className="italic text-accent">·</span>Pump
        </div>
        <div className="flex flex-wrap gap-6">
          <a
            href={`https://testnet.arcscan.app/address/${FACTORY_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="link-quiet font-mono"
          >
            Factory
          </a>
          <a
            href="https://github.com/PHUOCHAU2403/arc-pump"
            target="_blank"
            rel="noopener noreferrer"
            className="link-quiet"
          >
            Source
          </a>
          <a
            href="https://docs.arc.network"
            target="_blank"
            rel="noopener noreferrer"
            className="link-quiet"
          >
            Arc docs
          </a>
        </div>
      </div>
      <div className="mt-10 pt-6 border-t border-line text-[11px] text-ink-faint">
        Testnet only · Not financial advice · Built on Arc Network · Powered by
        Circle USDC
      </div>
    </footer>
  );
}

function ageString(ts: bigint): string {
  const seconds = Math.floor(Date.now() / 1000) - Number(ts);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
