"use client";

import { useEffect, useState } from "react";

const WORKER_BASE =
  process.env.NEXT_PUBLIC_WORKER_URL ??
  "https://tempo-pump-mpp.arcpump2403.workers.dev";

type AgentActionType = "launch" | "buy" | "claim" | "heartbeat";

interface AgentAction {
  id: string;
  timestamp: number;
  type: AgentActionType;
  status: "success" | "error" | "skipped";
  summary: string;
  txHash?: string;
  tokenAddress?: string;
  curveAddress?: string;
  tokenSymbol?: string;
  tokenName?: string;
  amountTokens?: number;
  costPathUSD?: string;
  claimedPathUSD?: string;
  error?: string;
}

interface AgentStats {
  total: number;
  launches: number;
  buys: number;
  claims: number;
  heartbeats: number;
  errors: number;
  startedAt: number;
  lastActionAt: number;
  walletAddress: string;
  cronSchedule: string;
}

const TYPE_LABELS: Record<AgentActionType, string> = {
  launch: "Launch",
  buy: "Buy",
  claim: "Claim",
  heartbeat: "Heartbeat",
};

const TYPE_COLORS: Record<AgentActionType, string> = {
  launch: "var(--accent)",
  buy: "var(--good)",
  claim: "#a16207",
  heartbeat: "var(--ink-mute)",
};

export default function Page() {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [history, setHistory] = useState<AgentAction[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);

  // Auto-refresh data every 30s.
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [statsRes, histRes] = await Promise.all([
          fetch(`${WORKER_BASE}/agent/stats`).then((r) => r.json()),
          fetch(`${WORKER_BASE}/agent/history`).then((r) => r.json()),
        ]);
        if (!active) return;
        setStats(statsRes);
        setHistory(histRes.actions ?? []);
      } catch (err) {
        console.error("[dashboard] fetch failed", err);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Tick clock every second for countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const nextFireMs = nextCronFire(now);
  const countdown = formatCountdown(nextFireMs - now);
  const runningFor = stats?.startedAt
    ? formatDuration(now - stats.startedAt)
    : "—";

  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "48px 24px 96px",
      }}
    >
      {/* ============ HEADER ============ */}
      <header style={{ marginBottom: 56 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <span className="dot-live" />
          <span className="type-kicker">Live on Tempo mainnet</span>
        </div>

        <h1 className="type-display" style={{ margin: 0, marginBottom: 16 }}>
          Claude lives on{" "}
          <span style={{ color: "var(--accent)", fontStyle: "italic" }}>
            Tempo.
          </span>
        </h1>

        <p
          style={{
            fontSize: "1.125rem",
            color: "var(--ink-mute)",
            lineHeight: 1.6,
            maxWidth: 640,
            margin: 0,
          }}
        >
          An autonomous AI agent on Tempo mainnet. Every six hours it wakes up,
          picks an action — launch a memecoin, buy from a curve, claim creator
          fees, or send a heartbeat — and signs onchain. Forever.
        </p>

        <div
          style={{
            marginTop: 24,
            fontSize: 12,
            color: "var(--ink-faint)",
            fontFamily: "var(--font-mono)",
          }}
        >
          Wallet:{" "}
          <a
            className="link-quiet"
            href={`https://explore.tempo.xyz/address/${
              stats?.walletAddress ?? ""
            }`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {stats?.walletAddress ?? "—"}
          </a>{" "}
          · Schedule: every 6 hours · Cost per action: ~$0.06–0.23
        </div>
      </header>

      {/* ============ STAT STRIP ============ */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: "var(--line)",
          border: "1px solid var(--line)",
          marginBottom: 48,
        }}
      >
        <StatCell
          kicker="Next action in"
          value={loading ? "—" : countdown}
          unit=""
        />
        <StatCell
          kicker="Actions taken"
          value={loading ? "—" : String(stats?.total ?? 0)}
          unit="onchain"
        />
        <StatCell
          kicker="Running for"
          value={loading ? "—" : runningFor}
          unit=""
        />
        <StatCell
          kicker="Errors"
          value={loading ? "—" : String(stats?.errors ?? 0)}
          unit={
            stats && stats.errors === 0
              ? "all clean"
              : `${stats?.total ? Math.round((stats.errors / stats.total) * 100) : 0}%`
          }
        />
      </section>

      {/* ============ TYPE BREAKDOWN ============ */}
      {stats && stats.total > 0 ? (
        <section style={{ marginBottom: 48 }}>
          <div className="type-kicker" style={{ marginBottom: 12 }}>
            Action mix
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
            }}
          >
            <TypeChip label="Launches" count={stats.launches} color="var(--accent)" />
            <TypeChip label="Buys" count={stats.buys} color="var(--good)" />
            <TypeChip label="Claims" count={stats.claims} color="#a16207" />
            <TypeChip label="Heartbeats" count={stats.heartbeats} color="var(--ink-mute)" />
          </div>
        </section>
      ) : null}

      {/* ============ ACTIVITY FEED ============ */}
      <section>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingBottom: 16,
            borderBottom: "1px solid var(--line)",
            marginBottom: 16,
          }}
        >
          <div>
            <div className="type-kicker" style={{ marginBottom: 6 }}>
              Tape
            </div>
            <h2 className="type-headline" style={{ margin: 0 }}>
              What it&apos;s done so far
            </h2>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-mute)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {String(history.length).padStart(3, "0")} actions logged
          </div>
        </header>

        {loading ? (
          <Skeletons />
        ) : history.length === 0 ? (
          <EmptyTape />
        ) : (
          <div style={{ border: "1px solid var(--line)" }}>
            {history.map((action, i) => (
              <ActionRow
                key={action.id}
                action={action}
                showBorder={i > 0}
                now={now}
              />
            ))}
          </div>
        )}
      </section>

      {/* ============ FOOTER ============ */}
      <footer
        style={{
          marginTop: 80,
          paddingTop: 24,
          borderTop: "1px solid var(--line)",
          fontSize: 11,
          color: "var(--ink-faint)",
          textAlign: "center",
        }}
      >
        Powered by{" "}
        <a className="link-quiet" href="https://arcpump.com">
          Arc Pump
        </a>{" "}
        · Onchain on{" "}
        <a className="link-quiet" href="https://tempo.xyz">
          Tempo
        </a>{" "}
        · MPP-paid · No human signatures
      </footer>
    </main>
  );
}

function StatCell({
  kicker,
  value,
  unit,
}: {
  kicker: string;
  value: string;
  unit: string;
}) {
  return (
    <div
      style={{
        background: "var(--paper)",
        padding: "24px 20px",
      }}
    >
      <div className="type-kicker" style={{ marginBottom: 10 }}>
        {kicker}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
        }}
      >
        <span
          className="type-mono-stat"
          style={{ fontSize: 24, color: "var(--ink)" }}
        >
          {value}
        </span>
        {unit ? (
          <span
            style={{
              fontSize: 11,
              color: "var(--ink-mute)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TypeChip({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        padding: "16px 18px",
        background: "var(--paper)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: color,
            display: "inline-block",
          }}
        />
        <span className="type-kicker">{label}</span>
      </div>
      <div
        className="type-mono-stat"
        style={{ fontSize: 22, color: "var(--ink)" }}
      >
        {count}
      </div>
    </div>
  );
}

function ActionRow({
  action,
  showBorder,
  now,
}: {
  action: AgentAction;
  showBorder: boolean;
  now: number;
}) {
  const ago = formatRelative(now - action.timestamp);
  const isError = action.status === "error";
  const isSkipped = action.status === "skipped";

  return (
    <div
      style={{
        padding: "18px 20px",
        background: "var(--paper)",
        borderTop: showBorder ? "1px solid var(--line)" : undefined,
        display: "grid",
        gridTemplateColumns: "120px 1fr auto",
        gap: 20,
        alignItems: "center",
      }}
    >
      {/* type badge + relative time */}
      <div>
        <div
          style={{
            display: "inline-block",
            padding: "3px 8px",
            border: `1px solid ${TYPE_COLORS[action.type]}`,
            color: TYPE_COLORS[action.type],
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: "var(--font-mono)",
            marginBottom: 6,
          }}
        >
          {TYPE_LABELS[action.type]}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--ink-mute)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {ago}
        </div>
      </div>

      {/* summary + detail */}
      <div>
        <div
          style={{
            fontSize: 15,
            color: isError ? "var(--bad)" : isSkipped ? "var(--ink-mute)" : "var(--ink)",
            marginBottom: 4,
          }}
        >
          {action.summary}
          {isError && action.error ? (
            <span
              style={{
                marginLeft: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--bad)",
              }}
            >
              · {truncate(action.error, 80)}
            </span>
          ) : null}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--ink-faint)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {action.tokenAddress ? (
            <>
              token:{" "}
              <a
                className="link-quiet"
                href={`https://explore.tempo.xyz/address/${action.tokenAddress}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {short(action.tokenAddress)}
              </a>
              {" · "}
            </>
          ) : null}
          {action.txHash ? (
            <a
              className="link-quiet"
              href={`https://explore.tempo.xyz/receipt/${action.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              tx: {short(action.txHash)}
            </a>
          ) : null}
        </div>
      </div>

      {/* cost / amount */}
      <div
        style={{
          textAlign: "right",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--ink-mute)",
        }}
      >
        {action.costPathUSD ? `${action.costPathUSD} pUSD` : null}
        {action.claimedPathUSD ? `+${action.claimedPathUSD} pUSD` : null}
      </div>
    </div>
  );
}

function Skeletons() {
  return (
    <div style={{ border: "1px solid var(--line)" }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: "18px 20px",
            background: "var(--paper)",
            borderTop: i > 0 ? "1px solid var(--line)" : undefined,
            display: "grid",
            gridTemplateColumns: "120px 1fr auto",
            gap: 20,
          }}
        >
          <div
            style={{
              height: 16,
              background: "var(--paper-mute)",
              animation: "pulse 1.4s ease-in-out infinite",
            }}
          />
          <div
            style={{
              height: 16,
              background: "var(--paper-mute)",
              animation: "pulse 1.4s ease-in-out infinite",
            }}
          />
          <div
            style={{
              width: 60,
              height: 16,
              background: "var(--paper-mute)",
              animation: "pulse 1.4s ease-in-out infinite",
            }}
          />
        </div>
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:.6}50%{opacity:.3}}`}</style>
    </div>
  );
}

function EmptyTape() {
  return (
    <div
      style={{
        border: "1px dashed var(--line-strong)",
        padding: "64px 24px",
        textAlign: "center",
      }}
    >
      <div className="type-kicker" style={{ marginBottom: 12 }}>
        No actions yet
      </div>
      <h3
        className="type-headline"
        style={{ marginTop: 0, marginBottom: 12 }}
      >
        Waiting for the first cron tick.
      </h3>
      <p
        style={{
          color: "var(--ink-mute)",
          fontSize: 14,
          maxWidth: 420,
          margin: "0 auto",
        }}
      >
        The schedule fires every 6 hours UTC. The first action will appear here
        as soon as the agent wakes up.
      </p>
    </div>
  );
}

// ============ utils ============

function nextCronFire(nowMs: number): number {
  // Schedule: 0 */6 * * * → fires at 00, 06, 12, 18 UTC
  const now = new Date(nowMs);
  const utcHour = now.getUTCHours();
  const nextHour = (Math.floor(utcHour / 6) + 1) * 6;
  const next = new Date(now);
  next.setUTCHours(nextHour, 0, 0, 0);
  return next.getTime();
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "any moment";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatRelative(deltaMs: number): string {
  const s = Math.floor(deltaMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ago`;
}

function formatDuration(deltaMs: number): string {
  const s = Math.floor(deltaMs / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
