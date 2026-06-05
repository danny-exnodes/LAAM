# Decision: Harness Reliability/Eval — live scorecard (lát 1)

**Ngày:** 2026-06-05 · **Vai trò:** technical consultant · **Trạng thái:** spec viết xong, chờ user review.

**Tài liệu đầy đủ:** `docs/superpowers/specs/2026-06-05-harness-reliability-eval-design.md` (taxonomy 6 chiều, kiến trúc, types, graders, runner, scorecard, bộ scenario, file layout). Memo này = pointer + chốt quyết định.

## Vấn đề
Core harness xong (SP-1→4, 498 test) nhưng **mọi test mock model** → độ tin cậy lớp model 8B KHÔNG được đo. Bằng chứng lỗi hành vi đã có: **F2** (0 call geo-tool — tool-selection), **F4** (title sinh từ blob — Rule 13). Unit-test mock không thể thấy lớp này.

## Hướng đã chốt (user: "reliability & eval trước, tùy bạn chọn hướng tốt nhất")
**Live scorecard, lát mỏng:** `npm run eval` (host) drive `runToolRounds` THẬT + Ollama sống + `dispatch` stub, chấm `convo[]` trả về theo 6 chiều, k-runs, ra `.serena/qa/eval-<date>.md`. **ĐO trước** — không sửa model/prompt ở lát này.

## Decision log
- **A** Stub tool-output, **không seed-DB** (tách "harness/query đúng" — đã unit-test — khỏi "model tin được"; grounding chấm nhờ sự-thật cố định).
- **B** k-runs (k=5) + pass-rate, **sampler PROD** (8B không tất định; variance = tín hiệu reliability; không ép temp=0).
- **C** Script `npm run eval` **riêng**, không trong `npm test` (hit Ollama sống → host-only, [[agent-ops-rules]]; giữ 498-test nhanh & tất định).
- **D** Runner = **vitest project riêng**, KHÔNG thêm `tsx` (zero devDep mới — [[harness-lockfile-hygiene]], lock đang dirty; tái dùng alias `@/` + TS transform).
- **E** Dim write = **stub thuần** (selection+args+không-bịa-success), không vòng confirm (gate→pending_write là harness tất định, đã unit-test; integration e2e sau).
- **F** Đưa ca **F2/chart vào dù biết fail** (baseline ~0% — Rule 12 fail loud: biến lỗ hổng vô hình thành con số bám theo được).

## Phi mục tiêu (lát này)
Không LLM-judge · không seed-DB · không replay/CI-gate (promote sau khi baseline ổn) · không vòng confirm e2e · không dogfood-dashboard · **KHÔNG fix F2** (→ phase tools/skills) · không thêm dependency.

## Liên quan
[[agent-harness-architecture]] · [[poc-model-choice]] · [[agent-ops-rules]] · [[chat-context-window]] · [[harness-lockfile-hygiene]]. Bằng chứng: checkpoint `qa-e2e-chat-2026-06-05`, backlog `chat-qa-functional-bugs`.

## Next
✅ Spec + **plan** đã viết: `docs/superpowers/plans/2026-06-05-harness-reliability-eval.md` (**14 task**, TDD, ~zero dep mới; graders/runner/report unit-test trong `npm test`, chỉ `suite.eval.ts` chạy live). Chờ user chốt: (1) cô lập (worktree/branch) (2) cách thực thi (subagent-driven / inline). ⚠️ Agent KHÔNG chạy `npm run eval` (cần Ollama sống → host/user, `agent-ops`).
