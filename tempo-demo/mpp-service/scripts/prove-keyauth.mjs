// Proof-of-concept: can a headless viem client sign a Tempo tx as an ACCESS KEY
// and have it attributed to the MAIN wallet via a pre-signed KeyAuthorization?
//
// This is the mechanism we previously (wrongly) concluded was impossible. Before
// touching the production worker, prove it with a single 1-wei pathUSD transfer
// and check that the on-chain `from` is the MAIN wallet (0xa8aB…), not the
// access key EOA (0x7e6bfb…).
//
// Secrets are read from env so they never land in source or chat:
//   TEMPO_ACCESS_KEY        = keys.toml `key`               (access key privkey)
//   TEMPO_KEY_AUTHORIZATION = keys.toml `key_authorization` (signed blob)
//
// Run from tempo-demo/mpp-service:
//   TEMPO_ACCESS_KEY=0x… TEMPO_KEY_AUTHORIZATION=0x… node scripts/prove-keyauth.mjs

import { createClient, http, encodeFunctionData, parseAbi, publicActions, walletActions } from "viem";
import { Account, Chain, tempoActions } from "viem/tempo";
import { KeyAuthorization } from "ox/tempo";

const RPC = process.env.RPC_URL ?? "https://rpc.tempo.xyz";
const PATHUSD = "0x20C0000000000000000000000000000000000000";
const GAS_FEE_TOKEN = "0x20C000000000000000000000b9537d11c60E8b50"; // USDC.e
const MAIN_WALLET = "0xa8aB0DE5937BD22Da15F7FeE25F1340D7c83C935";

const ACCESS_KEY = process.env.TEMPO_ACCESS_KEY;
const KEY_AUTH = process.env.TEMPO_KEY_AUTHORIZATION;
if (!ACCESS_KEY || !KEY_AUTH) {
  console.error("Set TEMPO_ACCESS_KEY and TEMPO_KEY_AUTHORIZATION env vars.");
  process.exit(1);
}

// Access-key account whose ADDRESS is the main wallet (root) but whose SIGNER is
// the access key. This makes tx.from = main wallet; the chain then verifies the
// attached keyAuthorization (signed by the main wallet's passkey).
const account = Account.fromSecp256k1(ACCESS_KEY, { access: MAIN_WALLET });
const keyAuthorization = KeyAuthorization.deserialize(KEY_AUTH);

const client = createClient({ account, chain: Chain.tempo, transport: http(RPC) })
  .extend(publicActions)
  .extend(walletActions)
  .extend(tempoActions());

console.log("account.address    :", account.address, "(expect MAIN wallet 0xa8aB)");
console.log("account.accessKey  :", account.accessKeyAddress, "(expect 0x7e6bfb)");
console.log("keyAuthorization parsed: expiry =", String(keyAuthorization.expiry), "| has signature =", !!keyAuthorization.signature);

// 1 wei USDC.e transfer to self. USDC.e is the token the access key is authorized
// to spend (its keyAuthorization limit). The DEBITED account (tx.from) should be
// the MAIN wallet because of the attached keyAuthorization.
const data = encodeFunctionData({
  abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
  functionName: "transfer",
  args: [MAIN_WALLET, 1n],
});

console.log("\nSending 1-wei USDC.e tx with keyAuthorization attached…");
const receipt = await client.sendTransactionSync({
  calls: [{ to: GAS_FEE_TOKEN, data }],
  feeToken: GAS_FEE_TOKEN,
  keyAuthorization,
});

console.log("tx hash :", receipt.transactionHash);
console.log("status  :", receipt.status);

const tx = await client.getTransaction({ hash: receipt.transactionHash });
console.log("\ntx.from :", tx.from);
console.log(
  tx.from?.toLowerCase() === MAIN_WALLET.toLowerCase()
    ? "✅ PROOF PASSED — tx attributed to the MAIN wallet."
    : `⚠️  tx.from is ${tx.from} — NOT the main wallet. Attribution did not work as hoped.`
);
console.log("Explorer:", `https://explore.tempo.xyz/tx/${receipt.transactionHash}`);
