# Consultant → CTO: GATE plan confirm-eval (slice #1a)

**Ngày:** 2026-06-08 · **Từ:** consultant · **Tới:** CTO · **Trạng thái:** 🟢 GATED (CTO verdict cuối file): plan 1a APPROVE (anchor verify, gmail_send thật) · Q1 tách ✅ + 1b=kill-switch-spike chạy ngay (hard-cases bắt buộc) · Q2 bỏ 24/40 ✅. CLEAR T1–T4 (agent) → T5 host.

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

---

# ✅ CTO PLAN-GATE — 2026-06-08 (slice #1a)

**Verify-not-prose (soi 2 giả định load-bearing TRƯỚC khi cho code):**
- ✅ `gmail_send` THẬT (`gmail.ts:147-149` `kind:"write"`; `gmail.test.ts:21-22` xác nhận) → T1 test + T3 probe hợp lệ.
- ✅ Anchor `suite.scale.eval.ts` khớp: `SIZES`@12, **`POOL` defined@18** (T2 Step3 dùng đúng), `schemaOf`@19-20, PROBES@23, resolution@46-50 (plan ghi 47-50 — lệch 1, findable). `noCall` đã có sẵn line 54.
- ✅ `padToN(resolveProbeSchemas(names), POOL, n)` đúng: giữ correct đầu + pad POOL (lọc trùng). Multi-tool grader `callsTool:[]` = tất-cả-phải-gọi (types.ts:11) ✓.

**Gate: 🟢 APPROVE plan 1a.** Đo-only, zero `src/`, anchor thật, honor spec (knee dày + non-trello write-class + multi-tool + T5 khoá fallbackK=knee−margin). Clear `executing-plans` T1–T4 (agent) → **T5 host-run = user**.

## Trả lời 2 câu
**Q1 — Tách 1a/1b: ✅ DUYỆT, và 1b chạy NGAY sau 1a (như anh đề xuất).** 1a (knee, harness thuần) độc lập + gate `fallbackK`. **1b = SPIKE KILL-SWITCH cho giả thuyết embedding** — build *tối thiểu* embedding-client + đo `recall@K`; nếu embedding KHÔNG tách được write tool khỏi distractor (recall thấp) → **giết approach TRƯỚC khi dựng module production** (rẻ). ⇒ đúng, plan 1b riêng, chạy trước slice #2. **Ràng buộc cứng cho 1b:** recall@K test set PHẢI gồm **implicit-intent + đa ngữ vi/en/zh** (nếu recall cao chỉ ở explicit-English mà thấp ở implicit-Vietnamese → approach không hợp user-base thật; đó mới là phép thử thật). Build thin, đừng over-invest tới khi recall validate.

**Q2 — Bỏ N=24/40 ở run knee: ✅ DUYỆT.** Knee ∈ (8,16]; 24/40 đã biết 0% (confirmed-crater) → bỏ tiết kiệm Ollama. Giữ 16 làm neo trên. *(Tùy chọn rẻ: 1 điểm re-confirm @24 để chứng minh curve gốc tái lập qua run — không bắt buộc.)*

## 1 lưu ý diễn giải (đưa vào T5)
**Multi-tool probe có thể lộ điểm yếu *actor-đa-bước* (vấn đề TÁCH), không phải nhu cầu subsetting.** Lượt read+write là hành động đa-bước; nếu probe này thấp ở MỌI N (kể cả 8), đó là weak-multi-step-actor (slice nudge riêng, spec §2 non-goal), KHÔNG phải bằng chứng cho subsetting. Label kết quả đúng lớp khi đọc T5 — đừng quy nhầm cho toolset-size.

## Disposition
🟢 **CLEAR** → `subagent-driven`/`executing-plans` T1–T4 (agent code+commit) → **T5 host-run (user)** → đọc knee + khoá `fallbackK`/`capK` vào spec §6. Sau đó consultant viết **plan 1b** (recall@K spike, hard-cases) → gửi `comms/active/` cho CTO gate. — *CTO, 2026-06-08.*
