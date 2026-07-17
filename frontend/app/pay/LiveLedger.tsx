"use client";

import { useEffect, useRef, useState } from "react";

// Live ledger — polls the service every 5s, animates newly-arrived purchases,
// and lets you expand a row for its invoice + on-chain detail.
const SVC = "https://agentpay-service.arcpump2403.workers.dev";
const ARCSCAN = "https://testnet.arcscan.app";

type Purchase = { invoice: string; amountUSDC: string; resource: string; agent?: string; agentName?: string; ts: number };
type Ledger = { purchases: Purchase[]; stats: { count: number; totalUSDC: number; agents: string[] } };

function ago(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60000), h = Math.floor(m / 60);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export function LiveLedger({ initial }: { initial: Ledger }) {
  const [led, setLed] = useState<Ledger>(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set(initial.purchases.map((p) => p.invoice)));

  useEffect(() => {
    let alive = true;
    fetch(`${SVC}/hit`).catch(() => {}); // count this page view (once per load)
    async function tick() {
      try {
        const d: Ledger = await (await fetch(`${SVC}/ledger?t=${Date.now()}`)).json();
        if (!alive) return;
        const newOnes = d.purchases.filter((p) => !seen.current.has(p.invoice)).map((p) => p.invoice);
        if (newOnes.length) {
          setFresh(new Set(newOnes));
          newOnes.forEach((i) => seen.current.add(i));
          setTimeout(() => alive && setFresh(new Set()), 1600);
        }
        setLed(d);
      } catch {}
    }
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const { purchases, stats } = led;

  return (
    <>
      <div className="stats">
        <div className="stat"><div className="n">{stats.count ?? 0}</div><div className="l">Paid calls</div></div>
        <div className="stat"><div className="n acc">{(stats.totalUSDC ?? 0).toFixed(2)}</div><div className="l">USDC settled</div></div>
        <div className="stat"><div className="n">{(stats.agents ?? []).length}</div><div className="l">Agents</div></div>
      </div>

      <div className="feed">
        {purchases.length === 0 ? (
          <div className="empty">No purchases yet — hit “Run it” above.</div>
        ) : (
          purchases.map((p) => (
            <div key={p.invoice} className={`frow ${fresh.has(p.invoice) ? "new" : ""} ${open === p.invoice ? "open" : ""}`} onClick={() => setOpen(open === p.invoice ? null : p.invoice)}>
              <div className="who">
                <span className="avatar" />
                <span className="wn">{p.agentName || "Agent"}</span>
                {p.agent ? <span className="waddr">{short(p.agent)}</span> : null}
              </div>
              <div className="what">paid for <code>{p.resource}</code></div>
              <div className="amt">+{p.amountUSDC} USDC</div>
              <div className="tm">{ago(p.ts)}</div>
              <div className="frow-x">
                <div><span className="xl">invoice</span> <span className="mono">{p.invoice}</span></div>
                <div>
                  <span className="xl">agent</span>{" "}
                  {p.agent ? <a className="lnk" href={`${ARCSCAN}/address/${p.agent}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{p.agent} ↗</a> : "—"}
                </div>
                <div><span className="xl">status</span> <span className="ok">verified on-chain · settled in USDC</span></div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
