# Kịch bản quay video demo — Arc Pump

**Encode Programmable Money Hackathon · Checkpoint 3 · track Agentic Economy**
Mục tiêu **2 phút 50**. Sáu cảnh, **một trình duyệt duy nhất**, không dòng lệnh nào.
Lời thoại đưa qua TTS — không cần tự đọc.

> **Bản này thay bản cũ dùng terminal.** Lý do: terminal chỉ đọc được với người
> đã viết code, mà khán giả Web3 quen dApp. Và `arcpump.com/pay` có sẵn nút
> **Run it** chạy thanh toán thật trên chain — quay cái đó vừa dễ hiểu hơn vừa
> là bằng chứng mạnh hơn một cửa sổ chữ.

---

## Chuẩn bị (5 phút trước khi bấm ghi)

**Mở một tab:** `https://arcpump.com/pay`

Ẩn thanh bookmark, đóng tab thừa, tắt thông báo, phóng to **110–125%**.
Quay **1920×1080**. Cuộn bằng bánh xe, đừng kéo thanh trượt.

**Chạy thử nút Run it một lần trước khi ghi** — để biết nó mất bao lâu, và để
cache ấm. Endpoint có giới hạn tần suất nên đừng bấm liên tục.

---

## Cảnh 1 — Vấn đề (0:00 – 0:25)

**Hình:** đầu trang. Tiêu đề *"The payment rail for autonomous AI agents"*, chấm
xanh **Live on Arc**, khối code `agent.ts`.

**Lời:**
> Autonomous agents are starting to buy things — data, compute, API calls. But
> every payment system we have was built for people: subscriptions, API keys, a
> card at checkout.
>
> None of that fits a machine that makes one call, once, with nobody watching.

---

## Cảnh 2 — Trả tiền thật, một cú bấm (0:25 – 1:12)

**Hình:** cuộn tới khối **Playground**, bấm **Run it**. Để ba bước tự sáng lên
theo thứ tự: Request → Pay → Unlock.

**Lời:**
> One click, and a real agent pays one cent of USDC on Arc.
>
> First it asks for the resource and gets four-oh-two, Payment Required, with an
> invoice. That status code has been in the HTTP spec since nineteen ninety-seven
> and almost nobody has ever used it — it is exactly what an agent needs.
>
> Then its wallet pays the invoice. This is a Circle Programmable Wallet, multi
> party computation, so no private key sits on any server. The agent signs for
> itself.
>
> Then the service checks the chain, and only then hands over the data.

**⚠ Bước Pay mất 10–20 giây chờ xác nhận. ĐỪNG CẮT.** Chờ thật là một phần của
bằng chứng — cắt đi trông như dựng sẵn.

---

## Cảnh 3 — Kiểm trên chain (1:12 – 1:38)

**Hình:** trong bước Pay đã hiện link **view tx ↗** — bấm vào, sang arcscan.
Dừng ở trường **To**, chỉ vào địa chỉ router.

**Lời:**
> Here is that payment on the public explorer. It went through a small contract
> called the PaymentRouter, and that contract exists for one reason.
>
> On Arc, USDC is the native token. That makes payments fast and final, but a
> native transfer carries no memo — so there is nothing tying the money to an
> invoice. Forty lines of Solidity fix that: every payment is bound to both the
> invoice and the recipient, forwarded in the same transaction, never held.
>
> On any chain where USDC is an ERC-20, this contract would not be needed. Here
> it is.

---

## Cảnh 4 — Nó không tiêu quá tay (1:38 – 2:10)

**Hình:** cuộn tới **Autonomous, never unbounded**. **Kéo hai thanh trượt** —
per-call cap và total budget. Cho thấy con số lệnh gọi thay đổi, rồi kéo tới lúc
nó chuyển sang trạng thái từ chối.

**Lời:**
> Autonomy without limits is just a way to lose money quickly. Every agent runs
> under a cap on each call and a budget it cannot exceed.
>
> Drag them, and you can see the point where the agent stops paying. That check
> runs before the request goes out, never after.

---

## Cảnh 5 — Có người khác đã trả (2:10 – 2:32)

**Hình:** cuộn tới **Live ledger**. Dừng cho thấy số lượt và bảng giao dịch. Bấm
mở một dòng để lộ chi tiết.

**Lời:**
> Every payment the service has verified on chain is listed here, publicly. Not
> a demo counter — the same ledger the service reads before it serves anything.

---

## Cảnh 6 — Kết (2:32 – 2:50)

**Hình:** cuộn tới **Why Arc** rồi lên lại đầu trang.

**Lời:**
> Arc Pump. A pay-per-call rail for agents, in USDC on Arc. Live, on chain, and
> open source.
>
> Thanks for watching.

**Overlay chữ ở cảnh cuối:**
```
arcpump.com/pay
github.com/PHUOCHAU2403/arc-pump
PaymentRouter  0x8eB7e2A25C46938084d951985A5F87ad310A73Db
```

---

## Nếu còn thời gian: một cảnh nữa đáng thêm

Sau cảnh 4, mở `test/PaymentRouter.t.sol` và chỉ vào
`testFuzz_noStrangerCanBrickAnInvoice`.

**Lời:**
> One more thing, because it is the part I would want to know. Invoice ids
> travel in the clear. In an earlier version, anyone could send one wei against
> someone else's invoice and make it permanently unpayable — one wei, and the
> service goes down.
>
> Payments are now keyed by invoice and recipient together, and they accumulate
> instead of locking. This test states the property: no stranger, at any amount,
> against any address, can stop an honest payment from clearing.

Gần như mọi video hackathon chỉ trình bày đường đi thuận lợi. Tự nêu một lỗ hổng
trong contract của chính mình, kèm test canh giữ nó, là thứ phân biệt người viết
code sản xuất với người viết code trình diễn.

---

## Những gì cố ý KHÔNG quay

- **Không terminal.** Đây là lý do bản trước bị thay.
- **Không sơ đồ kiến trúc.** Hộp-và-mũi-tên ai vẽ cũng được.
- **Không nhắc phần memecoin cũ** còn trong repo — không thuộc bài nộp này.
- **Không hứa hẹn tương lai.** Chỉ nói thứ đang chạy.

## Bảng kiểm trước khi nộp — hạn 10/8 18:59

- [ ] Video ≤ 3:00, YouTube **Unlisted**
- [ ] Link video → ô **Link to Demo Video**
- [ ] `https://arcpump.com/pay` → ô **Live Demo Link**
- [ ] Track = **Agentic Economy**
- [ ] Ô **Submission Details** — dán từ `SUBMISSION-DETAILS.md`
- [ ] Bấm **Submit Checkpoint** (điền mà không bấm = chưa nộp)
