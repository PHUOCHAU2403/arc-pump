"use client";

import Link from "next/link";
import { useActivityFeed, type FeedItem } from "@/hooks/useActivityFeed";
import {
  formatTokens,
  formatUsdc,
  shortAddr,
  timeAgo,
} from "@/lib/blockchain";

/**
 * Global activity feed across ALL tokens.
 * Renders on the home page as a "Live tape" section.
 *
 * Each row: type · token · token amount · USDC · trader · time · explorer link.
 */
export function ActivityFeed({ limit = 20 }: { limit?: number }) {
  const { data: feed, isLoading, isError } = useActivityFeed(limit);

  return (
    <section className="max-w-6xl mx-auto px-6 sm:px-8 py-20 sm:py-24 border-t border-line">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10 pb-6 border-b border-line">
        <div>
          <div className="type-kicker mb-2">Live tape</div>
          <h2 className="type-headline">
            Recent activity
          </h2>
        </div>
        <div className="text-sm text-ink-mute font-mono">
          {feed ? String(feed.length).padStart(3, "0") : "—"} latest
        </div>
      </header>

      {isLoading ? (
        <LoadingRows />
      ) : isError ? (
        <NoticeRow eyebrow="Tape unavailable" body="Refresh to retry." />
      ) : !feed || feed.length === 0 ? (
        <NoticeRow
          eyebrow="No activity yet"
          body="Trades from any token will appear here in real time."
        />
      ) : (
        <FeedTable feed={feed} />
      )}
    </section>
  );
}

function FeedTable({ feed }: { feed: FeedItem[] }) {
  return (
    <div className="border border-line">
      <div className="hidden md:grid grid-cols-[80px_minmax(180px,1.4fr)_1fr_1fr_1fr_72px] gap-4 px-5 py-3 bg-paper-soft border-b border-line type-kicker text-[10px]">
        <span>Type</span>
        <span>Token</span>
        <span>Amount</span>
        <span>USDC</span>
        <span>Trader</span>
        <span className="text-right">Tx</span>
      </div>

      <div className="divide-y divide-line">
        {feed.map((row) => (
          <FeedRow key={`${row.txHash}-${row.logIndex}`} row={row} />
        ))}
      </div>
    </div>
  );
}

function FeedRow({ row }: { row: FeedItem }) {
  const isBuy = row.type === "buy";
  const fallbackImg = `https://api.dicebear.com/9.x/initials/svg?seed=${row.tokenSymbol}&backgroundColor=ebebe3&textColor=0a0a0a`;
  const img = row.tokenImage || fallbackImg;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[80px_minmax(180px,1.4fr)_1fr_1fr_1fr_72px] gap-3 md:gap-4 px-5 py-4 bg-paper hover:bg-paper-soft transition-colors">
      <div className="flex md:block items-center gap-3">
        <span
          className={`inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border ${
            isBuy
              ? "border-good text-good"
              : "border-bad text-bad"
          }`}
        >
          {isBuy ? "Buy" : "Sell"}
        </span>
      </div>

      <Link
        href={`/token/${row.tokenAddress}`}
        className="flex items-center gap-3 min-w-0 group"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img}
          alt={row.tokenSymbol}
          className="w-8 h-8 object-cover border border-line shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).src = fallbackImg;
          }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-sm text-ink truncate group-hover:text-accent transition-colors">
              ${row.tokenSymbol}
            </div>
            <span
              className="text-[9px] font-mono tracking-wider uppercase px-1 py-0 border border-line text-ink-mute leading-tight"
              title={`Factory v${row.tokenVersion}`}
            >
              v{row.tokenVersion}
            </span>
          </div>
          <div className="md:hidden text-[11px] text-ink-mute font-mono">
            {row.tokenName}
          </div>
        </div>
      </Link>

      <Cell
        mobileLabel="Amount"
        value={formatTokens(row.tokenAmount)}
        unit={`$${row.tokenSymbol}`}
      />
      <Cell
        mobileLabel="USDC"
        value={formatUsdc(row.usdcAmount, 4)}
        unit="USDC"
      />
      <Cell
        mobileLabel="Trader"
        value={shortAddr(row.trader)}
        unit={timeAgo(row.timestamp)}
      />

      <div className="md:text-right">
        <a
          href={`https://testnet.arcscan.app/tx/${row.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="link-quiet text-xs font-mono"
        >
          tx →
        </a>
      </div>
    </div>
  );
}

function Cell({
  mobileLabel,
  value,
  unit,
}: {
  mobileLabel: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <div className="md:hidden type-kicker mb-0.5 text-[10px]">
        {mobileLabel}
      </div>
      <div className="text-sm text-ink font-mono">{value}</div>
      {unit && (
        <div className="text-[11px] text-ink-mute font-mono mt-0.5">{unit}</div>
      )}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="border border-line divide-y divide-line">
      {Array.from({ length: 4 }).map((_, row) => (
        <div
          key={row}
          className="grid grid-cols-[80px_minmax(180px,1.4fr)_1fr_1fr_1fr_72px] gap-4 px-5 py-4"
        >
          {Array.from({ length: 6 }).map((__, cell) => (
            <div
              key={cell}
              className="h-3 bg-paper-soft border border-line animate-pulse"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function NoticeRow({ eyebrow, body }: { eyebrow: string; body: string }) {
  return (
    <div className="border border-line border-dashed py-12 px-6 text-center">
      <div className="type-kicker mb-2">{eyebrow}</div>
      <p className="text-ink-mute text-sm max-w-md mx-auto leading-relaxed">
        {body}
      </p>
    </div>
  );
}
