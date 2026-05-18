"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { FACTORY_V2_ABI, FACTORY_V2_ADDRESS } from "@/lib/factory";
import { arcTestnet } from "@/lib/chains";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Navbar } from "@/components/Navbar";
import { decodeEventLog, formatEther } from "viem";

const WEI = 10n ** 18n;
const DEFAULT_MAX_SUPPLY_TOKENS = 1_000_000;
const MIN_MAX_SUPPLY_TOKENS = 1_000;
const MAX_MAX_SUPPLY_TOKENS = 1_000_000_000_000; // 1T
const DEFAULT_FEE_BPS = 100; // 1%
const MAX_FEE_BPS = 500; // 5%

const FEE_PRESETS = [0, 50, 100, 200, 500]; // basis points

export default function CreatePage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [imageURI, setImageURI] = useState("");
  const [description, setDescription] = useState("");
  const [maxSupplyInput, setMaxSupplyInput] = useState(
    String(DEFAULT_MAX_SUPPLY_TOKENS)
  );
  const [feeBps, setFeeBps] = useState(DEFAULT_FEE_BPS);

  const { data: feeWei } = useReadContract({
    address: FACTORY_V2_ADDRESS,
    abi: FACTORY_V2_ABI,
    functionName: "createFee",
  });

  const maxSupplyTokens = parseSupply(maxSupplyInput);
  const maxSupplyValid =
    maxSupplyTokens >= MIN_MAX_SUPPLY_TOKENS &&
    maxSupplyTokens <= MAX_MAX_SUPPLY_TOKENS;
  const maxSupplyWei = BigInt(maxSupplyTokens) * WEI;

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (!isSuccess || !receipt) return;
    for (const log of receipt.logs) {
      try {
        const parsed = decodeEventLog({
          abi: FACTORY_V2_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (parsed.eventName === "TokenCreated") {
          const args = parsed.args as { token: `0x${string}` };
          router.push(`/token/${args.token}`);
          return;
        }
      } catch {
        /* not factory event */
      }
    }
  }, [isSuccess, receipt, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feeWei || !maxSupplyValid) return;

    writeContract({
      address: FACTORY_V2_ADDRESS,
      abi: FACTORY_V2_ABI,
      functionName: "createToken",
      args: [
        name.trim(),
        symbol.trim().toUpperCase(),
        imageURI.trim(),
        description.trim(),
        maxSupplyWei,
        feeBps,
      ],
      value: feeWei as bigint,
    });
  };

  const fee = feeWei ? formatEther(feeWei as bigint) : "1";
  const previewImg =
    imageURI ||
    `https://api.dicebear.com/9.x/initials/svg?seed=${symbol || "preview"}&backgroundColor=ebebe3&textColor=0a0a0a`;

  const canSubmit =
    name.trim().length > 0 &&
    symbol.trim().length > 0 &&
    symbol.trim().length <= 10 &&
    maxSupplyValid &&
    feeBps <= MAX_FEE_BPS &&
    feeBps >= 0 &&
    !isPending &&
    !isConfirming;

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 sm:px-8 py-16 sm:py-24">
        <div className="max-w-2xl mb-16">
          <div className="type-kicker mb-4">New launch</div>
          <h1 className="type-headline mb-4">
            Define the asset.{" "}
            <span className="font-display italic text-accent">
              Then deploy.
            </span>
          </h1>
          <p className="text-ink-mute leading-relaxed">
            A token is just a name plus a curve. Both live forever onchain —
            choose them carefully.
          </p>
        </div>

        {!isConnected ? (
          <NotConnected />
        ) : !onArc ? (
          <WrongNetwork />
        ) : (
          <div className="grid lg:grid-cols-[1fr_400px] gap-12">
            {/* ============ FORM ============ */}
            <form
              onSubmit={handleSubmit}
              className="space-y-8 pr-0 lg:pr-12 lg:border-r border-line"
            >
              <Field
                label="Name"
                placeholder="e.g. Pepe the Frog"
                value={name}
                onChange={setName}
                max={32}
              />
              <Field
                label="Ticker"
                placeholder="PEPE"
                value={symbol}
                onChange={(v) => setSymbol(v.toUpperCase())}
                max={10}
                hint="Up to 10 characters. Uppercase only."
                mono
              />
              <ImageField
                value={imageURI}
                onChange={setImageURI}
                symbol={symbol}
              />
              <FieldTextarea
                label="Description"
                placeholder="What is this token about?"
                value={description}
                onChange={setDescription}
                max={280}
              />

              <div className="pt-6 border-t border-line space-y-6">
                <div className="type-kicker">Tokenomics</div>

                <Field
                  label="Max supply"
                  placeholder="1000000"
                  value={maxSupplyInput}
                  onChange={(v) =>
                    setMaxSupplyInput(v.replace(/[^0-9]/g, ""))
                  }
                  hint={
                    maxSupplyValid
                      ? `${formatSupplyHint(maxSupplyTokens)} tokens · cap on the bonding curve`
                      : `Must be between ${MIN_MAX_SUPPLY_TOKENS.toLocaleString()} and ${MAX_MAX_SUPPLY_TOKENS.toLocaleString()}`
                  }
                  mono
                />

                <FeeSelector value={feeBps} onChange={setFeeBps} />
              </div>

              <div className="pt-8 border-t border-line">
                <div className="flex justify-between items-baseline mb-6">
                  <span className="type-kicker">Launch fee</span>
                  <span className="type-mono-stat text-2xl">
                    {fee}{" "}
                    <span className="text-sm text-ink-mute">USDC</span>
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="btn-primary w-full py-4 text-sm font-medium tracking-wide rounded-sm"
                >
                  {isPending
                    ? "Awaiting signature…"
                    : isConfirming
                      ? "Broadcasting…"
                      : "Deploy token →"}
                </button>

                {hash && (
                  <p className="mt-4 text-xs text-ink-mute font-mono text-center">
                    tx{" "}
                    <a
                      href={`https://testnet.arcscan.app/tx/${hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-quiet"
                    >
                      {hash.slice(0, 10)}…{hash.slice(-8)}
                    </a>
                  </p>
                )}
                {error && (
                  <p className="mt-3 text-xs text-bad text-center">
                    {parseError(error.message)}
                  </p>
                )}
              </div>
            </form>

            {/* ============ PREVIEW ============ */}
            <aside>
              <div className="type-kicker mb-4">Preview</div>
              <div className="card p-6 mb-6">
                <div className="flex items-start gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewImg}
                    alt="preview"
                    className="w-14 h-14 object-cover border border-line"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-xl text-ink truncate">
                      {name || "Unnamed token"}
                    </div>
                    <div className="text-xs font-mono text-ink-mute mt-0.5">
                      ${symbol || "TICKER"}
                    </div>
                  </div>
                </div>
                {description && (
                  <p className="mt-5 pt-5 border-t border-line text-sm text-ink-mute leading-relaxed">
                    {description}
                  </p>
                )}
              </div>

              <div className="space-y-4 text-sm">
                <Spec label="Curve" value="Linear" />
                <Spec
                  label="Max supply"
                  value={
                    maxSupplyValid
                      ? formatSupplyHint(maxSupplyTokens)
                      : "—"
                  }
                  mono
                />
                <Spec label="Start price" value="0 USDC" mono />
                <Spec
                  label="Slope"
                  value="1×10⁻⁹"
                  mono
                  hint="USDC per token per token sold"
                />
                <Spec
                  label="Trade fee"
                  value={`${(feeBps / 100).toFixed(2)}%`}
                  mono
                  hint={
                    feeBps > 0
                      ? "80% to you, 20% to protocol"
                      : "Free trades"
                  }
                />
                <Spec label="Network" value="Arc" />
                <Spec label="Factory" value="v2" mono />
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

// ============ SUB COMPONENTS ============

function Field({
  label,
  placeholder,
  value,
  onChange,
  max,
  hint,
  mono,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-sm font-medium text-ink">{label}</label>
        {max && (
          <span className="text-[11px] text-ink-faint font-mono">
            {value.length}/{max}
          </span>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        placeholder={placeholder}
        className={`w-full px-0 py-3 bg-transparent border-b border-line focus:outline-none focus:border-ink text-base placeholder:text-ink-faint ${mono ? "font-mono" : ""}`}
      />
      {hint && <p className="text-[11px] text-ink-faint mt-2">{hint}</p>}
    </div>
  );
}

function FieldTextarea({
  label,
  placeholder,
  value,
  onChange,
  max,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-sm font-medium text-ink">{label}</label>
        <span className="text-[11px] text-ink-faint font-mono">
          {value.length}/{max}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        placeholder={placeholder}
        rows={3}
        className="w-full px-0 py-3 bg-transparent border-b border-line focus:outline-none focus:border-ink text-base placeholder:text-ink-faint resize-none"
      />
    </div>
  );
}

function ImageField({
  value,
  onChange,
  symbol,
}: {
  value: string;
  onChange: (v: string) => void;
  symbol: string;
}) {
  const pinataJwt = process.env.NEXT_PUBLIC_PINATA_JWT;
  const [mode, setMode] = useState<"upload" | "url">(
    pinataJwt ? "upload" : "url"
  );
  const [preview, setPreview] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError("");

    if (!isSupportedImage(file)) {
      setUploadError("Use PNG, JPG, SVG, or WebP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image must be 5MB or smaller.");
      return;
    }

    if (!pinataJwt) {
      setMode("url");
      setUploadError("Pinata JWT missing. Paste an image URL instead.");
      return;
    }

    const nextPreview = URL.createObjectURL(file);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextPreview;
    });

    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const response = await fetch(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${pinataJwt}` },
          body: form,
        }
      );

      if (!response.ok) {
        throw new Error(`Pinata upload failed with ${response.status}.`);
      }

      const body: unknown = await response.json();
      const hash = readIpfsHash(body);
      if (!hash) throw new Error("Pinata response did not include an IPFS hash.");

      onChange(`https://gateway.pinata.cloud/ipfs/${hash}`);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed. Paste a URL instead."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const displayImg =
    preview ||
    value ||
    `https://api.dicebear.com/9.x/initials/svg?seed=${symbol || "preview"}&backgroundColor=ebebe3&textColor=0a0a0a`;

  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-sm font-medium text-ink">Image</label>
        <span className="text-[11px] text-ink-faint font-mono">max 5MB</span>
      </div>

      {mode === "upload" ? (
        <div>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files[0]);
            }}
            className="flex items-center gap-4 border border-line border-dashed p-4 cursor-pointer hover:border-line-strong"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImg}
              alt="token preview"
              className="w-16 h-16 object-cover border border-line"
            />
            <div className="min-w-0">
              <div className="text-sm text-ink">
                {isUploading
                  ? "Uploading to IPFS..."
                  : value
                    ? "Image pinned to IPFS."
                    : "Drop image or click to select."}
              </div>
              <div className="text-[11px] text-ink-faint mt-1">
                PNG, JPG, SVG, or WebP.
              </div>
            </div>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
          <button
            type="button"
            onClick={() => setMode("url")}
            className="link-quiet text-xs mt-3"
          >
            Or paste URL
          </button>
        </div>
      ) : (
        <div>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://"
            className="w-full px-0 py-3 bg-transparent border-b border-line focus:outline-none focus:border-ink text-base placeholder:text-ink-faint"
          />
          <div className="flex justify-between gap-4 mt-2">
            <p className="text-[11px] text-ink-faint">
              Optional. Any direct image link.
            </p>
            {pinataJwt && (
              <button
                type="button"
                onClick={() => setMode("upload")}
                className="link-quiet text-xs"
              >
                Upload file
              </button>
            )}
          </div>
        </div>
      )}

      {!pinataJwt && (
        <p className="text-[11px] text-ink-faint mt-2">
          Pinata upload is disabled until NEXT_PUBLIC_PINATA_JWT is configured.
        </p>
      )}
      {uploadError && (
        <p className="text-[11px] text-bad mt-2">{uploadError}</p>
      )}
    </div>
  );
}

function Spec({
  label,
  value,
  mono,
  hint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex justify-between items-baseline py-3 border-b border-line">
      <div>
        <div className="text-sm text-ink-mute">{label}</div>
        {hint && <div className="text-[10px] text-ink-faint mt-0.5">{hint}</div>}
      </div>
      <div className={`text-sm text-ink ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function NotConnected() {
  return (
    <div className="card p-16 text-center">
      <div className="type-kicker mb-4">Authentication required</div>
      <h2 className="type-headline mb-4">Connect a wallet to continue.</h2>
      <p className="text-ink-mute text-sm mb-8 max-w-md mx-auto">
        A signature is required to deploy contracts on Arc. Any Web3 wallet
        with USDC will work.
      </p>
      <div className="flex justify-center">
        <ConnectButton />
      </div>
    </div>
  );
}

function WrongNetwork() {
  return (
    <div className="card p-16 text-center">
      <div className="type-kicker mb-4 text-bad">Wrong network</div>
      <h2 className="type-headline mb-4">
        Switch to <span className="font-display italic">Arc Network</span>.
      </h2>
      <p className="text-ink-mute text-sm mb-8 max-w-md mx-auto">
        Chain ID 5042002. Your wallet is currently on a different network.
      </p>
      <div className="flex justify-center">
        <ConnectButton />
      </div>
    </div>
  );
}

function parseError(msg: string): string {
  if (msg.includes("User rejected") || msg.includes("user rejected")) {
    return "Transaction was cancelled.";
  }
  if (msg.includes("InsufficientFee")) {
    return "Insufficient USDC for launch fee.";
  }
  if (msg.includes("MaxSupplyOutOfRange")) {
    return "Max supply outside allowed range.";
  }
  if (msg.includes("TradeFeeTooHigh")) {
    return "Trade fee exceeds 5% cap.";
  }
  if (msg.includes("insufficient funds")) {
    return "Wallet balance is too low for fee plus gas.";
  }
  return msg.slice(0, 140);
}

function parseSupply(input: string): number {
  const cleaned = input.replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  return Number(cleaned);
}

function formatSupplyHint(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString();
}

function FeeSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (bps: number) => void;
}) {
  const [custom, setCustom] = useState(
    FEE_PRESETS.includes(value) ? "" : (value / 100).toFixed(2)
  );

  const handleCustom = (raw: string) => {
    setCustom(raw);
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 0 && num <= 5) {
      onChange(Math.round(num * 100));
    }
  };

  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-sm font-medium text-ink">Trade fee</label>
        <span className="text-[11px] text-ink-faint font-mono">
          {(value / 100).toFixed(2)}%
        </span>
      </div>
      <div className="grid grid-cols-5 gap-px bg-line border border-line mb-3">
        {FEE_PRESETS.map((bps) => (
          <button
            key={bps}
            type="button"
            onClick={() => {
              onChange(bps);
              setCustom("");
            }}
            className={`py-2 text-xs font-mono ${
              value === bps
                ? "bg-paper-soft text-ink"
                : "bg-paper text-ink-mute hover:text-ink"
            }`}
          >
            {bps === 0 ? "0%" : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 border-b border-line">
        <input
          type="number"
          min="0"
          max="5"
          step="0.1"
          value={custom}
          onChange={(e) => handleCustom(e.target.value)}
          placeholder="Custom (0–5)"
          className="flex-1 bg-transparent py-2 text-sm font-mono focus:outline-none placeholder:text-ink-faint"
        />
        <span className="text-xs text-ink-mute font-mono">%</span>
      </div>
      <p className="text-[11px] text-ink-faint mt-2 leading-relaxed">
        {value > 0
          ? "Charged on each buy and sell. You receive 80% of fees, protocol receives 20%."
          : "Free trades for users. You earn nothing from trade flow."}
      </p>
    </div>
  );
}

function isSupportedImage(file: File): boolean {
  const allowedTypes = new Set([
    "image/png",
    "image/jpeg",
    "image/svg+xml",
    "image/webp",
  ]);
  return allowedTypes.has(file.type);
}

function readIpfsHash(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const hash = (value as { IpfsHash?: unknown }).IpfsHash;
  return typeof hash === "string" ? hash : undefined;
}
