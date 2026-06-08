# Checkpoint: consultant — 2026-06-08

## What was done
- Phân tích curve `eval:scale` 2026-06-08: **write selection sụp 100%@8→0%@16+** (CI non-overlap), read giữ 100%@40. Verified KHÔNG phải artifact (`padToN` giữ tool đích đầu pool). Chẩn đoán: 8B = reader đáng tin / actor đa-bước không đáng tin.
- Brainstorming tool-subsetting (3 quyết định lõi: embedding `bge-m3` / retrieve đồng nhất cap≤8 / fallback bounded dưới-vách).
- Viết spec + 2 lần CTO gate (design + spec-review), fold **R1–R5**. Sharpening load-bearing: **`fallbackK = knee − margin`, KHÔNG hardcode 15**.
- Viết plan **confirm-eval slice #1a** (5 task, đo-only, zero `src/`); tách **1b (recall@K+embedding)** thành plan riêng.
- Commit `37fbec7` (main): spec folds + plan 1a + comms plan-gate.

## Files changed
- `docs/superpowers/specs/2026-06-08-tool-subsetting-design.md` (R1–R5 folded)
- `docs/superpowers/plans/2026-06-08-confirm-eval-knee.md` (mới)
- `.serena/memories/comms/active/consultant-to-cto-confirm-eval-plan.md` (mới, 🔴 OPEN)
- (CTO đã commit trước: comms/resolved/consultant-to-cto-tool-subsetting-design.md, backlog/harness-write-tool-subsetting.md)

## Current state
- Spec design **CTO-APPROVED**. Plan 1a **chờ CTO plan-gate** (comms active).
- Connector-**write**-GA CHẶN trên tool-subsetting + eval-recovery; read-GA đi tiếp.
- Confabulation đã được runtime `write-claim-guard` + Confirm Card trung hoà (QA live) → slice này chỉ lo SELECTION.

## Next steps
- CTO gate plan 1a (2 câu mở: Q1 tách 1a/1b + 1b chạy ngay?, Q2 bỏ N=24/40 ở run knee?).
- Sau gate: `executing-plans` T1–T4 (agent code, **branch/worktree riêng**) → T5 `npm run eval:scale` (**HOST/user**, agent cấm chạy Ollama) → đọc knee → khoá `fallbackK`/`capK` vào spec §6.
- Rồi viết plan **1b** (embedding-client + recall@K + implicit/đa-ngữ) chờ gate.

## Blockers / Risks
- Live eval host-only (Ollama) — knee chưa đo được tới khi user chạy T5.
- Cược load-bearing (R4): `miss-rate(recall@K) ≪ crater-rate` — phải đo ở 1b, chưa chứng minh.

## Execution update — slice #1a T1–T4 DONE (branch `feat/confirm-eval-knee`)
- Plan 1a **CTO-gated** (`comms/resolved/consultant-to-cto-confirm-eval-plan.md`): Q1 tách 1a/1b ✅ (1b=kill-switch spike, hard-cases bắt buộc), Q2 bỏ 24/40 ✅.
- Commits: `b7af9ad` resolver (TDD 7/7) · `56fba25` knee SIZES [8,10,12,14,16] + probe `gmail_send` (write-class) + `multi-read-write`. `tsc` sạch.
- ⏳ **T5 BLOCKED on host:** user chạy `npm run eval:scale` (Ollama) → ghi `.serena/qa/eval-scale-2026-06-08.md` (đè bản 4-điểm cũ; bản cũ còn trong git).
- Sau T5: đọc knee (write + write-gmail) → khoá `fallbackK=knee−margin`/`capK` vào spec §6 → finish branch → viết **plan 1b** (recall@K spike).
- ⚠️ Đọc multi-tool đúng lớp (CTO): thấp ở MỌI N = weak-multi-step-actor (TÁCH), không phải subsetting.
