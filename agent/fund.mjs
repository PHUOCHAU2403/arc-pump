import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
const client = initiateDeveloperControlledWalletsClient({ apiKey: process.env.CIRCLE_API_KEY, entitySecret: process.env.CIRCLE_ENTITY_SECRET });
const addr = process.env.AGENT_ADDRESS;
try {
  const r = await client.requestTestnetTokens({ blockchain: "ARC-TESTNET", address: addr, native: true, usdc: true });
  console.log("faucet:", JSON.stringify(r.data ?? r, null, 1).slice(0,300));
} catch (e) { console.log("faucet err:", (e.message||"").slice(0,200)); }
