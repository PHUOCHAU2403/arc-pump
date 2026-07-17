"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { parseEther } from "viem";

// "Pay with your own wallet" — the visitor connects a wallet and pays the
// invoice from their own address in native USDC on Arc, so their wallet (not the
// sponsor's) is what shows up on-chain and in the ledger.
const SVC = "https://agentpay-service.arcpump2403.workers.dev";
const ARCSCAN = "https://testnet.arcscan.app";
const ARC_ID = 5042002;
const ROUTER = "0x42bCE0940b286b29A7bE50c3C7c89302A48E28ff";
const routerAbi = [
  { type: "function", name: "pay", stateMutability: "payable", inputs: [{ name: "invoiceId", type: "bytes32" }, { name: "service", type: "address" }], outputs: [] },
] as const;

export function WalletPay() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<string | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pay() {
    if (!address || !publicClient) return;
    setBusy(true); setErr(null); setTx(null); setData(null);
    try {
      if (chainId !== ARC_ID) await switchChainAsync({ chainId: ARC_ID });
      const rb = await (await fetch(`${SVC}/premium?t=${Date.now()}`)).json();
      const inv = rb.invoice;
      const hash = await writeContractAsync({
        address: ROUTER, abi: routerAbi, functionName: "pay",
        args: [inv.id as `0x${string}`, inv.service as `0x${string}`],
        value: parseEther(inv.amountUSDC),
        chainId: ARC_ID,
      });
      setTx(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      const uj = await (await fetch(`${SVC}/premium?invoice=${inv.id}&t=${Date.now()}`, {
        headers: { "x-agent": address, "x-agent-name": "You" },
      })).json();
      setData(uj?.data?.insight || "unlocked");
    } catch (e) {
      const m = String((e as Error).message || e);
      setErr(/rejected|denied/i.test(m) ? "you rejected the transaction" : /insufficient/i.test(m) ? "not enough USDC on Arc testnet in this wallet" : m.slice(0, 140));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wp">
      <div className="wp-head">
        <div>
          <div className="wp-t">Or pay with your own wallet.</div>
          <div className="wp-s">Connect a wallet and pay the invoice yourself — your address (not the sponsor&rsquo;s) settles it on-chain.</div>
        </div>
        <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
      </div>

      {isConnected ? (
        <div className="wp-act">
          <button className="btn primary" onClick={pay} disabled={busy}>
            {busy ? "Confirm in wallet…" : "Pay 0.01 USDC yourself →"}
          </button>
          {tx ? (
            <a className="lnk" href={`${ARCSCAN}/tx/${tx}`} target="_blank" rel="noreferrer">your tx ↗</a>
          ) : null}
          {data ? <span className="wp-ok">✓ unlocked — settled from your wallet</span> : null}
        </div>
      ) : (
        <div className="wp-note">Connect above to pay from your own address.</div>
      )}

      {err ? <div className="pg-err">⚠ {err}</div> : null}
      <div className="wp-foot">Needs Arc testnet + a little test USDC in your wallet. Most visitors won&rsquo;t have it — that&rsquo;s what the sponsored demo above is for.</div>
    </div>
  );
}
