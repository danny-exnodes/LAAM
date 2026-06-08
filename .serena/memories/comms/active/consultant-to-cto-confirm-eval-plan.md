# Consultant → CTO: GATE plan confirm-eval (slice #1a)

**Ngày:** 2026-06-08 · **Từ:** consultant · **Tới:** CTO · **Trạng thái:** 🔴 OPEN — xin gate trước `executing-plans`.

## Context
Spec design APPROVED (§13, R1–R5 đã fold). Plan slice #1a viết xong theo `writing-plans` (TDD, bite-sized).
**Plan:** `docs/superpowers/plans/2026-06-08-confirm-eval-knee.md` (5 task).
**Spec:** `docs/superpowers/specs/2026-06-08-tool-subsetting-design.md`.

## Plan honor spec/verdict thế nào
- **Đo-only, zero code `src/`, zero dep** — chỉ mở rộng `scripts/eval/` (đúng "measure-only" + agent-ops host-only).
- **Knee:** SIZES dày `[8,10,12,14,16]` → tìm điểm write bắt đầu sụp (gate 4 CTO: đo knee, không đoán).
- **Non-trello write-probe `gmail_send` BẮT BUỘC** (R/verdict 4): xác nhận lỗi-LỚP-write; nếu chỉ trello crater → chẩn đoán đổi (đã ghi nhánh báo CTO).
- **Multi-tool probe** (read+write cùng lượt, sharpening phụ): xác nhận cả hai lọt ≤ capK.
- **Resolver pure** tách ra `distractors.ts` + unit test trong `npm test` (graders/curve thuần test nhanh).
- T5 = host-run + đọc knee → **khoá `fallbackK = knee − margin`, `capK ≤ min(8, knee−margin)`** vào spec §6 (honor sharpening load-bearing: trần = f(knee), không hardcode 15).

## Quyết định tự chốt trong plan (xin CTO xác nhận)
1. **Tách slice #1a / #1b.** Plan này = **1a (scale-curve: knee + write-class)** — độc lập chạy được, ra knee. **`recall@K` + embedding-client + ca implicit/đa-ngữ ⇒ slice #1b (plan riêng).** Lý do: recall@K đo *retriever* (cần embedding client = mảnh slice #2); scale-curve đo *model selection* (thuần harness). Nhét chung buộc kéo embedding lên sớm + nhập nhằng "measure-only". **Q1: duyệt tách? và 1b làm NGAY (de-risk embedding trước khi dựng module) hay gộp vào slice #2 retriever?** *(đề xuất: 1b plan riêng, chạy ngay sau 1a — recall xác nhận "embedding tách được tool" TRƯỚC khi code production.)*
2. **Q2: run knee có giữ N=24/40 không?** *(đề xuất bỏ ở run knee — đã biết 0%, tiết kiệm k×probe lượt Ollama; full-run lại nếu cần.)*

## Xin CTO
Gate plan 1a (hoặc chỉnh). Sau gate: `executing-plans` T1→T5 (T1-4 = agent code+commit; **T5 host-run = user**, agent không chạy Ollama). Rồi consultant viết plan 1b chờ gate.

---
<!-- CTO: append verdict in-file (Serena comms protocol) -->
