# Arc Pump — kịch bản video demo

**Encode Programmable Money Hackathon · Checkpoint 3 · track Agentic Economy**
Mục tiêu: **3 phút**. Tám cảnh. Mọi thứ trong đây đều đã kiểm chứng được — không có cảnh nào là slide suông.

---

## Chuẩn bị trước khi bấm ghi

**Lời thoại: dùng TTS, đừng tự đọc.** Đúng cách cậu đã làm với `agent-dashboard/voiceover/` lần trước. Bảy đoạn `.mp3`, ghép vào bản dựng. Không có lý do gì phải nói tiếng Anh trực tiếp cho một video kỹ thuật, và giọng TTS đều đặn còn dễ nghe hơn giọng người đọc kịch bản lần đầu.

**Mở sẵn bốn tab, đúng thứ tự này** — chuyển tab nhanh thì video mới gọn:

1. PowerShell, đã `cd D:/Code/arc-pump`, chữ phóng to (Ctrl + cuộn) để chữ đọc được ở 1080p
2. `https://arcpump.com/pay`
3. `https://testnet.arcscan.app/address/0x8eB7e2A25C46938084d951985A5F87ad310A73Db`
4. VS Code mở `src/PaymentRouter.sol` và `test/PaymentRouter.t.sol`

**Quay ở 1920×1080.** Ẩn bookmark bar, đóng hết tab thừa, tắt thông báo.

**Một lần chạy thử toàn bộ trước khi ghi.** Endpoint `/demo-pay` có giới hạn tần suất; biết trước nó mất bao lâu thì lúc ghi không bị hụt nhịp.

---

## Cảnh 1 — Vấn đề (0:00 – 0:20)

**Hình:** trang `arcpump.com/pay`, đứng yên ở phần hero.

**Lời:**
> Autonomous agents are starting to buy things. Data, compute, API calls.
> But every payment system we have was built for people: subscriptions,
> API keys, a card at checkout. None of that fits a machine that makes one
> call, once, with nobody watching.

---

## Cảnh 2 — Sản phẩm là gì (0:20 – 0:40)

**Hình:** cuộn chậm qua ba bước Request / Pay / Unlock.

**Lời:**
> Arc Pump is a pay-per-call rail. An agent asks for a resource, gets a
> price, pays it on Arc in USDC, and gets the resource. One payment, one
> call. No account, no key, no human.
> Everything you are about to see is running live. Nothing is mocked.

---

## Cảnh 3 — Hoá đơn thật (0:40 – 1:10)

**Hình:** PowerShell. Gõ chậm, để người xem đọc kịp:

```
curl.exe -i https://agentpay-service.arcpump2403.workers.dev/premium
```

Khi ra kết quả, **tô sáng dòng `HTTP/1.1 402 Payment Required`**, rồi tô sáng header `PAYMENT-REQUIRED`.

**Lời:**
> An unpaid request comes back four-oh-two. Payment Required. That status
> code has been in the HTTP spec since nineteen ninety-seven and almost
> nobody has ever used it. It is exactly what an agent needs.
> The header carries the terms: the price, the invoice id, the contract to
> pay, and the function to call. A machine can read this and act on it
> without being told anything in advance.

*(Ghi chú: nếu muốn cho thấy nội dung header đã giải mã, chèn text overlay phần JSON — đừng gõ thêm lệnh base64, sẽ làm loãng nhịp.)*

---

## Cảnh 4 — Trả tiền thật (1:10 – 1:50)

**Hình:** sang tab `arcpump.com/pay`, cuộn tới ô Playground, bấm **Run it**. Để chạy trọn vẹn, ba bước tự sáng lên lần lượt.

**Lời:**
> Now the same flow, from the browser. One click, and a real agent pays one
> cent of USDC on Arc.
> Request. Pay. Unlock.
> The wallet signing this is a Circle Programmable Wallet — multi-party
> computation, so no private key sits on any server. The agent signs for
> itself, inside a per-call cap and a total budget it cannot exceed.

**Nhịp:** bước 2 mất khoảng 10–20 giây chờ xác nhận. **Đừng cắt.** Chờ thật là một phần của bằng chứng — cắt đi trông như dựng.

---

## Cảnh 5 — Hỏi chain, không hỏi dịch vụ (1:50 – 2:15)

**Hình:** bấm link `view tx ↗` trong Playground → mở arcscan. Chỉ vào trường **To** = `0x8eB7e2A2…73Db`. Rồi quay lại PowerShell:

```
cast call 0x8eB7e2A25C46938084d951985A5F87ad310A73Db "verify(bytes32,address,uint256)(bool)" <invoiceId> 0xfC6153A6d0Cc40E17d9B48fE2fb1AACd9C63114e 10000000000000000 --rpc-url https://rpc.quicknode.testnet.arc.network/
```

Kết quả `true` — **để nó trên màn hình 2 giây**.

**Lời:**
> The service says it was paid. That is not good enough. So we ask the
> contract directly, and it answers true.
> This is the check the service itself makes before it hands anything over.
> One view call. No oracle, no webhook, no trust.

---

## Cảnh 6 — Vì sao Arc cần contract này (2:15 – 2:40)

**Hình:** VS Code, `src/PaymentRouter.sol`, cuộn tới `pay()`.

**Lời:**
> On Arc, USDC is the native token. That makes payments fast and final, but
> a native transfer carries no memo — so there is no way to tie money to an
> invoice. That is why this contract exists. Forty lines. It binds every
> payment to both the invoice and the recipient, forwards the funds in the
> same transaction, and never holds them.
> It is the smallest thing that makes the rail work on this chain, and it
> would not be needed on any chain where USDC is an ERC-20.

---

## Cảnh 7 — Cái lỗ mình tự tìm ra (2:40 – 3:00)

**Hình:** VS Code, `test/PaymentRouter.t.sol`, cuộn tới
`testFuzz_noStrangerCanBrickAnInvoice`. Rồi terminal chạy `forge test`, cho thấy **68 passed**.

**Lời:**
> One more thing, because it is the part I would want to know about.
> Invoice ids are published in the clear. In an earlier version, anyone
> could send one wei against someone else's invoice and make it permanently
> unpayable. One wei, and the service goes down.
> Payments are now keyed by invoice and recipient together, and they
> accumulate instead of locking. This fuzz test states the property: no
> stranger, at any amount, against any address, can stop an honest payment
> from clearing. Sixty-eight tests, none of them touching the network.

**Vì sao cảnh này quan trọng:** gần như mọi video hackathon chỉ trình bày đường đi thuận lợi. Tự nêu ra một lỗ hổng thật trong contract của chính mình, kèm test canh giữ nó, là thứ phân biệt người viết code sản xuất với người viết code trình diễn. Đừng bỏ cảnh này để tiết kiệm 20 giây.

---

## Cảnh 8 — Kết (3:00 – 3:15)

**Hình:** quay lại `arcpump.com/pay`, đứng ở hero.

**Lời:**
> Arc Pump. A pay-per-call rail for agents, in USDC on Arc. Live, on-chain,
> and open source.
> Thanks for watching.

**Overlay chữ ở cảnh cuối:**
```
arcpump.com/pay
github.com/PHUOCHAU2403/arc-pump
PaymentRouter  0x8eB7e2A25C46938084d951985A5F87ad310A73Db
```

---

## Những gì cố ý KHÔNG đưa vào

- **Không có slide kiến trúc.** Mọi thứ đều là màn hình thật đang chạy. Một sơ đồ hộp-và-mũi-tên không chứng minh được gì mà ai cũng vẽ được.
- **Không nhắc phần memecoin cũ.** Nó vẫn còn trong repo nhưng không thuộc bài nộp này; nhắc tới chỉ gây rối.
- **Không có video giới thiệu đội.** Đó là trường riêng trong form, không phải phần của video demo.
- **Không hứa hẹn tương lai.** Chỉ nói thứ đang chạy. Người chấm nghe "sắp tới chúng tôi sẽ…" cả ngày rồi.

## Bảng kiểm trước khi nộp

- [ ] Video ≤ 3:30, tải lên YouTube **Unlisted**
- [ ] Xem lại một lượt trên điện thoại — chữ terminal có đọc được không
- [ ] Link video dán vào **Link to Demo Video**
- [ ] **Live Demo Link** = `https://arcpump.com/pay`
- [ ] **Track** = Agentic Economy
- [ ] Ô Submission Details viết xong
