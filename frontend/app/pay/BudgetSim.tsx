"use client";

import { useState } from "react";

// Interactive budget simulator — tinker with price / cap / budget and see how
// many calls an agent gets and when a call is blocked. Pure client-side.
export function BudgetSim() {
  const [price, setPrice] = useState(0.01);
  const [cap, setCap] = useState(0.05);
  const [budget, setBudget] = useState(1.0);

  const blocked = price > cap;
  const calls = blocked ? 0 : Math.floor(budget / price);
  const spend = blocked ? 0 : +(calls * price).toFixed(4);

  return (
    <div className="sim">
      <div className="sim-l">
        <Row label="Price per call" val={`${price.toFixed(3)} USDC`}>
          <input type="range" min={0.001} max={0.1} step={0.001} value={price} onChange={(e) => setPrice(+e.target.value)} />
        </Row>
        <Row label="Per-call cap" val={`${cap.toFixed(3)} USDC`}>
          <input type="range" min={0.001} max={0.2} step={0.001} value={cap} onChange={(e) => setCap(+e.target.value)} />
        </Row>
        <Row label="Agent budget" val={`${budget.toFixed(2)} USDC`}>
          <input type="range" min={0.1} max={50} step={0.1} value={budget} onChange={(e) => setBudget(+e.target.value)} />
        </Row>
      </div>
      <div className="sim-r">
        {blocked ? (
          <>
            <div className="sim-big bad">Blocked</div>
            <div className="sim-cap">Price ({price.toFixed(3)}) is above the per-call cap ({cap.toFixed(3)}). The agent refuses to pay — a guardrail, not a failure.</div>
          </>
        ) : (
          <>
            <div className="sim-big">{calls.toLocaleString()}</div>
            <div className="sim-cap">calls before the budget runs out · <b>{spend} USDC</b> total. After that, the agent stops paying — automatically.</div>
            <div className="sim-bar"><span style={{ width: `${Math.min(100, (price / cap) * 100)}%` }} /></div>
            <div className="sim-hint">bar = price vs. cap · headroom before a single call is rejected</div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, val, children }: { label: string; val: string; children: React.ReactNode }) {
  return (
    <div className="sim-row">
      <div className="sim-rl"><span>{label}</span><span className="mono">{val}</span></div>
      {children}
    </div>
  );
}
