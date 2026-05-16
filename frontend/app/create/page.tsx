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
import { FACTORY_ABI, FACTORY_ADDRESS } from "@/lib/factory";
import { arcTestnet } from "@/lib/chains";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Navbar } from "@/components/Navbar";
import { decodeEventLog, formatEther } from "viem";

export default function CreatePage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const onArc = chainId === arcTestnet.id;

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [imageURI, setImageURI] = useState("");
  const [description, setDescription] = useState("");

  const { data: feeWei } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "createFee",
  });

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
          abi: FACTORY_ABI,
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
    if (!feeWei) return;

    writeContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "createToken",
      args: [
        name.trim(),
        symbol.trim().toUpperCase(),
        imageURI.trim(),
        description.trim(),
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
            A token is just a name plus a curve. Both live forever on Arc
            Testnet — choose them carefully.
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
              <Field
                label="Image URL"
                placeholder="https://"
                value={imageURI}
                onChange={setImageURI}
                hint="Optional. Any direct image link (PNG, JPG, SVG)."
              />
              <FieldTextarea
                label="Description"
                placeholder="What is this token about?"
                value={description}
                onChange={setDescription}
                max={280}
              />

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
                <Spec label="Max supply" value="1,000,000" mono />
                <Spec label="Start price" value="0 USDC" mono />
                <Spec
                  label="Slope"
                  value="1×10⁻⁹"
                  mono
                  hint="USDC per token per token sold"
                />
                <Spec label="Trading fee" value="0%" mono />
                <Spec label="Network" value="Arc Testnet" />
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
        A signature is required to deploy contracts on Arc Testnet. Any
        Web3 wallet with USDC will work.
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
        Switch to <span className="font-display italic">Arc Testnet</span>.
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
  if (msg.includes("insufficient funds")) {
    return "Wallet balance is too low for fee plus gas.";
  }
  return msg.slice(0, 140);
}
