"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useAccount } from "wagmi";
import { Navbar } from "@/components/Navbar";
import { useUserPortfolio } from "@/hooks/useUserPortfolio";
import { formatTokens, formatUsdc, shortAddr } from "@/lib/blockchain";
import type { Holding } from "@/lib/types";

export default function PortfolioPage() {
  const { isConnected } = useAccount();
  const {
    data: portfolio,
    isLoading,
    isError,
    error,
  } = useUserPortfolio();

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 sm:px-8 py-12 sm:py-16">
        <header className="mb-12 pb-10 border-b border-line">
          <div className="type-kicker mb-4">Account</div>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div>
              <h1 className="type-display mb-5 text-ink">Your portfolio</h1>
              <p className="text-ink-mute text-base sm:text-lg leading-relaxed max-w-2xl">
                Positions across Arc Pump markets, valued at current bonding
                curve spot prices.
              </p>
            </div>

            <div className="border-t lg:border-t-0 lg:border-l border-line pt-6 lg:pt-0 lg:pl-8">
              <div className="type-kicker mb-3">Total value</div>
              <div className="type-mono-stat text-4xl sm:text-5xl text-ink">
                {portfolio ? formatUsdc(portfolio.totalValueWei, 2) : "--"}
              </div>
              <div className="text-xs text-ink-mute font-mono mt-2">USDC</div>
            </div>
          </div>
        </header>

        {!isConnected ? (
          <ConnectState />
        ) : isLoading ? (
          <LoadingState />
        ) : isError ? (
          <NoticeState
            eyebrow="Portfolio unavailable"
            title="The account view could not be loaded."
            body={
              error instanceof Error
                ? error.message
                : "Refresh the page to try again."
            }
          />
        ) : !portfolio || portfolio.holdings.length === 0 ? (
          <EmptyState />
        ) : (
          <PortfolioTable holdings={portfolio.holdings} />
        )}
      </main>
    </div>
  );
}

function PortfolioTable({ holdings }: { holdings: Holding[] }) {
  return (
    <section>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="type-kicker mb-2">Holdings</div>
          <h2 className="type-headline">Open positions</h2>
        </div>
        <div className="text-sm text-ink-mute font-mono">
          {String(holdings.length).padStart(2, "0")} positions
        </div>
      </div>

      <div className="border border-line">
        <div className="hidden lg:grid grid-cols-[minmax(220px,1fr)_1fr_1fr_1fr_112px] gap-4 px-5 py-3 bg-paper-soft border-b border-line type-kicker text-[10px]">
          <span>Token</span>
          <span>Balance</span>
          <span>Spot price</span>
          <span>Value</span>
          <span className="text-right">Action</span>
        </div>

        <div className="divide-y divide-line">
          {holdings.map((holding) => (
            <HoldingRow key={holding.tokenAddress} holding={holding} />
          ))}
        </div>
      </div>
    </section>
  );
}

function HoldingRow({ holding }: { holding: Holding }) {
  const fallbackImg = `https://api.dicebear.com/9.x/initials/svg?seed=${holding.info.symbol}&backgroundColor=ebebe3&textColor=0a0a0a`;
  const img = holding.info.imageURI || fallbackImg;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_1fr_1fr_1fr_112px] gap-5 lg:gap-4 px-5 py-5 bg-paper">
      <div className="flex items-start gap-4 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img}
          alt={holding.info.name}
          className="w-12 h-12 object-cover border border-line"
          onError={(e) => {
            (e.target as HTMLImageElement).src = fallbackImg;
          }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-display text-lg text-ink truncate">
              {holding.info.name}
            </div>
            <span
              className="text-[10px] font-mono tracking-wider uppercase px-1.5 py-0.5 border border-line text-ink-mute"
              title={`Factory v${holding.info.version}`}
            >
              v{holding.info.version}
            </span>
          </div>
          <div className="text-xs text-ink-mute font-mono mt-0.5">
            ${holding.info.symbol} / {shortAddr(holding.tokenAddress)}
          </div>
        </div>
      </div>

      <Metric
        label="Balance"
        value={formatTokens(holding.balance)}
        unit={`$${holding.info.symbol}`}
      />
      <Metric
        label="Spot price"
        value={formatUsdc(holding.currentPriceWei, 6)}
        unit="USDC"
      />
      <Metric label="Value" value={formatUsdc(holding.valueWei, 2)} unit="USDC" />

      <div className="flex lg:justify-end lg:items-center">
        <Link
          href={`/token/${holding.tokenAddress}`}
          className="link-quiet text-sm"
        >
          Trade -&gt;
        </Link>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div>
      <div className="lg:hidden type-kicker mb-1 text-[10px]">{label}</div>
      <div className="type-mono-stat text-sm sm:text-base text-ink">{value}</div>
      <div className="text-[11px] text-ink-mute font-mono mt-1">{unit}</div>
    </div>
  );
}

function ConnectState() {
  return (
    <div className="border border-line border-dashed py-16 px-6 text-center">
      <div className="type-kicker mb-3">Wallet required</div>
      <h2 className="type-headline mb-3">Connect to see your positions.</h2>
      <p className="text-ink-mute text-sm max-w-md mx-auto mb-8 leading-relaxed">
        Portfolio data is calculated from your token balances and live curve
        prices.
      </p>
      <div className="flex justify-center">
        <ConnectButton />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-line border-dashed py-16 px-6 text-center">
      <div className="type-kicker mb-3">No holdings</div>
      <h2 className="type-headline mb-3">An empty portfolio is dry powder.</h2>
      <p className="text-ink-mute text-sm max-w-md mx-auto mb-8 leading-relaxed">
        Explore recent launches and buy into a curve when the idea earns it.
      </p>
      <Link
        href="/"
        className="btn-primary inline-block px-6 py-3 text-sm font-medium rounded-sm"
      >
        Browse markets -&gt;
      </Link>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="border border-line divide-y divide-line">
      {Array.from({ length: 4 }).map((_, row) => (
        <div
          key={row}
          className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_1fr_1fr_1fr_112px] gap-5 lg:gap-4 px-5 py-5"
        >
          {Array.from({ length: 5 }).map((__, cell) => (
            <div
              key={cell}
              className="h-4 skeleton"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function NoticeState({
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
      <h2 className="type-headline mb-3">{title}</h2>
      <p className="text-ink-mute text-sm max-w-md mx-auto leading-relaxed">
        {body}
      </p>
    </div>
  );
}
