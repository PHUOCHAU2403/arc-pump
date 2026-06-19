import { initiateDeveloperControlledWalletsClient, registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";
import crypto from "node:crypto";
import fs from "node:fs";

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) { console.error("missing CIRCLE_API_KEY"); process.exit(1); }

let entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!entitySecret) {
  entitySecret = crypto.randomBytes(32).toString("hex");
  await registerEntitySecretCiphertext({ apiKey, entitySecret, recoveryFileDownloadPath: "./" });
  fs.appendFileSync(".env", `CIRCLE_ENTITY_SECRET=${entitySecret}\n`);
  console.log("entity secret: generated + registered (saved to .env + recovery.dat)");
} else {
  console.log("entity secret: already configured");
}

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const ws = await client.createWalletSet({ name: "arc-pump-agent" });
const walletSetId = ws.data.walletSet.id;
const w = await client.createWallets({ walletSetId, blockchains: ["ARC-TESTNET"], count: 1, accountType: "EOA" });
const wallet = w.data.wallets[0];
fs.appendFileSync(".env", `CIRCLE_WALLET_SET_ID=${walletSetId}\nCIRCLE_WALLET_ID=${wallet.id}\nAGENT_ADDRESS=${wallet.address}\n`);
console.log("walletSetId :", walletSetId);
console.log("walletId    :", wallet.id);
console.log("AGENT ADDR  :", wallet.address, "(ARC-TESTNET, EOA)");
