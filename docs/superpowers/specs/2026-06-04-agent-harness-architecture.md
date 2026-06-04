# Agent Harness — Kiến trúc & Roadmap (tổng quát)

> **Loại tài liệu:** Architecture + roadmap ở mức cao (không đi sâu từng lớp).
> Mục đích: để các session/agent đang làm song song nắm **hướng chung** trước khi
> đào sâu. Mỗi sub-project (SP-x) sẽ có spec → plan riêng sau.
>
> **Ngày:** 2026-06-04 · **Vai trò:** technical consultant · **Trạng thái:** chờ user review.
>
> Liên quan Serena: [[poc-model-choice]] · [[v2-architecture]] · [[v2-app]] · [[agent-ops-rules]].

---

## 1. Bối cảnh & hiện trạng

LAAM đã có một "harness" tối giản trong `/api/chat` + `src/lib/connectors/*`:

| Lớp hiện có | Chi tiết (đọc từ code) |
|---|---|
| **Model** | 1 model Ollama `qwen3-vl:8b-instruct-q8_0`; `buildOllamaPayload()` thuần; stream text câu trả lời. |
| **Tool-loop** | `runToolRounds(messages, tools, deps, maxRounds=4)` — vòng **non-streaming**, native tool-calling của Ollama (`tools[]`→`tool_calls`→`execute()`→feed lại), vòng cuối ép text. **Fail-soft**. |
| **Tools** | **Chỉ connectors ngoài**: demo/github/trello/jira/gdrive/gcal/gmail. User-scoped, cred AES-256-GCM. Hợp đồng `ConnectorTool{type:'function',function:{name,description,parameters}}`. |
| **Dispatch** | `execute(userId, toolName, args)` → `TOOL_OWNER[name]` → `def.handlers[name](args, creds)`. |
| **System prompt** | 1 chuỗi tĩnh ngắn. Không context động. |
| **Memory** | `chat_conversations` + `chat_messages` (per-user). **Tool turn KHÔNG được lưu** — chỉ lưu text assistant cuối. |

### Sáu khoảng trống (lý do cần harness)

1. 🔴 **AI mù với chính dữ liệu LAAM.** Không tool nào trỏ vào `agent_sessions`/`stats`/`machines`. Trợ lý không trả lời được "agent nào đang chạy/kẹt?", "token hôm nay?" — nghịch lý cho một tool *giám sát agent*.
2. 🟠 **Thiếu lớp context-assembly.** System prompt không bơm trạng thái hệ thống / ngày giờ / ngôn ngữ / danh sách tool đang bật.
3. 🟠 **Thiếu guardrail/validation** cho tool args & output (AGENTS.md Rule 13).
4. 🟡 **Chưa có vòng lặp agent thực thụ** (plan→act→observe→reflect); không phân biệt tool *đọc* vs *ghi*; không xác nhận hành động ghi.
5. 🟡 **UI không thấy tiến trình tool** (ẩn trong vòng non-streaming).
6. 🟡 **Chưa có memory/retrieval** ngoài lịch sử thô.

---

## 2. Nguyên tắc thiết kế (bám AGENTS.md / CLAUDE.md)

- **Pure + testable cores.** Logic harness là hàm thuần (như `buildOllamaPayload`/`runToolRounds` hiện tại), DI cho I/O → test bằng vitest, không cần Ollama/DB sống.
- **Fail-soft mặc định.** Lỗi tool/Ollama → degrade về trả lời thường, không hard-fail (giữ hành vi hiện tại). Nhưng **fail loud trong log/telemetry** (Rule 12) — không nuốt lỗi im lặng.
- **~~No-connector path bất biến~~ → SỬA bởi SP-1 (D-SP1-1).** Ban đầu chủ trương: khi user chưa bật tool nào, đường stream + persistence giữ byte-for-byte. **Nhưng** internal tools (L3) *luôn bật* nên tool-loop chạy mọi lượt chat — nguyên tắc này không còn áp dụng. Thay bằng: **connector path & UX streaming giữ nguyên hành vi**; chấp nhận thêm ~1 vòng non-streaming/lượt (tối ưu streaming-with-tools để sau). Xem `2026-06-04-agent-harness-sp1-foundation-design.md` §6.
- **Rule 13 — trust code over LLM.** ID/tên/exact string mà tool trả: ground lại từ DB trước khi dùng/persist; hoặc cho model tham chiếu theo index, code map lại.
- **Surgical, match conventions.** Không viết lại connectors. Tách module mới `src/lib/agent/*`, không phình `/api/chat`.
- **Read trước Write.** Internal tools **read-only** trước; write + safety là sub-project sau.

---

## 3. Kiến trúc 6 lớp

```
┌─────────────────────────────────────────────────────────────┐
│ L6  UX feedback   — stream tool events → UI, citations        │  cần phối hợp FE
├─────────────────────────────────────────────────────────────┤
│ L5  Memory        — persist tool turns, summarize history      │
├─────────────────────────────────────────────────────────────┤
│ L4  Guardrails    — validate args · ground ID(Rule13) · gate W │
├─────────────────────────────────────────────────────────────┤
│ L3  Internal tools— agent_sessions / stats / machines …        │  lấp nghịch lý lớn nhất
├─────────────────────────────────────────────────────────────┤
│ L2  Tool dispatch — union schema (internal + connector), route │  hợp đồng chung
├─────────────────────────────────────────────────────────────┤
│ L1  Context       — persona + date/lang + state + tool list    │
├─────────────────────────────────────────────────────────────┤
│ L0  Orchestrator  — plan→act→observe loop, stream, persist      │  tổng quát hoá runToolRounds
└─────────────────────────────────────────────────────────────┘
  Connectors hiện tại  →  GIỮ NGUYÊN, route qua L2 (không viết lại)
```

> Mỗi lớp dưới đây ghi ở mức **hợp đồng** (trách nhiệm · in/out · phụ thuộc · file dự kiến). Chữ ký cụ thể chốt trong spec của từng SP.

### L0 — Agent Orchestrator
- **Trách nhiệm:** điều phối 1 lượt chat: lấy context (L1) → vòng plan/act/observe (gọi model, nếu có tool_call thì dispatch qua L2+L4, feed lại) → stream câu cuối → persist.
- **In/out:** in `{userId, conversationId, body, history}`; out `ReadableStream` text + side-effect persist.
- **Phụ thuộc:** L1, L2, (L4 bọc dispatch), Ollama client.
- **File dự kiến:** `src/lib/agent/orchestrator.ts` (thuần, DI), `runToolRounds` chuyển/ tổng quát hoá vào đây. `/api/chat/route.ts` co lại thành adapter HTTP mỏng.
- **Giữ:** bounded rounds, non-streaming tool rounds + stream câu cuối, fail-soft.

### L1 — Context Assembly
- **Trách nhiệm:** dựng system prompt động + ngữ cảnh đầu lượt.
- **In/out:** in `{userId, lang, now, enabledTools, lightState?}`; out `messages[0]` (system) + optional context block. **Thuần.**
- **Ghi chú:** persona LAAM; ngày giờ thật; ngôn ngữ theo `laam_lang`; liệt kê tool đang bật; (tuỳ chọn) "light state" tóm tắt (số agent đang chạy, #stuck) để model chủ động.
- **File dự kiến:** `src/lib/agent/context.ts`.

### L2 — Tool Dispatch (union + route) — *quyết định kiến trúc, xem §6*
- **Trách nhiệm:** (a) ghép **model-facing schema** = `[...internalSchemas, ...connectorTools(userId)]`; (b) **một** hàm `dispatch(ctx, name, args)` route: internal → `tool.handler(args, ctx)`; còn lại → `connectors.execute(userId, name, args)`.
- **Hợp đồng internal Tool:** `Tool{ name, description, parameters, kind:'read'|'write', handler(args, ctx) }` với `ctx{ userId, db, now, lang }`.
- **Phụ thuộc:** L3 (internal registry), `lib/connectors` (giữ nguyên).
- **File dự kiến:** `src/lib/agent/tools/registry.ts` (internal registry + union + dispatch).

### L3 — Internal Tools (domain LAAM, read-only ở SP-1)
- **Trách nhiệm:** phơi dữ liệu LAAM cho model qua tool. Ứng viên (map dữ liệu thật):
  - `list_agents({status?, machineId?})` → từ `agent_sessions` (+ `isStuck` từ `src/lib/stuck.ts`).
  - `get_agent({id})` → 1 phiên (tools/subAgents/histo jsonb, transcriptPath).
  - `query_stats({window?})` → `computeStats(sessions)` (`src/lib/stats.ts`): KPI, cost-by-model, tokens-by-project, tool leaderboard.
  - `list_machines()` → `machines`.
  - `find_stuck()` → các phiên đang kẹt.
- **Phụ thuộc:** `db`, `lib/stats`, `lib/stuck`, `lib/monitoring`.
- **File dự kiến:** `src/lib/agent/tools/laam/*.ts`.
- **Rule 13:** kết quả luôn ground từ DB; nếu model nhắc id/tên, đối chiếu lại trước khi persist.

### L4 — Guardrails
- **Trách nhiệm:** bọc đúng 1 chokepoint `dispatch`: validate args theo `parameters` (JSON schema); chặn/bound output size; **ground ID/tên** theo DB (Rule 13); với `kind:'write'` → cơ chế xác nhận (SP-2); redact secret.
- **File dự kiến:** `src/lib/agent/guardrails.ts`.

### L5 — Memory (sub-project sau)
- Persist tool turns (mở rộng `chat_messages` role `tool`/`tool_calls` jsonb — **đụng schema → migration**); summarize lịch sử dài; (tuỳ) retrieval. Để **SP-3**, tránh đụng schema sớm.

### L6 — UX Feedback (sub-project sau, phối hợp FE)
- Stream tool-call events (tool nào, args, trạng thái kết quả) ra `components/chat/*`; citations. Hiện tool rounds non-streaming nên cần kênh sự kiện riêng (SSE/stream multiplex). **Đụng chung chat UI → phối hợp session responsive FE.**

---

## 4. Build order (sub-projects)

| SP | Phạm vi | Lớp | Success criteria (mức cao) | Rủi ro |
|----|---------|-----|----------------------------|--------|
| **SP-1 Foundation** | Orchestrator tách `/api/chat`; context động; union+dispatch; internal read tools; guardrail tối thiểu (validate+ground) | L0,L1,L2,L3(read),L4(min) | "Liệt kê agent đang chạy / token hôm nay" trả lời đúng từ DB; no-connector & connector path cũ không đổi; test xanh (≥375 + mới); build xanh | Refactor `/api/chat` đụng đường stream |
| **SP-2 Actions & safety** | Phân loại read/write; gate xác nhận write; mở rộng guardrail; connectors đa bước | L4(full),L2 | Hành động write cần xác nhận; không write ngoài ý user; test | UX xác nhận; bảo mật |
| **SP-3 Memory & proactive** | Persist tool turns + summarize; lớp proactive (stuck/cost-spike → chủ động báo) | L5 + proactive | Hội thoại dài không vỡ context; cảnh báo proactive đúng | Migration schema; nhiễu cảnh báo |
| **SP-4 UX feedback** | Stream tool events ra UI; citations | L6 | User thấy tool đang chạy + nguồn | Phối hợp FE; đụng chat UI |

**Vì sao SP-1 trước:** vừa **lập hợp đồng các lớp** (mọi thứ sau cắm vào), vừa **lấp khoảng trống lớn nhất** (AI mù dữ liệu LAAM), lại **read-only rủi ro thấp**, **không đụng connectors đang chạy**.

---

## 5. Coordination (3 session song song)

- **File dùng chung nhạy cảm:** `src/app/api/chat/route.ts` (SP-1 refactor) và `src/components/chat/*` (SP-4). Session FE responsive có thể đụng `components/chat/*` → **trước SP-4 phải đồng bộ**; SP-1 chỉ đụng backend route nên rủi ro thấp.
- **Không đụng** Dockerfile/compose (session docker sở hữu). Harness không yêu cầu thay đổi hạ tầng; chỉ cần Ollama (đã chạy) + DB (đã chạy).
- **agent-ops-rules:** không tự chạy ngầm dev/build/docker — user tự host. Verify bằng test thuần + targeted, không khởi động service nếu chưa được phép.

---

## 6. Decision log (quyết định xuyên suốt)

| # | Quyết định | Lý do |
|---|-----------|-------|
| D1 | **L2 = hybrid dispatch hợp nhất, connectors GIỮ NGUYÊN.** Internal tools là module mới theo hợp đồng `Tool{...,kind,handler(args,ctx)}`; model thấy union schema; 1 hàm `dispatch` route internal-vs-connector; guardrail bọc đúng chokepoint này. | Rủi ro thấp nhất cho 375 test + connector đang chạy; internal vs external khác bản chất (cred) nên tách là trung thực; 1 chokepoint cho guardrail; đảo/gộp được sau. |
| D2 | **Orchestrator tổng quát hoá `runToolRounds`** vào `src/lib/agent/*` thuần; `/api/chat` thành adapter mỏng. Giữ bounded + tool-round non-streaming + stream câu cuối + fail-soft. | Tái dùng pattern đã test; giữ UX streaming; tách để test & mở rộng. |
| D3 | **Model giữ nguyên** `qwen3-vl:8b-instruct-q8_0` + native Ollama tool-calling, **không smart-routing**. | Đúng [[poc-model-choice]]; tool-caller đủ mạnh. |
| D4 | **Rule 13 là guardrail hạng nhất (L4).** | Tránh model bịa/chuẩn hoá ID/tên khi truy vấn dữ liệu LAAM. |
| D5 | **SP-1 KHÔNG đụng schema.** Persist tool turns để L5/SP-3. | Tách rủi ro migration khỏi lát cắt nền. |
| D6 | **Internal tools read-only trước**, write + gate ở SP-2. | An toàn; giá trị đến sớm với rủi ro thấp. |

---

## 7. Phi mục tiêu (YAGNI)

- Không smart-routing đa model; không multi-agent orchestration trong chat; không RAG/vector store ở SP-1; không viết lại connector framework; không thay đổi model/hạ tầng.

## 8. Open questions (chốt trong spec từng SP)

- Định dạng "light state" ở L1 (bơm bao nhiêu vào system prompt vs để model tự gọi tool).
- Persist tool turns: thêm role `tool` vào `chat_messages` hay bảng `chat_tool_calls` riêng (SP-3).
- Kênh stream tool events ở L6 (multiplex trên stream hiện tại vs SSE riêng).
- Cơ chế xác nhận write ở SP-2 (round-trip UI vs tool "dry-run + confirm").
