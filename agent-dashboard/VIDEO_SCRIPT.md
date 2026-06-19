# Video script — Arc Pump Agent (~2.5 min)

Screen recording + voiceover. Keep it tight; judges watch many. Record at 1080p,
unlisted YouTube/Loom, paste the URL into SUBMISSION.md and the form.

Have these tabs open before recording:
1. The live dashboard — https://arc-pump-agent.arcpump2403.workers.dev
2. Arcscan — the agent wallet page (`/address/0x9f26df…`)
3. A terminal connected to the agent (or local `agent/`)
4. `agent-dashboard/architecture.svg` open in a viewer

---

### 0:00–0:20 · Hook (show the dashboard)
> "This is Arc Pump Agent — an autonomous AI agent that runs a USDC-native launchpad
> on Arc. No human clicks anything. Every few hours it decides what to do on its own,
> and you can watch it think, right here."

Scroll the dashboard slowly: header, the stats row, then the feed — pause on one
action so the **italic reasoning line** is clearly readable.

### 0:20–0:45 · The differentiator: it reasons
> "Each entry is a real decision. The agent reads its market on Arc, and Claude
> reasons about it — here it's choosing to buy into an existing token instead of
> launching a new one, and it explains why. That reasoning isn't decoration; it's
> what drove the on-chain transaction next to it."

Hover/point at a reasoning line + its tx link.

### 0:45–1:05 · Architecture (show the diagram)
> "The loop is simple. Claude reasons and picks an action. It's signed by a Circle
> Programmable Wallet — developer-controlled, MPC, so no private key ever sits on our
> server. The transaction settles in USDC on the Arc Pump smart contracts. Then the
> action and its reasoning are posted back to this dashboard. Then it sleeps, and
> repeats."

Show `architecture.svg` full-screen, tracing top to bottom.

### 1:05–1:45 · Live proof (terminal + Arcscan)
Run `node agent.mjs tick` in the terminal.
> "Let's run one cycle live. The agent reasons…"

When the result prints (reasoning + txHash):
> "…it decided, signed through Circle Wallets, and the transaction is confirmed on
> Arc, settled in USDC."

Copy the `txHash`, open it on Arcscan, show the confirmed tx + the **from = agent
wallet** + USDC value.
> "Same wallet, on-chain, no human in the loop."

Refresh the dashboard — the new action appears at the top.

### 1:45–2:15 · Circle integration (1-2 lines on screen)
> "Circle does the heavy lifting: USDC is the native settlement rail on Arc, and
> Circle Programmable Wallets give the agent a secure, key-safe way to sign every
> transaction itself. We wrote up exactly what worked and what we'd improve in our
> Circle Product Feedback."

Optionally flash the README's "How Circle tools are integrated" section.

### 2:15–2:30 · Close
> "Arc Pump Agent: an AI agent that earns, spends, and settles in USDC on Arc,
> entirely on its own. Built for the Stablecoin Commerce Stack Challenge, Agentic
> Economy track. Thanks for watching."

End on the live dashboard.

---

**Tips**
- Trim dead air while `tick` runs (the LLM call + tx take ~20–40s) — speed it up or cut.
- If `tick` happens to pick `claim` and skips, just run it again or narrate a `buy`/`launch`.
- Make sure the agent wallet has USDC before recording so a launch/buy doesn't fail.
- Keep total under 3 minutes.
