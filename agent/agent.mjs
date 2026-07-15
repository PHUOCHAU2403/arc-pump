// Arc Pump — a fleet of autonomous AI agents running a USDC-native market
// economy on Arc. A coordinator routes each cycle to the agent whose turn it is:
//   🚀 Launcher     — opens new USDC-native markets (createToken)
//   📈 Market Maker — seeds liquidity into existing markets (bonding-curve buy)
//   🏦 Treasury     — harvests creator fees to keep the economy self-funding (claim)
// Every action is reasoned by Claude, signed via a Circle Programmable Wallet
// (dev-controlled, MPC) on ARC-TESTNET, and settled in USDC on Arc. No human loop.
// Reads via viem public client; writes via Circle createContractExecutionTransaction.
//
// Run: node agent.mjs <read|reason|launch|buy|claim|tick|demo>
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import Anthropic from "@anthropic-ai/sdk";

// ---------- config ----------
const RPC = "https://rpc.testnet.arc.network";
const FACTORY = "0x4dCf3238dd90E571e82bC07fD876B384f170546c"; // MemeFactoryV2 (Arc testnet)
const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
const walletId = process.env.CIRCLE_WALLET_ID;
const AGENT = process.env.AGENT_ADDRESS;

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
// Three role-agents share the treasury wallet today; each owns one economic
// function. A coordinator (reason()) routes each cycle to one of them.
const FLEET = {
  launcher:    { tag: "launcher",    label: "Launcher",     emoji: "🚀", action: "launch" },
  marketmaker: { tag: "marketmaker", label: "Market Maker", emoji: "📈", action: "buy" },
  treasury:    { tag: "treasury",    label: "Treasury",     emoji: "🏦", action: "claim" },
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

// Submit a contract execution via Circle Wallets and wait for confirmation.
async function exec({ contract, sig, params, amount }) {
  const res = await circle.createContractExecutionTransaction({
    walletId,
    contractAddress: contract,
    abiFunctionSignature: sig,
    abiParameters: params,
    amount: amount ?? "0", // native USDC value for payable calls
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const id = res.data.id;
  // poll
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
    const r = await exec({ contract: c.curve, sig: "buy(uint256)", params: [amount.toString()], amount: formatUnits(total, 18) });
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
      const r = await exec({ contract: c.curve, sig: "claimCreatorFees(address)", params: [AGENT] });
      return { type: "claim", token: c.symbol, curve: c.curve, claimed: formatUnits(fees, 18) + " USDC", ...r };
    }
  }
  return { type: "claim", state: "SKIPPED", reason: "no creator fees accrued yet" };
}

// Snapshot the economy so the coordinator can route work to the right agent:
// how many markets exist, which are recent, treasury balance, claimable fees,
// and how many markets are buyable. Claimable/buyable are the A2A signals that
// tell the Treasury and Market Maker when it's their turn.
async function fleetSnapshot() {
  const total = Number(await arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "totalTokens" }));
  let recent = "none yet", claimable = 0n, buyable = 0;
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
  let bal = "unknown";
  try { bal = formatUnits(await arc.getBalance({ address: AGENT }), 18) + " USDC"; } catch {}
  return { total, recent, balance: bal, claimableUSDC: formatUnits(claimable, 18), buyableMarkets: buyable };
}

// The coordinator: Claude routes each cycle to ONE of the three fleet agents and
// explains the decision in that agent's voice. This is what turns a cron into a
// coordinated multi-agent economy — the reasoning is surfaced on the dashboard.
async function reason() {
  const s = await fleetSnapshot();
  const res = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 6000,
    thinking: { type: "adaptive" },
    system:
      "You are the coordinator of Arc Pump — a fleet of three autonomous AI agents running a USDC-native market economy on Circle's Arc blockchain. The fleet:\n" +
      "- launcher (🚀 Launcher): opens new USDC-native token markets (bonding curves).\n" +
      "- marketmaker (📈 Market Maker): provides liquidity by buying into existing markets to build momentum.\n" +
      "- treasury (🏦 Treasury): claims accrued creator fees to keep the economy self-funding.\n" +
      "Each cycle, route to exactly ONE agent based on the economy's state, and explain the decision in that agent's voice (first person). The agents coordinate as an economy: the Launcher seeds new markets, the Market Maker supports them with liquidity, the Treasury harvests fees. Keep it balanced — vary across cycles, don't only launch. Route to treasury only when there are claimable fees; route to marketmaker only when buyable markets exist. Every action settles in USDC on Arc with no human in the loop.",
    messages: [{
      role: "user",
      content: `Economy state on Arc:
- Markets open: ${s.total}
- Recent markets: ${s.recent}
- Treasury (wallet) balance: ${s.balance}
- Claimable creator fees: ${s.claimableUSDC} USDC
- Buyable markets: ${s.buyableMarkets}
- Launch fee: 1 USDC per new market

Decide which agent acts next and why. If routing to the Launcher, invent a fresh market name + short ticker fitting the onchain / agentic / stablecoin-commerce theme (avoid repeating the recent ones). Explain in 1-2 sentences, in the acting agent's voice.`,
    }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            agent: { type: "string", enum: ["launcher", "marketmaker", "treasury"] },
            reasoning: { type: "string" },
            tokenName: { type: "string" },
            tokenSymbol: { type: "string" },
          },
          required: ["agent", "reasoning", "tokenName", "tokenSymbol"],
          additionalProperties: false,
        },
      },
    },
  });
  const txt = res.content.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(txt);
}

async function tick() {
  const d = await reason();
  const meta = FLEET[d.agent] || FLEET.launcher;
  let result;
  if (d.agent === "marketmaker") result = await actionBuy();
  else if (d.agent === "treasury") result = await actionClaim();
  else result = await actionLaunch(d.tokenName, d.tokenSymbol);
  return { ...result, agent: meta.tag, agentLabel: meta.label, agentEmoji: meta.emoji, reasoning: d.reasoning };
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
  if (r.type === "launch") out.push(`  ✅ ${T}   ${r.name} ($${r.symbol})`);
  else if (r.type === "buy") out.push(`  ✅ ${T}   into $${r.token}${r.cost ? `   ·  ${r.cost}` : ""}`);
  else if (r.type === "claim") out.push(`  ${r.state === "SKIPPED" ? "↪" : "✅"} ${T}   ${r.state === "SKIPPED" ? (r.reason || "skipped") : "creator fees claimed"}`);
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
  } else if (["launch", "buy", "claim", "tick"].includes(cmd)) {
    const result =
      cmd === "launch" ? await actionLaunch() :
      cmd === "buy" ? await actionBuy() :
      cmd === "claim" ? await actionClaim() :
      await tick();
    console.log("result:", j(result));
    await ingest(result);
  } else console.log("usage: node agent.mjs <read|reason|launch|buy|claim|tick|demo>");
} catch (e) {
  console.error("ERR:", e.message);
  process.exit(1);
}
