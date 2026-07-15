import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { AutoRefresh } from "./AutoRefresh";

// Live dashboard for the autonomous Arc Pump Agent. Reads from the agent's
// Cloudflare Worker (the agent POSTs each decision there); this page renders it
// in the site's editorial style and re-fetches every 30s.
export const revalidate = 30;

export const metadata: Metadata = {
  title: "Arc Pump — agentic market infrastructure on Arc",
  description:
    "A fleet of autonomous AI agents running a USDC-native market economy on Circle's Arc. They open markets, seed liquidity, and manage the treasury — reasoning with Claude, signing through Circle Programmable Wallets, settling in USDC. No human in the loop.",
};

const ARCSCAN = "https://testnet.arcscan.app";
const AGENT_ADDR = "0x9f26dfba277afdd6e5df307f7d9363abe2f72b6a";
const DATA_URL =
  process.env.AGENT_DATA_URL ||
  "https://arc-pump-agent.arcpump2403.workers.dev/data";

type Action = {
  id: string;
  ts: number;
  type: string;
  agent?: string;
  agentLabel?: string;
  agentEmoji?: string;
  state: string;
  summary: string;
  reasoning: string;
  name: string;
  symbol: string;
  token: string;
  txHash: string;
  cost: string;
  balance: string;
};
type Stats = {
  total?: number;
  launch?: number;
  buy?: number;
  claim?: number;
  errors?: number;
};

// The fleet. Each agent owns one economic function; actions map 1:1 to a role,
// so we can attribute even older records (before the `agent` field existed).
const AGENTS: Record<string, { label: string; emoji: string; color: string; blurb: string }> = {
  launcher: { label: "Launcher", emoji: "🚀", color: "#c2410c", blurb: "Opens new USDC-native markets" },
  marketmaker: { label: "Market Maker", emoji: "📈", color: "#166534", blurb: "Seeds liquidity into live markets" },
  treasury: { label: "Treasury", emoji: "🏦", color: "#b45309", blurb: "Harvests fees to self-fund the economy" },
};
const AGENT_BY_TYPE: Record<string, string> = { launch: "launcher", buy: "marketmaker", claim: "treasury" };
function agentFor(a: Action) {
  const key = a.agent || AGENT_BY_TYPE[a.type];
  return AGENTS[key] || { label: a.type, emoji: "🤖", color: "#6b6b6b", blurb: "" };
}

function ago(ts: number) {
  const d = Math.max(0, Date.now() - ts);
  const m = Math.floor(d / 60000);
  const h = Math.floor(m / 60);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function title(a: Action) {
  if (a.type === "launch" && a.name) return `Launched ${a.name} ($${a.symbol})`;
  if (a.type === "buy")
    return a.token ? `Bought into $${a.token}` : "Bought into a curve";
  if (a.type === "claim") return "Claimed creator fees";
  return a.summary || a.type;
}

async function getData(): Promise<{ actions: Action[]; stats: Stats }> {
  try {
    const r = await fetch(DATA_URL, { next: { revalidate: 30 } });
    if (!r.ok) throw new Error(`data ${r.status}`);
    return (await r.json()) as { actions: Action[]; stats: Stats };
  } catch {
    return { actions: [], stats: {} };
  }
}

export default async function AgentPage() {
  const { actions, stats } = await getData();

  const statCells: [string, number | undefined][] = [
    ["Actions", stats.total],
    ["Launches", stats.launch],
    ["Buys", stats.buy],
    ["Claims", stats.claim],
    ["Errors", stats.errors],
  ];

  return (
    <main className="mx-auto w-full max-w-[760px] px-6 pt-14 pb-24">
      <AutoRefresh intervalMs={30000} />

      <div className="type-kicker flex items-center gap-2">
        <span className="dot-live" />
        Live on Arc · Agentic market infrastructure
      </div>

      <h1
        className="font-display mt-3 mb-3 font-medium"
        style={{ fontSize: "clamp(2.2rem,5vw,3.4rem)", lineHeight: 1.02, letterSpacing: "-0.03em" }}
      >
        A market economy run by autonomous agents.
      </h1>

      <p className="text-ink-soft max-w-[62ch] text-[1.05rem] leading-relaxed">
        Arc Pump is agentic market infrastructure on Arc. A fleet of AI agents
        opens USDC-native markets, seeds their liquidity, and manages the
        treasury — each one reasoning with Claude, signing through a Circle
        Programmable Wallet, and settling in USDC on-chain. No human in the loop.
      </p>

      <div className="font-mono text-ink-mute mt-4 text-[12.5px]">
        treasury wallet{" "}
        <a
          className="link-quiet"
          href={`${ARCSCAN}/address/${AGENT_ADDR}`}
          target="_blank"
          rel="noreferrer"
        >
          {AGENT_ADDR.slice(0, 10)}…{AGENT_ADDR.slice(-6)}
        </a>{" "}
        · the fleet signs via Circle Wallets · settles in USDC
      </div>

      <div className="bg-line border-line mt-10 mb-3 grid grid-cols-5 gap-px border">
        {statCells.map(([label, n]) => (
          <div key={label} className="bg-paper px-3.5 py-4">
            <div className="type-mono-stat text-[1.5rem] font-medium">
              {n || 0}
            </div>
            <div className="text-ink-mute mt-1 text-[10.5px] uppercase tracking-[0.12em]">
              {label}
            </div>
          </div>
        ))}
      </div>

      <div className="type-kicker mt-12 mb-3">The fleet</div>
      <div className="bg-line border-line grid gap-px border sm:grid-cols-3">
        {(["launcher", "marketmaker", "treasury"] as const).map((key) => {
          const ag = AGENTS[key];
          const count =
            key === "launcher" ? stats.launch : key === "marketmaker" ? stats.buy : stats.claim;
          return (
            <div key={key} className="bg-paper p-4">
              <div className="flex items-center gap-2">
                <span className="text-[1.15rem]">{ag.emoji}</span>
                <span className="font-medium">{ag.label}</span>
              </div>
              <div className="text-ink-mute mt-1.5 text-[13px] leading-snug">{ag.blurb}</div>
              <div
                className="type-mono-stat mt-3 text-[1.15rem] font-medium"
                style={{ color: ag.color }}
              >
                {count || 0}
                <span className="text-ink-faint text-[11px] font-normal"> actions</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="type-kicker mt-12 mb-1.5">Tape</div>
      <h2 className="font-display mb-4 text-[1.6rem] font-medium tracking-[-0.02em]">
        What the fleet has decided
      </h2>

      {actions.length === 0 ? (
        <div className="border-line text-ink-faint border-t py-10">
          No actions yet — the agent will wake on its schedule.
        </div>
      ) : (
        actions.map((a, i) => {
          const ag = agentFor(a);
          const color = ag.color;
          return (
            <div
              key={a.id || i}
              className="border-line motion-fade-up grid grid-cols-[132px_1fr] gap-[18px] border-t py-[18px]"
              style={{ "--motion-delay": `${Math.min(i, 8) * 30}ms` } as CSSProperties}
            >
              <div className="flex flex-col gap-[7px]">
                <span
                  className="flex w-fit items-center gap-1 rounded border px-2 py-[3px] text-[11px] font-medium tracking-[0.01em]"
                  style={{ color, borderColor: `${color}33`, background: `${color}11` }}
                >
                  <span>{ag.emoji}</span>
                  {ag.label}
                </span>
                <span className="font-mono text-ink-faint text-[12px]">
                  {ago(a.ts)}
                </span>
              </div>
              <div>
                <div className="text-[1.02rem] font-medium">{title(a)}</div>
                {a.reasoning ? (
                  <div className="font-display text-ink-soft my-[7px] text-[1.02rem] italic leading-[1.45]">
                    “{a.reasoning}”
                  </div>
                ) : null}
                <div className="font-mono mt-1 text-[12px]">
                  {a.txHash ? (
                    <a
                      className="text-accent hover:underline"
                      href={`${ARCSCAN}/tx/${a.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.txHash.slice(0, 10)}…{a.txHash.slice(-6)} ↗
                    </a>
                  ) : a.state === "SKIPPED" ? (
                    <span className="text-ink-faint">skipped</span>
                  ) : null}
                  {a.cost ? (
                    <span className="text-ink-faint"> · {a.cost}</span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })
      )}

      <div className="border-line text-ink-faint mt-16 border-t pt-5 text-[12px] leading-[1.7]">
        <b className="text-ink-mute font-medium">Arc Pump Agent</b> — Ignyte ×
        Circle Stablecoin Commerce Stack Challenge, Agentic Economy track.
        <br />
        Reasoning by Claude (Opus 4.8) · signing via Circle Programmable Wallets
        · contracts + USDC settlement on Arc.
      </div>
    </main>
  );
}
