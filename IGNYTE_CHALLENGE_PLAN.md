# Arc Pump Agent — Ignyte "Stablecoin Commerce Stack Challenge" Plan

**Track:** 4 — Best Agentic Economy Experience on Arc ($4000 / $2000)
**Deadline:** 2026-07-13 (~26 days). Host: Ignyte · Sponsors: Circle + Arc.

## Concept

An **AI agent that autonomously operates a USDC-native commerce primitive (a token
launchpad) on Arc** — it reasons about what to do, then discovers, executes, and
settles transactions in USDC via Arc smart contracts, with **no human in the loop**.

Maps directly to Track 4 examples: "AI agent that autonomously discovers and executes
a stablecoin-settled purchase using Arc smart contracts" + "autonomous merchant
settlement" + "pay-per-use".

## Why we win (differentiators)

1. **Genuine autonomy** — runs unattended on a schedule; most entries are human-clicked demos.
2. **LLM reasoning** — the agent uses Claude to generate token concepts + decide buy/claim
   based on live curve state → real "research/negotiate/execute", not a dumb bot.
3. **Already deployed on Arc** — MemeFactoryV2 live on Arc testnet (chain 5042002);
   working MVP, not vaporware. USDC settles natively (Arc's native gas = USDC).
4. **Authentic Circle Product Feedback** — deep real experience (access-key + KeyAuthorization
   headless signing, Nanopayments gap, mppx limits) → the feedback section most entrants fake.
5. **Polished Strategist Minimal UI** — design edge; reuse the existing agent dashboard.

## Architecture

```
        ┌──────────────────────────────────────────────────────┐
        │  AI AGENT  (backend autonomous loop, scheduled)        │
        │   1. REASON  — Claude: pick action + invent token idea │
        │   2. SIGN    — Circle Wallet (agent key mgmt) on Arc   │
        │   3. EXECUTE — call Arc Pump contracts (USDC-settled)  │
        │   4. SETTLE  — claim creator fees in USDC              │
        └─────────┬───────────────────────────────┬──────────────┘
            tx (native USDC)                 read state / feed
                  ▼                                ▼
     ┌──────────────────────────┐    ┌───────────────────────────┐
     │ ARC (Circle L1, testnet) │    │ Dashboard (Next.js)        │
     │  MemeFactoryV2           │    │  live actions, tx links,   │
     │  BondingCurve (USDC)     │    │  reasoning log, USDC P&L   │
     └──────────────────────────┘    └───────────────────────────┘
   Circle products used: USDC (native settlement) · Circle Wallets
   (agent-initiated tx key mgmt) · Nanopayments (micro-fee concept)
```

## Circle products to claim in submission
- **USDC** — native settlement + creator-fee payouts (already used). ✅ core
- **Circle Wallets** — agent's programmable wallet for autonomous signing on Arc. (verify Arc support in Phase 0)
- **Nanopayments** — high-frequency sub-cent micro-fee flow (conceptual/architecture if API gated; not penalized).

## Phased timeline (26 days)

### Phase 0 — Setup (Day 1–2)
- [ ] Circle Developer Account (console.circle.com/signup) → email for submission form
- [ ] Confirm Arc Pump contracts live on Arc testnet + frontend (arcpump.vercel.app) working
- [ ] Decide agent wallet: Circle Wallets API (preferred, scores product points) vs EOA fallback; verify Arc testnet support
- [ ] Create challenge branch in repo

### Phase 1 — Agent core (Day 3–9)
- [ ] Port autonomous agent (from Tempo) → Arc: chain 5042002, native-USDC value txs
- [ ] Actions: launch (factory createToken, 1 USDC fee), buy (bonding curve, USDC), claim fees
- [ ] Add Claude reasoning step: generate token name/concept + decide action from curve state
- [ ] Wire Circle Wallets for signing (or EOA + document Wallets as intended layer)
- [ ] Scheduler loop (cron / worker), spend caps, error handling

### Phase 2 — Dashboard (Day 8–14)
- [ ] Adapt existing Strategist Minimal agent dashboard to Arc: action feed, Arc explorer
      tx links, agent reasoning log, USDC P&L, tokens launched → satisfies "working frontend" + live demo URL

### Phase 3 — Depth + docs (Day 14–20)
- [ ] Nanopayments micro-fee / streaming angle (impl or conceptual)
- [ ] Architecture diagram (clean, submission-grade)
- [ ] README: setup steps + exactly how Circle tools were integrated
- [ ] Robustness pass

### Phase 4 — Submission assets (Day 20–26)
- [ ] Video demo + presentation (script then record): core functions + Circle tool usage
- [ ] "Circle Product Feedback" section (rich real material available)
- [ ] Final docs, demo URL, GitHub polish
- [ ] Dry-run the Ignyte submission form

### Phase 5 — Submit (Day 26–27, buffer)
- [ ] Submit on Ignyte before 2026-07-13; keep buffer for fixes

## Submission checklist (from rules)
- [ ] Title + short description
- [ ] Track: 4 (Agentic Economy)
- [ ] Circle Developer Account email
- [ ] Circle products used: USDC, Circle Wallets, Nanopayments(concept)
- [ ] Functional MVP: frontend + backend + architecture diagram
- [ ] Video demo + presentation + documentation
- [ ] GitHub repo + setup/integration docs
- [ ] Live demo URL
- [ ] "Circle Product Feedback" section
