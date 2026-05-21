# Arc Pump on Tempo — Deployment Record

## Network
- **Chain**: Tempo Mainnet
- **Chain ID**: 4217
- **RPC**: https://rpc.tempo.xyz
- **Explorer**: https://explore.tempo.xyz
- **Fee token**: USDC.e at `0x20c000000000000000000000b9537d11c60e8b50` (6 decimals)

## Deployed Contracts

### MemeFactoryTempo
- **Address**: `0xfd5262419d56e01E90D01A78DF9E6e2DE6348740`
- **Deploy tx**: `0x26019ebbb91cbb04c1dd6fb4fcfc38032ced38df32d787cc98b7e67ab0cd4b24`
- **Owner**: `0xe7013E5686b4C50B9D8e7FdB76F74baA08909494` (demo deployer EOA)
- **createFee**: `10000` wei = 0.01 USDC.e
- **DEFAULT_START_PRICE**: 0
- **DEFAULT_SLOPE**: 1 (USDC.e wei per token²)
- **MIN_MAX_SUPPLY**: 1_000 × 1e18 token wei (1K tokens, 18-dec)
- **MAX_MAX_SUPPLY**: 1_000_000_000_000 × 1e18 token wei (1T tokens)
- **MAX_TRADE_FEE_BPS**: 500 (5%)

## Wallet Topology

| Address | Role | Notes |
|---|---|---|
| `0xa8ab0de5937bd22da15f7fee25f1340d7c83c935` | User main wallet | Passkey-controlled via tempo wallet CLI |
| `0xe7013E5686b4C50B9D8e7FdB76F74baA08909494` | Deployer / demo EOA | Funded from main wallet, holds factory ownership |
| `0x3da27250f98c0b13f3a2805ee506ffa6c728a5d0` | Session key (CLI) | Delegated signer for main wallet, 10 USDC.e/week limit |

## Spend Audit

| Step | Cost (USDC.e) | Running balance |
|---|---|---|
| Welcome credit | +1.025879 | 1.026 |
| Transfer #1 (0.5 → deployer) | -0.522508 (gas incl.) | 0.503 |
| Transfer #2 (0.2 → deployer) | ~-0.222 | ~0.281 |
| Deploy MemeFactoryTempo | -0.351 (from deployer) | deployer: 0.349 |
| **Total spent so far** | **~1.096** combined wallets | |

## Tooling

- **Tempo CLI**: v1.7.0 (installed at `/root/.tempo/bin/tempo` in Ubuntu-26.04 WSL)
- **Tempo CLI wallet ext**: v0.4.1
- **Tempo Foundry fork**: v1.6.0-t3 (installed at `/root/.tempo-foundry/bin/forge`)

## Next Steps

- [ ] Build MPP endpoint server (`tempo.arcpump.com/launch`)
- [ ] Test end-to-end Claude CLI → MPP → contract launch
- [ ] Record demo video
- [ ] Compose Twitter thread

---

## V2 — Tempo-Native (TIP-20 pattern)

After discovering Tempo's EVM disables `msg.value` / `BALANCE` / `SELFBALANCE`,
the v1 factory at `0xfd5262419d56e01E90D01A78DF9E6e2DE6348740` was rendered
unusable (createToken revert on msg.value check). Re-architected to use
approve+transferFrom and TIP-20 transfer everywhere.

### MemeFactoryTempoV2
- **Address**: `0x42bce0940b286b29a7be50c3c7c89302a48e28ff`
- **Deploy tx**: `0xe208debb252739a77da806ce0cbf0b916eb3202109ef5fa08381b27ce2cc2d58`
- **Owner**: `0xe7013E5686b4C50B9D8e7FdB76F74baA08909494`
- **Fee token**: pathUSD `0x20C0000000000000000000000000000000000000`
- **createFee**: 10000 pathUSD wei (0.01 pathUSD)
- **Actual deploy cost**: 0.314 pathUSD (~$0.31)

### BondingCurveTempoV2
- Embedded in factory; each new curve deployed via `new` in `createToken`
- Constructor: `(startPrice, slope, maxSupply, creator, protocol, tradeFeeBps, feeToken)`
- Buy: approve + transferFrom of pathUSD; mint meme tokens to buyer
- Sell: burn meme tokens; transfer pathUSD back (net of fee)
- Claim: creator/protocol calls `claim*Fees(to)`; pathUSD transferred out

### End-to-End Test
- **Approve**: `0x0a5596d637956ae45b9f6fe22a390f30986cadd5b8c609c7d26afa2ab6048758`
- **createToken("Tempo Test", "TEST", "", "...", 1M, 0%)**:
  - tx `0xe321d4678ad129cb97dffbc579148feacd2776f88849c5e46c11fa6e5ddc5998`
  - new MemeToken: `0xae49360e4dc816adabc3fb6fcaae634d6ec3a88c`
  - new BondingCurveTempoV2: `0xcfac2cb03672a75ee91d7b89813db1c6bb90b981`
  - gas used: 11.9M

### Updated Spend Audit

| Step | Token | Cost |
|---|---|---|
| Welcome credits (free) | +1.026 USDC.e + 1.000 pathUSD | $2.03 |
| Transfer USDC.e #1 (0.5 → deployer) | -0.522 USDC.e | |
| Transfer USDC.e #2 (0.2 → deployer) | -0.222 USDC.e | |
| Deploy v1 (bricked, abandoned) | -0.351 USDC.e | |
| Transfer pathUSD (0.85 → deployer, via web UI) | -0.850 pathUSD | |
| Deploy v2 | -0.314 pathUSD | |
| Test createToken | -0.05 pathUSD | |
| **Remaining (combined)** | | **~$1.28** |

---

## End-to-End Demo Success — Day 3

**Date**: 2026-05-21

The MPP-paid AI agent launch flow now works on Tempo mainnet end-to-end.

### Architectural lessons (the path to working)

1. Standard mppx server SDK kept rewrapping the underlying verification
   error into a generic `VerificationFailedError`. After hours of indirection
   we pivoted to hand-rolling the MPP 402 challenge ourselves and trusting
   the retry's `Authorization: Payment …` header for the demo. Strict
   on-chain receipt verification is a follow-up.

2. Tempo's EVM disables `msg.value`, `CALLVALUE`, `BALANCE`, and
   `SELFBALANCE`. Standard viem `writeContract` builds an EIP-1559 tx and
   reverts with "insufficient funds for gas". Fix: use viem's first-class
   Tempo support (`viem/tempo` + `tempoActions()`) and call
   `client.sendTransactionSync({ calls: [{ to, data }], feeToken })`. Calldata
   must be encoded manually via `encodeFunctionData` — Tempo's `Call` type is
   `{ to, data, value }`, not viem's high-level abi/functionName/args shape.

3. Gas in pathUSD ran out faster than expected (factory + curve deploys are
   ~12M gas each, ~$0.20–0.30/launch on Tempo). Decoupled the fee tokens:
   contract still pulls `createFee` in pathUSD (via approve+transferFrom),
   gas paid in USDC.e from the deployer's larger USDC.e balance. New env
   var `GAS_FEE_TOKEN` in wrangler.toml.

### Onchain proof

POST to `https://tempo-pump-mpp.arcpump2403.workers.dev/launch` via Tempo
CLI (`tempo request`) returned:

```json
{
  "ok": true,
  "name": "Claude Demo",
  "symbol": "CLD",
  "supply": 1000000,
  "token": "0xa1188b471Ae5CDD7fD66A66548575c5cC5C8f7bE",
  "curve": "0x442b9f3a1ADdaD2FB63b2f1b782B7215699f1433",
  "txHash": "0x6e61868cd3099e55d95f9aefbfe3fbcbc1b88ae510d50aca65b36f8979c26775"
}
```

Verified onchain:
- token.name() == "Claude Demo"
- token.symbol() == "CLD"
- token.MAX_SUPPLY() == 1_000_000 × 1e18
- factory.totalTokens() bumped from 1 → 2

### Updated Spend Audit

| Step | Cost | Notes |
|---|---|---|
| Phase 2 deploys + tests | ~$0.78 | yesterday |
| Transfer USDC.e to deployer (0.3) | -0.001 | gas only |
| `Claude Demo` launch via MPP | -0.229 | gas + 0.01 createFee |
| **Remaining** | **~$0.62** | enough for 3–5 retakes |
