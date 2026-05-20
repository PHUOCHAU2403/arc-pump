/**
 * tempo-pump-mpp — MPP endpoint that lets AI agents launch a memecoin on
 * Tempo mainnet through arcpump.com's MemeFactoryTempoV2.
 *
 * Flow:
 *   1. Agent does `tempo request -X POST https://<worker>/launch \
 *        --json '{"name":"Claude","symbol":"CLD","supply":1000000,"fee":100}'`
 *   2. We respond with HTTP 402 + MPP challenge (price = $0.10 pathUSD,
 *      recipient = deployer).
 *   3. Agent's Tempo CLI auto-pays from its wallet, retries the request with
 *      `Authorization: Payment ...` header.
 *   4. We verify the receipt, then on the server side:
 *        a. approve(factory, createFee) on pathUSD (if not already)
 *        b. factory.createToken(name, symbol, "", description, supplyWei, feeBps)
 *      using the deployer key.
 *   5. Return the new MemeToken address + tx hash with a Payment-Receipt header.
 */

import { Mppx, tempo } from "mppx/server";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  decodeEventLog,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ============ Chain ============

const tempoChain = defineChain({
  id: 4217,
  name: "Tempo",
  nativeCurrency: { name: "USD", symbol: "USD", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.tempo.xyz"] } },
  blockExplorers: {
    default: { name: "Tempo Explorer", url: "https://explore.tempo.xyz" },
  },
});

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
  DEPLOYER_KEY: string; // wrangler secret
  MPP_SECRET_KEY: string; // wrangler secret — HMAC for challenge IDs
}

interface LaunchRequest {
  name: string;
  symbol: string;
  supply?: number; // whole tokens (1M = 1_000_000). Default 1M.
  fee?: number; // tradeFeeBps (100 = 1%). Default 0.
  description?: string;
}

// ============ Handler ============

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check + introspection.
    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        service: "tempo-pump-mpp",
        version: "0.1.0",
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

    // ============ MPP charge ============

    const mppx = Mppx.create({
      methods: [
        tempo({
          currency: env.PATHUSD_ADDRESS as Address,
          recipient: env.DEPLOYER_ADDRESS as Address,
        }),
      ],
      secretKey: env.MPP_SECRET_KEY,
      realm: "tempo-pump",
    });

    const charged = await mppx.charge({ amount: env.PRICE_PATHUSD })(request);
    if (charged.status === 402) return charged.challenge;

    // ============ Execute the launch on-chain ============

    let body: LaunchRequest;
    try {
      body = await request.clone().json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const validation = validateLaunch(body);
    if (validation.error) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const account = privateKeyToAccount(env.DEPLOYER_KEY as Hex);
    const publicClient = createPublicClient({
      chain: tempoChain,
      transport: http(env.RPC_URL),
    });
    const walletClient = createWalletClient({
      account,
      chain: tempoChain,
      transport: http(env.RPC_URL),
    });

    const factory = env.FACTORY_ADDRESS as Address;
    const pathUSD = env.PATHUSD_ADDRESS as Address;

    try {
      // Approve enough pathUSD to factory if allowance < createFee.
      const createFee = await publicClient.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "createFee",
      });

      const allowance = await publicClient.readContract({
        address: pathUSD,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account.address, factory],
      });

      if (allowance < createFee) {
        // Approve a large amount to avoid re-approving every launch.
        const approveAmount = createFee * 1_000n;
        const approveHash = await walletClient.writeContract({
          address: pathUSD,
          abi: erc20Abi,
          functionName: "approve",
          args: [factory, approveAmount],
          // @ts-expect-error - tempo-specific field, viem doesn't know about it
          feeToken: pathUSD,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Call factory.createToken
      const supplyWei =
        BigInt(body.supply ?? 1_000_000) * 1_000_000_000_000_000_000n;
      const feeBps = body.fee ?? 0;

      const txHash = await walletClient.writeContract({
        address: factory,
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
        // @ts-expect-error - tempo-specific field
        feeToken: pathUSD,
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      // Parse TokenCreated event to extract new addresses.
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
            const args = decoded.args as {
              token: Address;
              curve: Address;
            };
            tokenAddress = args.token;
            curveAddress = args.curve;
            break;
          }
        } catch {
          /* not the event we want */
        }
      }

      return charged.withReceipt(
        Response.json({
          ok: true,
          name: body.name,
          symbol: body.symbol,
          supply: body.supply ?? 1_000_000,
          tradeFeeBps: feeBps,
          token: tokenAddress,
          curve: curveAddress,
          txHash,
          explorer: `https://explore.tempo.xyz/receipt/${txHash}`,
          tokenExplorer: tokenAddress
            ? `https://explore.tempo.xyz/address/${tokenAddress}`
            : undefined,
        })
      );
    } catch (err) {
      console.error("[launch] failed", err);
      return charged.withReceipt(
        new Response(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
          { status: 500, headers: { "content-type": "application/json" } }
        )
      );
    }
  },
};

// ============ Validation ============

function validateLaunch(body: LaunchRequest): { error?: string } {
  if (!body.name || typeof body.name !== "string" || body.name.length > 32) {
    return { error: "name is required (1-32 chars)" };
  }
  if (
    !body.symbol ||
    typeof body.symbol !== "string" ||
    body.symbol.length > 10
  ) {
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
