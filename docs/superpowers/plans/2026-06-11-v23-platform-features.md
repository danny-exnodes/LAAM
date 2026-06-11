# v2.3 Platform Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Worktree: `.claude/worktrees/v23-features`, branch `feat/v2.3-platform`. Mỗi epic = chuỗi commit riêng, review 2 vòng per task. Nghiên cứu nền + phản biện 3 vai: `.claude/tmp/research-digest.txt` (6 studies + 3 critiques, evidence file:line đầy đủ).

**Goal:** 4 epic theo thứ tự PO: (A) responsive/nav reachability · (B) workflow patterns đợt-1 + structured-output · (C) Claude provider trong chat (merged spec) · (D) Google MCP = docs/backlog. Hạng mục "Claude Subscription per-user" KHÔNG build — xem Quyết định #1.

**Tech Stack:** như hiện trạng + `@anthropic-ai/sdk` (mới, Epic C).

---

## QUYẾT ĐỊNH THIẾT KẾ (đã qua panel phản biện security-tos / pragmatist / product)

1. **Claude Subscription per-user trong LAAM: KHÔNG BUILD.** Verified qua web (4 nguồn độc lập + Claude Help Center): từ 09/01/2026 Anthropic chặn server-side subscription-OAuth khỏi Messages API; ToS 19/02/2026 cấm dùng OAuth Free/Pro/Max trong third-party tools KỂ CẢ Agent SDK; 15/06/2026 SDK/headless chuyển sang credit pool riêng per-user, cấm share. → Mọi biến thể "user authorize tài khoản Claude subscription cho LAAM" đều vi phạm ToS hoặc bị chặn kỹ thuật. Phương án thay thế hợp lệ: **Messages API với org API key** (env, server-only) — Epic C. Per-user BYOK = backlog (chỉ khi cần billing attribution). KHÔNG dùng Agent-SDK-subprocess (3/6 risk của hướng đó là tự gây ra; Messages API đủ). KHÔNG build "shared host key fallback" UI riêng — org key trong env LÀ setup mặc định nội bộ.
2. **Spec Claude provider = chat-arch-serena làm gốc ⊕ phasing của model-switch.** Canonical = convo-shape nội bộ hiện tại; mọi dịch thuật trong adapter biên. `id` optional thêm vào tool_call shape (THẮNG map-theo-thứ-tự — Rule 13). MVS KHÔNG tools/vision cho Claude.
3. **PIN mới (ghi memory): workflow/scheduled runs CHỈ chạy model local.** Field `model` trên WfAgentNode tiếp tục ngủ. Kích hoạt cloud trong workflow cần decision riêng + budget.
4. **Gate "write-subsetting 🔴" đã RESOLVED 06-11** — điều kiện đúng cho tools-trên-Claude là "eval k≥6 re-run trên Claude" (~$2-3 Sonnet), không phải gate cũ.
5. **Judge template phải dùng structured-output** (`format` JSON-schema trên agent node) + condition `eq` trên field enum — KHÔNG `contains("PASS")` trên free-text 8B.
6. **Cost-labeling UX nằm trong MVS** Epic C: optgroup ghi rõ "Claude API — tính phí token vào key org, KHÔNG đụng subscription cá nhân"; quy đổi $ hiển thị từ frame tokens.
7. **Backlog mới (không thuộc plan này):** per-user HKDF/KMS cho connector crypto (global key = blast radius 50 cred); SSRF DNS-rebind nâng severity trung; nav labels English vs i18n → cần decision của user.

---

## EPIC A — Responsive + Nav reachability (~1 ngày)

### Task A1: Mobile reachability + active-state
**Files:** `src/components/settings/SettingsMenu.tsx` (thêm 2 row Monitoring + Graph vào SettingsCard 'servers', cạnh row /eval dòng ~56, pattern y hệt) · `src/i18n/dictionaries/settings.ts` (key mới `menu.monitoring`/`menu.graph` vi/en/zh — đọc dict thật để khớp naming) · `src/components/app-header.tsx:79` (active-check `current === n.href` → `current === n.href || current.startsWith(n.href + "/")` khớp bottom-nav.tsx:37).
**Test:** SettingsMenu test hiện có (nếu có) + assertion 2 row mới; app-header active-state test (render với pathname `/settings/machines` → tab Settings active).

### Task A2: Bottom-nav che canvas/content (3 trang)
**Files:**
- `src/components/eval/EvalClient.tsx:16` → `px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8`; dòng 13 `p-6` → `p-4 sm:p-6`.
- `/graph` + workflow editor: KHÔNG pad wrapper (tạo dải hở nền canvas) — thêm CSS scoped mobile: `.react-flow__controls { bottom: calc(3.5rem + env(safe-area-inset-bottom)) }` dưới `@media (max-width: 767px)` trong `src/app/workflow-editor.css` (hoặc css file graph dùng — Grep `react-flow__controls` để tìm đúng chỗ); graph/page.tsx:86 `p-6` → `p-4 sm:p-6` (chỉ padding, giữ h-dvh).
- Editor bottom-sheet `WorkflowEditor.tsx:1241` thêm `pb-[env(safe-area-inset-bottom)]`.
**Verify trước khi sửa top-bar:** đo DevTools 380px (chrome-devtools MCP, main session làm — implementer chỉ sửa khi có ảnh xác nhận tràn): nếu tràn → text label các nút ✨AI/Review/Test bọc `hidden sm:inline` (pattern /chat).

### Task A3: Xoá `/ui-preview` (file tự khai throwaway) — xoá route + grep reference. Xác nhận không có link nào trỏ tới.

---

## EPIC B — Workflow patterns đợt-1 (reordered theo phản biện)

### Task B1: Structured output cho agent node (enabler — LÀM TRƯỚC template)
**Files:** `src/lib/workflow/types.ts` (WfAgentNode + field optional `format?: Record<string, unknown>` — JSON-schema, additive đúng đường G1) · `src/lib/workflow/executors.ts` (runAgentNode: nếu node.format → truyền `format` vào call Ollama cuối + `JSON.parse` output, fail-loud + 1 self-repair retry đúng pattern coerceGraph trong generate.ts) · `src/lib/workflow/validate.ts` (format nếu có phải là object) · editor `NodeConfigPanel` (textarea JSON schema, optional, validate khi save) · `coerceGraph`/`GRAPH_FORMAT` trong generate.ts biết field mới · i18n 3 ngữ. Checklist trọn gói kind-mới như G1 đã làm (types→validate→engine→generate→editor→i18n→test).
**Test (TDD):** executors test — node có format trả JSON đúng schema → output là object parse được; model trả rác → retry 1 lần → fail-loud với message rõ.

### Task B2: 2 seed template + doc idiom
**Files:** nơi seed templates hiện có (Grep `template` trong src/lib/workflow hoặc src/app/api/workflows — đọc cấu trúc template TRƯỚC).
- Template "Digest có kiểm chứng": agent tóm tắt agent_sessions hôm qua (laam read tools) → agent judge `format: {verdict: enum[PASS,FAIL], reason: string}` → condition `eq` trên `{{steps.judge.output.verdict}}` == `PASS` → connector node ĐỂ TRỐNG/Demo (PIN: seed template KHÔNG hardcode write thật).
- Template "Triage theo lịch": schedule recurrence + condition guard đầu graph.
- `generate.ts` buildCatalog/system prompt: thêm 3 idiom (judge-verify, classify nhị phân bằng chuỗi condition, pipeline per-item bằng foreach body) để AI-builder tự đề xuất.
**Ghi memory:** PIN "workflow = local model only" vào decisions/workflow-orchestration-architecture.md (append) hoặc decision mới.

### KHÔNG LÀM (ghi vào plan để khỏi creep): switch node (chuỗi condition đủ, chưa có use-case), loop node (schedule-loop đủ; kích hoạt khi có use-case poll-trong-run cụ thể), parallel foreach (cần iterIndex migration — pattern có sẵn ở workflow_node_idempotency khi cần), DAG/tournament/runtime-spawn (vi phạm PIN #3/D4).

---

## EPIC C — Claude provider (merged spec, MVS trước)

### Task C1: Provider interface + Anthropic adapter (MVS = chat thường + stream)
**Files mới:** `src/lib/llm/provider.ts` (interface ChatProvider: chatOnce/chatStream/usage — convo-shape nội bộ làm tham số, KHÔNG đổi shape) · `src/lib/llm/claude.ts` (adapter `@anthropic-ai/sdk`):
- messages: system messages[0]→param `system`; history user/assistant pass-through; (MVS chưa có tool messages).
- options whitelist: CHỈ `max_tokens` (16000 stream; lý do drop temperature/top_p: tránh phân nhánh Sonnet/Opus — Opus 4.7+ reject), KHÔNG num_ctx/presence_penalty.
- stream: `client.messages.stream()` → `content_block_delta.text_delta` yield delta; usage từ finalMessage → `{in: input_tokens, out: output_tokens}`.
- typed errors: Anthropic.AuthenticationError/RateLimitError/OverloadedError/APIConnectionError → message i18n, KHÔNG string-match.
**Files sửa:** `src/app/api/chat/route.ts`:
- `isClaude(model) = model.startsWith('claude-')`; whitelist CHẶT: chỉ nhận `claude-sonnet-4-6` | `claude-opus-4-8` (yêu cầu user: chỉ Sonnet+Opus) — model claude khác → 400.
- Nhánh Claude trong streamMainTurn: BỎ runToolRounds (tools rỗng — Claude "chưa hỗ trợ công cụ" ở MVS), gọi adapter chatStream đổ vào controller hiện có, emit frame `{t:"tokens"}` y hệt; write-claim-guard F1 + persist + summary flow giữ nguyên.
- **BẮT BUỘC TRONG MVS (bug chắc chắn nếu quên):** `callModelText` (summarize SP-3, route.ts:824-833 + call-site :249) PIN vào Ollama `MODEL` env — không nhận model user chọn.
- handleConfirm: thêm field `model` optional vào payload sealPendingWrite (resume narrate đúng provider; resume text-only nên với Claude-MVS = dùng adapter chatStream).
- env: `ANTHROPIC_API_KEY` (server-only; thiếu → /api/chat/info không quảng cáo claude models). `.env.example` + DEPLOYMENT.md ghi chú.
**Contract tests (chống thoái hoá — từ phản biện):** (1) provider Claude + write tool → PendingWriteSignal vẫn thoát tới route (test orchestrator giữ dispatch không try/catch); (2) tools body gửi Anthropic không chứa field `kind`; (3) model lạ `claude-haiku-*` → 400.

### Task C2: UI switch + cost labeling (MVS)
**Files:** `/api/chat/info` trả thêm `claudeModels: []` chỉ khi có key · `SettingsPanel.tsx` optgroup "Local (Ollama) — $0" / "Claude API — tính phí token (key org, không đụng subscription cá nhân)" · khi đang chọn claude: 1 dòng note dưới composer "Claude chưa dùng được công cụ/laam_* — sẽ trả lời không có dữ liệu nội bộ" + quy đổi $ cạnh token count (giá hardcode const PRICING với comment nguồn + ngày; Sonnet $3/$15, Opus $5/$25 per MTok) · i18n vi/en/zh đầy đủ.
**Test:** info route có/không key; SettingsPanel render optgroup; note hiển thị khi model claude.

### Task C3 (FULL — TÁCH RIÊNG, chỉ sau khi MVS chạy + user duyệt chi phí eval): tools qua adapter chatOnce (tool_use_id ↔ CanonToolCall.id additive; nudge QW-3 orphan → user message; strip kind), vision mime channel, eval k≥6 re-run. KHÔNG nằm trong đợt commit này — ghi backlog.

---

## EPIC D — Google MCP: docs + backlog (KHÔNG code connector mới)

**Việc thật:** (1) README section "Mount MCP server ngoài" (tính năng P6 e3e7ed0 ĐÃ SHIP — user chưa biết); (2) backlog `google-mcp-official-poc.md`: điều kiện kích hoạt A1 (enroll Workspace Developer Preview bằng account nào? official MCP có nhận PKCE access-token thường không? — kill-switch nếu đòi DCR; chỉ PoC timebox 1 ngày trên nhánh vứt đi khi có ≥1 tool MCP mà REST thiếu); (3) backlog `connectors-crypto-hkdf.md` (global key → per-user HKDF) + nâng severity SSRF DNS-rebind trong backlog sẵn có; (4) KHÔNG thay Google REST (mất gmail_send đã gate; official MCP đang preview, không send).

---

## Verify & bàn giao
- Full vitest + tsc sau mỗi epic; visual verify Epic A trên :3100 sau merge (chrome-devtools, 390px).
- Mỗi epic 1 cụm commit; cuối cùng final whole-branch review; merge khi xanh (user đã giao toàn quyền tới hoàn thiện); CHANGELOG [Unreleased]; checkpoint + decision memories (claude-subscription verdict, workflow PIN, provider design).
- Báo cáo cuối cho user: bằng chứng ToS mục 2 + các lựa chọn nếu vẫn muốn subscription-path (chỉ còn: mỗi dev dùng Claude Code của họ, LAAM monitor — đó chính là sản phẩm hiện tại).
