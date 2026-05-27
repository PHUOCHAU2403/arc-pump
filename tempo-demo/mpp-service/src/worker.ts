/**
 * tempo-pump-mpp — MPP-compatible endpoint that lets AI agents launch a
 * memecoin on Tempo mainnet through Arc Pump's MemeFactoryTempoV2.
 *
 * Verification model
 *
 * For the demo we hand-roll the HTTP 402 challenge (matches MPP shape so
 * the Tempo CLI happily auto-pays and retries) and trust any retry that
 * carries an `Authorization: Payment ...` header. Strict on-chain receipt
 * verification is left for a follow-up — the cost per call is small and
 * the demo angle is "AI launched a coin," not "payments fraud surface."
 *
 * Tempo-native transactions
 *
 * Tempo's EVM disables CALLVALUE/BALANCE/SELFBALANCE and uses TIP-20
 * stablecoins for gas. viem's standard `writeContract` builds a normal
 * EIP-1559 tx and fails because the deployer has no native ETH balance.
 * We use viem's first-class Tempo support (`viem/tempo`) to build
 * Tempo-type transactions that pay gas in pathUSD.
 */

import {
  createClient,
  http,
  parseAbi,
  publicActions,
  walletActions,
  decodeEventLog,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Chain, tempoActions } from "viem/tempo";

// ============ ABIs ============

const factoryAbi = parseAbi([
  "function createToken(string name, string symbol, string imageURI, string description, uint256 maxSupply, uint16 tradeFeeBps) returns (address token, address curve)",
  "function createFee() view returns (uint256)",
  "function totalTokens() view returns (uint256)",
  "struct TokenInfo { address token; address curve; address creator; string name; string symbol; string imageURI; uint256 createdAt; uint256 maxSupply; uint16 tradeFeeBps; }",
  "function tokenAt(uint256 index) view returns (TokenInfo)",
  "event TokenCreated(uint256 indexed id, address indexed token, address indexed creator, address curve, string name, string symbol, string imageURI, uint256 maxSupply, uint16 tradeFeeBps)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const curveAbi = parseAbi([
  "function buy(uint256 amount)",
  "function getBuyCost(uint256 amount) view returns (uint256)",
  "function feeFor(uint256 amount, bool isBuy) view returns (uint256)",
  "function spotPrice() view returns (uint256)",
  "function reserve() view returns (uint256)",
  "function creatorFeesAccrued() view returns (uint256)",
  "function tradeFeeBps() view returns (uint16)",
]);

// ============ Env types ============

interface Env {
  FACTORY_ADDRESS: string;
  PATHUSD_ADDRESS: string;
  DEPLOYER_ADDRESS: string;
  RPC_URL: string;
  PRICE_PATHUSD: string;
  DEPLOYER_KEY: string;
  MPP_SECRET_KEY: string;
  /**
   * Token used to pay gas for server-side txs (approve / createToken).
   * Distinct from PATHUSD_ADDRESS which is the contract-level fee currency.
   * Set to USDC.e (`0x20C00…b9537d11c60E8b50`) so the deployer can use its
   * larger USDC.e balance for gas while keeping createFee in pathUSD.
   */
  GAS_FEE_TOKEN: string;
  /** Price (pathUSD whole units) for /launch-and-bootstrap. Default "0.20". */
  PRICE_LIFECYCLE_PATHUSD?: string;
  /** KV namespace storing the autonomous agent's action history. */
  AGENT_LOG: KVNamespace;
  /** User's main wallet — sweep action sends agent earnings here. */
  USER_WALLET: string;
}

interface LaunchRequest {
  name: string;
  symbol: string;
  supply?: number;
  fee?: number;
  description?: string;
  /** /launch-and-bootstrap only: tokens the agent buys from the curve after launch. */
  bootstrapTokens?: number;
}

// ============ Handler ============

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      const response = await handle(request, env);
      // CORS so the dashboard on agent.arcpump.com can read /agent/* endpoints.
      response.headers.set("access-control-allow-origin", "*");
      response.headers.set(
        "access-control-allow-headers",
        "content-type, authorization"
      );
      return response;
    } catch (err) {
      console.error("[fatal]", err);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Worker exception",
          message: err instanceof Error ? err.message : String(err),
        }),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          },
        }
      );
    }
  },

  /**
   * Scheduled (cron) handler — fires per the [triggers] crons in wrangler.toml.
   *
   * The cron schedule is "0 *\/6 * * *" (every 6 hours). On each fire we pick a
   * random action from the agent's repertoire and execute it on Tempo mainnet.
   * Results are written to KV so the public dashboard can render the history.
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(runAgentTick(env));
  },
};

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    return Response.json({
      service: "tempo-pump-mpp",
      version: "0.4.0",
      factory: env.FACTORY_ADDRESS,
      currency: env.PATHUSD_ADDRESS,
      price_launch: env.PRICE_PATHUSD,
      price_lifecycle: env.PRICE_LIFECYCLE_PATHUSD ?? "0.05",
      endpoints: {
        launch: {
          method: "POST",
          path: "/launch",
          description: "Deploy a token + curve via factory.createToken.",
          body: {
            name: "string",
            symbol: "string",
            supply: "number (default 1000000)",
            fee: "number (bps, default 0)",
            description: "string (optional)",
          },
          price: `${env.PRICE_PATHUSD} pathUSD`,
        },
        lifecycle: {
          method: "POST",
          path: "/launch-and-bootstrap",
          description:
            "Atomic lifecycle for an AI agent: launch the token, approve the curve, buy the bootstrap tranche, return final state. Agent becomes both the creator (earning 80% of future trade fees) and the first holder.",
          body: {
            name: "string",
            symbol: "string",
            supply: "number (default 1000000)",
            fee: "number (bps, default 100 = 1%)",
            bootstrapTokens:
              "number (whole tokens the agent buys after launch, default 1000)",
            description: "string (optional)",
          },
          price: `${env.PRICE_LIFECYCLE_PATHUSD ?? "0.05"} pathUSD`,
        },
      },
    });
  }

  // ============ Agent dashboard endpoints (public, no auth) ============

  if (request.method === "GET" && url.pathname === "/agent/history") {
    const history = await loadAgentHistory(env, 50);
    return Response.json({ count: history.length, actions: history });
  }

  if (request.method === "GET" && url.pathname === "/agent/stats") {
    const stats = await loadAgentStats(env);
    return Response.json(stats);
  }

  // Manual trigger for testing — fire one tick on demand. Useful for local dev
  // and bootstrapping the dashboard with one entry before cron has fired.
  // Accepts admin token via header OR ?token= query param so it's trivially
  // hittable from a browser (paste-and-fire) during demos.
  if (
    (request.method === "POST" || request.method === "GET") &&
    url.pathname === "/agent/tick"
  ) {
    const headerAuth = request.headers.get("x-admin-token") ?? "";
    const queryAuth = url.searchParams.get("token") ?? "";
    const auth = headerAuth || queryAuth;
    if (auth !== env.MPP_SECRET_KEY) {
      return new Response("Forbidden", { status: 403 });
    }
    const result = await runAgentTick(env);
    return Response.json({ ok: true, result });
  }

  const isLaunch = request.method === "POST" && url.pathname === "/launch";
  const isLifecycle =
    request.method === "POST" && url.pathname === "/launch-and-bootstrap";

  if (!isLaunch && !isLifecycle) {
    return new Response("Not found", { status: 404 });
  }

  // ============ MPP challenge (first call) ============

  const auth = request.headers.get("authorization") ?? "";
  const hasPaymentAuth = /^Payment\s/i.test(auth);

  if (!hasPaymentAuth) {
    const price = isLifecycle
      ? env.PRICE_LIFECYCLE_PATHUSD ?? "0.05"
      : env.PRICE_PATHUSD;
    return emit402Challenge(env, price);
  }

  // ============ Process launch (second call) ============

  let body: LaunchRequest;
  let rawBody: string | undefined;
  try {
    rawBody = await request.text();
    body = JSON.parse(rawBody);
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Invalid JSON body",
        rawBody: rawBody ?? "<no body>",
        rawBodyLength: rawBody?.length ?? 0,
        parseError: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }

  const validation = validateLaunch(body);
  if (validation.error) {
    return jsonError(400, validation.error);
  }

  const factory = env.FACTORY_ADDRESS as Address;
  const pathUSD = env.PATHUSD_ADDRESS as Address;
  const account = privateKeyToAccount(env.DEPLOYER_KEY as Hex);

  // Tempo-native client: knows about TIP-20 fee tokens, type 0x76 txs, etc.
  const client = createClient({
    account,
    chain: Chain.tempo,
    transport: http(env.RPC_URL),
  })
    .extend(publicActions)
    .extend(walletActions)
    .extend(tempoActions());

  // ----- Approve pathUSD to factory if needed -----
  const createFee = await client.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "createFee",
  });

  const allowance = await client.readContract({
    address: pathUSD,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, factory],
  });

  if (allowance < createFee) {
    const approveAmount = createFee * 1_000n;
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [factory, approveAmount],
    });
    const approveReceipt = await client.sendTransactionSync({
      calls: [{ to: pathUSD, data: approveData }],
      feeToken: env.GAS_FEE_TOKEN as Address,
    });
    if (approveReceipt.status !== "success") {
      return jsonError(500, "approve(pathUSD → factory) reverted on Tempo");
    }
  }

  // ----- Call factory.createToken -----
  const supplyWei =
    BigInt(body.supply ?? 1_000_000) * 1_000_000_000_000_000_000n;
  const feeBps = body.fee ?? 0;

  const launchData = encodeFunctionData({
    abi: factoryAbi,
    functionName: "createToken",
    args: [
      body.name,
      body.symbol,
      "",
      body.description ?? "Launched by AI agent via tempo-pump-mpp",
      supplyWei,
      feeBps,
    ],
  });
  const launchReceipt = await client.sendTransactionSync({
    calls: [{ to: factory, data: launchData }],
    feeToken: env.GAS_FEE_TOKEN as Address,
  });

  if (launchReceipt.status !== "success") {
    return jsonError(500, "factory.createToken reverted on Tempo");
  }

  let tokenAddress: Address | undefined;
  let curveAddress: Address | undefined;
  for (const log of launchReceipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: factoryAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "TokenCreated") {
        const args = decoded.args as { token: Address; curve: Address };
        tokenAddress = args.token;
        curveAddress = args.curve;
        break;
      }
    } catch {
      /* not the event we want */
    }
  }

  // ============ /launch — return after createToken ============
  if (isLaunch) {
    return Response.json({
      ok: true,
      name: body.name,
      symbol: body.symbol,
      supply: body.supply ?? 1_000_000,
      tradeFeeBps: feeBps,
      token: tokenAddress,
      curve: curveAddress,
      txHash: launchReceipt.transactionHash,
      explorer: `https://explore.tempo.xyz/receipt/${launchReceipt.transactionHash}`,
      tokenExplorer: tokenAddress
        ? `https://explore.tempo.xyz/address/${tokenAddress}`
        : undefined,
    });
  }

  // ============ /launch-and-bootstrap — continue with buy ============
  if (!curveAddress || !tokenAddress) {
    return jsonError(500, "Could not locate new curve/token in TokenCreated event");
  }

  const bootstrapTokens = Math.min(
    Math.max(Math.floor(body.bootstrapTokens ?? 100), 1),
    100_000
  );
  const bootstrapWei =
    BigInt(bootstrapTokens) * 1_000_000_000_000_000_000n;

  // Quote cost + fee for the buy on the brand-new curve.
  const buyCost = await client.readContract({
    address: curveAddress,
    abi: curveAbi,
    functionName: "getBuyCost",
    args: [bootstrapWei],
  });
  const buyFee = await client.readContract({
    address: curveAddress,
    abi: curveAbi,
    functionName: "feeFor",
    args: [bootstrapWei, true],
  });
  const total = buyCost + buyFee;

  // Approve pathUSD to the new curve (curve will transferFrom for cost + fee).
  if (total > 0n) {
    const approveAmount = total * 10n; // buffer for future buys from same agent
    const approveCurveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [curveAddress, approveAmount],
    });
    const approveCurveReceipt = await client.sendTransactionSync({
      calls: [{ to: pathUSD, data: approveCurveData }],
      feeToken: env.GAS_FEE_TOKEN as Address,
    });
    if (approveCurveReceipt.status !== "success") {
      return jsonError(500, "approve(pathUSD → curve) reverted on Tempo");
    }
  }

  const buyData = encodeFunctionData({
    abi: curveAbi,
    functionName: "buy",
    args: [bootstrapWei],
  });
  const buyReceipt = await client.sendTransactionSync({
    calls: [{ to: curveAddress, data: buyData }],
    feeToken: env.GAS_FEE_TOKEN as Address,
  });
  if (buyReceipt.status !== "success") {
    return jsonError(500, "curve.buy reverted on Tempo");
  }

  // Read final state for narrative payload.
  const [reserve, spotPrice, tradeFeeBpsLive, agentBalance] = await Promise.all([
    client.readContract({
      address: curveAddress,
      abi: curveAbi,
      functionName: "reserve",
    }),
    client.readContract({
      address: curveAddress,
      abi: curveAbi,
      functionName: "spotPrice",
    }),
    client.readContract({
      address: curveAddress,
      abi: curveAbi,
      functionName: "tradeFeeBps",
    }),
    client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    }),
  ]);

  return Response.json({
    ok: true,
    name: body.name,
    symbol: body.symbol,
    supply: body.supply ?? 1_000_000,
    tradeFeeBps: feeBps,
    token: tokenAddress,
    curve: curveAddress,
    launchTx: launchReceipt.transactionHash,
    bootstrapTx: buyReceipt.transactionHash,
    bootstrap: {
      tokens: bootstrapTokens,
      costPathUSD: (Number(buyCost) / 1_000_000).toFixed(6),
      feePathUSD: (Number(buyFee) / 1_000_000).toFixed(6),
      totalPathUSD: (Number(total) / 1_000_000).toFixed(6),
    },
    state: {
      reservePathUSD: (Number(reserve) / 1_000_000).toFixed(6),
      spotPricePathUSD: (Number(spotPrice) / 1_000_000).toFixed(9),
      agentBalanceTokens: Number(agentBalance) / 1e18,
      tradeFeeBps: Number(tradeFeeBpsLive),
      creatorShareOfFuture: `${
        Number(tradeFeeBpsLive) > 0
          ? ((Number(tradeFeeBpsLive) * 80) / 100 / 100).toFixed(2)
          : "0.00"
      }% (80% of ${(Number(tradeFeeBpsLive) / 100).toFixed(2)}% trade fee)`,
    },
    explorer: `https://explore.tempo.xyz/receipt/${buyReceipt.transactionHash}`,
    tokenExplorer: `https://explore.tempo.xyz/address/${tokenAddress}`,
  });
}

// ============ MPP 402 helpers ============

function emit402Challenge(env: Env, priceWhole?: string): Response {
  const price = priceWhole ?? env.PRICE_PATHUSD;
  const amountWei = Math.round(parseFloat(price) * 1_000_000).toString();
  const challengeId = crypto.randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const requestPayload = {
    amount: amountWei,
    currency: env.PATHUSD_ADDRESS,
    recipient: env.DEPLOYER_ADDRESS,
    methodDetails: { chainId: 4217 },
  };
  const requestB64 = base64urlEncode(JSON.stringify(requestPayload));

  const wwwAuthenticate = [
    `Payment id="${challengeId}"`,
    `realm="tempo-pump"`,
    `method="tempo"`,
    `intent="charge"`,
    `request="${requestB64}"`,
    `expires="${expires}"`,
  ].join(", ");

  return new Response(
    JSON.stringify({
      type: "https://paymentauth.org/problems/payment-required",
      title: "Payment Required",
      status: 402,
      detail: "Payment is required.",
      challengeId,
    }),
    {
      status: 402,
      headers: {
        "content-type": "application/problem+json",
        "www-authenticate": wwwAuthenticate,
        "cache-control": "no-store",
      },
    }
  );
}

function base64urlEncode(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ============ Validation ============

function validateLaunch(body: LaunchRequest): { error?: string } {
  if (!body.name || typeof body.name !== "string" || body.name.length > 32) {
    return { error: "name is required (1-32 chars)" };
  }
  if (!body.symbol || typeof body.symbol !== "string" || body.symbol.length > 10) {
    return { error: "symbol is required (1-10 chars)" };
  }
  if (body.supply !== undefined) {
    if (
      typeof body.supply !== "number" ||
      body.supply < 1_000 ||
      body.supply > 1_000_000_000_000
    ) {
      return { error: "supply must be 1_000 to 1_000_000_000_000" };
    }
  }
  if (body.fee !== undefined) {
    if (typeof body.fee !== "number" || body.fee < 0 || body.fee > 500) {
      return { error: "fee must be 0..500 bps (0-5%)" };
    }
  }
  return {};
}

// =====================================================================
//                       AUTONOMOUS AGENT
// =====================================================================

/**
 * One scheduled tick of the autonomous agent. Picks an action by weight,
 * executes it on Tempo mainnet using the deployer key, logs the outcome to
 * KV, and returns a structured action record.
 *
 * Failures are caught and logged so the cron handler never throws — a single
 * failed action shouldn't stop the schedule.
 */
async function runAgentTick(env: Env): Promise<AgentAction> {
  const timestamp = Date.now();
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const actionType = pickAgentAction();

  const account = privateKeyToAccount(env.DEPLOYER_KEY as Hex);
  const client = buildAgentClient(env, account);

  let action: AgentAction;
  try {
    switch (actionType) {
      case "launch":
        action = await runAgentLaunch(env, client, account, id, timestamp);
        break;
      case "buy":
        action = await runAgentBuy(env, client, account, id, timestamp);
        break;
      case "claim":
        action = await runAgentClaim(env, client, account, id, timestamp);
        break;
      case "sweep":
        action = await runAgentSweep(env, client, account, id, timestamp);
        break;
      case "heartbeat":
      default:
        action = await runAgentHeartbeat(env, client, account, id, timestamp);
        break;
    }
  } catch (err) {
    action = {
      id,
      timestamp,
      type: actionType,
      status: "error",
      summary: `Action ${actionType} failed`,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  await logAgentAction(env, action);
  return action;
}

function pickAgentAction(): AgentActionType {
  // Action mix tuned for narrative density:
  //   launch    35% — fresh memecoin, photogenic for the activity feed
  //   buy       25% — keeps existing curves moving
  //   claim     20% — proves the agent earns from its own creations
  //   sweep     10% — periodically routes earnings to the user's main wallet
  //   heartbeat 10% — "still alive" tx when nothing else makes sense
  const roll = Math.random();
  if (roll < 0.35) return "launch";
  if (roll < 0.6) return "buy";
  if (roll < 0.8) return "claim";
  if (roll < 0.9) return "sweep";
  return "heartbeat";
}

// -------------------- action: launch --------------------

async function runAgentLaunch(
  env: Env,
  client: AgentClient,
  account: ReturnType<typeof privateKeyToAccount>,
  id: string,
  timestamp: number
): Promise<AgentAction> {
  const factory = env.FACTORY_ADDRESS as Address;
  const pathUSD = env.PATHUSD_ADDRESS as Address;

  const pick = COIN_PALETTE[Math.floor(Math.random() * COIN_PALETTE.length)];
  const supplyTokens = 1_000_000;
  const supplyWei = BigInt(supplyTokens) * 1_000_000_000_000_000_000n;
  const feeBps = 100; // always 1% so the agent keeps earning

  // Ensure factory has createFee allowance from deployer.
  const createFee = await client.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "createFee",
  });
  const allowance = await client.readContract({
    address: pathUSD,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, factory],
  });
  if (allowance < createFee) {
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [factory, createFee * 1000n],
    });
    await client.sendTransactionSync({
      calls: [{ to: pathUSD, data: approveData }],
      feeToken: env.GAS_FEE_TOKEN as Address,
    });
  }

  const launchData = encodeFunctionData({
    abi: factoryAbi,
    functionName: "createToken",
    args: [
      pick.name,
      pick.symbol,
      "",
      "Autonomous launch by Claude on Tempo",
      supplyWei,
      feeBps,
    ],
  });
  const receipt = await client.sendTransactionSync({
    calls: [{ to: factory, data: launchData }],
    feeToken: env.GAS_FEE_TOKEN as Address,
  });

  let tokenAddress: Address | undefined;
  let curveAddress: Address | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: factoryAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "TokenCreated") {
        const args = decoded.args as { token: Address; curve: Address };
        tokenAddress = args.token;
        curveAddress = args.curve;
        break;
      }
    } catch {
      /* not the event */
    }
  }

  return {
    id,
    timestamp,
    type: "launch",
    status: receipt.status === "success" ? "success" : "error",
    summary: `Launched $${pick.symbol} (${pick.name})`,
    tokenSymbol: pick.symbol,
    tokenName: pick.name,
    tokenAddress,
    curveAddress,
    txHash: receipt.transactionHash,
  };
}

// -------------------- action: buy --------------------

async function runAgentBuy(
  env: Env,
  client: AgentClient,
  account: ReturnType<typeof privateKeyToAccount>,
  id: string,
  timestamp: number
): Promise<AgentAction> {
  const factory = env.FACTORY_ADDRESS as Address;
  const pathUSD = env.PATHUSD_ADDRESS as Address;

  // Pick a random existing token from the factory.
  const total = (await client.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "totalTokens",
  })) as bigint;

  if (total === 0n) {
    return {
      id,
      timestamp,
      type: "buy",
      status: "skipped",
      summary: "Nothing to buy — no tokens deployed yet",
    };
  }

  const index = BigInt(Math.floor(Math.random() * Number(total)));
  const info = await client.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "tokenAt",
    args: [index],
  });

  const tokenAddress = info.token as Address;
  const curveAddress = info.curve as Address;
  const symbol = info.symbol;
  const name = info.name;

  // Buy 10 tokens — small + cheap.
  const buyTokens = 10;
  const buyWei = BigInt(buyTokens) * 1_000_000_000_000_000_000n;

  const cost = (await client.readContract({
    address: curveAddress,
    abi: curveAbi,
    functionName: "getBuyCost",
    args: [buyWei],
  })) as bigint;
  const fee = (await client.readContract({
    address: curveAddress,
    abi: curveAbi,
    functionName: "feeFor",
    args: [buyWei, true],
  })) as bigint;
  const totalCost = cost + fee;

  // Approve pathUSD to curve if needed.
  const allowance = (await client.readContract({
    address: pathUSD,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, curveAddress],
  })) as bigint;
  if (allowance < totalCost) {
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [curveAddress, totalCost * 10n],
    });
    await client.sendTransactionSync({
      calls: [{ to: pathUSD, data: approveData }],
      feeToken: env.GAS_FEE_TOKEN as Address,
    });
  }

  const buyData = encodeFunctionData({
    abi: curveAbi,
    functionName: "buy",
    args: [buyWei],
  });
  const receipt = await client.sendTransactionSync({
    calls: [{ to: curveAddress, data: buyData }],
    feeToken: env.GAS_FEE_TOKEN as Address,
  });

  return {
    id,
    timestamp,
    type: "buy",
    status: receipt.status === "success" ? "success" : "error",
    summary: `Bought ${buyTokens} $${symbol} from its curve`,
    tokenSymbol: symbol,
    tokenName: name,
    tokenAddress,
    curveAddress,
    txHash: receipt.transactionHash,
    amountTokens: buyTokens,
    costPathUSD: (Number(totalCost) / 1_000_000).toFixed(6),
  };
}

// -------------------- action: claim --------------------

async function runAgentClaim(
  env: Env,
  client: AgentClient,
  account: ReturnType<typeof privateKeyToAccount>,
  id: string,
  timestamp: number
): Promise<AgentAction> {
  const factory = env.FACTORY_ADDRESS as Address;

  // Scan the first 20 tokens for accrued creator fees on the agent's curves.
  const total = (await client.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "totalTokens",
  })) as bigint;

  if (total === 0n) {
    return {
      id,
      timestamp,
      type: "claim",
      status: "skipped",
      summary: "Nothing to claim — no curves yet",
    };
  }

  const scanLimit = Math.min(Number(total), 20);
  for (let i = scanLimit - 1; i >= 0; i--) {
    try {
      const info = await client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "tokenAt",
        args: [BigInt(i)],
      });
      const curveAddress = info.curve as Address;
      const creator = info.creator as Address;
      const symbol = info.symbol;

      if (creator.toLowerCase() !== account.address.toLowerCase()) continue;

      const accrued = (await client.readContract({
        address: curveAddress,
        abi: curveAbi,
        functionName: "creatorFeesAccrued",
      })) as bigint;

      if (accrued === 0n) continue;

      // Claim into the agent's own wallet.
      const claimData = encodeFunctionData({
        abi: parseAbi(["function claimCreatorFees(address to)"]),
        functionName: "claimCreatorFees",
        args: [account.address],
      });
      const receipt = await client.sendTransactionSync({
        calls: [{ to: curveAddress, data: claimData }],
        feeToken: env.GAS_FEE_TOKEN as Address,
      });

      return {
        id,
        timestamp,
        type: "claim",
        status: receipt.status === "success" ? "success" : "error",
        summary: `Claimed ${(Number(accrued) / 1_000_000).toFixed(4)} pathUSD from $${symbol}`,
        tokenSymbol: symbol,
        curveAddress,
        txHash: receipt.transactionHash,
        claimedPathUSD: (Number(accrued) / 1_000_000).toFixed(6),
      };
    } catch {
      /* try next */
    }
  }

  return {
    id,
    timestamp,
    type: "claim",
    status: "skipped",
    summary: "No creator fees accrued on any curve yet",
  };
}

// -------------------- action: sweep --------------------

/**
 * Sweep accumulated earnings (pathUSD + USDC.e) from the agent's wallet to
 * the user's main wallet. Keeps a buffer in the agent wallet so it can keep
 * paying gas + future createFees.
 *
 * Buffer policy:
 *   - Keep at least 0.50 USDC.e in agent (for ~2-3 more action ticks of gas)
 *   - Keep at least 0.10 pathUSD in agent (for ~10 createFees at 0.01 each)
 *   - Sweep everything above that to USER_WALLET
 *
 * If neither balance has surplus, returns a "skipped" action so the tick
 * doesn't look like an error.
 */
async function runAgentSweep(
  env: Env,
  client: AgentClient,
  account: ReturnType<typeof privateKeyToAccount>,
  id: string,
  timestamp: number
): Promise<AgentAction> {
  const pathUSD = env.PATHUSD_ADDRESS as Address;
  const usdcE = env.GAS_FEE_TOKEN as Address;
  const userWallet = env.USER_WALLET as Address;

  const RESERVE_USDC_E = 500_000n; // 0.50 USDC.e
  const RESERVE_PATHUSD = 100_000n; // 0.10 pathUSD

  const [pathUSDBal, usdcEBal] = await Promise.all([
    client.readContract({
      address: pathUSD,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    }) as Promise<bigint>,
    client.readContract({
      address: usdcE,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    }) as Promise<bigint>,
  ]);

  const pathUSDSurplus =
    pathUSDBal > RESERVE_PATHUSD ? pathUSDBal - RESERVE_PATHUSD : 0n;
  const usdcESurplus =
    usdcEBal > RESERVE_USDC_E ? usdcEBal - RESERVE_USDC_E : 0n;

  // Cap individual sweeps so a single bug can't drain the agent.
  const cap = 1_000_000n; // 1.00 unit per token per sweep
  const sweepPathUSD = pathUSDSurplus > cap ? cap : pathUSDSurplus;
  const sweepUsdcE = usdcESurplus > cap ? cap : usdcESurplus;

  if (sweepPathUSD === 0n && sweepUsdcE === 0n) {
    return {
      id,
      timestamp,
      type: "sweep",
      status: "skipped",
      summary: "Nothing to sweep — both balances below reserve thresholds",
    };
  }

  // Build the calls array. Tempo lets us batch transfers in one tx.
  const calls: Array<{ to: Address; data: Hex }> = [];
  if (sweepPathUSD > 0n) {
    calls.push({
      to: pathUSD,
      data: encodeFunctionData({
        abi: parseAbi([
          "function transfer(address to, uint256 amount) returns (bool)",
        ]),
        functionName: "transfer",
        args: [userWallet, sweepPathUSD],
      }),
    });
  }
  if (sweepUsdcE > 0n) {
    calls.push({
      to: usdcE,
      data: encodeFunctionData({
        abi: parseAbi([
          "function transfer(address to, uint256 amount) returns (bool)",
        ]),
        functionName: "transfer",
        args: [userWallet, sweepUsdcE],
      }),
    });
  }

  const receipt = await client.sendTransactionSync({
    calls,
    feeToken: env.GAS_FEE_TOKEN as Address,
  });

  const summaryParts: string[] = [];
  if (sweepPathUSD > 0n) {
    summaryParts.push(`${(Number(sweepPathUSD) / 1_000_000).toFixed(4)} pathUSD`);
  }
  if (sweepUsdcE > 0n) {
    summaryParts.push(`${(Number(sweepUsdcE) / 1_000_000).toFixed(4)} USDC.e`);
  }

  return {
    id,
    timestamp,
    type: "sweep",
    status: receipt.status === "success" ? "success" : "error",
    summary: `Swept ${summaryParts.join(" + ")} to user wallet`,
    txHash: receipt.transactionHash,
    sweptPathUSD:
      sweepPathUSD > 0n
        ? (Number(sweepPathUSD) / 1_000_000).toFixed(6)
        : undefined,
    sweptUsdcE:
      sweepUsdcE > 0n
        ? (Number(sweepUsdcE) / 1_000_000).toFixed(6)
        : undefined,
  };
}

// -------------------- action: heartbeat --------------------

async function runAgentHeartbeat(
  env: Env,
  client: AgentClient,
  account: ReturnType<typeof privateKeyToAccount>,
  id: string,
  timestamp: number
): Promise<AgentAction> {
  const pathUSD = env.PATHUSD_ADDRESS as Address;

  // Send 1 wei pathUSD to self — proves the agent is alive without spending.
  const transferData = encodeFunctionData({
    abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
    functionName: "transfer",
    args: [account.address, 1n],
  });
  const receipt = await client.sendTransactionSync({
    calls: [{ to: pathUSD, data: transferData }],
    feeToken: env.GAS_FEE_TOKEN as Address,
  });

  return {
    id,
    timestamp,
    type: "heartbeat",
    status: receipt.status === "success" ? "success" : "error",
    summary: "Sent a heartbeat tx (1 wei to self)",
    txHash: receipt.transactionHash,
  };
}

// -------------------- KV helpers --------------------

async function logAgentAction(env: Env, action: AgentAction): Promise<void> {
  // Use a reverse-time key so list() returns newest first.
  const key = `action:${(Number.MAX_SAFE_INTEGER - action.timestamp).toString().padStart(16, "0")}:${action.id}`;
  await env.AGENT_LOG.put(key, JSON.stringify(action));

  // Maintain a stats counter atomically-ish (best effort; KV isn't transactional).
  const currentRaw = await env.AGENT_LOG.get("stats:summary");
  const current: AgentStats = currentRaw
    ? JSON.parse(currentRaw)
    : {
        total: 0,
        launches: 0,
        buys: 0,
        claims: 0,
        heartbeats: 0,
        sweeps: 0,
        errors: 0,
        startedAt: action.timestamp,
        lastActionAt: action.timestamp,
      };
  // Migrate older stats records that pre-date the `sweeps` counter.
  if (typeof current.sweeps !== "number") current.sweeps = 0;
  current.total += 1;
  current.lastActionAt = action.timestamp;
  if (action.status === "error") current.errors += 1;
  switch (action.type) {
    case "launch":
      current.launches += 1;
      break;
    case "buy":
      current.buys += 1;
      break;
    case "claim":
      current.claims += 1;
      break;
    case "heartbeat":
      current.heartbeats += 1;
      break;
    case "sweep":
      current.sweeps += 1;
      break;
  }
  await env.AGENT_LOG.put("stats:summary", JSON.stringify(current));
}

async function loadAgentHistory(
  env: Env,
  limit: number
): Promise<AgentAction[]> {
  const list = await env.AGENT_LOG.list({ prefix: "action:", limit });
  const values = await Promise.all(
    list.keys.map((k) => env.AGENT_LOG.get(k.name, "json"))
  );
  return values.filter((v): v is AgentAction => !!v);
}

async function loadAgentStats(env: Env): Promise<AgentStats & {
  walletAddress: string;
  cronSchedule: string;
}> {
  const raw = await env.AGENT_LOG.get("stats:summary");
  const parsed = raw ? JSON.parse(raw) : null;
  const base: AgentStats = {
    total: 0,
    launches: 0,
    buys: 0,
    claims: 0,
    heartbeats: 0,
    sweeps: 0,
    errors: 0,
    startedAt: 0,
    lastActionAt: 0,
    ...(parsed ?? {}),
  };
  return {
    ...base,
    walletAddress: env.DEPLOYER_ADDRESS,
    cronSchedule: "every 6 hours (0 */6 * * *)",
  };
}

// -------------------- types --------------------

type AgentActionType = "launch" | "buy" | "claim" | "heartbeat" | "sweep";

interface AgentAction {
  id: string;
  timestamp: number;
  type: AgentActionType;
  status: "success" | "error" | "skipped";
  summary: string;
  txHash?: string;
  tokenAddress?: string;
  curveAddress?: string;
  tokenSymbol?: string;
  tokenName?: string;
  amountTokens?: number;
  costPathUSD?: string;
  claimedPathUSD?: string;
  sweptPathUSD?: string;
  sweptUsdcE?: string;
  error?: string;
}

interface AgentStats {
  total: number;
  launches: number;
  buys: number;
  claims: number;
  heartbeats: number;
  sweeps: number;
  errors: number;
  startedAt: number;
  lastActionAt: number;
}

function buildAgentClient(env: Env, account: ReturnType<typeof privateKeyToAccount>) {
  return createClient({
    account,
    chain: Chain.tempo,
    transport: http(env.RPC_URL),
  })
    .extend(publicActions)
    .extend(walletActions)
    .extend(tempoActions());
}

type AgentClient = ReturnType<typeof buildAgentClient>;

// -------------------- coin name palette --------------------

const COIN_PALETTE: Array<{ name: string; symbol: string }> = [
  { name: "Pixel Cat", symbol: "PXLC" },
  { name: "Vibe Check", symbol: "VIBE" },
  { name: "Onchain Coffee", symbol: "OCAF" },
  { name: "Sunday Pump", symbol: "SUN" },
  { name: "Lazy Doge", symbol: "LDGE" },
  { name: "Tempo Beats", symbol: "BEAT" },
  { name: "Agent Money", symbol: "AGM" },
  { name: "Auto Pilot", symbol: "AUTO" },
  { name: "Block Goblin", symbol: "GOBL" },
  { name: "Stable Frog", symbol: "FROG" },
  { name: "Loop Coin", symbol: "LOOP" },
  { name: "Echo Chamber", symbol: "ECHO" },
  { name: "Glitch Mode", symbol: "GLTC" },
  { name: "Slow Pump", symbol: "SLOW" },
  { name: "After Midnight", symbol: "MDNT" },
  { name: "First Light", symbol: "DAWN" },
  { name: "Sleepy Whale", symbol: "WHL" },
  { name: "Neon Cat", symbol: "NEON" },
  { name: "Forever Online", symbol: "FOL" },
  { name: "Stack Sats", symbol: "STK" },
  { name: "Quiet Money", symbol: "QM" },
  { name: "Loud Money", symbol: "LM" },
  { name: "Cron Friend", symbol: "CRON" },
  { name: "Six Hours", symbol: "SXH" },
  { name: "Mainnet Mood", symbol: "MOOD" },
  { name: "Bot Energy", symbol: "BOT" },
  { name: "Quiet Pump", symbol: "QP" },
  { name: "Vibe Static", symbol: "STAT" },
  { name: "Soft Launch", symbol: "SOFT" },
  { name: "Token Diary", symbol: "DIRY" },
];
