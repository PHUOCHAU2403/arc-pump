# Encode Club — Remix AI Bootcamp · reply to Giles

Send from your Gmail (sieusayza@gmail.com), reply to giles@encode.club.
Attach: `arc-pump-code.zip` + `ArcPump-deck.pdf`.
Fill in the video URL (item 5) after you record + upload.

---

**To:** giles@encode.club
**Subject:** Re: Remix AI Bootcamp — Final Chance to Submit: Arc Pump

Hi Giles,

Thank you so much for holding the door open — I really appreciate it. Here is everything for Arc Pump:

**1. Challenge Explanation**
I built under the **Freestyle** challenge. Arc Pump is agentic payment infrastructure with real-world impact: as AI agents start doing real work, they need to pay for the services they consume — APIs, data, compute — autonomously, which today's subscriptions and human checkout can't do. Arc Pump gives agents a pay-per-call rail: they pay per request in USDC on Arc, metered and bounded. That's the bootcamp's "real-world impact" applied to the emerging agent economy.

**2. Submission Details**
Arc Pump is a working **pay-per-call payment rail for AI agents**, live on Arc.
- Flow: an agent hits a paywalled service → gets `402 Payment Required` + an invoice → its wallet pays the invoice in native USDC through an on-chain PaymentRouter → the service verifies the payment on-chain and serves the response. (x402-style.)
- I built all three sides: a Solidity **PaymentRouter** contract on Arc (binds each payment to an invoice + recipient, since native USDC has no memo), a **service wrapper** that issues 402s and verifies on-chain, and a **pay-client SDK** with per-call and total-budget guardrails so an agent can't overspend.
- It's **live and interactive** at arcpump.com/pay: anyone can click "Run it" and watch a real AI agent pay 0.01 USDC on Arc to unlock a resource — step by step, with the on-chain tx — or connect a wallet and pay it themselves. A live ledger shows every paid call.
- Signing is via **Circle Programmable Wallets** (MPC — no raw private key); USDC is native on Arc (final in ~1s). Built with Next.js + Cloudflare Workers, AI-assisted throughout.
- Key achievement: a genuinely autonomous, on-chain, verifiable agent payment — click a button on the web and a real stablecoin payment settles on Arc, no human in the loop.

**3. Link to Code**
https://github.com/PHUOCHAU2403/arc-pump — heads up: my GitHub account is temporarily suspended (an automated false-positive on a new, very active account; appeal in progress), so this may 404 right now. I've attached the full source as **arc-pump-code.zip** so you have it either way.

**4. Link to Presentation**
Attached: **ArcPump-deck.pdf** (7-slide deck).

**5. Link to Demo Video**
<PASTE YOUTUBE/LOOM URL HERE>

**6. Live Demo Link**
https://arcpump.com/pay

**7. Submission Files**
Attached: arc-pump-code.zip (full source) and ArcPump-deck.pdf (deck).

Thanks again for the second chance — it means a lot.

Best,
Hau (Nguyen Phuoc Hau)

---

## Video script (~75s screen recording of arcpump.com/pay)

Record the screen (OBS / Xbox Game Bar). Voice optional — captions are fine.

- **0:00–0:12** — Open `arcpump.com/pay`. Slow scroll of the hero: "The payment rail for autonomous AI agents." Say: *"Arc Pump lets AI agents pay for services per request, in USDC on Arc."*
- **0:12–0:40** — Scroll to "Don't take our word for it." Click **Run it →**. Let it run: Request (402 + invoice) → Pay (spinner → tx) → Unlock (data). Say: *"One click — a real agent pays 0.01 USDC on Arc, and here's the on-chain transaction."* Hover/click the **tx ↗** link to show Arcscan briefly.
- **0:40–0:55** — Scroll to the **live ledger** — the payment you just made appears. Click a row to expand (invoice / verified on-chain). Say: *"Every paid call is on the ledger, verified on-chain."*
- **0:55–1:10** — Scroll to the **budget simulator**. Drag a slider so it flips to "Blocked." Say: *"Agents are bounded — a per-call cap and a budget. It refuses to overspend."*
- **1:10–1:20** — Scroll to "How it works" (402 → Pay → Unlock) + the tech (Circle Wallets, native USDC, PaymentRouter). Close on the hero. Say: *"Autonomous, on-chain, settled in USDC on Arc. That's Arc Pump."*

Upload to YouTube **Unlisted** (or Loom), paste the URL into item 5 above.
