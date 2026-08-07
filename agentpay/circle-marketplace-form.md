# Circle Agent Marketplace — nội dung điền form

**Form:** https://forms.gle/7YFzvdmMcn1JH5tF6 ("Accept USDC from agents")
**Marketplace:** https://agents.circle.com/services
Soạn 31/7/2026. Đây là **form đăng ký ý định bán**, không phải publish tự động.

---

## ⚠️ Đọc phần này trước khi điền

Endpoint `/premium` hiện trả về **một câu insight viết cứng**. Nó chứng minh cơ chế thanh toán chạy được — nhưng không phải dịch vụ có giá trị thật. Nộp nó lên marketplace như một sản phẩm bán 0.01 USDC sẽ phản tác dụng với Circle.

**Nên trình bày như thế nào:** đừng bán endpoint demo. Bán **năng lực và câu chuyện**, kèm dịch vụ thật.

Điểm mạnh nhất của cậu với Circle không phải cái endpoint — mà là: **cậu tự build một rail x402 trên Arc Testnet trước khi biết Gateway Nanopayments tồn tại.** Cùng bài toán, cùng chain, cùng kết luận. Đó là thứ khiến người của Circle muốn nói chuyện. Nó cũng chính là điều đưa cậu vào Finalist ở Remix.

Và nhớ: **Circle là Tier 1 trong danh sách xin việc của cậu.** Form này vừa là kênh bán hàng vừa là cửa vào quan hệ.

---

## Nội dung điền

### Provider / Builder
```
Nguyen Phuoc Hau (independent builder)
Email: sieusayza@gmail.com
GitHub: https://github.com/PHUOCHAU2403
Portfolio: https://arcpump.com/pay
```

### Service name
```
Arc Pump — pay-per-call rail + paid agent services on Arc
```

### What are you building / what would you list?
```
I run a live pay-per-call payment rail for AI agents on Arc Testnet, and I want to
list paid services on the marketplace.

Context that may be useful to you: I built this independently, before I found
Gateway Nanopayments. Same problem, same chain, same conclusion — agents need to
pay per request in USDC, and native USDC on Arc has no memo field, so a raw
transfer can't be bound to an invoice. My solution was a small non-custodial
settlement contract (PaymentRouter) that binds each payment to both the invoice
id and the recipient, so a service can verify in one view call. Yours solves it
with a Gateway Wallet deposit plus offchain EIP-3009 authorizations and batched
settlement, which scales far better to sub-cent amounts.

Live and verifiable right now:
- PaymentRouter on Arc Testnet (5042002):
  0x8eB7e2A25C46938084d951985A5F87ad310A73Db
- Paid endpoint (unpaid request returns 402 with an x402 v2 PAYMENT-REQUIRED
  header; paid request returns 200):
  https://agentpay-service.arcpump2403.workers.dev/premium
- Public ledger of every verified paid call:
  https://agentpay-service.arcpump2403.workers.dev/ledger
- Interactive demo — one click triggers a real on-chain payment:
  https://arcpump.com/pay

I should be straight with you about maturity: /premium is currently a
demonstration endpoint. The payment path is real and on-chain; the payload
behind it is a placeholder. I am not asking you to list a placeholder.

What I would list is real paid agent services on top of this rail:

1. RateCard — pricing recommendations for agent services. Already live and
   revenue-generating on another agent marketplace at 0.1 USDC/call, settling on
   Base mainnet. It scans live marketplace listings, finds the services a buyer
   would actually compare against, and returns a demand-weighted price with the
   evidence attached.

2. Prediction-market fair value — I have a working lognormal fair-value model
   that prices short-term Polymarket "Up or Down" markets against live Binance
   spot: P(close > open) with volatility estimated from the last 60 one-minute
   candles, surfacing where the market price has drifted from fair value. Not
   raw odds — the mispricing signal. I saw prediction-market odds listed as a
   marketplace category and this is a differentiated version of it.

I would rather list something an agent genuinely wants to buy than pad the
directory.
```

### Which Circle products do you use?
```
USDC (native on Arc), Circle Programmable Wallets (developer-controlled, MPC),
Arc Testnet. My agents sign autonomously through Circle Wallets — no private key
on any server. I also submitted detailed product feedback through the Ignyte
Stablecoin Commerce Stack Challenge.
```

### Pricing model
```
Pay-per-call in USDC. Current demo endpoint is 0.01 USDC/call. RateCard is
0.1 USDC/call. Open to moving to Gateway Nanopayments pricing if that is the
preferred seller path — sub-cent pricing is exactly what my own rail cannot do,
since I settle on-chain per call and pay gas each time.
```

### Anything else?
```
Two things.

First: I would like to migrate to Gateway Nanopayments and would value a
technical conversation about the seller path on Arc. Having built the naive
version, I have specific feedback on where an independent developer gets stuck —
including that the supported-networks reference page currently 404s, and that
the docs give the Arc Testnet chain id inconsistently in two places.

Second: I am a Finalist at the Encode x Remix AI Bootcamp for Real World Impact
2026 with this project, and I have submitted to the Circle Programmable Money
Hackathon and the Ignyte Stablecoin Commerce Stack Challenge. I build payment
infrastructure for autonomous agents full time outside my day job, and I am open
to working on this professionally.
```

---

## Bằng chứng kèm theo (nếu form cho upload / hỏi thêm)

| Mục | Giá trị |
|---|---|
| Unpaid request → 402 | `curl -i https://agentpay-service.arcpump2403.workers.dev/premium` |
| Header x402 v2 | `PAYMENT-REQUIRED` (base64) — scheme `arc-router-v1`, network `eip155:5042002` |
| Paid request → 200 | `?invoice=<id>` sau khi gọi `router.pay()` |
| Contract | https://testnet.arcscan.app/address/0x8eB7e2A25C46938084d951985A5F87ad310A73Db |
| Sổ cái công khai | https://agentpay-service.arcpump2403.workers.dev/ledger |
| Repo | https://github.com/PHUOCHAU2403/arc-pump |

---

## Việc cần làm sau khi nộp form

1. **Xây một endpoint có giá trị thật.** Tái dùng nguyên bộ 402 + router + ledger đã có, chỉ thay payload demo bằng dữ liệu fair-value từ poly-sniper. Hạ tầng đã xong; chỉ thiếu handler dữ liệu.
2. **Cài `circle` CLI** để test theo chuẩn (`circle services inspect` / `pay`) — hiện chưa cài trên máy.
3. Cân nhắc thêm một `accepts[]` entry theo **Gateway Nanopayments** để client chuẩn trả được, song song với `arc-router-v1`.
