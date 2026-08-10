# Video narration — AI voiceover (TTS-ready)

Format: screen recording + AI voiceover. Paste the narration below into ElevenLabs,
generate the mp3, then sync it under your screen clips. ~2 min 15 s at normal pace.

Each block has a **[SCREEN]** direction (what to show) and the **line to narrate**.
Generate the audio as ONE block (simplest) or per-segment (tighter sync).

---

### 1 · Hook
**[SCREEN]** Dashboard, scrolling the action feed slowly.
> This is Arc Pump Agent — an autonomous AI agent that runs a stablecoin launchpad on Arc, completely on its own. No one is clicking anything. It has been running by itself for days, and every entry here is a decision it made and carried out on-chain.

### 2 · It reasons (the differentiator)
**[SCREEN]** Hover/zoom one italic reasoning line, then its transaction link.
> What makes it different is that it reasons. Before each action, Claude reads the market and decides what to do — launch a new token, buy into an existing one, or claim fees. And it explains why, in plain English, right next to the transaction it produced.

### 3 · Architecture
**[SCREEN]** Full-screen `architecture.svg`, tracing top to bottom.
> The loop is simple. Claude reasons and picks an action. A Circle Programmable Wallet signs it, using multi-party computation, so no private key ever sits on a server. The transaction settles in USDC on the Arc Pump smart contracts. The decision and its reasoning post back to this live dashboard. Then it sleeps, and repeats, every six hours.

### 4 · Live proof
**[SCREEN]** Terminal — run `node agent.mjs tick`. (Speed up the wait in editing.)
> Let's watch one cycle happen live. The agent wakes, reasons about its market, decides, and signs the transaction through Circle Wallets.

### 5 · On-chain confirmation
**[SCREEN]** Open the tx on Arcscan; point to the from-wallet and the USDC value. Then refresh the dashboard to show the new action on top.
> And there it is. A real transaction, confirmed on Arc, settled in USDC, sent from the agent's own wallet. No human in the loop.

### 6 · Circle integration
**[SCREEN]** README "How Circle tools are integrated" section (or stay on dashboard).
> Circle does the heavy lifting. USDC is the native settlement rail on Arc, and Circle Programmable Wallets give the agent a secure way to sign every transaction itself. That combination is what makes a truly autonomous on-chain agent possible.

### 7 · Close
**[SCREEN]** Back on the live dashboard.
> Arc Pump Agent — an AI agent that earns, spends, and settles in USDC on Arc, entirely on its own. Built for the Stablecoin Commerce Stack Challenge. Thanks for watching.

---

## Make the voiceover (ElevenLabs — free)

1. Go to **elevenlabs.io** → sign up (free tier ≈ 10 min of audio/month — plenty).
2. Open **Text to Speech**. Pick a calm, clear English voice (e.g. *Brian*, *Adam*, or *Rachel*). Model: the default multilingual/v3 is fine.
3. Settings: **Stability ~50**, **Similarity ~75**, Speed normal. (Higher stability = steadier, less dramatic.)
4. Paste the 7 lines above (just the narrated text, not the [SCREEN] notes). Generate.
5. **Download the mp3.** Tip: generating each numbered block separately gives you clips you can line up exactly with each screen segment.

## Assemble (CapCut — free, beginner-friendly)

1. New project → import your screen recordings + the mp3(s).
2. Drop the **narration on the audio track**; lay each **screen clip** above its matching line.
3. The live `tick` wait (~30 s): **trim or speed it up** so "…decides…" lands when the result appears. No dead air.
4. (Optional) CapCut **auto-captions** from the audio — keep them small/bottom for accessibility.
5. Add **background music**, volume ~10–15% (well under the voice).
6. Export **1080p, 30fps** → upload to **YouTube (Unlisted)** → paste the link into `SUBMISSION.md` and the form.

## Pre-record checklist
- Agent wallet funded with USDC so the live `tick` doesn't fail.
- Browser zoomed in (`Ctrl +`) so text is legible at 1080p.
- Desktop tidy; close unrelated tabs.
- Record in short clips per segment — don't attempt one perfect take.
- Keep total under 3 minutes.
