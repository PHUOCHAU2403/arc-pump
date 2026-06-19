# Circle Product Feedback

Submitted for **The Stablecoin Commerce Stack Challenge** — Agentic Economy track.
Project: **Arc Pump Agent** — an autonomous AI agent that operates a USDC‑native
launchpad on Arc, reasoning with Claude and settling every transaction in USDC
through a Circle Programmable Wallet, with no human in the loop.

## Circle products used (and why)

- **Circle Programmable Wallets — Developer‑Controlled (MPC), on `ARC-TESTNET`.**
  The agent needs to sign transactions autonomously, on a schedule, with no human
  approving each one — and we did not want to hold a raw private key on a server.
  Developer‑Controlled Wallets were the natural fit: Circle's MPC holds the key
  material, our agent calls the API to execute contract calls. This is exactly the
  "secure key management for agent‑initiated transactions" the track recommends.
  Agent wallet: `0x9f26dfba277afdd6e5df307f7d9363abe2f72b6a`.

- **USDC — settlement + value rail on Arc.** On Arc, USDC is the native gas/value
  token, so every action the agent takes — paying the launch fee, buying on a
  bonding curve, claiming creator fees — settles in USDC end‑to‑end. No wrapper,
  no separate quote token.

- **Nanopayments (conceptual / next step).** Our agent already makes frequent,
  low‑value onchain actions; high‑frequency sub‑cent settlement is the direction
  we want to take the "pay‑per‑action" side of the launchpad.

## What worked well

- **Dev‑controlled wallet setup is genuinely fast.** Generate + register the entity
  secret, create a wallet set, create an `EOA` wallet on `ARC-TESTNET` — a handful
  of SDK calls (`@circle-fin/developer-controlled-wallets`) and we had a working,
  MPC‑secured agent wallet on Arc.
- **Contract execution with native value is clean.** `createContractExecutionTransaction`
  with `abiFunctionSignature` + `abiParameters` + a native `amount` let the agent call
  our `MemeFactory.createToken(...)` (payable) and `BondingCurve.buy(...)` (payable)
  directly. Polling `getTransaction` to `COMPLETE` and reading `txHash` was simple and
  reliable — real launches and buys confirmed on Arc on the first working attempt.
- **MPC signing "just works" for an autonomous loop.** Once set up, the agent runs
  unattended every 6 hours and signs without any interactive step — the whole point
  of an agentic wallet.

## What could be improved

1. **Entity‑secret registration: `recoveryFileDownloadPath` must be a *directory*,
   not a file path.** Passing `./recovery.dat` throws `Invalid Directory` — the
   value has to be `./`. The error fires after the ciphertext is already computed,
   and the message doesn't make the directory‑vs‑file requirement obvious. This cost
   real debugging time on the very first call.
2. **No working testnet faucet through the Wallets SDK on Arc.**
   `requestTestnetTokens({ blockchain: "ARC-TESTNET", ... })` returned `403 Forbidden`
   with a Standard API key, so we had to fund the agent wallet manually by sending
   USDC from another Arc wallet. For an agent that is supposed to be self‑sufficient,
   a programmatic fund path in dev would remove a manual onboarding step.
3. **USDC on Arc is the *native* token at 18 decimals — and that surprises you.**
   Most developers' mental model of USDC is the 6‑decimal ERC‑20. On Arc it's the
   native gas/value token at 18 decimals, and the contract‑execution `amount` maps to
   `msg.value`. Our first payable call under‑sent value and reverted before we traced
   it to the decimals/native‑value model. This is easy once you know it, painful until
   you do.
4. **`accountType` guidance for agents.** `EOA` worked perfectly; `SCA` is also offered.
   For an autonomous agent on Arc it wasn't clear which to prefer or the gas/UX
   trade‑offs — a one‑liner in the docs would help.

## Recommendations

- **Document the entity‑secret directory requirement** in the dev‑controlled wallets
  quickstart, and make the SDK error say "expected a directory path" explicitly.
- **Ship a programmatic Arc testnet faucet** (via the Wallets SDK or a documented
  endpoint) so agents can self‑fund during development — or, at minimum, return a
  clearer error pointing to the manual faucet.
- **Add an "agent wallet on Arc" quickstart**: create → fund → execute a *payable*
  contract call settling in native USDC. That exact path (the one we hand‑assembled)
  is the canonical agentic‑economy flow and deserves a first‑class guide.
- **Call out native‑USDC (18‑dec) vs standard/bridged USDC (6‑dec)** prominently
  across Arc docs and SDK examples, with a worked payable‑call example showing how
  `amount` becomes `msg.value`.
- **Nanopayments for agents:** a documented, generally‑available sub‑cent / streaming
  primitive on Arc would let agents settle per‑inference and per‑action flows natively
  — the missing piece for high‑frequency agentic commerce.

Overall: Developer‑Controlled Wallets + USDC on Arc made an genuinely autonomous,
key‑safe onchain agent straightforward to build. The rough edges were all
onboarding/docs, not the core product — once past them, the agent has been signing
and settling on Arc on its own every 6 hours.
