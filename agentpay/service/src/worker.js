// Agent-pay service — the "sell side" of the pay-per-call rail, plus a live
// ledger + dashboard.
//
//   GET /fairvalue                -> 402 + invoice (the real product: live
//                                    prediction-market mispricing signal)
//   GET /fairvalue?invoice=<id>   -> 200 + signal, verified on-chain, single-use
//   GET /premium                  -> 402 / 200, same flow, placeholder payload
//                                    kept so existing demos keep working
//   GET /ledger                   -> JSON { purchases[], stats }
//   GET /                         -> HTML dashboard of agent purchases
//
// Every 402 also carries the standard x402 v2 PAYMENT-REQUIRED header.

const ROUTER = "0x42bCE0940b286b29A7bE50c3C7c89302A48E28ff";
const SERVICE = "0xfC6153A6d0Cc40E17d9B48fE2fb1AACd9C63114e"; // this service's payee (USDC lands here)
const RPC = "https://rpc.testnet.arc.network";
const ARCSCAN = "https://testnet.arcscan.app";
const PRICE_WEI = "10000000000000000"; // 0.01 USDC (native, 18 dec)
const PRICE_USDC = "0.01";
const VERIFY_SELECTOR = "0x3ab5b633"; // verify(bytes32,address,uint256)

// x402 (v2) discovery. We advertise our terms in the standard `PAYMENT-REQUIRED`
// header so any x402 client can read the price, chain and payee without knowing
// this service. We do NOT claim the `exact` scheme: that settles an EIP-3009
// signed authorization, and on Arc USDC is the *native* token — there is nothing
// to sign an authorization against, which is why payment goes through the router
// instead. Declaring our own scheme means a standard client skips us cleanly
// rather than attempting a payment that could never succeed.
const NETWORK = "eip155:5042002"; // Arc testnet
const SCHEME = "arc-router-v1";
const NATIVE_ASSET = "0x0000000000000000000000000000000000000000"; // native USDC has no ERC-20 address
const BASE_URL = "https://agentpay-service.arcpump2403.workers.dev";

const DESCRIPTIONS = {
  "/fairvalue": "Live fair-value and mispricing signal for short-dated crypto prediction markets.",
  "/premium": "Pay-per-call resource settled in native USDC on Arc.",
};

const paymentRequirements = (invoiceId, resource) => ({
  x402Version: 2,
  error: "Payment required",
  resource: { url: BASE_URL + resource, description: DESCRIPTIONS[resource], mimeType: "application/json" },
  accepts: [{
    scheme: SCHEME,
    network: NETWORK,
    amount: PRICE_WEI,
    asset: NATIVE_ASSET,
    payTo: SERVICE,
    maxTimeoutSeconds: 900,
    extra: {
      name: "USDC", decimals: 18, native: true, router: ROUTER, invoiceId,
      pay: "router.pay(bytes32 invoiceId, address service) payable",
      verify: "router.verify(bytes32,address,uint256) view returns (bool)",
      retry: `${BASE_URL}${resource}?invoice=${invoiceId}`,
    },
  }],
});

const b64 = (o) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))));

// A 402 that carries both our own JSON body (unchanged, so existing clients keep
// working) and the standard x402 header.
const json402 = (body, invoiceId, resource) => {
  const r = json(body, 402);
  r.headers.set("PAYMENT-REQUIRED", b64(paymentRequirements(invoiceId, resource)));
  return r;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-payment,x-agent,x-agent-name",
  // Browsers can't read a custom header cross-origin unless it's exposed.
  "access-control-expose-headers": "PAYMENT-REQUIRED",
};
const cors = (r) => { for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v); return r; };
const json = (o, status = 200) =>
  new Response(JSON.stringify(o, null, 2), { status, headers: { "content-type": "application/json", ...CORS } });

export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);
      if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
      if (url.pathname === "/fairvalue") return await gate(req, env, url, "/fairvalue", fairValue);
      if (url.pathname === "/premium") return await gate(req, env, url, "/premium", demoPayload);
      if (url.pathname === "/ledger") return json(await loadLedger(env));
      if (url.pathname === "/demo-pay" && req.method === "POST") return await demoPay(req, env);
      if (url.pathname === "/demo-status") return await demoStatus(req, env, url);
      if (url.pathname === "/hit") return await hit(req, env);
      if (url.pathname === "/analytics") return await analytics(req, env, url);
      return await dashboard(env);
    } catch (e) {
      return json({ error: "worker error: " + String((e && e.message) || e).slice(0, 220) }, 500);
    }
  },
};

// The payment gate. Identical for every paid resource: issue an invoice, verify
// it on-chain, serve once. `produce` is what the buyer is actually paying for —
// it only runs after payment is confirmed, so an unpaid caller costs us nothing
// but a KV write.
async function gate(req, env, url, resource, produce) {
  const provided = url.searchParams.get("invoice") || req.headers.get("x-payment");

  if (!provided) {
    const id = "0x" + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.INVOICES.put(id, JSON.stringify({ resource, price: PRICE_WEI, served: false, ts: Date.now() }), { expirationTtl: 900 });
    return json402({
      error: "payment required",
      invoice: { id, amount: PRICE_WEI, amountUSDC: PRICE_USDC, router: ROUTER, service: SERVICE, resource, chain: "arc-testnet", expiresInSec: 900 },
      how: `Call ${ROUTER}.pay(invoiceId, service) with ${PRICE_USDC} USDC, then retry GET ${resource}?invoice=${id}`,
    }, id, resource);
  }

  const inv = await env.INVOICES.get(provided, "json");
  if (!inv) return json({ error: "unknown or expired invoice" }, 400);
  if (inv.served) return json({ error: "invoice already used", invoice: provided }, 409);
  // An invoice buys the resource it was issued for, not a different one.
  if (inv.resource !== resource) return json({ error: `invoice was issued for ${inv.resource}`, invoice: provided }, 400);

  const ok = await verifyOnChain(provided, SERVICE, inv.price);
  if (!ok) return json402({ error: "not paid yet", invoice: { id: provided, amount: inv.price, amountUSDC: PRICE_USDC, router: ROUTER, service: SERVICE } }, provided, resource);

  const data = await produce();

  // Only burn the invoice once we actually have something to hand back — if the
  // upstream data sources are down, the buyer keeps their paid invoice.
  inv.served = true;
  await env.INVOICES.put(provided, JSON.stringify(inv), { expirationTtl: 900 });

  await recordPurchase(env, {
    invoice: provided,
    amountUSDC: PRICE_USDC,
    resource,
    agent: (req.headers.get("x-agent") || "").slice(0, 44),
    agentName: (req.headers.get("x-agent-name") || "").slice(0, 40),
    ts: Date.now(),
  });

  return json({
    resource,
    data,
    payment: { invoice: provided, amountUSDC: PRICE_USDC, settledInUSDC: true, chain: "arc-testnet" },
  });
}

const demoPayload = async () => ({
  insight: "On Arc, USDC is the native token — settlement is final in ~1s, which is exactly what per-call agent payments need.",
  generatedAt: new Date().toISOString(),
});

// ---------------------------------------------------------------------------
// /fairvalue — what an agent actually pays for.
//
// Short-dated "Up or Down" prediction markets are priced against live spot with
// a zero-drift lognormal model: the probability that the close exceeds the open
// is Phi( ln(spot/open) / (sigma * sqrt(minutes_left)) ), with sigma estimated
// from the last 60 one-minute log returns. The output is not the odds — anyone
// can read those off the book — it is the gap between the model and the book.
// ---------------------------------------------------------------------------

// Question prefix as Polymarket writes it -> Binance symbol.
const ASSETS = {
  Bitcoin: "BTCUSDT", Ethereum: "ETHUSDT", Solana: "SOLUSDT",
  XRP: "XRPUSDT", Dogecoin: "DOGEUSDT", BNB: "BNBUSDT",
};
const EDGE_THRESHOLD = 0.05; // 5 cents
const MIN_SECONDS_LEFT = 50; // below this the quote is stale before you can act

// Spot comes from Bybit, not Binance: Binance answers 403 to Cloudflare Worker
// egress IPs (both api.binance.com and the data mirror), while Bybit, Coinbase
// and Kraken all answer 200. Bybit is the closest match — same USDT pairs for
// every asset these markets cover.
//
// One call per symbol gives both the history and the price: Bybit returns the
// in-progress candle first, so its close is the live spot.
async function bybitCandles(symbol) {
  const u = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=1&limit=90`;
  const r = await fetch(u, { cf: { cacheTtl: 5 } });
  if (!r.ok) throw new Error(`bybit ${symbol} -> ${r.status}`);
  const j = await r.json();
  const list = j?.result?.list;
  if (!Array.isArray(list) || !list.length) throw new Error(`bybit ${symbol} -> ${j?.retMsg || "no data"}`);
  // Bybit lists newest-first; we want oldest-first.
  return list
    .map((c) => ({ openTime: Number(c[0]), open: Number(c[1]), close: Number(c[4]) }))
    .sort((a, b) => a.openTime - b.openTime);
}

// The period this market covers, in minutes, read off the question text
// ("… - July 30, 11:15PM-11:20PM ET" -> 5).
//
// This has to come from the question. `eventStartTime` is NOT the period open:
// consecutive 11:15-11:20 and 11:20-11:25 markets carry the same value, so
// using it prices every period against the same stale candle.
function periodMinutes(q) {
  const m = (q || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  const to24 = (h, ap) => (Number(h) % 12) + (/pm/i.test(ap) ? 12 : 0);
  const a = to24(m[1], m[3]) * 60 + Number(m[2]);
  let b = to24(m[4], m[6]) * 60 + Number(m[5]);
  if (b <= a) b += 1440; // period crosses midnight
  return b - a;
}

// Abramowitz-Stegun 7.1.26 — enough precision for a pricing signal.
function normCdf(x) {
  const s = x < 0 ? -1 : 1, z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}

// Per-minute stdev of log returns over the candle closes.
function sigmaFrom(closes) {
  const r = [];
  for (let i = 1; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
  if (r.length < 2) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
}

// Polymarket leaves hundreds of dead 2025 markets flagged closed=false, so
// sorting by endDate ascending never reaches today. end_date_min is what makes
// this query return live markets at all. We only look 30 minutes out — beyond
// that the market isn't short-dated enough for this model to say anything.
async function liveUpDownMarkets() {
  const now = new Date(), max = new Date(Date.now() + 1800e3);
  const u = "https://gamma-api.polymarket.com/markets?closed=false&active=true"
    + `&end_date_min=${now.toISOString()}&end_date_max=${max.toISOString()}`
    + "&order=endDate&ascending=true&limit=100";
  const r = await fetch(u, { cf: { cacheTtl: 5 } });
  if (!r.ok) throw new Error(`gamma -> ${r.status}`);
  const all = await r.json();
  return (Array.isArray(all) ? all : []).filter((m) => /Up or Down/i.test(m.question || "") && m.clobTokenIds);
}

// Live order book, in one batched request.
//
// Gamma's `bestBid`/`bestAsk` fields cannot be used for this: measured against
// the book they are simply wrong (a market quoting 0.130/0.131 on the CLOB came
// back as 0.03/0.04 from Gamma), and `outcomePrices` lags. Pricing a signal off
// either would manufacture double-digit "edges" that do not exist. The CLOB is
// the only source that matches what a taker would actually get filled at.
async function clobPrices(markets) {
  const yesToken = new Map();
  const reqs = [];
  for (const m of markets) {
    let t;
    try { t = JSON.parse(m.clobTokenIds)[0]; } catch { continue; }
    if (!t) continue;
    yesToken.set(String(m.id), t);
    reqs.push({ token_id: t, side: "BUY" }, { token_id: t, side: "SELL" });
  }
  if (!reqs.length) return { yesToken, prices: {} };

  const r = await fetch("https://clob.polymarket.com/prices", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(reqs),
  });
  if (!r.ok) throw new Error(`clob -> ${r.status}`);
  return { yesToken, prices: await r.json() };
}

let fvCache = { at: 0, body: null }; // per-isolate, ~10s — keeps a burst of paid calls cheap

async function fairValue() {
  if (fvCache.body && Date.now() - fvCache.at < 10_000) {
    return { ...fvCache.body, cachedForMs: Date.now() - fvCache.at };
  }

  const markets = await liveUpDownMarkets();
  const wanted = [...new Set(markets.map((m) => ASSETS[(m.question || "").split(" Up or Down")[0]]).filter(Boolean))];

  if (!wanted.length) {
    return {
      model: "lognormal zero-drift: P(close>open) = Phi(ln(spot/open)/(sigma*sqrt(t)))",
      markets: [], note: "No live Up/Down markets in the next 30 minutes.", generatedAt: new Date().toISOString(),
    };
  }

  const [book, ...candleSets] = await Promise.all([
    clobPrices(markets),
    ...wanted.map((s) => bybitCandles(s)),
  ]);

  const spot = {}, sigma = {}, candles = {};
  wanted.forEach((s, i) => {
    candles[s] = candleSets[i];
    spot[s] = candles[s][candles[s].length - 1].close; // in-progress candle = live price
    sigma[s] = sigmaFrom(candles[s].map((c) => c.close));
  });

  const now = Date.now();
  const rows = [];
  for (const m of markets) {
    const sym = ASSETS[(m.question || "").split(" Up or Down")[0]];
    if (!sym || !spot[sym] || !sigma[sym]) continue;

    const endMs = new Date(m.endDate).getTime();
    const durMin = periodMinutes(m.question);
    if (!durMin) continue;
    const startMs = endMs - durMin * 60000;
    const secondsLeft = Math.round((endMs - now) / 1000);
    const minutesLeft = (endMs - now) / 60000;
    if (!(minutesLeft > 0)) continue;

    // A period that hasn't opened yet has no reference price, so under a
    // zero-drift model its fair value is exactly 0.5 — pricing it off the latest
    // candle instead would invent an edge out of an open that doesn't exist.
    const pending = startMs > now;
    const c = pending ? null : candles[sym].filter((x) => x.openTime <= startMs).pop();
    if (!pending && !c) continue;

    const fair = pending ? 0.5 : normCdf(Math.log(spot[sym] / c.open) / (sigma[sym] * Math.sqrt(minutesLeft)));

    // The CLOB returns the best resting order on each side: side=BUY is the
    // best bid, side=SELL is the best ask. (Verified against a book quoting
    // 0.130 bid / 0.131 ask.)
    const px = book.prices[book.yesToken.get(String(m.id))] || {};
    const bid = Number(px.BUY), ask = Number(px.SELL);
    const edgeYes = Number.isFinite(ask) ? fair - ask : null;   // buy YES if the book is under the model
    const edgeNo = Number.isFinite(bid) ? bid - fair : null;    // buy NO if the book is over it

    let signal = "WAIT", edge = 0;
    if (secondsLeft >= MIN_SECONDS_LEFT) {
      if (edgeYes !== null && edgeYes >= EDGE_THRESHOLD) { signal = "BUY_YES"; edge = edgeYes; }
      else if (edgeNo !== null && edgeNo >= EDGE_THRESHOLD) { signal = "BUY_NO"; edge = edgeNo; }
      else edge = Math.max(edgeYes ?? -1, edgeNo ?? -1);
    }

    rows.push({
      market: m.question, id: String(m.id), asset: sym,
      status: pending ? "pending" : "live",
      periodOpen: c ? c.open : null, spot: Number(spot[sym].toFixed(8)),
      sigmaPerMin: Number(sigma[sym].toFixed(8)),
      minutesLeft: Number(minutesLeft.toFixed(2)), secondsLeft,
      fairValue: Number(fair.toFixed(4)),
      bestBid: Number.isFinite(bid) ? bid : null,
      bestAsk: Number.isFinite(ask) ? ask : null,
      edge: Number(edge.toFixed(4)), signal,
    });
  }

  rows.sort((a, b) => b.edge - a.edge);
  const body = {
    model: "lognormal zero-drift: P(close>open) = Phi(ln(spot/open)/(sigma*sqrt(t)))",
    sigmaEstimator: "stdev of the last 60-90 one-minute log returns",
    signalRule: `|edge| >= ${EDGE_THRESHOLD} and >= ${MIN_SECONDS_LEFT}s remaining`,
    sources: ["bybit:spot 1m klines", "polymarket:gamma (market discovery)", "polymarket:clob (live book)"],
    priceSource: "CLOB order book — Gamma's bestBid/bestAsk do not match the book and are not used",
    counts: { markets: rows.length, signals: rows.filter((r) => r.signal !== "WAIT").length },
    markets: rows,
    disclaimer: "Model output, not investment advice. A simple model runs roughly break-even against professional market makers.",
    generatedAt: new Date().toISOString(),
  };
  fvCache = { at: Date.now(), body };
  return body;
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

// ---------- sponsored demo payment (real, on-chain, rate-limited) ----------
// Lets a visitor trigger a REAL agent payment on Arc from the landing page.
// The agent's Circle wallet pays the invoice; spam is bounded by a per-IP
// cooldown + a global daily cap. Secrets: CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET,
// CIRCLE_WALLET_ID (wrangler secret put).
const CIRCLE_API = "https://api.circle.com/v1/w3s";
const DEMO_DAILY_CAP = 300;

async function demoPay(req, env) {
  let b; try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const invoice = String(b.invoice || "");
  if (!/^0x[0-9a-fA-F]{64}$/.test(invoice)) return json({ error: "a valid invoice is required" }, 400);
  if (!env.CIRCLE_API_KEY) return json({ error: "sponsor payments not configured" }, 503);

  const ip = req.headers.get("cf-connecting-ip") || "anon";
  const now = Date.now();
  const last = Number((await env.INVOICES.get(`dip:${ip}`)) || "0");
  if (now - last < 15000) return json({ error: "just a moment — one demo payment every ~15s" }, 429);
  const day = new Date().toISOString().slice(0, 10);
  const gc = Number((await env.INVOICES.get(`dcount:${day}`)) || "0");
  if (gc >= DEMO_DAILY_CAP) return json({ error: "daily demo limit reached — grab the SDK to keep going" }, 429);
  await env.INVOICES.put(`dip:${ip}`, String(now), { expirationTtl: 60 });

  let id;
  try { id = await circlePay(env, invoice); }
  catch (e) { return json({ error: "payment failed: " + String(e.message || e).slice(0, 160) }, 502); }
  await env.INVOICES.put(`dcount:${day}`, String(gc + 1), { expirationTtl: 60 * 60 * 26 });
  return json({ ok: true, id, invoice });
}

async function demoStatus(req, env, url) {
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);
  try {
    const t = await circleGetTx(env, id);
    return json({ state: t.state, txHash: t.txHash || null });
  } catch (e) {
    return json({ error: String(e.message || e).slice(0, 160) }, 502);
  }
}

async function circlePay(env, invoice) {
  const body = {
    idempotencyKey: crypto.randomUUID(),
    entitySecretCiphertext: await entityCiphertext(env),
    walletId: env.CIRCLE_WALLET_ID,
    contractAddress: ROUTER,
    abiFunctionSignature: "pay(bytes32,address)",
    abiParameters: [invoice, SERVICE],
    amount: PRICE_USDC,
    feeLevel: "MEDIUM",
  };
  const r = await fetch(`${CIRCLE_API}/developer/transactions/contractExecution`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CIRCLE_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j?.data?.id) throw new Error(j?.message || JSON.stringify(j).slice(0, 160));
  return j.data.id;
}

async function circleGetTx(env, id) {
  const r = await fetch(`${CIRCLE_API}/transactions/${id}`, { headers: { authorization: `Bearer ${env.CIRCLE_API_KEY}` } });
  const j = await r.json();
  const t = j?.data?.transaction || {};
  return { state: t.state || "UNKNOWN", txHash: t.txHash };
}

// Encrypt the 32-byte entity secret with Circle's RSA public key (per request).
async function entityCiphertext(env) {
  const r = await fetch(`${CIRCLE_API}/config/entity/publicKey`, { headers: { authorization: `Bearer ${env.CIRCLE_API_KEY}` } });
  const pem = (await r.json())?.data?.publicKey;
  if (!pem) throw new Error("could not fetch entity public key");
  const der = pemToDer(pem);
  const key = await crypto.subtle.importKey("spki", der, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, hexToBytes(env.CIRCLE_ENTITY_SECRET));
  return btoa(String.fromCharCode(...new Uint8Array(ct)));
}
function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function hexToBytes(h) {
  h = h.replace(/^0x/, "");
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
  return a;
}

// ---------- analytics ----------
// Lightweight, privacy-respecting: daily page views + unique visitors (by a
// short hash of IP, never the raw IP). Demo runs come from the dcount counter.
const todayUTC = () => new Date().toISOString().slice(0, 10);

async function hit(req, env) {
  const day = todayUTC();
  const views = Number((await env.INVOICES.get(`views:${day}`)) || "0") + 1;
  await env.INVOICES.put(`views:${day}`, String(views), { expirationTtl: 60 * 60 * 24 * 40 });
  // unique visitor: hash the IP so we never store it raw
  const ip = req.headers.get("cf-connecting-ip") || "anon";
  const h = await sha8(ip + ":" + day);
  if (!(await env.INVOICES.get(`uv:${day}:${h}`))) {
    await env.INVOICES.put(`uv:${day}:${h}`, "1", { expirationTtl: 60 * 60 * 48 });
    const u = Number((await env.INVOICES.get(`uniq:${day}`)) || "0") + 1;
    await env.INVOICES.put(`uniq:${day}`, String(u), { expirationTtl: 60 * 60 * 24 * 40 });
  }
  return json({ ok: true });
}

async function analytics(req, env, url) {
  if (!env.ANALYTICS_KEY || url.searchParams.get("key") !== env.ANALYTICS_KEY)
    return json({ error: "unauthorized" }, 403);
  const days = [];
  let tViews = 0, tUniq = 0, tRuns = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const views = Number((await env.INVOICES.get(`views:${d}`)) || "0");
    const uniq = Number((await env.INVOICES.get(`uniq:${d}`)) || "0");
    const demoRuns = Number((await env.INVOICES.get(`dcount:${d}`)) || "0");
    days.push({ day: d, views, uniqueVisitors: uniq, demoRuns });
    tViews += views; tUniq += uniq; tRuns += demoRuns;
  }
  const ledger = await loadLedger(env);
  return json({ last7days: days, totals: { views: tViews, uniqueVisitors: tUniq, demoRuns: tRuns, paidCalls: ledger.stats.count || 0, usdcSettled: ledger.stats.totalUSDC || 0 } });
}

async function sha8(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
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
