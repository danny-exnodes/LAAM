# SP-1 Foundation — Agent Harness (deep-dive spec)

> **Sub-project 1** của roadmap `docs/superpowers/specs/2026-06-04-agent-harness-architecture.md`.
> **Vai trò tài liệu:** spec chi tiết + **đóng băng hợp đồng** (contracts) mà SP-2/3/4 sẽ trích dẫn.
> **Ngày:** 2026-06-04 · **Chủ:** main session (claude) · **Trạng thái:** chờ user review → writing-plans.
> Serena: [[agent-harness-architecture]] · [[agent-harness-sp-analysis-plan]] · [[poc-model-choice]] · [[agent-ops-rules]].

---

## 1. Mục tiêu & phạm vi

**Mục tiêu:** trợ lý chat trả lời thông minh về **chính dữ liệu LAAM** (agent đang chạy/kẹt, chi phí token, máy) bằng cách cho model gọi **internal tools read-only**, đồng thời **lập hợp đồng các lớp** để SP-2/3/4 cắm vào.

**Trong phạm vi:** L0 orchestrator (tổng quát hoá `runToolRounds`) · L1 context động · L2 union schema + `dispatch` · L3 internal read tools · L4 guardrail tối thiểu.

**Ngoài phạm vi (defer):** write tools + gate (SP-2) · persist tool turns + summarize + proactive (SP-3) · stream tool events ra UI (SP-4) · đổi schema · smart-routing · viết lại connectors.

**Success criteria (verify được):**
1. Hỏi "những agent nào đang chạy?" / "agent nào đang kẹt?" / "token tiêu hôm nay?" → trả lời đúng số liệu lấy từ `agent_session` (không bịa).
2. `laam_get_agent` với id không tồn tại → trả "không tìm thấy" (không bịa — Rule 13).
3. Connector path cũ (vd "liệt kê repo GitHub") vẫn chạy như trước.
4. Logic harness ở `src/lib/agent/*` là **hàm thuần + DI**, test bằng vitest không cần Ollama/DB sống. Baseline **375 test xanh** + test mới cho L0–L4. `next build` xanh, `tsc` sạch.
5. Lỗi tool/Ollama → degrade về trả lời thường (fail-soft), **có log** (không nuốt im — Rule 12).

---

## 2. Hợp đồng đóng băng (CONTRACTS — SP-2/3/4 trích dẫn cái này)

> Đây là output quan trọng nhất của SP-1. Mọi thay đổi sau này phải round-trip về chủ SP-1 (Rule 7), không tự sửa.

```ts
// src/lib/agent/types.ts

// Ngữ cảnh chạy 1 tool. KHÔNG có creds (internal tools không cần) — thay vào đó
// có db + danh tính + thời gian (inject để test). Connectors tự quản creds riêng.
export type ToolContext = {
  userId: string;          // người đang chat (audit/RBAC); internal tools đọc dữ liệu DÙNG CHUNG
  now: number;             // epoch ms — inject, không gọi Date.now() trong core
  lang: string;            // 'vi' | 'en' | 'zh'
};

export type ToolKind = "read" | "write";   // SP-1: mọi internal tool = "read"

// Internal tool. `parameters` dùng ĐÚNG shape JSON-schema mà connector đang dùng
// (object/properties/required) để model thấy đồng nhất giữa internal & connector.
export type Tool = {
  name: string;            // tiền tố 'laam_' (vd laam_list_agents) — tránh trùng tên connector
  description: string;     // tiếng Việt, ngắn gọn, hướng dẫn model khi nào gọi
  parameters: object;      // JSON schema
  kind: ToolKind;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

// Trace 1 lượt tool (ANTICIPATE SP-4 — SP-1 chỉ thu thập, chưa stream ra UI).
export type ToolEvent =
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; ok: boolean; bytes: number };
```

```ts
// src/lib/agent/registry.ts  (L2)

// Schema model nhìn thấy = union(internal đã map sang ConnectorTool shape, connector tools).
export function modelToolSchemas(internal: Tool[], connectorTools: ConnectorTool[]): ConnectorTool[];

// ĐIỂM DISPATCH DUY NHẤT. Route theo tên: internal (có trong registry) → handler đã-guard;
// còn lại → connectors.execute(ctx.userId, name, args). Tool lạ → {error}.
export function makeDispatch(
  internal: Tool[],
  ctx: ToolContext,
  onEvent?: (e: ToolEvent) => void,
): (name: string, args: unknown) => Promise<unknown>;
```

```ts
// src/lib/agent/context.ts  (L1) — THUẦN
export function buildSystemPrompt(input: {
  lang: string; now: number; toolNames: string[]; base?: string;
}): string;
```

```ts
// src/lib/agent/orchestrator.ts  (L0) — tổng quát hoá runToolRounds, DI, THUẦN logic
export type ToolRoundsDeps = {
  callOllama: (messages: ChatMessage[], tools: ConnectorTool[]) => Promise<OllamaChatResponse>;
  dispatch: (name: string, args: unknown) => Promise<unknown>;   // = makeDispatch(...)
  onEvent?: (e: ToolEvent) => void;
};
export function runToolRounds(
  messages: ChatMessage[], tools: ConnectorTool[], deps: ToolRoundsDeps, maxRounds?: number,
): Promise<ChatMessage[]>;
```

```ts
// src/lib/agent/guardrails.ts  (L4)
export function validateArgs(parameters: object, args: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string };
export function boundOutput(result: unknown, maxBytes?: number): unknown;   // cắt/đánh dấu nếu quá lớn
export function guard(tool: Tool): Tool;   // bọc handler: validateArgs → run → boundOutput
```

**Khác biệt so với hiện tại:** `runToolRounds` đổi từ nhận `execute` sang nhận `dispatch` + thêm `onEvent` (tùy chọn). Chữ ký cũ `deps.execute` được thay bằng `deps.dispatch`; logic vòng lặp/bounded/echo tool-result **giữ nguyên**.

---

## 3. Thiết kế từng lớp

### L0 — Orchestrator (`src/lib/agent/orchestrator.ts`)
- **Chuyển** `runToolRounds` từ `src/app/api/chat/route.ts` sang đây, tổng quát hoá: `dispatch` thay `execute`, phát `onEvent` ở mỗi tool_call/tool_result.
- Giữ: bounded rounds (`maxRounds=4`), vòng tool **non-streaming**, vòng cuối ép text, echo `tool_calls` + `tool` result vào hội thoại.
- **Stream câu cuối + persist vẫn ở route** (plumbing I/O) — route gọi vào lib. Đây là mức "logic ở lib/agent, route điều phối I/O" (chưa phải route rỗng tuyệt đối; tinh gọn thêm để sau).

### L1 — Context (`src/lib/agent/context.ts`) — thuần
- `buildSystemPrompt`: persona LAAM (giữ chuỗi gốc làm `base`) + **ngày giờ thật** (từ `now`) + chỉ dẫn ngôn ngữ theo `lang` + 1 dòng liệt kê **tên tool đang có** ("Bạn có thể gọi: laam_list_agents, …").
- **Không** bơm số liệu live vào prompt (tránh +1 query và phình token trên model 16GB) → để model tự gọi `laam_*`. *(Open Q1: có bơm 1 dòng "đang có N agent chạy, M kẹt" không.)*

### L2 — Registry + dispatch (`src/lib/agent/registry.ts`)
- `INTERNAL_TOOLS: Tool[]` (đã `guard()` sẵn). `modelToolSchemas` ghép `[...internal→ConnectorTool, ...connectorTools]`.
- `makeDispatch`: tên ∈ internal registry → gọi handler đã-guard (truyền `ctx`); else → `connectors.execute(ctx.userId, name, args)`. Phát `onEvent`. Tool lạ → `{error}`. **Một chokepoint** cho L4.
- **Chống trùng tên:** internal tools tiền tố `laam_`; connector tools giữ tên gốc. Nếu vẫn trùng → internal thắng (log cảnh báo).

### L3 — Internal tools (`src/lib/agent/tools/laam/*.ts`, kind `read`)
Đọc dữ liệu **DÙNG CHUNG** (không user-scope — khớp Dashboard ai đăng nhập cũng xem). Nguồn = `agent_session` / `machine` + `lib/stats` + `lib/stuck`.

| Tool | Args | Trả về (compact) | Nguồn |
|---|---|---|---|
| `laam_list_agents` | `{status?, machineId?, limit?}` | mảng `{id, project, model, status, stuck, latestActivity, startedAt, durationMin, tokensIn, tokensOut, costUsd}` | `agent_session` + `isStuck(now, thr=10')` |
| `laam_get_agent` | `{id}` (required) | 1 phiên + `tools`/`subAgents`/`histo`; id sai → `{error:"không tìm thấy"}` | `agent_session` |
| `laam_query_stats` | `{}` | `computeStats(rows)`: KPI, cost-by-model, tokens-by-project, tool leaderboard | `lib/stats` (dùng lại mapping SessionRow của `/api/stats`) |
| `laam_list_machines` | `{}` | `{id, name, hostname, lastSeen, online}` | `machine` |
| `laam_find_stuck` | `{thresholdMin?}` (mặc định 10) | các phiên `isStuck` + `latestActivity` | `agent_session` + `isStuck` |

- **DB access:** handler đọc qua `db` import trực tiếp (như các route khác); để test thuần, tách phần truy vấn sau 1 hàm nhỏ hoặc inject `db` qua module mock (mirror cách test route hiện tại mock `@/db`). *(Quyết định D-SP1-4 bên dưới.)*
- **SessionRow mapping:** nếu `/api/stats` chưa export hàm map `agent_session → SessionRow`, SP-1 tách `toSessionRow()` dùng chung (surgical, không đổi shape).
- **Rule 13:** `laam_get_agent` kiểm tra id tồn tại trong DB trước khi trả; không bao giờ "dựng" phiên từ id model đưa.

### L4 — Guardrails tối thiểu (`src/lib/agent/guardrails.ts`)
- `validateArgs`: validator **tự viết, không thêm dep** (khớp tinh thần "no new deps" của `route.ts`). Kiểm: `args` là object; mỗi `properties` khai báo đúng kiểu cơ bản (string/number/boolean); `required` đủ. Thiếu/sai → `{ok:false,error}` → handler trả error thân thiện thay vì ném.
- `boundOutput`: serialize JSON, nếu > `maxBytes` (mặc định 8KB) → cắt + gắn `{_truncated:true}` (bảo vệ context model 16GB).
- `guard(tool)`: bọc `validateArgs → handler → boundOutput`, áp ngay khi dựng `INTERNAL_TOOLS` ⇒ dispatch luôn đi qua guard.
- **Defer SP-2:** ground-truth toàn diện + gate `kind:'write'` (SP-1 chưa có write tool).

---

## 4. Refactor `/api/chat/route.ts` (an toàn)
1. Import `buildSystemPrompt`, `INTERNAL_TOOLS`, `modelToolSchemas`, `makeDispatch`, `runToolRounds` từ `src/lib/agent`.
2. System prompt: thay chuỗi tĩnh `SYSTEM` bằng `buildSystemPrompt({lang, now, toolNames})` (lang đọc cookie `laam_lang`).
3. `tools` exposed cho model = `modelToolSchemas(INTERNAL_TOOLS, await chatTools(userId).catch(()=>[]))`.
4. `dispatch = makeDispatch(INTERNAL_TOOLS, {userId, now, lang}, onEvent)`; truyền vào `runToolRounds`.
5. Giữ nguyên: tạo/із conversation, persist user+assistant, stream câu cuối, fail-soft (lỗi tool-loop → stream từ payload gốc).
6. `onEvent` ở SP-1 = collector cục bộ (chưa stream ra UI; sẵn cho SP-4).

---

## 5. Test plan (vitest, mirror style hiện có — mock `@/auth`, `@/db`, `node:child_process`)
- `context.test.ts`: prompt chứa ngày, chỉ dẫn lang, tên tool; thuần.
- `guardrails.test.ts`: `validateArgs` chặn thiếu required / sai kiểu; `boundOutput` cắt khi quá ngưỡng (+ `_truncated`).
- `registry.test.ts`: `makeDispatch` route internal vs connector (mock `execute`), tool lạ → error, phát `onEvent`, ưu tiên internal khi trùng tên.
- `tools/laam/*.test.ts`: mỗi tool trả shape compact đúng với `db` giả; `isStuck` đúng ngưỡng; `get_agent` id sai → error (Rule 13).
- `orchestrator.test.ts`: mở rộng test `runToolRounds` hiện có — gọi `dispatch`, bounded, `onEvent` phát đủ.
- `route` (giữ test cũ + thêm): internal tools luôn có trong `tools` kể cả khi 0 connector; lỗi Ollama → 502 như cũ.

---

## 6. Decision log (SP-1)
- **D-SP1-1 ⚠️ SỬA nguyên tắc roadmap:** internal tools **luôn bật** ⇒ tool-loop chạy **mọi lượt chat** ⇒ nguyên tắc §2 roadmap "no-connector path bất biến" **không còn đúng**. Đây là chủ đích (đó chính là tính năng). *Hệ quả:* thêm ≥1 vòng non-streaming/lượt (độ trễ trên model local). **Chấp nhận ở SP-1**; tối ưu (gọi 1 lần streaming-kèm-tools để bỏ vòng thừa khi model không gọi tool) → **Open Q2 / ứng viên SP-2**. *(Surface theo Rule 7/12 — sẽ cập nhật lại §2 roadmap.)*
- **D-SP1-2:** Giữ pattern **vòng tool non-streaming + stream câu cuối** (đã test, đã chạy) thay vì đổi sang streaming-with-tools ngay — surgical, rủi ro thấp.
- **D-SP1-3:** Internal tools **không user-scope** (đọc monitoring dùng chung), khớp Dashboard. `ctx.userId` chỉ cho audit/RBAC sau. *(Open Q3: có gate RBAC cho read không — mặc định không.)*
- **D-SP1-4:** Tools đọc DB qua `db` import + tách hàm query nhỏ; test mock `@/db` (mirror `route.test.ts`). Không inject `db` vào `ToolContext` (giữ ctx gọn, serializable-ish cho SP-4).
- **D-SP1-5:** Tiền tố `laam_` cho internal tools (chống trùng + rõ nguồn).
- **D-SP1-6:** `now` inject vào core (không `Date.now()` trong hàm thuần) để test ổn định.

## 7. Open questions (chốt khi review / writing-plans)
- **Q1:** L1 có bơm 1 dòng "light state" (N chạy / M kẹt) vào system prompt không, hay để model tự gọi tool? (mặc định: không bơm.)
- **Q2:** Có làm tối ưu streaming-with-tools ngay trong SP-1 để né vòng thừa, hay để SP-2? (mặc định: để sau.)
- **Q3:** Read tools có cần gate theo role (viewer/member…) không? (mặc định: không, mọi user đăng nhập đọc được.)

## 8. Phụ thuộc & rủi ro
- Cần Ollama chạy + model hỗ trợ tool-calling (đã có, `qwen3-vl`). Không đổi hạ tầng/schema.
- Rủi ro: model local gọi tool kém ổn định → guardrail trả lỗi thân thiện + fail-soft giữ UX. Độ trễ thêm 1 vòng (D-SP1-1).
- Coordination: chỉ đụng `src/app/api/chat/route.ts` (backend) + thêm `src/lib/agent/*`. Không đụng `components/chat/*` (an toàn với session FE). Xem [[agent-harness-coordination]].
