"use client";

import type { Address } from "viem";
import { useTradeHistory } from "@/hooks/useTradeHistory";
import {
  formatTokens,
  formatUsdc,
  shortAddr,
  timeAgo,
} from "@/lib/blockchain";
import type { Trade } from "@/lib/types";

type TradeFeedProps = {
  curveAddress: Address | undefined;
  symbol?: string;
};

export function TradeFeed({ curveAddress, symbol }: TradeFeedProps) {
  const {
    data: trades,
    isLoading,
    isError,
    error,
  } = useTradeHistory(curveAddress, { limit: 50 });

  return (
    <section className="mt-16 sm:mt-20">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 pb-6 border-b border-line">
        <div>
          <div className="type-kicker mb-2">Tape</div>
          <h2 className="type-headline">Recent trades</h2>
        </div>
        <div className="text-xs text-ink-mute font-mono">
          {trades ? String(trades.length).padStart(2, "0") : "--"} events
        </div>
      </div>

      {!curveAddress ? (
        <FeedNotice
          eyebrow="Waiting for curve"
          title="Trade history appears once the market resolves."
          body="The token contract is loaded before its curve address is available."
        />
      ) : isLoading ? (
        <LoadingRows />
      ) : isError ? (
        <FeedNotice
          eyebrow="History unavailable"
          title="The trade tape could not be loaded."
          body={error instanceof Error ? error.message : "Refresh the page to try again."}
        />
      ) : !trades || trades.length === 0 ? (
        <FeedNotice
          eyebrow="No trades yet"
          title="The tape is still clean."
          body="The first buy or sell on this curve will appear here."
        />
      ) : (
        <div className="border border-line">
          <div className="hidden sm:grid grid-cols-[88px_1fr_1fr_120px_96px] gap-4 px-4 py-3 bg-paper-soft border-b border-line type-kicker text-[10px]">
            <span>Side</span>
            <span>Amount</span>
            <span>Notional</span>
            <span>Trader</span>
            <span className="text-right">Time</span>
          </div>
          <div className="divide-y divide-line">
            {trades.map((trade) => (
              <TradeRow key={`${trade.txHash}-${trade.logIndex}`} trade={trade} symbol={symbol} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TradeRow({ trade, symbol }: { trade: Trade; symbol?: string }) {
  const isBuy = trade.type === "buy";
  const sideClass = isBuy ? "text-good" : "text-bad";

  return (
    <a
      href={`https://testnet.arcscan.app/tx/${trade.txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="grid grid-cols-1 sm:grid-cols-[88px_1fr_1fr_120px_96px] gap-3 sm:gap-4 px-4 py-4 bg-paper hover:bg-paper-soft"
    >
      <div className={`type-kicker ${sideClass}`}>{isBuy ? "Buy" : "Sell"}</div>

      <div>
        <div className="sm:hidden type-kicker mb-1 text-[10px]">Amount</div>
        <div className="type-mono-stat text-sm text-ink">
          {formatTokens(trade.tokenAmount)}
          <span className="ml-1 text-xs text-ink-mute">
            {symbol ? `$${symbol}` : "tokens"}
          </span>
        </div>
      </div>

      <div>
        <div className="sm:hidden type-kicker mb-1 text-[10px]">Notional</div>
        <div className="type-mono-stat text-sm text-ink">
          {formatUsdc(trade.usdcAmount, 6)}
          <span className="ml-1 text-xs text-ink-mute">USDC</span>
        </div>
      </div>

      <div>
        <div className="sm:hidden type-kicker mb-1 text-[10px]">Trader</div>
        <div className="font-mono text-xs text-ink-mute">{shortAddr(trade.trader)}</div>
      </div>

      <div className="sm:text-right">
        <div className="sm:hidden type-kicker mb-1 text-[10px]">Time</div>
        <div className="font-mono text-xs text-ink-mute">{timeAgo(trade.timestamp)}</div>
      </div>
    </a>
  );
}

function LoadingRows() {
  return (
    <div className="border border-line divide-y divide-line">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-1 sm:grid-cols-[88px_1fr_1fr_120px_96px] gap-3 sm:gap-4 px-4 py-4"
        >
          {Array.from({ length: 5 }).map((__, cell) => (
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

function FeedNotice({
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
