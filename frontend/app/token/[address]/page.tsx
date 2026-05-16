"use client";

import { use, useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { FACTORY_ABI, FACTORY_ADDRESS } from "@/lib/factory";
import { CURVE_ABI } from "@/lib/curve";
import { TOKEN_ABI } from "@/lib/token";
import { arcTestnet } from "@/lib/chains";
import { Navbar } from "@/components/Navbar";
import { PriceChart } from "@/components/PriceChart";

export default function TokenPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: raw } = use(params);
  const tokenAddress = raw as `0x${string}`;
  const { address: user, isConnected } = useAccount();
  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;

  // ============ READS ============
  const { data: curveAddress } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "curveOf",
    args: [tokenAddress],
  });
  const curve = curveAddress as `0x${string}` | undefined;

  const { data: name } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: "name",
  });
  const { data: symbol } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: "symbol",
  });
  const { data: imageURI } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: "imageURI",
  });
  const { data: description } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: "description",
  });
  const { data: totalSupply, refetch: refetchSupply } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: "totalSupply",
    query: { refetchInterval: 5000 },
  });
  const { data: maxSupply } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: "MAX_SUPPLY",
  });
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    args: user ? [user] : undefined,
    query: { enabled: !!user, refetchInterval: 5000 },
  });
  const { data: spotPrice } = useReadContract({
    address: curve,
    abi: CURVE_ABI,
    functionName: "spotPrice",
    query: { enabled: !!curve, refetchInterval: 5000 },
  });
  const { data: reserve } = useReadContract({
    address: curve,
    abi: CURVE_ABI,
    functionName: "reserve",
    query: { enabled: !!curve, refetchInterval: 5000 },
  });

  // ============ STATE ============
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("100");

  const tokenAmount = (() => {
    try {
      const n = BigInt(Math.floor(Number(amount || "0")));
      return n * 10n ** 18n;
    } catch {
      return 0n;
    }
  })();

  const { data: quote } = useReadContract({
    address: curve,
    abi: CURVE_ABI,
    functionName: mode === "buy" ? "getBuyCost" : "getSellReturn",
    args: tokenAmount > 0n ? [tokenAmount] : undefined,
    query: { enabled: !!curve && tokenAmount > 0n },
  });

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: txSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (txSuccess) {
      refetchSupply();
      refetchBalance();
    }
  }, [txSuccess, refetchSupply, refetchBalance]);

  const handleTrade = () => {
    if (!curve || tokenAmount <= 0n) return;
    if (mode === "buy") {
      writeContract({
        address: curve,
        abi: CURVE_ABI,
        functionName: "buy",
        args: [tokenAmount],
        value: quote as bigint,
      });
    } else {
      writeContract({
        address: curve,
        abi: CURVE_ABI,
        functionName: "sell",
        args: [tokenAmount],
      });
    }
  };

  // ============ DERIVED ============
  const supplyTokens = totalSupply ? Number(totalSupply) / 1e18 : 0;
  const maxTokens = maxSupply ? Number(maxSupply) / 1e18 : 1_000_000;
  const percentSold = (supplyTokens / maxTokens) * 100;
  const balanceTokens = balance ? Number(balance) / 1e18 : 0;
  const fallbackImg = `https://api.dicebear.com/9.x/initials/svg?seed=${(symbol as string) || tokenAddress}&backgroundColor=ebebe3&textColor=0a0a0a`;

  // ============ LOADING ============
  if (!name) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-5xl mx-auto px-6 sm:px-8 py-32 text-center">
          <div className="type-kicker mb-4">Loading token</div>
          <p className="text-ink-mute font-mono text-sm">{tokenAddress}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 sm:px-8 py-12 sm:py-16">
        {/* ============ HEADER ============ */}
        <header className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start mb-12 pb-12 border-b border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={(imageURI as string) || fallbackImg}
            alt={(name as string) || "token"}
            className="w-24 h-24 object-cover border border-line"
            onError={(e) => {
              (e.target as HTMLImageElement).src = fallbackImg;
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="type-kicker mb-2">
              ${symbol as string}
            </div>
            <h1 className="type-headline mb-3 truncate">{name as string}</h1>
            {description && (
              <p className="text-ink-mute text-sm leading-relaxed mb-4 max-w-2xl">
                {description as string}
              </p>
            )}
            <a
              href={`https://testnet.arcscan.app/address/${tokenAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="link-quiet text-xs font-mono"
            >
              {tokenAddress}
            </a>
          </div>
        </header>

        {/* ============ STATS GRID ============ */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line border border-line mb-12">
          <Stat
            label="Spot price"
            value={
              spotPrice ? (Number(spotPrice) / 1e18).toFixed(6) : "—"
            }
            unit="USDC"
          />
          <Stat
            label="Sold"
            value={formatNumber(supplyTokens)}
            unit={`of ${formatNumber(maxTokens)}`}
          />
          <Stat
            label="Curve progress"
            value={`${percentSold.toFixed(2)}`}
            unit="%"
          />
          <Stat
            label="Raised"
            value={
              reserve ? (Number(reserve) / 1e18).toFixed(4) : "0.0000"
            }
            unit="USDC"
          />
        </section>

        {/* ============ PROGRESS ============ */}
        <section className="mb-12">
          <div className="flex justify-between items-baseline mb-3">
            <span className="type-kicker">Bonding curve</span>
            <span className="text-xs font-mono text-ink-mute">
              {percentSold.toFixed(2)}% filled
            </span>
          </div>
          <div className="h-px bg-line relative">
            <div
              className="absolute inset-y-0 left-0 bg-ink transition-all duration-500"
              style={{ width: `${Math.max(percentSold, 0.5)}%` }}
            />
          </div>
        </section>

        {/* ============ PRICE CHART ============ */}
        <section className="mb-12">
          <PriceChart curveAddress={curve} />
        </section>

        {/* ============ TRADE PANEL ============ */}
        <section className="grid lg:grid-cols-[1fr_320px] gap-12">
          {/* Trade form */}
          <div>
            <div className="flex gap-0 mb-8 border-b border-line">
              <TabButton
                active={mode === "buy"}
                onClick={() => setMode("buy")}
              >
                Buy
              </TabButton>
              <TabButton
                active={mode === "sell"}
                onClick={() => setMode("sell")}
              >
                Sell
              </TabButton>
            </div>

            {!isConnected ? (
              <ConnectGate label="Connect wallet to trade" />
            ) : !onArc ? (
              <ConnectGate label="Switch to Arc Testnet" />
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-baseline mb-2">
                    <label className="type-kicker">
                      Amount ({symbol as string})
                    </label>
                    {mode === "sell" && (
                      <button
                        onClick={() =>
                          setAmount(String(Math.floor(balanceTokens)))
                        }
                        className="text-[11px] text-ink-mute hover:text-ink"
                      >
                        max: {formatNumber(balanceTokens)}
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min="0"
                    step="1"
                    className="w-full px-0 py-4 bg-transparent border-b border-line focus:outline-none focus:border-ink text-3xl font-mono"
                  />
                  <div className="flex gap-3 mt-3">
                    {[100, 1000, 10000, 100000].map((n) => (
                      <button
                        key={n}
                        onClick={() => setAmount(String(n))}
                        className="text-xs text-ink-mute hover:text-ink font-mono"
                      >
                        {formatNumber(n)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="py-4 border-y border-line">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-ink-mute">
                      {mode === "buy" ? "You pay" : "You receive"}
                    </span>
                    <span className="type-mono-stat text-2xl">
                      {quote
                        ? (Number(quote) / 1e18).toFixed(6)
                        : "—"}{" "}
                      <span className="text-sm text-ink-mute">USDC</span>
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleTrade}
                  disabled={!quote || isPending || isConfirming}
                  className="btn-primary w-full py-4 text-sm font-medium tracking-wide rounded-sm"
                >
                  {isPending
                    ? "Awaiting signature…"
                    : isConfirming
                      ? "Broadcasting…"
                      : mode === "buy"
                        ? `Buy ${amount} $${symbol as string} →`
                        : `Sell ${amount} $${symbol as string} →`}
                </button>

                {txHash && (
                  <p className="text-xs text-ink-mute font-mono text-center">
                    tx{" "}
                    <a
                      href={`https://testnet.arcscan.app/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-quiet"
                    >
                      {txHash.slice(0, 10)}…{txHash.slice(-8)}
                    </a>
                  </p>
                )}
                {error && (
                  <p className="text-xs text-bad text-center">
                    {error.message.slice(0, 140)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Side: Holdings + Mechanics */}
          <aside className="space-y-10">
            <div>
              <div className="type-kicker mb-3">Your position</div>
              {isConnected ? (
                <div className="border-t border-line pt-4">
                  <div className="type-mono-stat text-3xl mb-1">
                    {formatNumber(balanceTokens)}
                  </div>
                  <div className="text-xs text-ink-mute">
                    ${symbol as string} ·{" "}
                    {balanceTokens > 0 && spotPrice
                      ? `≈ ${((balanceTokens * Number(spotPrice)) / 1e18).toFixed(4)} USDC`
                      : "—"}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-mute border-t border-line pt-4">
                  Connect a wallet to see balance.
                </p>
              )}
            </div>

            <div>
              <div className="type-kicker mb-4">Mechanics</div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-line pb-3">
                  <span className="text-ink-mute">Curve</span>
                  <span>Linear</span>
                </div>
                <div className="flex justify-between border-b border-line pb-3">
                  <span className="text-ink-mute">Trade fee</span>
                  <span className="font-mono">0%</span>
                </div>
                <div className="flex justify-between border-b border-line pb-3">
                  <span className="text-ink-mute">Max supply</span>
                  <span className="font-mono">
                    {formatNumber(maxTokens)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-mute">Chain</span>
                  <span>Arc Testnet</span>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

// ============ COMPONENTS ============

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="bg-paper p-5">
      <div className="type-kicker mb-3 text-[10px]">{label}</div>
      <div className="type-mono-stat text-lg sm:text-xl text-ink leading-tight truncate">
        {value}
      </div>
      {unit && (
        <div className="text-[11px] text-ink-mute font-mono mt-1 truncate">
          {unit}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 text-sm font-medium relative -mb-px border-b ${
        active
          ? "border-ink text-ink"
          : "border-transparent text-ink-mute hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ConnectGate({ label }: { label: string }) {
  return (
    <div className="border border-line py-12 text-center">
      <p className="text-sm text-ink-mute mb-6">{label}</p>
      <div className="flex justify-center">
        <ConnectButton />
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
}
