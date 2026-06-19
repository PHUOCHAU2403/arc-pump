# Ignyte Submission — field sheet

Copy each field into the Ignyte submission form. Everything below is ready except
the video URL (record first, then paste).

---

**Title**
Arc Pump Agent — an autonomous AI agent running a USDC-native launchpad on Arc

**Short description**
An autonomous AI agent that operates a USDC-native token launchpad on Arc. Every few
hours it reasons with Claude about its market, decides to launch a token, buy a
bonding curve, or claim creator fees, signs the transaction through a Circle
Programmable Wallet, and settles it in USDC on Arc — with no human in the loop. A
live dashboard streams every decision and its reasoning.

**Track submitted for**
Track 4 — Best Agentic Economy Experience on Arc

**Email associated with your Circle Developer Account**
sieusayza@gmail.com

**Circle products used on Arc** (select)
- ✅ USDC — native settlement, launch fees, creator-fee payouts
- ✅ Wallets — Circle Programmable Wallets (Developer-Controlled, MPC) as the agent's signer
- ✅ Nanopayments — referenced as the next step for high-frequency agentic settlement (conceptual / architecture-level)

**Functional MVP and diagram**
- Live demo (working frontend + backend): https://arc-pump-agent.arcpump2403.workers.dev
- Agent wallet on Arc testnet: https://testnet.arcscan.app/address/0x9f26dfba277afdd6e5df307f7d9363abe2f72b6a
- MemeFactory contract: https://testnet.arcscan.app/address/0x4dCf3238dd90E571e82bC07fD876B384f170546c
- Architecture diagram: `agent-dashboard/architecture.svg` (in repo) — attach/upload this image to the form

**Video demonstration + presentation**
<PASTE VIDEO URL HERE after recording — see VIDEO_SCRIPT.md>

**Link to GitHub / code repository**
https://github.com/PHUOCHAU2403/arc-pump
(setup + Circle-integration docs are in the root README.md)

**Demo Application Platform / Application URL**
https://arc-pump-agent.arcpump2403.workers.dev

**Circle Product Feedback**
See `agent-dashboard/CIRCLE_PRODUCT_FEEDBACK.md` — covers why we chose USDC + Circle
Programmable Wallets, what worked well, what could be improved (entity-secret recovery
path, Arc testnet faucet, native-USDC 18-decimals), and recommendations. Paste that
section's contents into the form's "Circle Product Feedback" field.

---

## Pre-submit checklist
- [ ] `git push` the repo so README + agent/ + agent-dashboard/ + architecture.svg + feedback are public
- [ ] Confirm secrets are NOT committed (agent/.env, recovery*.dat are gitignored)
- [ ] Record the video, upload (YouTube/Loom unlisted), paste URL above + in the form
- [ ] Upload architecture.svg (or a PNG export) to the diagram field
- [ ] Confirm the live dashboard loads + shows recent agent activity
- [ ] Submit before 2026-07-13
