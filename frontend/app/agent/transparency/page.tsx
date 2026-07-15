import type { Metadata } from "next";
import Link from "next/link";

// Trust infrastructure: how an autonomous fleet stays auditable and bounded.
// MPC signing, a tight action whitelist, per-action spend caps, every decision
// on-chain. This is the "why you can trust it runs with no human" page.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Transparency & guardrails — Arc Pump",
  description:
    "How Arc Pump's autonomous agent fleet stays auditable and safe: MPC signing with no raw key, a tight on-chain action whitelist, per-action spend limits, and every decision published on-chain.",
};

const ARCSCAN = "https://testnet.arcscan.app";
const AGENT_ADDR = "0x9f26dfba277afdd6e5df307f7d9363abe2f72b6a";
const FACTORY = "0x4dCf3238dd90E571e82bC07fD876B384f170546c";
const REPO = "https://github.com/PHUOCHAU2403/arc-pump";
const DATA_URL =
  process.env.AGENT_DATA_URL ||
  "https://arc-pump-agent.arcpump2403.workers.dev/data";

type Stats = { total?: number; errors?: number };

async function getStats(): Promise<{ stats: Stats; balance: string | null }> {
  try {
    const r = await fetch(DATA_URL, { next: { revalidate: 60 } });
    if (!r.ok) throw new Error();
    const d = (await r.json()) as {
      stats?: Stats;
      actions?: { balance?: string }[];
    };
    const balance = d.actions?.find((a) => a.balance)?.balance ?? null;
    return { stats: d.stats ?? {}, balance };
  } catch {
    return { stats: {}, balance: null };
  }
}

const FLEET = [
  {
    emoji: "🚀",
    label: "Launcher",
    color: "#c2410c",
    method: "MemeFactory.createToken(…)",
    can: "Open a new USDC-native market",
    limit: "≤ 1 USDC — the protocol launch fee",
  },
  {
    emoji: "📈",
    label: "Market Maker",
    color: "#166534",
    method: "BondingCurve.buy(…)",
    can: "Seed liquidity into an existing market",
    limit: "Small quoted buys — sub-cent to cents",
  },
  {
    emoji: "🏦",
    label: "Treasury",
    color: "#b45309",
    method: "BondingCurve.claimCreatorFees(…)",
    can: "Harvest fees the fleet already earned",
    limit: "0 spend — only collects",
  },
];

const CANNOT = [
  "Move funds to arbitrary addresses — it can only call the three whitelisted contract methods below.",
  "Call arbitrary contracts — the signer is scoped to the Arc Pump factory and its bonding curves.",
  "Exceed its per-action spend cap, or spend anything other than USDC on Arc.",
  "Touch a raw private key — Circle's MPC holds the key material; the fleet only requests signatures.",
];

export default async function TransparencyPage() {
  const { stats, balance } = await getStats();

  return (
    <main className="mx-auto w-full max-w-[760px] px-6 pt-14 pb-24">
      <div className="type-kicker flex items-center gap-2">
        <span className="dot-live" />
        Trust infrastructure
      </div>

      <h1
        className="font-display mt-3 mb-3 font-medium"
        style={{ fontSize: "clamp(2.2rem,5vw,3.4rem)", lineHeight: 1.02, letterSpacing: "-0.03em" }}
      >
        Autonomous, but not unaccountable.
      </h1>

      <p className="text-ink-soft max-w-[62ch] text-[1.05rem] leading-relaxed">
        Arc Pump runs with no human in the loop — so every action is bounded and
        on the record. The fleet signs through MPC with no raw key, can only call
        a short whitelist of contract methods, caps what it spends per action, and
        publishes its reasoning and transaction for every single decision.
      </p>

      {/* live proof-of-health */}
      <div className="bg-line border-line mt-10 grid grid-cols-3 gap-px border">
        <div className="bg-paper px-4 py-4">
          <div className="type-mono-stat text-[1.5rem] font-medium">{stats.total ?? "—"}</div>
          <div className="text-ink-mute mt-1 text-[10.5px] uppercase tracking-[0.12em]">
            Actions on-chain
          </div>
        </div>
        <div className="bg-paper px-4 py-4">
          <div className="type-mono-stat text-[1.5rem] font-medium" style={{ color: (stats.errors ?? 0) === 0 ? "#166534" : "#991b1b" }}>
            {stats.errors ?? 0}
          </div>
          <div className="text-ink-mute mt-1 text-[10.5px] uppercase tracking-[0.12em]">
            Failed / reverted
          </div>
        </div>
        <div className="bg-paper px-4 py-4">
          <div className="type-mono-stat text-[1.25rem] font-medium">{balance ?? "—"}</div>
          <div className="text-ink-mute mt-1 text-[10.5px] uppercase tracking-[0.12em]">
            Treasury balance
          </div>
        </div>
      </div>

      {/* the signer */}
      <div className="type-kicker mt-12 mb-2">The signer</div>
      <h2 className="font-display mb-3 text-[1.6rem] font-medium tracking-[-0.02em]">
        No key on any server.
      </h2>
      <p className="text-ink-soft max-w-[62ch] leading-relaxed">
        Every transaction is signed by a{" "}
        <b className="font-medium">Circle Programmable Wallet</b> (Developer-Controlled,
        MPC). Circle&rsquo;s multi-party computation holds the key material; the fleet
        requests a signature over the API. There is no exportable private key sitting
        on the agent server — the thing people fear most about an autonomous on-chain
        agent simply isn&rsquo;t there.
      </p>
      <div className="font-mono text-ink-mute mt-3 text-[12.5px]">
        treasury wallet{" "}
        <a className="link-quiet" href={`${ARCSCAN}/address/${AGENT_ADDR}`} target="_blank" rel="noreferrer">
          {AGENT_ADDR.slice(0, 10)}…{AGENT_ADDR.slice(-6)}
        </a>
      </div>

      {/* action whitelist */}
      <div className="type-kicker mt-12 mb-2">The whitelist</div>
      <h2 className="font-display mb-4 text-[1.6rem] font-medium tracking-[-0.02em]">
        What each agent is allowed to do.
      </h2>
      <div className="border-line border-t">
        {FLEET.map((a) => (
          <div key={a.label} className="border-line grid grid-cols-[132px_1fr] gap-[18px] border-b py-4">
            <div>
              <span
                className="flex w-fit items-center gap-1 rounded border px-2 py-[3px] text-[11px] font-medium"
                style={{ color: a.color, borderColor: `${a.color}33`, background: `${a.color}11` }}
              >
                <span>{a.emoji}</span>
                {a.label}
              </span>
            </div>
            <div>
              <div className="text-[1rem] font-medium">{a.can}</div>
              <div className="font-mono text-ink-mute mt-1 text-[12.5px]">{a.method}</div>
              <div className="text-ink-faint mt-1 text-[13px]">Spend cap · {a.limit}</div>
            </div>
          </div>
        ))}
      </div>

      {/* what it cannot do */}
      <div className="type-kicker mt-12 mb-2">The boundaries</div>
      <h2 className="font-display mb-4 text-[1.6rem] font-medium tracking-[-0.02em]">
        What it cannot do.
      </h2>
      <ul className="space-y-3">
        {CANNOT.map((c, i) => (
          <li key={i} className="text-ink-soft grid grid-cols-[20px_1fr] gap-2 leading-relaxed">
            <span className="text-bad mt-[2px] font-mono text-[13px]">✕</span>
            <span>{c}</span>
          </li>
        ))}
      </ul>

      {/* on the record */}
      <div className="type-kicker mt-12 mb-2">On the record</div>
      <h2 className="font-display mb-3 text-[1.6rem] font-medium tracking-[-0.02em]">
        Every decision is verifiable.
      </h2>
      <p className="text-ink-soft max-w-[62ch] leading-relaxed">
        The reasoning behind each action is published on the live feed; each action
        is a real transaction you can open on Arcscan; the signer and the contracts
        are all public. Nothing about the fleet is a black box.
      </p>
      <div className="mt-4 flex flex-col gap-2 font-mono text-[12.5px]">
        <a className="link-quiet w-fit" href="/agent">Live decision feed →</a>
        <a className="link-quiet w-fit" href={`${ARCSCAN}/address/${AGENT_ADDR}`} target="_blank" rel="noreferrer">
          Treasury wallet on Arcscan →
        </a>
        <a className="link-quiet w-fit" href={`${ARCSCAN}/address/${FACTORY}`} target="_blank" rel="noreferrer">
          MemeFactory contract on Arcscan →
        </a>
        <a className="link-quiet w-fit" href={REPO} target="_blank" rel="noreferrer">
          Source code on GitHub →
        </a>
      </div>

      <div className="border-line text-ink-faint mt-16 border-t pt-5 text-[12px] leading-[1.7]">
        <Link className="link-quiet" href="/agent">
          ← Back to the live dashboard
        </Link>
        <br />
        Arc Pump — agentic market infrastructure on Arc. Reasoning by Claude · signing
        via Circle Programmable Wallets · settlement in USDC on Arc.
      </div>
    </main>
  );
}
