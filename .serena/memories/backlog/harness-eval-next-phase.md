# Backlog: Harness Eval — Phase tiếp theo (sau baseline 2026-06-05)

> Nguồn: baseline live `npm run eval` (k=5). Scorecard: `.serena/qa/eval-2026-06-05.md`. Checkpoint: `claude-harness-eval-2026-06-05`. Eval harness ở **PR #2** (`feat/harness-eval`). Decision: `decisions/harness-reliability-eval.md`.

## Baseline = thước nghiệm thu cho MỌI fix về sau
sel 86% · args 100% · ground 83% · restraint 100% · term 100% · **write-intent 0%** · rich-block 100%.
Internal read-tools ~100% · chart-render 100% · **geo-directions 0% DÙ tool đã inject**.

## Ưu tiên (CẬP NHẬT sau khi sửa scenario geo — số geo cũ là LỖI ĐO)
⚠️ **geo "0%" CŨ = lỗi đo** (scenario test phantom `geo_directions` tool). Đã sửa → đo ` ```map ` emission (đúng cơ chế client-resolve `geo-resolve.ts`, song song chart) → **geo 5/5**. ⇒ **F2 coi như ĐÓNG** (chart + map đều 5/5 nhờ RENDER_GUIDE từ fb05f05). **Slice "geo via skills" HUỶ — không còn lỗ hổng reliability để chữa.**

**Verdict phase Reliability/Eval: harness + 8B VỮNG TOÀN DIỆN.** sel/args/ground-read/restraint/term/chart/map đều **~100%**. Cái duy nhất "đỏ" = write-narration **0%** (model bịa "đã tạo" khi stub trả pending_write) → **xác nhận gate SP-2 cần thiết** (code-built preview, Rule 13) — GIỮ NGUYÊN, đừng nới.

### 🆕 Trang theo dõi eval cho nhà đầu tư — SPEC ĐÃ VIẾT (2026-06-05)
Spec: `docs/superpowers/specs/2026-06-05-eval-tracking-page-design.md`. Trang `/eval` DB-backed: bảng `eval_run` (migration **0004**) ← `suite.eval` persist best-effort (nhãn+gitSha mỗi run) · `src/lib/eval-stats.ts` (thuần, test) · page server-component (headline overallPct + recharts trend per-dimension + bảng scorecard + danh sách run) · i18n vi/en/zh + nav + auth. MVP (no PDF/drill-down). Plan: `docs/superpowers/plans/2026-06-05-eval-tracking-page.md` (8 task, TDD, code đầy đủ). **Chờ implement** (phiên tươi; **merge PR #2 trước** rồi branch từ main).

## Ưu tiên capability (sau khi trang eval xong, hoặc song song)
1. 🟢 **Phase tiếp theo THẬT = capability expansion (thêm internal read-tools).** Nền chọn+ground ~100% → rủi ro thấp. Ứng viên: `get_timeline({agentId})` (có sẵn `/api/agents/[id]/timeline`), project drill-down, cross-machine compare. `search_transcript` cần port từ `v1-unported` trước. Mỗi tool kèm 1 scenario eval.
2. 🟡 GIỮ gate SP-2 (write-narration 0% đã xác nhận model không đáng tin để tự thuật write).
3. 🔵 (minor eval-hygiene) `write-intent-trello` trùng cột grounding (kéo ground xuống 83%; read-grounding thực = **100%**). Bỏ `finalNotContains` khỏi scenario này nếu muốn cột grounding đo đúng chỉ-grounding.

## Cách làm (mỗi slice — lặp như buổi 06-05)
Brainstorm → spec → plan → worktree → subagent-driven. **Vòng đo:** thêm/sửa → `npm run eval` → so baseline → chứng minh số dịch. Scenario mới vào `scripts/eval/scenarios/`.

## Lưu ý kỹ thuật
- Eval = **vitest project riêng** (`npm run eval`, host-only, cần Ollama). Graders/runner thuần → test trong `npm test`. Stub-output (không seed-DB), k=5 sampler prod.
- Plan deltas (code là chân lý): config Vitest-4 (`maxWorkers:1+isolate:false+passWithNoTests`), runner.test fake stateless, write-intent detail spacing.
- Khi merge PR #2: dọn 3 untracked doc dupes trong `main` (spec/plan/decision drafted pre-worktree). PR gồm cả `fb05f05`.
