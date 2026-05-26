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
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
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
          headers: { "content-type": "application/json" },
        }
      );
    }
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
