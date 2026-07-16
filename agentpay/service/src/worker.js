// Agent-pay demo service — the "sell side" of the pay-per-call rail, plus a
// live ledger + dashboard.
//
//   GET /premium                  -> 402 + { invoice: { id, amount, router, service } }
//   (agent pays router.pay(id, service) on Arc)
//   GET /premium?invoice=<id>     -> 200 + data (verified on-chain, single-use);
//                                    the paid call is recorded to the ledger
//   GET /ledger                   -> JSON { purchases[], stats }
//   GET /                         -> HTML dashboard of agent purchases

const ROUTER = "0x42bCE0940b286b29A7bE50c3C7c89302A48E28ff";
const SERVICE = "0xfC6153A6d0Cc40E17d9B48fE2fb1AACd9C63114e"; // this service's payee (USDC lands here)
const RPC = "https://rpc.testnet.arc.network";
const ARCSCAN = "https://testnet.arcscan.app";
const PRICE_WEI = "10000000000000000"; // 0.01 USDC (native, 18 dec)
const PRICE_USDC = "0.01";
const VERIFY_SELECTOR = "0x3ab5b633"; // verify(bytes32,address,uint256)

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-payment,x-agent,x-agent-name",
};
const cors = (r) => { for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v); return r; };
const json = (o, status = 200) =>
  new Response(JSON.stringify(o, null, 2), { status, headers: { "content-type": "application/json", ...CORS } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (url.pathname === "/premium") return premium(req, env, url);
    if (url.pathname === "/ledger") return json(await loadLedger(env));
    return dashboard(env);
  },
};

async function premium(req, env, url) {
  const provided = url.searchParams.get("invoice") || req.headers.get("x-payment");

  if (!provided) {
    const id = "0x" + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.INVOICES.put(id, JSON.stringify({ resource: "/premium", price: PRICE_WEI, served: false, ts: Date.now() }), { expirationTtl: 900 });
    return json({
      error: "payment required",
      invoice: { id, amount: PRICE_WEI, amountUSDC: PRICE_USDC, router: ROUTER, service: SERVICE, resource: "/premium", chain: "arc-testnet", expiresInSec: 900 },
      how: `Call ${ROUTER}.pay(invoiceId, service) with ${PRICE_USDC} USDC, then retry GET /premium?invoice=${id}`,
    }, 402);
  }

  const inv = await env.INVOICES.get(provided, "json");
  if (!inv) return json({ error: "unknown or expired invoice" }, 400);
  if (inv.served) return json({ error: "invoice already used", invoice: provided }, 409);

  const ok = await verifyOnChain(provided, SERVICE, inv.price);
  if (!ok) return json({ error: "not paid yet", invoice: { id: provided, amount: inv.price, amountUSDC: PRICE_USDC, router: ROUTER, service: SERVICE } }, 402);

  inv.served = true;
  await env.INVOICES.put(provided, JSON.stringify(inv), { expirationTtl: 900 });

  // Record the verified purchase to the ledger.
  await recordPurchase(env, {
    invoice: provided,
    amountUSDC: PRICE_USDC,
    resource: "/premium",
    agent: (req.headers.get("x-agent") || "").slice(0, 44),
    agentName: (req.headers.get("x-agent-name") || "").slice(0, 40),
    ts: Date.now(),
  });

  return json({
    resource: "/premium",
    data: { insight: "On Arc, USDC is the native token — settlement is final in ~1s, which is exactly what per-call agent payments need.", generatedAt: new Date().toISOString() },
    payment: { invoice: provided, amountUSDC: PRICE_USDC, settledInUSDC: true, chain: "arc-testnet" },
  });
}

async function verifyOnChain(invoiceId, service, priceWei) {
  const pad = (h) => h.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const data = VERIFY_SELECTOR + invoiceId.slice(2) + pad(service) + pad(BigInt(priceWei).toString(16));
  try {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: ROUTER, data }, "latest"] }) });
    const res = (await r.json()).result;
    return res ? BigInt(res) === 1n : false;
  } catch {
    return false;
  }
}

async function recordPurchase(env, rec) {
  const key = `purchase:${(Number.MAX_SAFE_INTEGER - rec.ts).toString().padStart(16, "0")}:${rec.invoice.slice(2, 10)}`;
  await env.INVOICES.put(key, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 30 });
  const sraw = await env.INVOICES.get("ledger-stats");
  const s = sraw ? JSON.parse(sraw) : { count: 0, totalUSDC: 0, agents: [] };
  s.count++;
  s.totalUSDC = +(s.totalUSDC + Number(rec.amountUSDC)).toFixed(6);
  if (rec.agent && !s.agents.includes(rec.agent)) s.agents.push(rec.agent);
  await env.INVOICES.put("ledger-stats", JSON.stringify(s));
}

async function loadLedger(env) {
  const list = await env.INVOICES.list({ prefix: "purchase:", limit: 50 });
  const purchases = (await Promise.all(list.keys.map((k) => env.INVOICES.get(k.name, "json")))).filter(Boolean);
  const sraw = await env.INVOICES.get("ledger-stats");
  const stats = sraw ? JSON.parse(sraw) : { count: 0, totalUSDC: 0, agents: [] };
  return { purchases, stats, router: ROUTER, service: SERVICE, price: PRICE_USDC };
}

// ---------- dashboard ----------
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function ago(ts) { const m = Math.floor((Date.now() - ts) / 60000), h = Math.floor(m / 60); if (m < 1) return "just now"; if (m < 60) return m + "m ago"; if (h < 24) return h + "h ago"; return Math.floor(h / 24) + "d ago"; }
function short(a) { return a ? a.slice(0, 8) + "…" + a.slice(-4) : "—"; }

async function dashboard(env) {
  const { purchases, stats } = await loadLedger(env);
  const rows = purchases.length
    ? purchases.map((p) => `
      <div class="row">
        <div class="who">${p.agentName ? esc(p.agentName) : "Agent"}${p.agent ? `<a href="${ARCSCAN}/address/${esc(p.agent)}" target="_blank">${esc(short(p.agent))}</a>` : ""}</div>
        <div class="what">paid for <b>${esc(p.resource)}</b></div>
        <div class="amt">${esc(p.amountUSDC)} USDC</div>
        <div class="time">${ago(p.ts)}</div>
      </div>`).join("")
    : `<div class="empty">No purchases yet — point an agent at <code>/premium</code>.</div>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent-pay — pay-per-call ledger on Arc</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,500;1,400&family=Inter+Tight:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--paper:#FAFAF7;--ink:#0a0a0a;--ink2:#2a2a2a;--mute:#6b6b6b;--faint:#9a9a92;--line:#e5e5dd;--accent:#c2410c;--good:#166534}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Inter Tight",system-ui,sans-serif;line-height:1.5}
.wrap{max-width:720px;margin:0 auto;padding:56px 24px 96px}
.kicker{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--mute)}
.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--good);margin-right:7px;vertical-align:middle}
h1{font-family:"Newsreader",Georgia,serif;font-weight:500;font-size:clamp(2rem,5vw,3rem);letter-spacing:-.03em;line-height:1.03;margin:.3em 0 .3em}
.lede{color:var(--ink2);font-size:1.02rem;max-width:56ch}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin:36px 0 10px}
.stat{background:var(--paper);padding:16px 14px}.stat .n{font-family:"JetBrains Mono",monospace;font-size:1.5rem;font-weight:500}.stat .l{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);margin-top:4px}
.tape{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--mute);margin:40px 0 6px}
h2{font-family:"Newsreader",serif;font-weight:500;font-size:1.5rem;margin:0 0 16px}
.row{display:grid;grid-template-columns:1fr auto auto;gap:14px;align-items:baseline;padding:14px 0;border-top:1px solid var(--line)}
.who{font-weight:500}.who a{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--mute);margin-left:8px;text-decoration:none}
.what{color:var(--ink2)}.what b{font-family:"JetBrains Mono",monospace;font-weight:500;font-size:.92em}
.amt{font-family:"JetBrains Mono",monospace;color:var(--good);font-weight:500;white-space:nowrap}
.time{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--faint);white-space:nowrap}
.grid3 .what{grid-column:1/-1}
.empty{padding:36px 0;color:var(--faint);border-top:1px solid var(--line)}
.foot{margin-top:56px;font-size:12px;color:var(--faint);border-top:1px solid var(--line);padding-top:18px;line-height:1.7}
.foot a{color:var(--accent);text-decoration:none}
code{font-family:"JetBrains Mono",monospace;font-size:.9em}
@media(max-width:520px){.row{grid-template-columns:1fr auto}.time{display:none}}
</style></head><body><div class="wrap">
<div class="kicker"><span class="dot"></span>Pay-per-call · settled in USDC on Arc</div>
<h1>Agents paying for what they use.</h1>
<p class="lede">A live ledger of autonomous AI agents paying per request in USDC on Arc — each call metered, priced, and settled on-chain through the PaymentRouter. No subscriptions, no humans.</p>
<div class="stats">
  <div class="stat"><div class="n">${stats.count || 0}</div><div class="l">Paid calls</div></div>
  <div class="stat"><div class="n">${(stats.totalUSDC || 0).toFixed(2)}</div><div class="l">USDC settled</div></div>
  <div class="stat"><div class="n">${(stats.agents || []).length}</div><div class="l">Agents</div></div>
</div>
<div class="tape">Ledger</div>
<h2>Who paid for what</h2>
${rows}
<div class="foot">
  PaymentRouter <a href="${ARCSCAN}/address/${ROUTER}" target="_blank">${short(ROUTER)}</a> · price ${PRICE_USDC} USDC/call · Arc testnet<br>
  An agent pays per request in native USDC; the service verifies the payment on-chain before serving. Try it: <code>GET /premium</code>.
</div>
</div>
<script>setTimeout(()=>location.reload(),30000)</script>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
