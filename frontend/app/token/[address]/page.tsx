"use client";

import { use, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { PublicClient } from "viem";
import {
  FACTORY_V1_ABI,
  FACTORY_V1_ADDRESS,
  FACTORY_V2_ABI,
  FACTORY_V2_ADDRESS,
} from "@/lib/factory";
import { CURVE_V1_ABI, CURVE_V2_ABI } from "@/lib/curve";
import { TOKEN_ABI } from "@/lib/token";
import { arcTestnet } from "@/lib/chains";
import { formatUsdc } from "@/lib/blockchain";
import { useFlashOnChange } from "@/hooks/useFlashOnChange";
import { Navbar } from "@/components/Navbar";
import { HoldersList } from "@/components/HoldersList";
import { PriceChart } from "@/components/PriceChart";
import { TradeFeed } from "@/components/TradeFeed";

const WEI = 10n ** 18n;
const MAX_SEARCH_TOKENS = 1_000_000n;

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
  const publicClient = usePublicClient({ chainId: arcTestnet.id });

  // ============ VERSION DETECTION ============
  // Ask both factories for this token's curve. Whichever returns non-zero
  // tells us which version (and thus which curve ABI) to use.
  const { data: v2CurveRaw } = useReadContract({
    address: FACTORY_V2_ADDRESS,
    abi: FACTORY_V2_ABI,
    functionName: "curveOf",
    args: [tokenAddress],
  });
  const { data: v1CurveRaw } = useReadContract({
    address: FACTORY_V1_ADDRESS,
    abi: FACTORY_V1_ABI,
    functionName: "curveOf",
    args: [tokenAddress],
  });

  const ZERO = "0x0000000000000000000000000000000000000000";
  const v2Curve =
    v2CurveRaw && (v2CurveRaw as string).toLowerCase() !== ZERO
      ? (v2CurveRaw as `0x${string}`)
      : undefined;
  const v1Curve =
    v1CurveRaw && (v1CurveRaw as string).toLowerCase() !== ZERO
      ? (v1CurveRaw as `0x${string}`)
      : undefined;

  const tokenVersion: 1 | 2 | undefined = v2Curve ? 2 : v1Curve ? 1 : undefined;
  const curve = v2Curve ?? v1Curve;
  const CURVE_ABI = tokenVersion === 2 ? CURVE_V2_ABI : CURVE_V1_ABI;

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

  // v2-only reads — undefined for v1 tokens.
  const { data: tradeFeeBps } = useReadContract({
    address: curve,
    abi: CURVE_V2_ABI,
    functionName: "tradeFeeBps",
    query: { enabled: !!curve && tokenVersion === 2 },
  });
  const { data: creatorAddr } = useReadContract({
    address: curve,
    abi: CURVE_V2_ABI,
    functionName: "creator",
    query: { enabled: !!curve && tokenVersion === 2 },
  });
  const { data: creatorFeesAccrued, refetch: refetchCreatorFees } =
    useReadContract({
      address: curve,
      abi: CURVE_V2_ABI,
      functionName: "creatorFeesAccrued",
      query: { enabled: !!curve && tokenVersion === 2, refetchInterval: 8000 },
    });

  const isCreator =
    tokenVersion === 2 &&
    !!user &&
    !!creatorAddr &&
    (user as string).toLowerCase() === (creatorAddr as string).toLowerCase();

  // ============ STATE ============
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [inputMode, setInputMode] = useState<"tokens" | "usdc">("tokens");
  const [amount, setAmount] = useState("100");
  const [slippageBps, setSlippageBps] = useState(100);
  const [customSlippage, setCustomSlippage] = useState("1");
  const [showSlippage, setShowSlippage] = useState(false);

  const parsedAmount = parseDecimalToWei(amount);
  const tokenInputAmount = inputMode === "tokens" ? parsedAmount : 0n;
  const desiredUsdcAmount = inputMode === "usdc" ? parsedAmount : 0n;
  const sellSearchCap = mode === "sell" && balance ? (balance as bigint) : undefined;

  const { data: calculatedTokenAmount, isFetching: isCalculatingAmount } =
    useQuery({
      queryKey: [
        "tradeAmountForUsdc",
        curve,
        mode,
        desiredUsdcAmount.toString(),
        sellSearchCap?.toString() ?? "max",
      ],
      enabled:
        !!publicClient &&
        !!curve &&
        inputMode === "usdc" &&
        desiredUsdcAmount > 0n,
      queryFn: async () => {
        if (!publicClient || !curve) return 0n;
        return findTokenAmountForUsdc({
          client: publicClient,
          curve,
          mode,
          desiredUsdcWei: desiredUsdcAmount,
          maxTokenWei: sellSearchCap,
        });
      },
    });

  const tokenAmount =
    inputMode === "tokens" ? tokenInputAmount : calculatedTokenAmount ?? 0n;

  const { data: quote } = useReadContract({
    address: curve,
    abi: CURVE_ABI,
    functionName: mode === "buy" ? "getBuyCost" : "getSellReturn",
    args: tokenAmount > 0n ? [tokenAmount] : undefined,
    query: { enabled: !!curve && tokenAmount > 0n },
  });

  // Fee math (v2 only). v1 tokens have no fee, so feeWei stays 0n.
  //   buy:  total = cost + fee  →  msg.value must cover total
  //   sell: net   = grossRefund - fee  →  user actually receives `net`
  const feeBpsBigInt =
    tokenVersion === 2 && typeof tradeFeeBps === "number"
      ? BigInt(tradeFeeBps)
      : 0n;
  const quoteWei = (quote as bigint | undefined) ?? 0n;
  const feeWei =
    feeBpsBigInt > 0n ? (quoteWei * feeBpsBigInt) / 10_000n : 0n;
  const totalCostWei = mode === "buy" ? quoteWei + feeWei : 0n;
  const netSellWei = mode === "sell" ? quoteWei - feeWei : 0n;
  const displayQuoteWei = mode === "buy" ? totalCostWei : netSellWei;
  const maxValueSentWei =
    mode === "buy" && quote !== undefined
      ? applySlippageUp(totalCostWei, slippageBps)
      : 0n;

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: txSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (txSuccess) {
      refetchSupply();
      refetchBalance();
    }
  }, [txSuccess, refetchSupply, refetchBalance]);

  // Separate write hook for the creator fee claim flow — isolates its
  // pending/error state from the buy/sell flow so the trade UI doesn't
  // disable while a claim is in flight.
  const {
    writeContract: writeClaim,
    data: claimTxHash,
    isPending: isClaimSubmitting,
    error: claimError,
    reset: resetClaim,
  } = useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: claimSuccess } =
    useWaitForTransactionReceipt({ hash: claimTxHash });

  useEffect(() => {
    if (claimSuccess) {
      refetchCreatorFees();
    }
  }, [claimSuccess, refetchCreatorFees]);

  const handleClaimCreatorFees = () => {
    if (!curve || !user || tokenVersion !== 2) return;
    resetClaim();
    writeClaim({
      address: curve,
      abi: CURVE_V2_ABI,
      functionName: "claimCreatorFees",
      args: [user],
    });
  };

  const handleTrade = () => {
    if (!curve || tokenAmount <= 0n) return;
    if (mode === "buy") {
      writeContract({
        address: curve,
        abi: CURVE_ABI,
        functionName: "buy",
        args: [tokenAmount],
        // For v2 tokens, msg.value must cover cost + fee — slippage applied on
        // top of the post-fee total. For v1, feeWei is 0 so this reduces to
        // the v1 behaviour cleanly.
        value: maxValueSentWei,
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

  const handleInputModeSwitch = () => {
    const next = inputMode === "tokens" ? "usdc" : "tokens";
    setInputMode(next);
    setAmount(next === "tokens" ? "100" : "1");
  };

  const handleSlippagePreset = (bps: number) => {
    setSlippageBps(bps);
    setCustomSlippage((bps / 100).toString());
  };

  const handleCustomSlippage = (value: string) => {
    setCustomSlippage(value);
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setSlippageBps(Math.round(parsed * 100));
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
            flashValue={spotPrice as bigint | undefined}
          />
          <Stat
            label="Sold"
            value={formatNumber(supplyTokens)}
            unit={`of ${formatNumber(maxTokens)}`}
            flashValue={totalSupply as bigint | undefined}
          />
          <Stat
            label="Curve progress"
            value={`${percentSold.toFixed(2)}`}
            unit="%"
            flashValue={Math.round(percentSold * 100)}
          />
          <Stat
            label="Raised"
            value={
              reserve ? (Number(reserve) / 1e18).toFixed(4) : "0.0000"
            }
            unit="USDC"
            flashValue={reserve as bigint | undefined}
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
            <div className="flex gap-4 justify-between mb-8 border-b border-line">
              <div className="flex gap-0">
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
              <div className="relative pb-2">
                <button
                  onClick={() => setShowSlippage((open) => !open)}
                  className="px-3 py-2 text-xs text-ink-mute hover:text-ink border border-line rounded-sm"
                >
                  Slippage {(slippageBps / 100).toFixed(2)}%
                </button>
                {showSlippage && (
                  <SlippagePopover
                    customSlippage={customSlippage}
                    onCustom={handleCustomSlippage}
                    onPreset={handleSlippagePreset}
                    slippageBps={slippageBps}
                  />
                )}
              </div>
            </div>

            {!isConnected ? (
              <ConnectGate label="Connect wallet to trade" />
            ) : !onArc ? (
              <ConnectGate label="Switch to Arc Network" />
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-baseline mb-2">
                    <label className="type-kicker">
                      {inputMode === "tokens"
                        ? `Amount (${symbol as string})`
                        : "Amount (USDC)"}
                    </label>
                    <button
                      onClick={handleInputModeSwitch}
                      className="text-[11px] text-ink-mute hover:text-ink"
                    >
                      switch to{" "}
                      {inputMode === "tokens" ? "USDC" : `$${symbol as string}`}
                    </button>
                    {mode === "sell" && inputMode === "tokens" && (
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
                    step={inputMode === "tokens" ? "1" : "0.01"}
                    className="w-full px-0 py-4 bg-transparent border-b border-line focus:outline-none focus:border-ink text-3xl font-mono"
                  />
                  <div className="flex gap-3 mt-3">
                    {(inputMode === "tokens"
                      ? [100, 1000, 10000, 100000]
                      : [1, 5, 10, 25]
                    ).map((n) => (
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
                  {inputMode === "usdc" && (
                    <div className="flex justify-between items-baseline pb-4 mb-4 border-b border-line">
                      <span className="text-sm text-ink-mute">
                        Estimated tokens
                      </span>
                      <span className="type-mono-stat text-xl">
                        {isCalculatingAmount
                          ? "..."
                          : formatTokenAmount(tokenAmount)}{" "}
                        <span className="text-sm text-ink-mute">
                          ${symbol as string}
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-ink-mute">
                      {mode === "buy" ? "You pay" : "You receive"}
                    </span>
                    <span className="type-mono-stat text-2xl">
                      {quote
                        ? (Number(displayQuoteWei) / 1e18).toFixed(6)
                        : "—"}{" "}
                      <span className="text-sm text-ink-mute">USDC</span>
                    </span>
                  </div>
                  {tokenVersion === 2 && feeWei > 0n && quote !== undefined && (
                    <div className="flex justify-between items-baseline text-[11px] text-ink-mute mt-2 pt-2 border-t border-line">
                      <span>
                        {mode === "buy"
                          ? `Base cost + ${(Number(tradeFeeBps ?? 0) / 100).toFixed(2)}% fee`
                          : `Gross − ${(Number(tradeFeeBps ?? 0) / 100).toFixed(2)}% fee`}
                      </span>
                      <span className="font-mono">
                        {(Number(quoteWei) / 1e18).toFixed(6)}
                        {mode === "buy" ? " + " : " − "}
                        {(Number(feeWei) / 1e18).toFixed(6)}
                      </span>
                    </div>
                  )}
                </div>

                {mode === "buy" && quote !== undefined && (
                  <div className="flex justify-between items-baseline text-xs text-ink-mute">
                    <span>Max value sent</span>
                    <span className="font-mono">
                      {(Number(maxValueSentWei) / 1e18).toFixed(6)} USDC
                    </span>
                  </div>
                )}

                {mode === "sell" && (
                  <p className="text-xs text-ink-mute leading-relaxed">
                    Note: sells execute at market price. This curve does not
                    expose slippage protection.
                  </p>
                )}

                <button
                  onClick={handleTrade}
                  disabled={
                    !quote ||
                    tokenAmount <= 0n ||
                    isPending ||
                    isConfirming ||
                    isCalculatingAmount
                  }
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

            {isCreator && (
              <CreatorPanel
                feesAccrued={(creatorFeesAccrued as bigint | undefined) ?? 0n}
                onClaim={handleClaimCreatorFees}
                isSubmitting={isClaimSubmitting}
                isConfirming={isClaimConfirming}
                claimSuccess={claimSuccess}
                claimError={claimError}
                claimTxHash={claimTxHash}
              />
            )}

            <div>
              <div className="type-kicker mb-4">Mechanics</div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-line pb-3">
                  <span className="text-ink-mute">Curve</span>
                  <span>Linear</span>
                </div>
                <div className="flex justify-between border-b border-line pb-3">
                  <span className="text-ink-mute">Factory</span>
                  <span className="font-mono">
                    {tokenVersion ? `v${tokenVersion}` : "—"}
                  </span>
                </div>
                <div className="border-b border-line pb-3">
                  <div className="flex justify-between">
                    <span className="text-ink-mute">Trade fee</span>
                    <span className="font-mono">
                      {formatFeePct(tokenVersion, tradeFeeBps as number | undefined)}
                    </span>
                  </div>
                  {tokenVersion === 2 &&
                    typeof tradeFeeBps === "number" &&
                    tradeFeeBps > 0 && (
                      <div className="text-[11px] text-ink-mute mt-2 leading-relaxed">
                        80% to creator · 20% to protocol
                      </div>
                    )}
                </div>
                <div className="flex justify-between border-b border-line pb-3">
                  <span className="text-ink-mute">Max supply</span>
                  <span className="font-mono">
                    {formatCompactSupply(maxTokens)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-mute">Chain</span>
                  <span>Arc</span>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <TradeFeed curveAddress={curve} symbol={symbol as string | undefined} />
        <HoldersList
          tokenAddress={tokenAddress}
          totalSupply={totalSupply as bigint | undefined}
        />
      </main>
    </div>
  );
}

// ============ COMPONENTS ============

function SlippagePopover({
  customSlippage,
  onCustom,
  onPreset,
  slippageBps,
}: {
  customSlippage: string;
  onCustom: (value: string) => void;
  onPreset: (bps: number) => void;
  slippageBps: number;
}) {
  const presets = [
    { label: "0.5%", value: 50 },
    { label: "1%", value: 100 },
    { label: "5%", value: 500 },
  ];

  return (
    <div className="absolute right-0 top-full z-20 w-64 border border-line bg-paper p-4">
      <div className="type-kicker mb-3">Slippage tolerance</div>
      <div className="grid grid-cols-3 gap-px bg-line border border-line mb-4">
        {presets.map((preset) => (
          <button
            key={preset.value}
            onClick={() => onPreset(preset.value)}
            className={`py-2 text-xs font-mono ${
              slippageBps === preset.value
                ? "bg-paper-soft text-ink"
                : "bg-paper text-ink-mute hover:text-ink"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label className="type-kicker mb-2 block text-[10px]">Custom</label>
      <div className="flex items-center border-b border-line">
        <input
          type="number"
          min="0"
          step="0.1"
          value={customSlippage}
          onChange={(e) => onCustom(e.target.value)}
          className="w-full bg-transparent py-2 text-sm font-mono focus:outline-none"
        />
        <span className="text-xs text-ink-mute font-mono">%</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  flashValue,
}: {
  label: string;
  value: string;
  unit?: string;
  /** Optional value to watch — when it changes, the stat briefly flashes accent. */
  flashValue?: bigint | number | string;
}) {
  const flashClass = useFlashOnChange(flashValue);
  return (
    <div className="bg-paper p-5">
      <div className="type-kicker mb-3 text-[10px]">{label}</div>
      <div
        className={`type-mono-stat text-lg sm:text-xl text-ink leading-tight truncate ${flashClass}`}
      >
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
  // Underline is a child element whose scaleX is driven by the active flag —
  // CSS handles the 220ms ease-out tween. Origin alternates left/right so it
  // visually "wipes" toward the active tab when switching between Buy and Sell.
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 text-sm font-medium relative -mb-px transition-colors duration-200 ${
        active ? "text-ink" : "text-ink-mute hover:text-ink"
      }`}
    >
      {children}
      <span
        aria-hidden
        className="absolute left-0 right-0 bottom-0 h-px bg-ink origin-left transition-transform duration-200 ease-out"
        style={{ transform: active ? "scaleX(1)" : "scaleX(0)" }}
      />
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

/**
 * Compact supply formatter: keeps round numbers clean (1M instead of 1.00M).
 */
function formatCompactSupply(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e12) return `${trimZeros(n / 1e12)}T`;
  if (n >= 1e9) return `${trimZeros(n / 1e9)}B`;
  if (n >= 1e6) return `${trimZeros(n / 1e6)}M`;
  if (n >= 1e3) return `${trimZeros(n / 1e3)}K`;
  return n.toFixed(0);
}

function trimZeros(n: number): string {
  // 1.00 → "1", 1.50 → "1.5", 1.23 → "1.23"
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, "");
}

/**
 * Format a curve's trade fee as a human percent.
 * v1 tokens have no fee; if the tokenVersion isn't known yet, return em-dash.
 */
function formatFeePct(
  version: 1 | 2 | undefined,
  bps: number | undefined
): string {
  if (version === 1) return "0%";
  if (version !== 2 || typeof bps !== "number") return "—";
  if (bps === 0) return "0%";
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`;
}

function formatTokenAmount(wei: bigint): string {
  const n = Number(wei) / 1e18;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(0);
  return n.toFixed(4);
}

function parseDecimalToWei(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed || !/^\d*(\.\d*)?$/.test(trimmed)) return 0n;

  const [whole = "0", fraction = ""] = trimmed.split(".");
  const wholeWei = BigInt(whole || "0") * WEI;
  const fractionWei = BigInt(fraction.padEnd(18, "0").slice(0, 18) || "0");

  return wholeWei + fractionWei;
}

function applySlippageUp(amount: bigint, bps: number): bigint {
  return (amount * (10_000n + BigInt(bps)) + 9_999n) / 10_000n;
}

async function findTokenAmountForUsdc({
  client,
  curve,
  desiredUsdcWei,
  maxTokenWei,
  mode,
}: {
  client: PublicClient;
  curve: `0x${string}`;
  desiredUsdcWei: bigint;
  maxTokenWei?: bigint;
  mode: "buy" | "sell";
}): Promise<bigint> {
  const capWhole =
    maxTokenWei && maxTokenWei > 0n ? maxTokenWei / WEI : MAX_SEARCH_TOKENS;
  const highLimit = capWhole > MAX_SEARCH_TOKENS ? MAX_SEARCH_TOKENS : capWhole;
  if (highLimit <= 0n) return 0n;

  let low = 1n;
  let high = highLimit;
  let best = 0n;

  while (low <= high) {
    const mid = (low + high) / 2n;
    const tokenAmount = mid * WEI;
    const quote = (await client.readContract({
      address: curve,
      abi: CURVE_V1_ABI,
      functionName: mode === "buy" ? "getBuyCost" : "getSellReturn",
      args: [tokenAmount],
    })) as bigint;

    if (mode === "buy") {
      if (quote <= desiredUsdcWei) {
        best = tokenAmount;
        low = mid + 1n;
      } else {
        high = mid - 1n;
      }
    } else if (quote >= desiredUsdcWei) {
      best = tokenAmount;
      high = mid - 1n;
    } else {
      low = mid + 1n;
    }
  }

  return best;
}

// ============ CREATOR PANEL ============

/**
 * Creator-only fee claim panel, rendered on the token detail aside for v2
 * tokens when the connected wallet matches the curve's creator address.
 *
 * Reads the current accrued creator share (80% of trade fees) and exposes a
 * single Claim action that withdraws to the connected wallet.
 */
function CreatorPanel({
  feesAccrued,
  onClaim,
  isSubmitting,
  isConfirming,
  claimSuccess,
  claimError,
  claimTxHash,
}: {
  feesAccrued: bigint;
  onClaim: () => void;
  isSubmitting: boolean;
  isConfirming: boolean;
  claimSuccess: boolean;
  claimError: Error | null;
  claimTxHash: `0x${string}` | undefined;
}) {
  const inFlight = isSubmitting || isConfirming;
  const disabled = inFlight || feesAccrued === 0n;

  return (
    <div className="border border-line bg-paper-soft p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="type-kicker">Creator earnings</div>
        <span className="text-[10px] font-mono tracking-wider uppercase px-1.5 py-0.5 border border-line text-ink-mute">
          you
        </span>
      </div>

      <div className="mb-1">
        <span className="type-mono-stat text-3xl text-ink">
          {formatUsdc(feesAccrued, 4)}
        </span>
        <span className="text-xs text-ink-mute font-mono ml-2">USDC</span>
      </div>
      <p className="text-[11px] text-ink-mute mb-5 leading-relaxed">
        Your 80% share of trade fees, claimable anytime.
      </p>

      <button
        onClick={onClaim}
        disabled={disabled}
        className="btn-primary w-full py-3 text-sm font-medium rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSubmitting
          ? "Confirm in wallet…"
          : isConfirming
            ? "Claiming…"
            : feesAccrued === 0n
              ? "Nothing to claim"
              : "Claim fees →"}
      </button>

      {claimSuccess && claimTxHash && (
        <div className="mt-4 pt-4 border-t border-line text-xs">
          <div className="text-good font-mono mb-1">✓ Claimed</div>
          <a
            href={`https://testnet.arcscan.app/tx/${claimTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="link-quiet font-mono break-all"
          >
            {claimTxHash.slice(0, 18)}…
          </a>
        </div>
      )}

      {claimError && (
        <div className="mt-4 pt-4 border-t border-line text-xs text-bad leading-relaxed">
          {parseClaimError(claimError)}
        </div>
      )}
    </div>
  );
}

function parseClaimError(err: Error): string {
  const msg = err.message || String(err);
  if (/User rejected|UserRejected|rejected/i.test(msg)) {
    return "Transaction rejected in wallet.";
  }
  if (/NotCreator/i.test(msg)) {
    return "Only the token creator can claim these fees.";
  }
  if (/NothingToClaim/i.test(msg)) {
    return "No fees have accrued yet.";
  }
  return "Claim failed. Refresh and try again.";
}
