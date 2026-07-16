import type { Metadata } from "next";
import { Playground } from "./Playground";
import { LiveLedger } from "./LiveLedger";
import { BudgetSim } from "./BudgetSim";

// Landing + live ledger for the Arc Pump agent-payment rail. Dark, high-contrast
// developer-infrastructure aesthetic (its own self-contained styling, separate
// from the site's editorial theme). Served at pay.arcpump.com via proxy.ts.
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
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="pp">
        <div className="glow" />

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
            <span className="grad">autonomous AI agents.</span>
          </h1>
          <p className="sub">
            Your agent pays per request in USDC on Arc — metered, capped, settled and
            verified on-chain. No subscriptions, no API keys, no humans in the loop.
          </p>
          <div className="cta">
            <a className="btn primary" href="#ledger">See the live ledger →</a>
            <a className="btn ghost" href="#how">How it works</a>
          </div>

          <div className="card code">
            <div className="cbar"><span /><span /><span /> <em>agent.ts</em></div>
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
    </>
  );
}

const CSS = `
.pp{--bg:#0a0b0d;--bg2:#101216;--card:#111318;--line:#1f232b;--line2:#2a2f39;--txt:#e8eaf0;--mut:#9aa3b2;--faint:#5c6473;--acc:#34d399;--acc2:#22d3ee;--radius:16px;
  position:relative;min-height:100vh;background:var(--bg);color:var(--txt);
  font-family:"Inter",system-ui,sans-serif;overflow:hidden;padding-bottom:80px;-webkit-font-smoothing:antialiased}
.pp *{box-sizing:border-box}
.pp a{color:inherit;text-decoration:none}
.pp code,.pp pre,.pp .mono{font-family:"JetBrains Mono",ui-monospace,monospace}
.pp .glow{position:absolute;top:-320px;left:50%;transform:translateX(-50%);width:1100px;height:700px;pointer-events:none;
  background:radial-gradient(closest-side,rgba(52,211,153,.16),rgba(34,211,238,.06) 55%,transparent 72%);filter:blur(10px);z-index:0}
.pp>*{position:relative;z-index:1}
.pp section,.pp .nav,.pp .foot{max-width:960px;margin:0 auto;padding-left:24px;padding-right:24px}

/* nav */
.nav{display:flex;align-items:center;justify-content:space-between;padding-top:22px;padding-bottom:22px}
.brand{font-family:"Space Grotesk",sans-serif;font-weight:700;letter-spacing:-.02em;font-size:18px}
.navr{display:flex;align-items:center;gap:22px;font-size:14px;color:var(--mut)}
.navr a:hover{color:var(--txt)}
.navr .chip{border:1px solid var(--line2);border-radius:999px;padding:7px 14px;color:var(--txt)}
.navr .chip:hover{border-color:var(--acc);color:var(--acc)}

/* hero */
.hero{padding-top:64px;text-align:center}
.tag{display:inline-flex;align-items:center;gap:9px;font-family:"JetBrains Mono",monospace;font-size:12px;letter-spacing:.06em;
  color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:7px 15px;background:rgba(255,255,255,.02)}
.live{width:7px;height:7px;border-radius:50%;background:var(--acc);box-shadow:0 0 0 0 rgba(52,211,153,.6);animation:pulse 2.2s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(52,211,153,.5)}70%{box-shadow:0 0 0 7px rgba(52,211,153,0)}100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}
.hero h1{font-family:"Space Grotesk",sans-serif;font-weight:600;letter-spacing:-.035em;line-height:1.02;
  font-size:clamp(2.6rem,7vw,5rem);margin:26px 0 0}
.grad{background:linear-gradient(100deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero .sub{color:var(--mut);font-size:1.12rem;line-height:1.6;max-width:620px;margin:22px auto 0}
.cta{display:flex;gap:12px;justify-content:center;margin:34px 0 0;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;border-radius:11px;padding:12px 20px;font-size:14.5px;font-weight:500;
  transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}
.btn.primary{background:var(--acc);color:#04120c;box-shadow:0 8px 30px -8px rgba(52,211,153,.5)}
.btn.primary:hover{transform:translateY(-1px);box-shadow:0 12px 34px -8px rgba(52,211,153,.6)}
.btn.ghost{border:1px solid var(--line2);color:var(--txt)}
.btn.ghost:hover{border-color:var(--mut);transform:translateY(-1px)}

/* code card */
.card{background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01));border:1px solid var(--line);border-radius:var(--radius)}
.code{max-width:720px;margin:52px auto 0;text-align:left;overflow:hidden;position:relative}
.code:before{content:"";position:absolute;inset:0;border-radius:var(--radius);padding:1px;pointer-events:none;
  background:linear-gradient(120deg,rgba(52,211,153,.5),transparent 40%,transparent 60%,rgba(34,211,238,.4));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:.6}
.cbar{display:flex;align-items:center;gap:7px;padding:13px 16px;border-bottom:1px solid var(--line);color:var(--faint)}
.cbar span{width:11px;height:11px;border-radius:50%;background:var(--line2)}
.cbar em{margin-left:8px;font-family:"JetBrains Mono",monospace;font-size:12px;font-style:normal}
.code pre{margin:0;padding:20px 22px;font-size:13.5px;line-height:1.85;overflow-x:auto;color:#cdd3de;white-space:pre-wrap;word-break:break-word}
.code .k{color:var(--acc2)}.code .fn{color:var(--acc)}.code .s{color:#e5c07b}.code .c{color:var(--faint)}

/* sections */
.kick{font-family:"JetBrains Mono",monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--acc);
  display:inline-flex;align-items:center;gap:8px}
.pp h2{font-family:"Space Grotesk",sans-serif;font-weight:600;letter-spacing:-.03em;font-size:clamp(1.8rem,4vw,2.6rem);margin:12px 0 0}
.how,.ledger,.why,.try{padding-top:92px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--radius);margin-top:34px;overflow:hidden}
.step{background:var(--bg2);padding:24px 22px 26px;transition:background .2s ease}
.step:hover{background:#14171d}
.sn{font-family:"JetBrains Mono",monospace;color:var(--acc);font-size:13px;letter-spacing:.1em}
.st{font-family:"Space Grotesk",sans-serif;font-weight:600;font-size:1.15rem;margin:14px 0 8px}
.sd{color:var(--mut);font-size:14px;line-height:1.6}

/* ledger */
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--radius);margin-top:34px;overflow:hidden}
.stat{background:var(--bg2);padding:22px}
.stat .n{font-family:"JetBrains Mono",monospace;font-size:2rem;font-weight:500;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.stat .n.acc{color:var(--acc)}
.stat .l{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--faint);margin-top:6px}
.feed{margin-top:18px;border-top:1px solid var(--line)}
.frow{display:grid;grid-template-columns:1fr auto auto auto;gap:16px;align-items:center;padding:15px 4px;border-bottom:1px solid var(--line)}
.who{display:flex;align-items:center;gap:10px;min-width:0}
.avatar{width:26px;height:26px;border-radius:8px;flex:none;background:linear-gradient(135deg,var(--acc),var(--acc2));opacity:.9}
.wn{font-weight:500}
.waddr{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--faint)}
.waddr:hover{color:var(--acc2)}
.what{color:var(--mut);font-size:14px}
.what code{color:var(--txt);font-size:12.5px;background:rgba(255,255,255,.05);padding:2px 7px;border-radius:6px}
.amt{font-family:"JetBrains Mono",monospace;color:var(--acc);font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.tm{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--faint);white-space:nowrap}
.empty{padding:40px 0;color:var(--faint)}

/* why */
.whyg{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:30px}
.wcard{background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:22px;transition:transform .18s ease,border-color .18s ease}
.wcard:hover{transform:translateY(-2px);border-color:var(--line2)}
.wt{font-family:"Space Grotesk",sans-serif;font-weight:600;font-size:1.08rem}
.wd{color:var(--mut);font-size:14px;line-height:1.6;margin-top:8px}

/* try */
.try2{padding:34px;max-width:820px;margin:0 auto;text-align:left}
.try2 h3{font-family:"Space Grotesk",sans-serif;font-weight:600;font-size:1.5rem;margin:12px 0 18px;letter-spacing:-.02em}
.cmd{font-family:"JetBrains Mono",monospace;font-size:13px;line-height:1.9;background:#0c0e12;border:1px solid var(--line);
  border-radius:12px;padding:18px;color:#cdd3de;white-space:pre-wrap;word-break:break-all;margin-bottom:18px}
.cmd .c{color:var(--faint)}.cmd .s{color:#e5c07b}

/* footer */
.foot{margin-top:96px;padding-top:26px;border-top:1px solid var(--line);color:var(--mut);font-size:13px;
  display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.foot b{color:var(--txt);font-weight:600}
.fl{display:flex;gap:12px;align-items:center;color:var(--faint)}
.fl a:hover{color:var(--acc2)}

/* playground */
.play{padding-top:92px}
.pg{margin-top:30px;border:1px solid var(--line);border-radius:var(--radius);background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01));padding:26px}
.pg-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap}
.pg-t{font-family:"Space Grotesk",sans-serif;font-weight:600;font-size:1.3rem}
.pg-s{color:var(--mut);font-size:14px;line-height:1.55;margin-top:6px;max-width:54ch}.pg-s b{color:var(--txt)}
.pg-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:24px}
.pgs{border:1px solid var(--line);border-radius:13px;padding:16px;background:var(--bg2);opacity:.55;transition:opacity .35s,border-color .35s,box-shadow .35s}
.pgs.active{opacity:1;border-color:var(--acc);box-shadow:0 0 0 1px rgba(52,211,153,.25),0 14px 34px -14px rgba(52,211,153,.4)}
.pgs.done{opacity:1;border-color:var(--line2)}
.pgs-top{display:flex;align-items:center;gap:9px}
.pgs-dot{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-family:"JetBrains Mono",monospace;background:var(--line2);color:var(--mut);flex:none}
.pgs.active .pgs-dot,.pgs.done .pgs-dot{background:var(--acc);color:#04120c}
.pgs-title{font-family:"Space Grotesk",sans-serif;font-weight:600}
.pgs-mono{font-family:"JetBrains Mono",monospace;font-size:11.5px;color:var(--faint);margin:12px 0 8px;word-break:break-all}
.pgs.active .pgs-mono,.pgs.done .pgs-mono{color:var(--acc2)}
.pgs-body{color:var(--mut);font-size:13px;line-height:1.5}.pgs-body b{color:var(--txt)}
.pg-data{color:var(--txt);font-style:italic}
.spin{width:12px;height:12px;border-radius:50%;border:2px solid rgba(4,18,12,.35);border-top-color:#04120c;animation:sp .7s linear infinite;display:inline-block}
@keyframes sp{to{transform:rotate(360deg)}}
.pg-err{margin-top:16px;color:#fca5a5;font-size:13px;background:rgba(220,38,38,.09);border:1px solid rgba(220,38,38,.25);border-radius:10px;padding:10px 14px}
.pg-note{margin-top:16px;color:var(--faint);font-size:12px}
.lnk{color:var(--acc2)}.lnk:hover{text-decoration:underline}

/* simulator */
.simw{padding-top:92px}
.ssub{color:var(--mut);font-size:15px;max-width:56ch;margin-top:12px;line-height:1.6}
.sim{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--radius);margin-top:30px;overflow:hidden}
.sim-l{background:var(--bg2);padding:26px}
.sim-r{background:#0d0f13;padding:26px;display:flex;flex-direction:column;justify-content:center}
.sim-row{margin-bottom:22px}.sim-row:last-child{margin-bottom:0}
.sim-rl{display:flex;justify-content:space-between;font-size:13.5px;color:var(--mut)}.sim-rl .mono{color:var(--txt)}
.sim input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:999px;background:var(--line2);outline:none;margin-top:11px}
.sim input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:var(--acc);cursor:pointer;box-shadow:0 0 0 4px rgba(52,211,153,.15)}
.sim input[type=range]::-moz-range-thumb{width:16px;height:16px;border:none;border-radius:50%;background:var(--acc);cursor:pointer}
.sim-big{font-family:"JetBrains Mono",monospace;font-size:3rem;font-weight:500;color:var(--acc);letter-spacing:-.02em;line-height:1}
.sim-big.bad{color:#fca5a5}
.sim-cap{color:var(--mut);font-size:13.5px;line-height:1.6;margin-top:10px}.sim-cap b{color:var(--txt)}
.sim-bar{height:6px;border-radius:999px;background:var(--line2);margin-top:18px;overflow:hidden}
.sim-bar span{display:block;height:100%;background:linear-gradient(90deg,var(--acc),var(--acc2));border-radius:999px;transition:width .2s}
.sim-hint{color:var(--faint);font-size:11.5px;margin-top:8px}

/* interactive ledger rows */
.frow{cursor:pointer;transition:background .2s}
.frow:hover{background:rgba(255,255,255,.025)}
.frow.new{animation:rowin 1s ease}
@keyframes rowin{0%{background:rgba(52,211,153,.16)}100%{background:transparent}}
.frow-x{grid-column:1/-1;max-height:0;overflow:hidden;opacity:0;display:flex;flex-direction:column;gap:6px;font-size:12.5px;transition:max-height .28s ease,opacity .28s ease,margin .28s ease}
.frow.open .frow-x{max-height:170px;opacity:1;margin-top:10px}
.frow-x .xl{color:var(--faint);display:inline-block;width:62px;font-family:"JetBrains Mono",monospace;font-size:11px;text-transform:uppercase;letter-spacing:.07em}
.frow-x .mono{color:var(--mut);word-break:break-all}
.frow-x .ok{color:var(--acc)}
.mono{font-family:"JetBrains Mono",monospace}

@media(max-width:720px){
  .steps,.stats,.whyg,.pg-steps,.sim{grid-template-columns:1fr}
  .frow{grid-template-columns:1fr auto;row-gap:6px}
  .what{grid-column:1/-1;order:3}.tm{display:none}
  .navr a:not(.chip){display:none}
}
`;
