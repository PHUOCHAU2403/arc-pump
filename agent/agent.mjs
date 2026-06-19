// Arc Pump Agent — autonomous agent operating a USDC-native launchpad on Arc.
// Signs via Circle Programmable Wallets (dev-controlled, MPC) on ARC-TESTNET.
// Actions: launch (createToken) · buy (bonding curve) · claim (creator fees).
// Reads via viem public client; writes via Circle createContractExecutionTransaction.
//
// Run: node agent.mjs <read|launch|buy|claim|tick>
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
]);

// ---------- token concept palette (reasoning fallback) ----------
const IDEAS = [
  ["Arc Settler", "ASET"], ["USDC Native", "USDCN"], ["Stable Agent", "SAGT"],
  ["Onchain Commerce", "OCOM"], ["Circle Flow", "CFLW"], ["Agentic Pay", "APAY"],
  ["Real Time Final", "RTF"], ["Nano Tick", "NANO"], ["Gateway Bot", "GWB"],
  ["Treasury Loop", "TLOOP"], ["Compliant Coin", "CMPL"], ["Remit Rail", "RAIL"],
];

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
  const c = await pickCurve();
  if (!c) return { type: "claim", state: "SKIPPED", reason: "no curves yet" };
  const r = await exec({ contract: c.curve, sig: "claimCreatorFees(address)", params: [AGENT] });
  return { type: "claim", curve: c.curve, ...r };
}

// AI reasoning: Claude decides the next action and explains why. The `reasoning`
// string is surfaced on the dashboard — this is what makes it an agent that
// *thinks*, not a cron with a dice roll.
async function reason() {
  const total = await arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "totalTokens" });
  let recent = "none yet";
  if (Number(total) > 0) {
    const lim = Math.min(Number(total), 5);
    const batch = await arc.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "tokensBatch", args: [BigInt(Math.max(0, Number(total) - lim)), BigInt(lim)] });
    recent = batch.map((t) => `${t.name} ($${t.symbol})`).join(", ");
  }
  let bal = "unknown";
  try { bal = formatUnits(await arc.getBalance({ address: AGENT }), 18) + " USDC"; } catch {}

  const res = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 6000,
    thinking: { type: "adaptive" },
    system:
      "You are an autonomous AI agent operating Arc Pump — a USDC-native memecoin launchpad on Circle's Arc blockchain. Each cycle you pick ONE action and settle it in USDC on Arc with no human in the loop: 'launch' a new token, 'buy' from an existing bonding curve, or 'claim' accrued creator fees. Keep the launchpad lively and your decisions varied and sensible.",
    messages: [{
      role: "user",
      content: `Current state of your launchpad on Arc:
- Tokens launched so far: ${Number(total)}
- Recent tokens: ${recent}
- Your wallet balance: ${bal}
- Launch fee: 1 USDC per token

Decide your next action. Aim for variety across cycles — grow the catalog with fresh launches regularly, not just buys; periodically claim fees too. If you 'launch', invent a fresh, fun token name + short ticker fitting the onchain / agentic / stablecoin-commerce theme (avoid repeating the recent ones). Explain your reasoning in 1-2 sentences.`,
    }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["launch", "buy", "claim"] },
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
  const d = await reason();
  let result;
  if (d.action === "launch") result = await actionLaunch(d.tokenName, d.tokenSymbol);
  else if (d.action === "buy") result = await actionBuy();
  else result = await actionClaim();
  return { ...result, reasoning: d.reasoning };
}

// ---------- main ----------
const cmd = process.argv[2] || "read";
try {
  if (cmd === "read") console.log("state:", j(await readState()));
  else if (cmd === "reason") console.log("decision:", j(await reason()));
  else if (["launch", "buy", "claim", "tick"].includes(cmd)) {
    const result =
      cmd === "launch" ? await actionLaunch() :
      cmd === "buy" ? await actionBuy() :
      cmd === "claim" ? await actionClaim() :
      await tick();
    console.log("result:", j(result));
    await ingest(result);
  } else console.log("usage: node agent.mjs <read|reason|launch|buy|claim|tick>");
} catch (e) {
  console.error("ERR:", e.message);
  process.exit(1);
}
