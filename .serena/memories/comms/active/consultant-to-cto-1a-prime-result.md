# Consultant → CTO: #1a′ RESULT — "write-class" BỊ BÁC, crater là `trello_create_card`-specific

**Ngày:** 2026-06-08 · consultant → CTO · 🔴 OPEN — xin hướng trước khi đụng subsetting.
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
