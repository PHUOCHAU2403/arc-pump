# Submission Details — dán vào ô "Submission Details" của Checkpoint 3

Toàn bộ số liệu dưới đây đã kiểm chứng ngày 6/8/2026. Không có câu nào chưa xác minh.

---

## Arc Pump — a pay-per-call payment rail for AI agents on Arc

**Live:** https://arcpump.com/pay · **Code:** https://github.com/PHUOCHAU2403/arc-pump
**Track:** Agentic Economy

### What it does

An agent asks a service for a resource and gets back `402 Payment Required` with an
invoice — a price, an invoice id, the contract to pay, and the function to call. It
pays that invoice on Arc in native USDC, retries the request, and the service verifies
the payment on-chain before serving the response. One payment, one call. No account,
no API key, nobody watching.

The paying wallet is a Circle Programmable Wallet (developer-controlled, MPC), so the
agent signs for itself and no private key sits on a server. Every payment happens
inside a per-call cap and a total budget the agent cannot exceed.

### Why there is a contract at all

This is the part that is specific to Arc, and it is the reason the project exists in
this shape.

On Arc, USDC is the *native* token. That makes a payment a plain value transfer —
fast and final in about a second — but a native transfer carries no memo, so there is
nothing to tie the money to an invoice. A service receiving 0.01 USDC has no way to
know which request it paid for.

`PaymentRouter` is the smallest thing that fixes it: about forty lines, no owner, no
admin, no custody. It records a payment against the pair `(invoice id, recipient)`,
forwards the funds to the recipient in the same transaction, and exposes a single view
function so the service can check in one `eth_call` whether a given invoice was paid to
it. On any chain where USDC is an ERC-20, this contract would not be needed — an
EIP-3009 authorisation would do the same job. It is needed here.

For the same reason the 402 header advertises the scheme `arc-router-v1` rather than
x402's `exact`. `exact` settles a signed EIP-3009 authorisation, and native USDC has
nothing to sign against. Declaring a distinct scheme lets a standard x402 client read
the terms and skip cleanly instead of attempting a payment that cannot succeed. This
is a real limit of x402 on stablecoin-native chains, not something we worked around
quietly.

### What is live and verifiable right now

| | |
|---|---|
| Interactive demo | https://arcpump.com/pay — click **Run it** and a real agent pays 0.01 USDC |
| Paid service | `GET https://agentpay-service.arcpump2403.workers.dev/premium` returns a real 402 |
| PaymentRouter | `0x8eB7e2A25C46938084d951985A5F87ad310A73Db` on Arc testnet |
| Deployment tx | `0x293ffee40fcbc91eddaa65c9426a8712c5fd31c5702d9500453170b8dcaa7506` |
| A real payment | `0x7b62109140a2ad19dcd2e5387570995bf9c6703956ba76f0d604d4748b824526` |
| Public ledger | `GET /ledger` — every payment the service has verified on-chain |
| Tests | 68 Foundry tests, none touching the network, run in CI on every push |

There is also a second paid endpoint, `/fairvalue`, which sells something real rather
than a placeholder: it prices every Polymarket "up or down" market closing in the next
thirty minutes against live spot and returns the gap between the model and the order
book. It exists to make the point that a paid endpoint should be worth paying for.

### Process — what actually happened

The project started as a USDC-native launchpad with an autonomous agent fleet. That
code is still in the repository, and the pivot is visible in it. What changed was
noticing that the interesting problem was not launching tokens — it was that the
agents we had built could not pay for anything without a human provisioning an API key
first. The rail became the product.

Two things from the build are worth stating plainly.

**The service does not trust itself.** Before serving a paid response it calls
`verify` on the router and requires `true`. The demo does the same: after the payment
lands we query the contract directly rather than believing the service's own report.
An executor should not also be the sole witness that it executed.

**We found and closed a real vulnerability in our own contract.** Invoice ids travel
in the clear inside the 402 header — anyone can read one with an unauthenticated
request. An earlier version of `PaymentRouter` keyed payments by invoice id alone and
rejected any second payment, which meant a stranger could send a single wei against
someone else's invoice, to any address, and make that invoice permanently unpayable.
Verification would fail forever, because the recorded recipient was the attacker.
Repeated against each freshly issued invoice, one wei plus gas takes the whole service
down.

Payments are now keyed by `(invoice id, recipient)` and accumulate rather than lock, so
a payment aimed at the wrong recipient cannot touch the real one's slot, and dust sent
to the right recipient is a donation rather than a lock. The old test suite had
encoded the bug as intended behaviour; it is replaced by tests asserting the opposite,
including a fuzz property that no stranger, at any amount, against any address, can
stop an honest payment from clearing. The fixed contract was redeployed and the whole
rail re-verified end to end before this submission.

### What this is not

It runs on Arc testnet. The rail works and every transaction above is real, but the
money is testnet money.

Nobody outside the project has paid for a call yet. The mechanism is proven; demand is
not. For a payments project that is the honest gap, and it is the next thing worth
fixing.

One detail that trips up integrators and is worth flagging: native USDC on Arc has
**18 decimals**, not the 6 that USDC uses as an ERC-20 elsewhere. Amounts in the 402
header are in wei.

---

*Built solo. Nguyen Phuoc Hau — github.com/PHUOCHAU2403*
