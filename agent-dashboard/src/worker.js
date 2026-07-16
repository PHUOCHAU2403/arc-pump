// Arc Pump Agent — dashboard + ingest Worker.
// The agent POSTs each action (with Claude's reasoning) to /ingest; this Worker
// stores it in KV and serves a Strategist Minimal dashboard at /.
// Bindings: AGENT_LOG (KV). Secret: INGEST_TOKEN.

const ARCSCAN = "https://testnet.arcscan.app";
const AGENT_ADDR = "0x9f26dfba277afdd6e5df307f7d9363abe2f72b6a";
const FACTORY = "0x4dCf3238dd90E571e82bC07fD876B384f170546c"; // MemeFactoryV2 (Arc testnet)
const RPC = "https://rpc.testnet.arc.network";

// Open API. Arc Pump is permissionless infrastructure: anyone can call the
// factory to create a market, then publish their move to the shared feed. The
// only gate is on-chain truth — /api/publish verifies the tx really called the
// factory before it appears. No API key; spam is priced out by the launch fee.
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (url.pathname === "/ingest" && req.method === "POST") return ingest(req, env);
    if (url.pathname === "/data" || url.pathname === "/api/economy") return serveData(env);
    if (url.pathname === "/api/agents") return serveAgents(env);
    if (url.pathname === "/api/publish" && req.method === "POST") return publishExternal(req, env);
    return serveDashboard(env);
  },
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};
function cors(resp) {
  for (const [k, v] of Object.entries(CORS)) resp.headers.set(k, v);
  return resp;
}

// The fleet roster + live counts, for anyone indexing the economy.
async function serveAgents(env) {
  const sraw = await env.AGENT_LOG.get("stats");
  const s = sraw ? JSON.parse(sraw) : {};
  const agents = [
    { id: "launcher", label: "Launcher", role: "Opens new USDC-native markets", action: "createToken", count: s.launch || 0 },
    { id: "marketmaker", label: "Market Maker", role: "Seeds liquidity into live markets", action: "buy", count: s.buy || 0 },
    { id: "treasury", label: "Treasury", role: "Harvests fees to self-fund the economy", action: "claimCreatorFees", count: s.claim || 0 },
  ];
  return json({ agents, external: s.external || 0, wallet: AGENT_ADDR, factory: FACTORY, chain: "arc-testnet", explorer: ARCSCAN });
}

// Open, permissionless publish: any external agent that created a market on the
// Arc Pump factory can add its move (with reasoning) to the shared feed. We
// verify the tx exists on Arc and actually called the factory — so the feed
// can't be spammed with fake or unrelated activity, and needs no API key.
async function publishExternal(req, env) {
  let a;
  try { a = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const txHash = String(a.txHash || "");
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return json({ error: "a valid txHash is required" }, 400);
  if (await env.AGENT_LOG.get(`ext:${txHash.toLowerCase()}`)) return json({ error: "already published" }, 409);

  let tx;
  try {
    const rr = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionByHash", params: [txHash] }),
    });
    tx = (await rr.json()).result;
  } catch { return json({ error: "could not reach Arc RPC" }, 502); }
  if (!tx) return json({ error: "transaction not found on Arc" }, 422);
  if ((tx.to || "").toLowerCase() !== FACTORY.toLowerCase())
    return json({ error: "tx must call the Arc Pump factory (createToken)" }, 422);

  const ts = Date.now();
  const id = crypto.randomUUID().slice(0, 8);
  const rec = {
    id, ts, type: "launch", agent: "external",
    agentLabel: String(a.agent || "External agent").slice(0, 40),
    agentEmoji: "🌐", state: "COMPLETE", source: "external",
    summary: "", reasoning: String(a.reasoning || "").slice(0, 600),
    name: String(a.name || "").slice(0, 40), symbol: String(a.symbol || "").slice(0, 10),
    token: "", txHash, cost: "", balance: "",
  };
  const key = `action:${(Number.MAX_SAFE_INTEGER - ts).toString().padStart(16, "0")}:${id}`;
  await env.AGENT_LOG.put(key, JSON.stringify(rec));
  await env.AGENT_LOG.put(`ext:${txHash.toLowerCase()}`, "1", { expirationTtl: 60 * 60 * 24 * 90 });

  const sraw = await env.AGENT_LOG.get("stats");
  const s = sraw ? JSON.parse(sraw) : { total: 0, launch: 0, buy: 0, claim: 0, errors: 0 };
  s.total++; s.launch = (s.launch || 0) + 1; s.external = (s.external || 0) + 1; s.lastAt = ts;
  await env.AGENT_LOG.put("stats", JSON.stringify(s));

  return json({ ok: true, id, published: true, explorer: `${ARCSCAN}/tx/${txHash}` });
}

async function ingest(req, env) {
  const token = new URL(req.url).searchParams.get("token");
  if (token !== env.INGEST_TOKEN) return json({ error: "unauthorized" }, 401);
  let a;
  try { a = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const ts = Date.now();
  const id = a.id || crypto.randomUUID().slice(0, 8);
  const rec = {
    id, ts,
    type: a.type || "tick",
    agent: a.agent || "",
    agentLabel: a.agentLabel || "",
    agentEmoji: a.agentEmoji || "",
    state: a.state || "",
    summary: a.summary || "",
    reasoning: a.reasoning || "",
    name: a.name || "",
    symbol: a.symbol || "",
    token: a.token || "",
    txHash: a.txHash || "",
    cost: a.cost || "",
    balance: a.balance || "",
  };
  const key = `action:${(Number.MAX_SAFE_INTEGER - ts).toString().padStart(16, "0")}:${id}`;
  await env.AGENT_LOG.put(key, JSON.stringify(rec));

  const sraw = await env.AGENT_LOG.get("stats");
  const s = sraw ? JSON.parse(sraw) : { total: 0, launch: 0, buy: 0, claim: 0, errors: 0, startedAt: ts };
  s.total++;
  if (rec.type in s) s[rec.type]++;
  if (rec.state === "error") s.errors++;
  s.lastAt = ts;
  await env.AGENT_LOG.put("stats", JSON.stringify(s));
  return json({ ok: true, id });
}

async function loadData(env) {
  const list = await env.AGENT_LOG.list({ prefix: "action:", limit: 60 });
  const actions = (await Promise.all(list.keys.map((k) => env.AGENT_LOG.get(k.name, "json")))).filter(Boolean);
  const sraw = await env.AGENT_LOG.get("stats");
  const stats = sraw ? JSON.parse(sraw) : { total: 0, launch: 0, buy: 0, claim: 0, errors: 0 };
  return { actions, stats };
}

async function serveData(env) {
  return json(await loadData(env));
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

async function serveDashboard(env) {
  const { actions, stats } = await loadData(env);
  const html = page(actions, stats);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function ago(ts) {
  const d = Math.max(0, Date.now() - ts), m = Math.floor(d / 60000), h = Math.floor(m / 60);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}
const TYPE_COLOR = { launch: "#c2410c", buy: "#166534", claim: "#b45309", tick: "#6b6b6b" };

function actionRow(a) {
  const color = TYPE_COLOR[a.type] || "#6b6b6b";
  let title = a.summary;
  if (a.type === "launch" && a.name) title = `Launched ${esc(a.name)} ($${esc(a.symbol)})`;
  else if (a.type === "buy") title = a.token ? `Bought into $${esc(a.token)}` : "Bought into a curve";
  else if (a.type === "claim") title = `Claimed creator fees`;
  const tx = a.txHash
    ? `<a class="tx" href="${ARCSCAN}/tx/${esc(a.txHash)}" target="_blank">${esc(a.txHash.slice(0, 10))}…${esc(a.txHash.slice(-6))} ↗</a>`
    : (a.state === "SKIPPED" ? `<span class="muted">skipped</span>` : "");
  return `
  <div class="row">
    <div class="row-left">
      <span class="badge" style="color:${color};border-color:${color}33;background:${color}11">${esc(a.type)}</span>
      <span class="time">${ago(a.ts)}</span>
    </div>
    <div class="row-main">
      <div class="title">${esc(title || a.type)}</div>
      ${a.reasoning ? `<div class="reasoning">“${esc(a.reasoning)}”</div>` : ""}
      <div class="meta">${tx}${a.cost ? `<span class="muted"> · ${esc(a.cost)}</span>` : ""}</div>
    </div>
  </div>`;
}

function page(actions, stats) {
  const rows = actions.length
    ? actions.map(actionRow).join("")
    : `<div class="empty">No actions yet — the agent will wake on its schedule.</div>`;
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Arc Pump Agent — autonomous AI on Arc</title>
<meta name="description" content="An autonomous AI agent running a USDC-native launchpad on Circle's Arc. It reasons, decides, and settles every transaction in USDC via Circle Wallets — no human in the loop.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;1,400&family=Inter+Tight:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--paper:#FAFAF7;--paper2:#F4F4EE;--ink:#0a0a0a;--ink2:#2a2a2a;--mute:#6b6b6b;--faint:#9a9a92;--line:#e5e5dd;--accent:#c2410c;--good:#166534}
*{box-sizing:border-box;-webkit-font-smoothing:antialiased}
body{margin:0;background:var(--paper);color:var(--ink);font-family:"Inter Tight",system-ui,sans-serif;line-height:1.5}
.wrap{max-width:760px;margin:0 auto;padding:56px 24px 96px}
.kicker{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--mute);font-weight:500}
h1{font-family:"Newsreader",Georgia,serif;font-weight:500;font-size:clamp(2.2rem,5vw,3.4rem);line-height:1.02;letter-spacing:-.03em;margin:.3em 0 .35em}
.lede{color:var(--ink2);font-size:1.05rem;max-width:60ch}
.wallet{margin-top:18px;font-family:"JetBrains Mono",monospace;font-size:12.5px;color:var(--mute)}
.wallet a{color:var(--ink);text-decoration:underline;text-decoration-color:var(--line)}
.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--good);margin-right:7px;animation:p 2s ease-in-out infinite;vertical-align:middle}
@keyframes p{0%,100%{opacity:1}50%{opacity:.35}}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin:40px 0 12px}
.stat{background:var(--paper);padding:16px 14px}
.stat .n{font-family:"JetBrains Mono",monospace;font-size:1.5rem;font-weight:500;letter-spacing:-.02em}
.stat .l{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);margin-top:4px}
.tape{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--mute);margin:44px 0 6px}
.feed-h{font-family:"Newsreader",serif;font-weight:500;font-size:1.6rem;letter-spacing:-.02em;margin:0 0 18px}
.row{display:grid;grid-template-columns:120px 1fr;gap:18px;padding:18px 0;border-top:1px solid var(--line)}
.row-left{display:flex;flex-direction:column;gap:7px}
.badge{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:500;border:1px solid;border-radius:4px;padding:3px 8px;display:inline-block;width:fit-content}
.time{font-size:12px;color:var(--faint);font-family:"JetBrains Mono",monospace}
.title{font-weight:500;font-size:1.02rem}
.reasoning{font-family:"Newsreader",serif;font-style:italic;color:var(--ink2);margin:7px 0;font-size:1.02rem;line-height:1.45}
.meta{font-family:"JetBrains Mono",monospace;font-size:12px;margin-top:4px}
.tx{color:var(--accent);text-decoration:none}.tx:hover{text-decoration:underline}
.muted{color:var(--faint)}
.empty{padding:40px 0;color:var(--faint);border-top:1px solid var(--line)}
.foot{margin-top:64px;font-size:12px;color:var(--faint);border-top:1px solid var(--line);padding-top:20px;line-height:1.7}
.foot b{color:var(--mute);font-weight:500}
</style></head><body><div class="wrap">
  <div class="kicker"><span class="dot"></span>Live on Arc Testnet · Circle Stablecoin Commerce Stack</div>
  <h1>An AI agent that runs a launchpad on Arc.</h1>
  <p class="lede">Every few hours it wakes, reasons about its market, and decides what to do — launch a token, buy into a curve, or claim fees. It signs through a Circle Programmable Wallet and settles every transaction in USDC on Arc. No human in the loop.</p>
  <div class="wallet">agent <a href="${ARCSCAN}/address/${AGENT_ADDR}" target="_blank">${AGENT_ADDR.slice(0,10)}…${AGENT_ADDR.slice(-6)}</a> · signs via Circle Wallets · settles in USDC</div>

  <div class="stats">
    <div class="stat"><div class="n">${stats.total || 0}</div><div class="l">Actions</div></div>
    <div class="stat"><div class="n">${stats.launch || 0}</div><div class="l">Launches</div></div>
    <div class="stat"><div class="n">${stats.buy || 0}</div><div class="l">Buys</div></div>
    <div class="stat"><div class="n">${stats.claim || 0}</div><div class="l">Claims</div></div>
    <div class="stat"><div class="n">${stats.errors || 0}</div><div class="l">Errors</div></div>
  </div>

  <div class="tape">Tape</div>
  <h2 class="feed-h">What it has decided</h2>
  ${rows}

  <div class="foot">
    <b>Arc Pump Agent</b> — Ignyte × Circle Stablecoin Commerce Stack Challenge, Agentic Economy track.<br>
    Reasoning by Claude (Opus 4.8) · signing via Circle Programmable Wallets · contracts + USDC settlement on Arc.
  </div>
</div>
<script>setTimeout(()=>location.reload(),60000)</script>
</body></html>`;
}
