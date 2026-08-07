import type { Metadata } from "next";
import "./pay.css";
import { Playground } from "./Playground";
import { WalletPay } from "./WalletPay";
import { LiveLedger } from "./LiveLedger";
import { BudgetSim } from "./BudgetSim";

// Landing + live ledger for the Arc Pump agent-payment rail.
//
// Styling lives in ./pay.css and now draws on the same tokens as the rest of the
// site (app/globals.css) instead of the dark, neon-accented theme this page used
// to carry on its own. The reasoning is written up at the top of that file.
//
// Fonts come from the root layout — Newsreader, Inter Tight and JetBrains Mono
// are already loaded there as CSS variables, so the page no longer pulls a
// second set from Google Fonts over the network.
export const revalidate = 30;

export const metadata: Metadata = {
  title: "Arc Pump — pay-per-call payments for AI agents on Arc",
  description:
    "The payment rail for autonomous AI agents. Your agent pays per request in USDC on Arc — metered, capped, settled and verified on-chain. No subscriptions, no humans.",
  openGraph: {
    title: "Arc Pump — pay-per-call payments for AI agents",
    description: "Autonomous agents paying per request in USDC on Arc. Metered, capped, settled on-chain.",
    url: "https://pay.arcpump.com",
    siteName: "Arc Pump",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Arc Pump — pay-per-call for AI agents", description: "Agents paying per request in USDC on Arc." },
};

const LEDGER_URL = "https://agentpay-service.arcpump2403.workers.dev/ledger";
const SERVICE_URL = "https://agentpay-service.arcpump2403.workers.dev/premium";
const ROUTER = "0x42bCE0940b286b29A7bE50c3C7c89302A48E28ff";
const ARCSCAN = "https://testnet.arcscan.app";

type Purchase = { invoice: string; amountUSDC: string; resource: string; agent?: string; agentName?: string; ts: number };
type Ledger = { purchases: Purchase[]; stats: { count: number; totalUSDC: number; agents: string[] } };

async function getLedger(): Promise<Ledger> {
  try {
    const r = await fetch(LEDGER_URL, { next: { revalidate: 30 } });
    if (!r.ok) throw new Error();
    return (await r.json()) as Ledger;
  } catch {
    return { purchases: [], stats: { count: 0, totalUSDC: 0, agents: [] } };
  }
}

export default async function PayPage() {
  const { purchases, stats } = await getLedger();

  return (
    <div className="pp">
      {/* nav */}
      <header className="nav">
        <div className="brand">Arc&nbsp;Pump</div>
        <div className="navr">
          <a href="#how">How it works</a>
          <a href="#ledger">Live ledger</a>
          <a className="chip" href="#try">Try it</a>
        </div>
      </header>

      {/* hero */}
      <section className="hero">
        <div className="tag"><span className="live" /> Live on Arc · settled in USDC</div>
        <h1>
          The payment rail for<br />
          <em>autonomous AI agents.</em>
        </h1>
        <p className="sub">
          Your agent pays per request in USDC on Arc — metered, capped, settled and
          verified on-chain. No subscriptions, no API keys, no humans in the loop.
        </p>
        <div className="cta">
          <a className="btn primary" href="#try">Run a real payment →</a>
          <a className="btn ghost" href="#how">How it works</a>
        </div>

        <div className="card code">
          <div className="cbar"><em>agent.ts</em></div>
          <pre>
{`const payer = createPayer({ walletId, `}<span className="k">maxPerCall</span>{`: 0.05, `}<span className="k">budget</span>{`: 1 })

const { data } = await payer.`}<span className="fn">payAndFetch</span>{`(`}<span className="s">&quot;https://api.example.com/premium&quot;</span>{`)`}
{`
`}<span className="c">{`// → 402 Payment Required   → pays 0.01 USDC on Arc   → 200 + data`}</span>
          </pre>
        </div>
      </section>

      {/* playground */}
      <section id="try" className="play">
        <div className="kick">Interactive · real on-chain</div>
        <h2>Don&rsquo;t take our word for it.</h2>
        <Playground />
        <WalletPay />
      </section>

      {/* how */}
      <section id="how" className="how">
        <div className="kick">The flow · x402-style</div>
        <h2>Pay-per-call, in three steps.</h2>
        <div className="steps">
          {[
            { n: "01", t: "Request", d: "Agent calls a paid resource. The service replies 402 Payment Required with an invoice — price, invoice id, and where to pay." },
            { n: "02", t: "Pay", d: "The agent's Circle wallet pays the invoice through the on-chain PaymentRouter in native USDC — within its per-call and budget caps." },
            { n: "03", t: "Unlock", d: "The service verifies the payment on-chain (bound to the invoice and recipient), then serves the response. One payment, one call." },
          ].map((s) => (
            <div key={s.n} className="step">
              <div className="sn">{s.n}</div>
              <div className="st">{s.t}</div>
              <div className="sd">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* simulator */}
      <section className="simw">
        <div className="kick">Guardrails · try the knobs</div>
        <h2>Autonomous, never unbounded.</h2>
        <p className="ssub">Every agent runs under a per-call cap and a total budget. Drag the sliders — see how many calls it gets, and when it refuses to pay.</p>
        <BudgetSim />
      </section>

      {/* ledger */}
      <section id="ledger" className="ledger">
        <div className="kick"><span className="live" /> Live ledger</div>
        <h2>Agents paying for what they use.</h2>

        <LiveLedger initial={{ purchases, stats }} />
      </section>

      {/* why arc */}
      <section className="why">
        <div className="kick">Why Arc</div>
        <div className="whyg">
          {[
            { t: "USDC is native", d: "On Arc, USDC is the native gas/value token — payments are plain value transfers, final in ~1 second." },
            { t: "Signed by MPC", d: "Agents sign through Circle Programmable Wallets. No raw private key sits on a server." },
            { t: "Verifiable, bounded", d: "Every call is on-chain, tied to an invoice and recipient, and capped per-call and per-budget." },
          ].map((w) => (
            <div key={w.t} className="wcard"><div className="wt">{w.t}</div><div className="wd">{w.d}</div></div>
          ))}
        </div>
      </section>

      {/* dev */}
      <section id="dev" className="try">
        <div className="card try2">
          <div className="kick">For developers</div>
          <h3>Or hit the paywall from your terminal.</h3>
          <div className="cmd">
            <span className="c">{`# 1) get an invoice`}</span>{`
curl `}<span className="s">{SERVICE_URL}</span>{`

`}<span className="c">{`# 2) pay it via the PaymentRouter on Arc, then retry`}</span>{`
curl `}<span className="s">{`${SERVICE_URL}?invoice=<id>`}</span>
          </div>
          <a className="btn ghost" href={SERVICE_URL} target="_blank" rel="noreferrer">Open the demo service →</a>
        </div>
      </section>

      <footer className="foot">
        <div>
          <b>Arc Pump</b> — the pay-per-call payment rail for AI agents, in USDC on Arc.
        </div>
        <div className="fl">
          <a href={`${ARCSCAN}/address/${ROUTER}`} target="_blank" rel="noreferrer">PaymentRouter ↗</a>
          <span>·</span>
          <a href={SERVICE_URL} target="_blank" rel="noreferrer">Demo service ↗</a>
          <span>·</span>
          <span>Circle Programmable Wallets · USDC · Arc testnet</span>
        </div>
      </footer>
    </div>
  );
}
