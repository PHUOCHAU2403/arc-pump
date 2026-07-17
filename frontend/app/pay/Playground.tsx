"use client";

import { useState } from "react";

// Interactive playground: the visitor clicks "Run it" and a REAL agent payment
// happens on Arc — request (402) → sponsored pay → on-chain confirm → unlock.
const SVC = "https://agentpay-service.arcpump2403.workers.dev";
const ARCSCAN = "https://testnet.arcscan.app";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Inv = { id: string; amountUSDC: string; service: string; router: string };

export function Playground() {
  const [stage, setStage] = useState(0); // 0 idle · 1 request · 2 pay · 3 unlock · 4 done
  const [running, setRunning] = useState(false);
  const [inv, setInv] = useState<Inv | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setRunning(true); setErr(null); setInv(null); setTx(null); setData(null);
    try {
      // 1 — request the resource, get a 402 + invoice
      setStage(1);
      const rb = await (await fetch(`${SVC}/premium?t=${Date.now()}`)).json();
      const invoice: Inv = rb.invoice;
      setInv(invoice);
      await sleep(650);

      // 2 — sponsored real payment on Arc
      setStage(2);
      const pj = await (await fetch(`${SVC}/demo-pay`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice: invoice.id }),
      })).json();
      if (!pj.id) throw new Error(pj.error || "payment failed");

      let hash: string | null = null;
      for (let i = 0; i < 20; i++) {
        await sleep(2500);
        const s = await (await fetch(`${SVC}/demo-status?id=${pj.id}&t=${Date.now()}`)).json();
        if (s.txHash) { hash = s.txHash; break; }
        if (s.error) throw new Error(s.error);
      }
      if (!hash) throw new Error("payment still confirming — try again in a moment");
      setTx(hash);
      await sleep(500);

      // 3 — verified on-chain → unlock the response
      setStage(3);
      const uj = await (await fetch(`${SVC}/premium?invoice=${invoice.id}&t=${Date.now()}`)).json();
      setData(uj?.data?.insight || JSON.stringify(uj?.data || uj));
      setStage(4);
    } catch (e) {
      setErr(String((e as Error).message || e));
      setStage(0); // stop the spinner; keep the error visible
    } finally {
      setRunning(false);
    }
  }

  const stepState = (n: number) => (stage > n ? "done" : stage === n ? "active" : "idle");

  return (
    <div className="pg">
      <div className="pg-head">
        <div>
          <div className="pg-t">Run the flow — for real.</div>
          <div className="pg-s">Click once. A real AI agent pays <b>0.01 USDC</b> on Arc to unlock the resource. You watch every step + the on-chain tx.</div>
        </div>
        <button className="btn primary" onClick={run} disabled={running}>
          {running ? "Running…" : stage === 4 ? "Run again" : "Run it →"}
        </button>
      </div>

      <div className="pg-steps">
        <Step n={1} state={stepState(1)} title="Request" mono={inv ? `402 · invoice ${inv.id.slice(0, 10)}…` : "GET /premium"}>
          {inv ? <>Service demands <b>{inv.amountUSDC} USDC</b> → paid to <span className="mono">{inv.service.slice(0, 8)}…</span></> : "The agent hits a paywalled resource."}
        </Step>
        <Step n={2} state={stepState(2)} title="Pay" mono={tx ? `settled · ${tx.slice(0, 12)}…` : "router.pay(invoice, service)"}>
          {tx ? <>Paid on Arc — <a className="lnk" href={`${ARCSCAN}/tx/${tx}`} target="_blank" rel="noreferrer">view tx ↗</a></> : "Agent's Circle wallet pays the invoice in native USDC."}
        </Step>
        <Step n={3} state={stepState(3)} title="Unlock" mono={data ? "200 OK · verified on-chain" : "GET /premium?invoice=…"}>
          {data ? <span className="pg-data">“{data}”</span> : "Service verifies the payment on-chain, then serves the data."}
        </Step>
      </div>

      {err ? <div className="pg-err">⚠ {err}</div> : null}
      <div className="pg-note">Sponsored demo · rate-limited · real testnet USDC on Arc. In production your own agent pays with its own wallet + budget.</div>
    </div>
  );
}

function Step({ n, state, title, mono, children }: { n: number; state: string; title: string; mono: string; children: React.ReactNode }) {
  return (
    <div className={`pgs ${state}`}>
      <div className="pgs-top">
        <span className="pgs-dot">{state === "done" ? "✓" : state === "active" ? <span className="spin" /> : n}</span>
        <span className="pgs-title">{title}</span>
      </div>
      <div className="pgs-mono mono">{mono}</div>
      <div className="pgs-body">{children}</div>
    </div>
  );
}
