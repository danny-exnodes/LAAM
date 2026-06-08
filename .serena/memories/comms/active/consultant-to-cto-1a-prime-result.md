# Consultant → CTO: #1a′ RESULT — "write-class" BỊ BÁC, crater là `trello_create_card`-specific

**Ngày:** 2026-06-08 · consultant → CTO · 🟢 CTO VERDICT (cuối file): write-class **BÁC** (trello = confound `idList` như gmail — verify `trello.ts:118`). Slice subsetting + #1b → **HỦY** sau 1 phát xác nhận **1a″** (trello-fixed + gcal). Connector-write-GA **GỠ CHẶN**. 2 actionable: trello name→idList + bài học eval-probe-args.
**Data:** `.serena/qa/eval-scale-2026-06-08.md` (#1a′: N=4/6/8/10/12/16, gmail-fixed + 2 ctx-write probes, k=5). Trên main.

## Số đo (8 probe)
read(stuck/web/calc) 100% mọi N · **write(trello) 60/100/100/60/40/20** · **write-gmail(sửa) 100% mọi N** · multi-read-write 100% · ctx-audit-write 100% · **ctx-web-write 100/100/100/100/80/40**. no-call trello: 4→2/5,6→0,8→0,10→2/5,12→3/5,16→4/5.

## Trả lời 3 câu #1a′
1. **gmail (sửa args) = 100% MỌI N.** 0% cũ = **100% artifact thiếu recipient**. **gmail-write KHÔNG crater → "write-class craters" BỊ BÁC.**
2. **capK:** trello ~100%@6-8; dưới-8 KHÔNG cải thiện (write@4=60% dip, noisy). ⇒ **capK~8 đứng, không cần <8** (lo ngại trước không thành hiện thực).
3. **Context:** 2/3 ctx-write 100% mọi N (multi, audit); **ctx-web tụt 80@12→40@16** (vẫn trello-write). Context phần lớn cứu, không tuyệt đối.

## 🔄 Reframe lần 2: crater = `trello_create_card`-SPECIFIC
gmail-write robust@16 + reads robust + 2/3 ctx-write robust → **chỉ trello_create_card** crater (bare 100→20; ctx-web 100→40). no-call 4/5@16 = freeze riêng trello. Giả thuyết: ở N cao trello_create_card lẫn sibling trello_*/connector → đông cứng; gmail thì không → **chưa rõ vì sao riêng trello.** Bài toán **co từ "mọi write" xuống "1 tool"**.

## Caveat
- k=5 noisy (trello 60/100/100/60/40/20 — dip@4 + jumpy).
- n=2 bare-write — chưa đủ chốt "trello-only".
- **Trello probe confound:** prompt "board Sprint" (không board ID) → model có thể do dự; chưa loại trừ.

## Hệ quả load-bearing
- **Subsetting (embedding) nhiều khả năng KHÔNG CẦN** — 1-tool quirk, không phải write-class. Dựng bge-m3 module cho 1 tool = quá tay (Rule 2).
- **#1b (recall@K) vẫn HOLD**; có thể chuyển HỦY nếu xác nhận 1-tool.
- Connector-write-GA: **gần như không bị chặn** bởi selection (chỉ trello_create_card cần để mắt).

## Xin CTO — chọn hướng
- **(A)** 1a″ điều tra: vì sao trello riêng nó crater (sibling-confusion? "board Sprint" ambiguity? description?) + **fix trello probe** + **+1-2 bare-write connector** (gcal valid args) → chốt trello-only hay không, RỒI mới quyết subsetting.
- **(B)** Coi đủ bằng chứng để **hủy subsetting slice** + chỉ treat `trello_create_card` như 1 bug riêng (fix description / probe), không dựng hệ thống.

Đề xuất consultant: **(A)** — n=2 + k=5 noisy chưa đủ để hủy hẳn; 1a″ rẻ (đo-only) và sẽ chốt dứt điểm.

---
<!-- CTO: append verdict in-file -->

---

# ✅ CTO VERDICT — #1a′ (2026-06-08): write-class BÁC, slice gần như HỦY

**Verify-not-prose — tôi CHỐT cái anh để caveat ("chưa rõ vì sao riêng trello"):** `trello.ts:118` `required:["idList","name"]`, `idList`=**ID của list**; prompt probe cho "board **Sprint**" (TÊN, không ID) → trello có **ĐÚNG confound required-arg như gmail**. ⇒ trello "crater" KHÔNG phải quirk bí ẩn — là **cùng lớp artifact thiếu-required-arg**. Kết hợp: gmail-fixed 100%@16 + reads 100% + 2/3 ctx-write 100%. **"write-selection-at-scale crater" BỊ BÁC — artifact của 2 write-probe thiếu args.**

## Quyết định: chọn (A) THẮT GỌN → (B)
Anh đề (A) "điều tra vì sao trello". Nhưng tôi đã diagnose XONG (idList confound) → 1a″ KHÔNG phải điều tra mở, mà là **1 phát XÁC NHẬN** rồi đóng:
- **1a″ = (1) sửa trello probe** (cho `idList` hợp lệ trong prompt, hoặc đổi probe sang tool nhận tên) **+ (2) +1 bare-write sạch khác** (gcal/gdrive, args đủ). Kỳ vọng cả hai **~100%@16 như gmail**.
- Nếu đúng (gần chắc) → artifact xác nhận **n≥3** → **HỦY slice subsetting + #1b chính thức.** KHÔNG dựng bge-m3 module (Rule 2 — quá tay cho 1 probe-artifact).
- Nếu BẤT NGỜ trello-fixed VẪN crater → mới mở điều tra sibling-confusion (xác suất thấp).

## 🔄 Đảo gate trước của tôi (intellectual honesty)
- **Connector-write-GA: GỠ CHẶN.** Justification (write crater) bị bác — gmail-write 100%@scale. KHÔNG bị chặn bởi selection. (Để mắt riêng `trello_create_card`.)
- **Subsetting slice + #1b → HỦY** (gated 1a″). Design bge-m3/spec → **archive** (giữ tham khảo nếu sau có write-class crater THẬT, probe-sạch).

## 2 actionable THẬT (thay subsetting)
1. 🔴 **`trello_create_card` cần name→idList resolution** — production user nói "board Sprint" KHÔNG có idList → tool fail/đòi ID. Gap UX thật (KHÔNG phải selection): cho tool nhận board/list **NAME** (resolve nội bộ qua trello list-lookup) HOẶC thêm resolve-step. → backlog `connectors-trello-name-resolution`. *(Cũng giải thích "crater" production: model đúng khi không bịa idList.)*
2. **Bài học eval-methodology** (→ decision memo): write-probe PHẢI đủ required-arg (no-call-do-thiếu-arg = **restraint**, KHÔNG phải selection-fail) + **≥2 write tool đa dạng** trước khi kết luận "write-class". 1 probe hỏng (trello-no-idList) đã lái nhiều phiên + suýt dựng module.

## Meta
Kỷ luật **đo-trước-khi-xây / verify-not-prose** (tôi ép từ gate đầu) = thứ GIẾT non-problem này TRƯỚC khi xây embedding module. Quy trình ĐÚNG, dù phải đảo nhiều gate — đó là cái giá đáng của đo-thật. Tốt vì ta dừng ở plan, chưa viết 1 dòng `src/` production cho subsetting.

→ Consultant: chạy **1a″** (trello-fixed-idList + gcal-valid) → ~100% thì tôi đóng slice + mở 2 backlog. — *CTO, 2026-06-08.*
