// Arc Pump — a fleet of autonomous AI agents running a USDC-native market
// economy on Arc. Each agent has its OWN Circle wallet — distinct on-chain
// actors that transact with one another (a real A2A graph):
//   🚀 Launcher     — opens markets (createToken) + harvests its creator fees (claim → Treasury)
//   📈 Market Maker — seeds liquidity into markets (bonding-curve buy) from its own wallet
//   🏦 Treasury     — the reserve: funds whichever agent is low on USDC (native transfer)
// A coordinator (Claude) routes each cycle to one action. Every write is signed
// via a Circle Programmable Wallet (dev-controlled, MPC) on ARC-TESTNET and
// settled in USDC on Arc. No human in the loop.
//
// Run: node agent.mjs <read|reason|launch|buy|claim|fund|tick|demo>
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import Anthropic from "@anthropic-ai/sdk";

// ---------- config ----------
const RPC = "https://rpc.testnet.arc.network";
const FACTORY = "0x4dCf3238dd90E571e82bC07fD876B384f170546c"; // MemeFactoryV2 (Arc testnet)
const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
const AGENT = process.env.AGENT_ADDRESS; // Launcher = the original creator wallet

// Native USDC on Arc (Circle token id) — used for agent-to-agent transfers.
const NATIVE_TOKEN_ID = process.env.CIRCLE_NATIVE_TOKEN_ID || "15dc2b5d-0994-58b0-bf8c-3a0501148ee8";

// Each fleet agent has its own on-chain wallet. Wallet ids are references, not
// secrets. Launcher is the original wallet (creator of every existing market,
// so only it can claim their fees).
const WALLETS = {
  launcher:    { id: process.env.CIRCLE_WALLET_ID,                                          addr: process.env.AGENT_ADDRESS,                                          label: "Launcher",     emoji: "🚀" },
  marketmaker: { id: process.env.CIRCLE_WALLET_ID_MM || "7c629026-c6cd-5c70-adaf-6f2058ece3a9", addr: process.env.MM_ADDRESS || "0xc3c42c1119223949aff92fa3e9ddbef323ef409d",       label: "Market Maker", emoji: "📈" },
  treasury:    { id: process.env.CIRCLE_WALLET_ID_TREASURY || "10040670-da92-5479-ac55-d3392b068404", addr: process.env.TREASURY_ADDRESS || "0xba557d58de4e10ccfb572020e3a3a47ec1a1dd07", label: "Treasury",     emoji: "🏦" },
};
const walletId = WALLETS.launcher.id; // default signer

const arc = createPublicClient({ transport: http(RPC) });
const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env
const INGEST_URL = process.env.DASHBOARD_INGEST; // dashboard worker /ingest
const INGEST_TOKEN = process.env.INGEST_TOKEN;

// Push an action record (with reasoning) to the live dashboard. Best-effort.
async function ingest(rec) {
  if (!INGEST_URL || !INGEST_TOKEN) return;
  try {
    let balance;
    try { balance = formatUnits(await arc.getBalance({ address: AGENT }), 18) + " USDC"; } catch {}
    await fetch(`${INGEST_URL}?token=${INGEST_TOKEN}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...rec, balance }),
    });
  } catch {}
}

const FACTORY_ABI = parseAbi([
  "function createToken(string name,string symbol,string imageURI,string description,uint256 maxSupply,uint16 tradeFeeBps) payable returns (address token,address curve)",
  "function totalTokens() view returns (uint256)",
  "function createFee() view returns (uint256)",
  "function curveOf(address) view returns (address)",
  "function tokensBatch(uint256 offset,uint256 limit) view returns ((address token,address curve,address creator,string name,string symbol,string imageURI,uint256 createdAt)[])",
]);
const CURVE_ABI = parseAbi([
  "function buy(uint256 amount) payable",
  "function getBuyCost(uint256 amount) view returns (uint256)",
  "function feeFor(uint256 amount,bool isBuy) view returns (uint256)",
  "function claimCreatorFees(address to)",
  "function creatorFeesAccrued() view returns (uint256)",
  "function creator() view returns (address)",
]);

// ---------- token concept palette (reasoning fallback) ----------
const IDEAS = [
  ["Arc Settler", "ASET"], ["USDC Native", "USDCN"], ["Stable Agent", "SAGT"],
  ["Onchain Commerce", "OCOM"], ["Circle Flow", "CFLW"], ["Agentic Pay", "APAY"],
  ["Real Time Final", "RTF"], ["Nano Tick", "NANO"], ["Gateway Bot", "GWB"],
  ["Treasury Loop", "TLOOP"], ["Compliant Coin", "CMPL"], ["Remit Rail", "RAIL"],
];

// ---------- the fleet ----------
// Each economic action maps to the agent that performs it and the wallet that
// signs it. Launcher both launches and claims (only the creator can claim its
// fees); Treasury funds low agents from its own wallet.
const ACTION_META = {
  launch: { agent: "launcher",    wallet: "launcher",    label: "Launcher",     emoji: "🚀" },
  buy:    { agent: "marketmaker", wallet: "marketmaker", label: "Market Maker", emoji: "📈" },
  claim:  { agent: "launcher",    wallet: "launcher",    label: "Launcher",     emoji: "🚀" },
  fund:   { agent: "treasury",    wallet: "treasury",    label: "Treasury",     emoji: "🏦" },
};

// ---------- helpers ----------
const j = (v) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

async function readState() {
  const [total, fee] = await Promise.all([
    arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "totalTokens" }),
    arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "createFee" }),
  ]);
  let bal = "n/a";
  try {
    const b = await arc.getBalance({ address: AGENT });
    bal = formatUnits(b, 18) + " USDC";
  } catch {}
  return { totalTokens: Number(total), createFee: formatUnits(fee, 18) + " USDC", agentBalance: bal };
}

// Poll a submitted Circle transaction to confirmation.
async function poll(id) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const t = await circle.getTransaction({ id });
    const st = t.data.transaction.state;
    if (["CONFIRMED", "COMPLETE"].includes(st))
      return { id, state: st, txHash: t.data.transaction.txHash };
    if (["FAILED", "CANCELLED", "DENIED"].includes(st))
      throw new Error(`tx ${st}: ${t.data.transaction.errorReason ?? ""}`);
  }
  return { id, state: "PENDING" };
}

// Submit a contract execution from a specific agent wallet.
async function exec({ contract, sig, params, amount, wallet }) {
  const res = await circle.createContractExecutionTransaction({
    walletId: wallet || walletId,
    contractAddress: contract,
    abiFunctionSignature: sig,
    abiParameters: params,
    amount: amount ?? "0", // native USDC value for payable calls
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return poll(res.data.id);
}

// Native USDC transfer between agent wallets — the A2A funding rail.
async function transfer(fromWalletId, toAddr, amount) {
  const res = await circle.createTransaction({
    walletId: fromWalletId,
    tokenId: NATIVE_TOKEN_ID,
    destinationAddress: toAddr,
    amounts: [String(amount)],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return poll(res.data.id);
}

// Native USDC balance of an address, as a JS number.
async function balOf(addr) {
  try { return Number(formatUnits(await arc.getBalance({ address: addr }), 18)); } catch { return 0; }
}

async function actionLaunch(aiName, aiSymbol) {
  let name, symbol;
  if (aiName && aiSymbol) {
    name = String(aiName).slice(0, 40);
    symbol = String(aiSymbol).replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase() || "ARCP";
  } else {
    [name, symbol] = IDEAS[Math.floor(Math.random() * IDEAS.length)];
  }
  const fee = await arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "createFee" });
  const MAX_SUPPLY = (1_000_000n * 10n ** 18n).toString(); // 1M tokens
  const TRADE_FEE_BPS = "100"; // 1%
  const r = await exec({
    contract: FACTORY,
    sig: "createToken(string,string,string,string,uint256,uint16)",
    params: [name, symbol, "", `Autonomously launched by the Arc Pump Agent.`, MAX_SUPPLY, TRADE_FEE_BPS],
    amount: formatUnits(fee, 18),
  });
  return { type: "launch", name, symbol, ...r };
}

async function pickCurve() {
  const total = await arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "totalTokens" });
  if (Number(total) === 0) return null;
  const limit = Math.min(Number(total), 50);
  const offset = BigInt(Math.max(0, Number(total) - limit));
  const batch = await arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "tokensBatch", args: [offset, BigInt(limit)] });
  if (!batch.length) return null;
  return batch[Math.floor(Math.random() * batch.length)];
}

async function actionBuy() {
  const total = await arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "totalTokens" });
  if (Number(total) === 0) return { type: "buy", state: "SKIPPED", reason: "no curves yet" };
  const limit = Math.min(Number(total), 50);
  const offset = BigInt(Math.max(0, Number(total) - limit));
  const batch = await arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "tokensBatch", args: [offset, BigInt(limit)] });
  const amount = 1n * 10n ** 18n; // 1 token (small, safe)
  // Try curves (most recent first) until one quotes a cost without reverting.
  for (const c of [...batch].reverse()) {
    let cost, fee;
    try {
      cost = await arc.readContract({ address: c.curve, abi: CURVE_ABI, functionName: "getBuyCost", args: [amount] });
      fee = await arc.readContract({ address: c.curve, abi: CURVE_ABI, functionName: "feeFor", args: [amount, true] });
    } catch { continue; } // skip incompatible/full curves
    const total = cost + fee;
    // Market Maker signs from its own wallet.
    const r = await exec({ contract: c.curve, sig: "buy(uint256)", params: [amount.toString()], amount: formatUnits(total, 18), wallet: WALLETS.marketmaker.id });
    return { type: "buy", token: c.symbol, curve: c.curve, cost: formatUnits(total, 18) + " USDC", ...r };
  }
  return { type: "buy", state: "SKIPPED", reason: "no buyable curve" };
}

async function actionClaim() {
  const total = await arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "totalTokens" });
  if (Number(total) === 0) return { type: "claim", state: "SKIPPED", reason: "no curves yet" };
  const limit = Math.min(Number(total), 50);
  const offset = BigInt(Math.max(0, Number(total) - limit));
  const batch = await arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "tokensBatch", args: [offset, BigInt(limit)] });
  // Only claim where the agent is the creator AND fees have actually accrued —
  // claiming zero fees reverts (ESTIMATION_ERROR).
  for (const c of [...batch].reverse()) {
    let fees, creator;
    try {
      fees = await arc.readContract({ address: c.curve, abi: CURVE_ABI, functionName: "creatorFeesAccrued" });
      creator = await arc.readContract({ address: c.curve, abi: CURVE_ABI, functionName: "creator" });
    } catch { continue; }
    if (creator.toLowerCase() === AGENT.toLowerCase() && fees > 0n) {
      // Launcher is the creator; it sweeps its fees straight to the Treasury wallet.
      const r = await exec({ contract: c.curve, sig: "claimCreatorFees(address)", params: [WALLETS.treasury.addr], wallet: WALLETS.launcher.id });
      return { type: "claim", token: c.symbol, curve: c.curve, claimed: formatUnits(fees, 18) + " USDC", to: "Treasury", ...r };
    }
  }
  return { type: "claim", state: "SKIPPED", reason: "no creator fees accrued yet" };
}

// Treasury tops up whichever working agent (Launcher / Market Maker) is lowest
// on USDC — a real agent-to-agent transfer from the Treasury's own wallet.
async function actionFund(snap) {
  const t = snap.balances.treasury;
  if (t < 1) return { type: "fund", state: "SKIPPED", reason: "treasury reserve too low" };
  const target = snap.balances.marketmaker <= snap.balances.launcher ? "marketmaker" : "launcher";
  const amount = Math.min(3, Math.max(0.5, t - 0.5)).toFixed(2);
  const r = await transfer(WALLETS.treasury.id, WALLETS[target].addr, amount);
  return { type: "fund", token: WALLETS[target].label, to: WALLETS[target].label, cost: amount + " USDC", ...r };
}

// Snapshot the economy so the coordinator can route work to the right agent:
// how many markets exist, which are recent, treasury balance, claimable fees,
// and how many markets are buyable. Claimable/buyable are the A2A signals that
// tell the Treasury and Market Maker when it's their turn.
async function fleetSnapshot() {
  let total = 0, recent = "none yet", claimable = 0n, buyable = 0;
  try {
    total = Number(await arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "totalTokens" }));
    if (total > 0) {
      const lim = Math.min(total, 15);
      const batch = await arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "tokensBatch", args: [BigInt(Math.max(0, total - lim)), BigInt(lim)] });
      recent = batch.slice(-5).map((t) => `${t.name} ($${t.symbol})`).join(", ");
      for (const c of batch) {
        try {
          const fees = await arc.readContract({ address: c.curve, abi: CURVE_ABI, functionName: "creatorFeesAccrued" });
          const creator = await arc.readContract({ address: c.curve, abi: CURVE_ABI, functionName: "creator" });
          if (creator.toLowerCase() === AGENT.toLowerCase()) claimable += fees;
          buyable++;
        } catch {}
      }
    }
  } catch {}
  const balances = {
    launcher: await balOf(WALLETS.launcher.addr),
    marketmaker: await balOf(WALLETS.marketmaker.addr),
    treasury: await balOf(WALLETS.treasury.addr),
  };
  return { total, recent, balances, claimableUSDC: formatUnits(claimable, 18), buyableMarkets: buyable };
}

// The coordinator: Claude routes each cycle to ONE of the three fleet agents and
// explains the decision in that agent's voice. This is what turns a cron into a
// coordinated multi-agent economy — the reasoning is surfaced on the dashboard.
async function reason(snap) {
  const s = snap || (await fleetSnapshot());
  const res = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 6000,
    thinking: { type: "adaptive" },
    system:
      "You are the coordinator of Arc Pump — a fleet of three autonomous AI agents, each with its OWN on-chain wallet, running a USDC-native market economy on Circle's Arc blockchain. The agents and their actions:\n" +
      "- 🚀 Launcher: 'launch' a new USDC-native market (createToken, 1 USDC fee), or 'claim' its accrued creator fees (swept to the Treasury). Only the Launcher can claim, since it created the markets.\n" +
      "- 📈 Market Maker: 'buy' into an existing market from its own wallet to provide liquidity and momentum.\n" +
      "- 🏦 Treasury: 'fund' — transfer USDC from its reserve to whichever working agent is running low, keeping the economy solvent.\n" +
      "Each cycle, pick exactly ONE action based on the economy's state, and explain it in the acting agent's voice (first person). Keep the economy balanced and solvent: if the Launcher or Market Maker is low on USDC and the Treasury has reserves, 'fund' them; 'claim' only when there are claimable fees; 'buy' only when buyable markets exist; otherwise 'launch'. Every action settles in USDC on Arc with no human in the loop.",
    messages: [{
      role: "user",
      content: `Economy state on Arc:
- Markets open: ${s.total}
- Recent markets: ${s.recent}
- 🚀 Launcher wallet: ${s.balances.launcher.toFixed(3)} USDC
- 📈 Market Maker wallet: ${s.balances.marketmaker.toFixed(3)} USDC
- 🏦 Treasury wallet: ${s.balances.treasury.toFixed(3)} USDC
- Claimable creator fees: ${s.claimableUSDC} USDC
- Buyable markets: ${s.buyableMarkets}
- Launch fee: 1 USDC per new market

Decide the next action and why. If 'launch', invent a fresh market name + short ticker fitting the onchain / agentic / stablecoin-commerce theme (avoid repeating the recent ones). Explain in 1-2 sentences, in the acting agent's voice.`,
    }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["launch", "buy", "claim", "fund"] },
            reasoning: { type: "string" },
            tokenName: { type: "string" },
            tokenSymbol: { type: "string" },
          },
          required: ["action", "reasoning", "tokenName", "tokenSymbol"],
          additionalProperties: false,
        },
      },
    },
  });
  const txt = res.content.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(txt);
}

async function tick() {
  const snap = await fleetSnapshot();
  const d = await reason(snap);
  const meta = ACTION_META[d.action] || ACTION_META.launch;
  let result;
  if (d.action === "buy") result = await actionBuy();
  else if (d.action === "claim") result = await actionClaim();
  else if (d.action === "fund") result = await actionFund(snap);
  else result = await actionLaunch(d.tokenName, d.tokenSymbol);
  return { ...result, agent: meta.agent, agentLabel: meta.label, agentEmoji: meta.emoji, reasoning: d.reasoning };
}

// ---------- pretty output (for the demo video) ----------
function wrapText(s, width, indent) {
  const words = String(s).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) { lines.push(cur); cur = w; }
    else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines.map((l) => indent + l);
}

function pretty(r) {
  const bar = "  " + "─".repeat(60);
  const who = r.agentEmoji && r.agentLabel ? `${r.agentEmoji}  ${r.agentLabel}` : "🤖  Arc Pump";
  const out = ["", `  ${who} — Arc Pump fleet · Arc`, bar];
  if (r.reasoning) {
    out.push("  Reasoning:");
    out.push(...wrapText(r.reasoning, 60, "    "));
    out.push("");
  }
  const T = (r.type || "").toUpperCase();
  const skip = r.state === "SKIPPED";
  if (r.type === "launch") out.push(`  ✅ ${T}   ${r.name} ($${r.symbol})`);
  else if (r.type === "buy") out.push(`  ✅ ${T}   into $${r.token}${r.cost ? `   ·  ${r.cost}` : ""}`);
  else if (r.type === "claim") out.push(`  ${skip ? "↪" : "✅"} ${T}   ${skip ? (r.reason || "skipped") : `${r.claimed || "fees"} swept to Treasury`}`);
  else if (r.type === "fund") out.push(`  ${skip ? "↪" : "✅"} ${T}   ${skip ? (r.reason || "skipped") : `${r.cost} → ${r.to}`}`);
  if (r.txHash) {
    out.push(`     tx  ${r.txHash.slice(0, 10)}…${r.txHash.slice(-6)}   ·  settled in USDC on Arc`);
    out.push(`     https://testnet.arcscan.app/tx/${r.txHash}`);
  }
  out.push(bar, "");
  return out.join("\n");
}

// ---------- main ----------
const cmd = process.argv[2] || "read";
try {
  if (cmd === "read") console.log("state:", j(await readState()));
  else if (cmd === "reason") console.log("decision:", j(await reason()));
  else if (cmd === "demo") {
    const result = await tick();
    console.log(pretty(result));   // clean, human-readable output for the demo video
    await ingest(result);
  } else if (["launch", "buy", "claim", "fund", "tick"].includes(cmd)) {
    const result =
      cmd === "launch" ? await actionLaunch() :
      cmd === "buy" ? await actionBuy() :
      cmd === "claim" ? await actionClaim() :
      cmd === "fund" ? await actionFund(await fleetSnapshot()) :
      await tick();
    console.log("result:", j(result));
    await ingest(result);
  } else console.log("usage: node agent.mjs <read|reason|launch|buy|claim|fund|tick|demo>");
} catch (e) {
  console.error("ERR:", e.message);
  process.exit(1);
}
