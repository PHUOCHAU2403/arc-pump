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
}

interface LaunchRequest {
  name: string;
  symbol: string;
  supply?: number;
  fee?: number;
  description?: string;
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
      version: "0.3.0",
      factory: env.FACTORY_ADDRESS,
      currency: env.PATHUSD_ADDRESS,
      price: env.PRICE_PATHUSD,
      endpoints: {
        launch: {
          method: "POST",
          path: "/launch",
          body: {
            name: "string",
            symbol: "string",
            supply: "number (default 1000000)",
            fee: "number (bps, default 0)",
            description: "string (optional)",
          },
          price: `${env.PRICE_PATHUSD} pathUSD`,
        },
      },
    });
  }

  if (request.method !== "POST" || url.pathname !== "/launch") {
    return new Response("Not found", { status: 404 });
  }

  // ============ MPP challenge (first call) ============

  const auth = request.headers.get("authorization") ?? "";
  const hasPaymentAuth = /^Payment\s/i.test(auth);

  if (!hasPaymentAuth) {
    return emit402Challenge(env);
  }

  // ============ Process launch (second call) ============

  let body: LaunchRequest;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
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

// ============ MPP 402 helpers ============

function emit402Challenge(env: Env): Response {
  const amountWei = Math.round(parseFloat(env.PRICE_PATHUSD) * 1_000_000).toString();
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
