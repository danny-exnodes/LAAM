# Eval Harness — Reliability Scorecard cho Agent 8B (lát mỏng, live)

> **Loại:** Design spec — phase *Reliability & Eval*, lát cắt 1 (live scorecard).
> **Ngày:** 2026-06-05 · **Vai trò:** technical consultant · **Trạng thái:** chờ user review.
> **Liên quan Serena:** [[agent-harness-architecture]] · [[poc-model-choice]] · [[agent-ops-rules]] · [[poc-host-and-ollama-ops]] · [[chat-context-window]].
> **Bằng chứng lỗi:** `.serena/checkpoint/qa-e2e-chat-2026-06-05.md`, `backlog/chat-qa-functional-bugs.md` (F2, F4).

---

## 1. Bối cảnh & vấn đề

Core harness đã hoàn chỉnh trên `main` (SP-1→SP-4, 498 vitest). Nhưng:

- **498 test đều mock model** (`callOllama` là `vi.fn()`). Chúng đo *harness logic đúng chưa*, **không** đo *model 8B hành xử đúng không*. Toàn bộ độ tin cậy của lớp model hiện **không được đo**.
- **Đã có bằng chứng lỗi hành vi model** (QA E2E 2026-06-05):
  - **F2** — "Chỉ đường…" / "Vẽ biểu đồ…" → **0 call** geo-tool, không emit fenced `chart`/`map`. = lỗi **tool-selection / instruction-following**.
  - **F4** — title hội thoại = byte file đính kèm (`%PDF-1.3…`). = vi phạm **Rule 13** (LLM sinh chuỗi từ blob, không ground).
  - Hai lỗi này **không phải bug FE** — là hành vi model, thứ unit-test mock không thể thấy.
- Manual-QA (Claude-in-Chrome) **mù vùng** đúng chỗ cần đo: không tái hiện ổn định việc nổ tool, và "không có tool-call nào nổ" nên **không quan sát được** tool-trace/citations/write-gate.

**Cơ hội (kiến trúc đã trả công):** `runToolRounds` thuần + DI (`{callOllama, dispatch}`) và **trả về `convo[]` đầy đủ** (kể cả lượt `role:"tool"`). ⟹ eval = thay `callOllama` mock bằng Ollama thật + `dispatch` bằng stub có-sự-thật, rồi chấm `convo[]`. Phần khó nhất (bắt được trace) **đã có sẵn**.

---

## 2. Mục tiêu (lát cắt này) & phi mục tiêu

**Mục tiêu:** `npm run eval` (chạy trên host) → **scorecard** 6 chiều cốt lõi (+ rich-block phụ) × ~10 scenario, mỗi ô là **pass-rate qua k lần** + tokens/latency trung bình, lưu `.serena/qa/eval-<date>.md` (+ `.json`).

**Nguyên tắc:** **ĐO trước.** Lát này *không* sửa model/prompt/tool — chỉ thiết lập thước đo + baseline. Sửa ở phase sau (tools/skills) và dùng cùng scorecard để chứng minh tiến bộ.

**Phi mục tiêu (YAGNI):** không LLM-judge; không seed-DB integration; không replay/CI-gate (promote sau); không vòng confirm→execute end-to-end (integration eval sau); không dogfood-dashboard; **không thêm dependency mới** (dùng vitest sẵn có).

---

## 3. "Reliable" = đo 6 chiều cốt lõi + 1 phụ (taxonomy)

| # | Chiều | Câu hỏi | Nguồn chấm | Lỗi tương ứng |
|---|-------|---------|------------|----------------|
| 1 | **Tool-selection** | Gọi đúng tool khi cần? | dispatch call-log | F2 |
| 2 | **Args** | Tham số đúng (đặc biệt **id từ lượt trước**, không bịa)? | dispatch call-log | — |
| 3 | **Grounding (Rule 13)** | Câu cuối chứa giá trị thật từ tool-output, không bịa? | `convo` text cuối vs `toolStubs` | F4 |
| 4 | **Restraint** | KHÔNG gọi tool khi không cần (chào hỏi/chitchat)? | dispatch call-log | — |
| 5 | **Termination** | Dừng đúng, không lặp tới `maxRounds`? | số vòng trong `convo` | — |
| 6 | **Write-intent** | Nhờ hành động → gọi đúng write-tool, **không bịa "đã xong"**? | dispatch call-log + text cuối | (SP-2) |
| (7) | **Rich-block** *(instruction-following)* | Emit fenced ` ```chart `/` ```map ` khi phù hợp? | regex text cuối | F2 |

Vì `expect` của mỗi scenario lấy từ **`toolStubs` (sự thật do ta đặt)**, mọi assertion **tất định** — không cần LLM-judge.

---

## 4. Kiến trúc

```
.serena/qa/eval-<date>.md (+ .json)   ◄── scorecard (người đọc / baseline theo dõi)
        ▲
   report.ts (render md + json)
        ▲
  ┌─────┴──────────────────────────────────────────────────────┐
  │ runner  (vitest "eval" project, HOST-only, npm run eval)     │
  │  với mỗi scenario, lặp k lần:                                 │
  │   runToolRounds(                                              │
  │     buildMessages(scenario.input),                           │
  │     unionToolSchemas(scenario),       // schema THẬT model thấy│
  │     { callOllama: realOllama(prodPayload),  // Ollama sống   │
  │       dispatch: stubDispatch(scenario.toolStubs) },  // ghi log│
  │     maxRounds)                                                │
  │   → convo[] + dispatchLog  →  graders(6)  →  per-run result   │
  └──────────────────────────────────────────────────────────────┘
        ▲                              ▲
   scenarios/*.ts                  graders/*.ts
   (input + toolStubs + expect)    (6 chiều, hàm thuần tất định)
```

Bốn đơn vị tách bạch, mỗi cái 1 trách nhiệm rõ:
- **scenarios** — dữ liệu khai báo (input của user + output stub của tool + kỳ vọng). Không logic.
- **runner** — drive `runToolRounds` thật k lần, gom `convo[]` + `dispatchLog`. Không chấm.
- **graders** — hàm thuần `(trace, expect) → GraderResult` cho từng chiều. **Tự unit-test được** (không cần Ollama).
- **report** — tổng hợp pass-rate, render scorecard. Không chấm.

---

## 5. Hợp đồng dữ liệu (types — `scripts/eval/types.ts`)

```ts
// Khớp ToolRoundsDeps thật trong src/lib/agent/orchestrator.ts
type ToolStubs = Record<string /*toolName*/, unknown /*giá trị dispatch trả*/>;

type Expect = {
  callsTool?: string | string[];        // chiều 1: phải gọi (1 trong / tất cả)
  notCalls?: string[];                   // chiều 4: tuyệt đối không gọi
  args?: Record<string, (a: unknown) => boolean>;  // chiều 2: assertion args/tool
  finalContains?: string[];              // chiều 3: token sự-thật phải có ở câu cuối
  finalNotContains?: string[];           // chiều 3: không được bịa (vd id giả)
  maxRounds?: number;                    // chiều 5
  emitsBlock?: "chart" | "map";          // chiều 7
};

type Scenario = {
  id: string;
  capability: keyof typeof DIMENSIONS;   // gắn nhãn chiều chính (để nhóm scorecard)
  input: string;                          // tin user
  toolStubs?: ToolStubs;                  // output tool sẽ trả khi model gọi
  extraTools?: string[];                  // tool tạm đăng ký để đo (vd geo cho F2 baseline)
  expect: Expect;
};

type DispatchCall = { name: string; args: unknown };
type RunTrace = { convo: ChatMessage[]; calls: DispatchCall[]; rounds: number;
                  tokensIn?: number; tokensOut?: number; ms: number };
type GraderResult = { dim: string; pass: boolean; detail?: string };
type ScenarioScore = { id: string; capability: string;
                       perDim: Record<string, { passed: number; total: number }>;
                       avgMs: number; avgTokOut?: number };
```

---

## 6. Scenario format (ví dụ thật)

```ts
// scripts/eval/scenarios/read-tools.ts
export const stuckBasic: Scenario = {
  id: "stuck-basic", capability: "tool-selection",
  input: "Agent nào đang kẹt?",
  toolStubs: { find_stuck: [{ id: "a1", name: "agent-frontend", stuckSince: "2026-06-05T09:00:00Z" }] },
  expect: {
    callsTool: "find_stuck",
    notCalls: ["query_stats", "list_machines"],
    finalContains: ["agent-frontend"],   // ground từ stub
    finalNotContains: ["a1"],            // không lộ id thô (tuỳ chọn)
    maxRounds: 2,
  },
};

// scripts/eval/scenarios/write-gate.ts — dim 6 (stub thuần, không kéo SP-2)
export const writeIntent: Scenario = {
  id: "write-intent-trello", capability: "write-intent",
  input: "Tạo card Trello tên 'Fix login bug' trong board Sprint",
  toolStubs: { trello_create_card: { status: "pending_write" } },
  expect: {
    callsTool: "trello_create_card",
    args: { trello_create_card: (a: any) => typeof a?.name === "string" && /login/i.test(a.name) },
    finalNotContains: ["đã tạo", "đã xong", "created successfully"], // không bịa hoàn tất
  },
};
```

---

## 7. Graders (6 chiều, hàm thuần — `scripts/eval/graders/*`)

- **tool-selection** — `calls.map(c=>c.name)` ⊇ `callsTool`.
- **args** — với mỗi `(tool, fn)` trong `expect.args`, tồn tại `call.name===tool` và `fn(call.args)===true`.
- **grounding** — text assistant cuối **chứa mọi** `finalContains` và **không chứa** `finalNotContains` (so khớp đã chuẩn hoá lower/trim; số thì so token số).
- **restraint** — `calls` ∩ `notCalls` = ∅.
- **termination** — `rounds <= (expect.maxRounds ?? maxRounds)`.
- **write-intent** — đã gọi write-tool đúng args **và** câu cuối không khớp regex "đã hoàn tất".
- **rich-block** — regex fenced ` ```chart `/` ```map ` ở text cuối.

Grader chỉ chấm chiều mà `expect` có khai báo (scenario không khai báo `emitsBlock` thì bỏ qua chiều 7). Mỗi grader trả `{dim, pass, detail}` để scorecard giải thích vì sao trượt.

---

## 8. Runner (`scripts/eval/run.ts` + `runner.ts`)

- **Cơ chế chạy = vitest "eval" project riêng**, KHÔNG nằm trong `include` mặc định ⟹ `npm test` (498 test) **không** đụng. Script: `"eval": "vitest run --project eval"` (config `vitest.eval.config.ts`: `testTimeout` lớn, `pool` đơn luồng, chỉ match `scripts/eval/**`). **Lý do chọn (thay tsx):** zero devDep mới (tôn trọng `harness-lockfile-hygiene`), tái dùng alias `@/` + transform TS có sẵn.
- **`realOllama`** — dựng `callOllama: (messages, tools) => fetch(OLLAMA/api/chat, {model, messages, tools, stream:false, options:<sampler prod>})`. **Tái dùng** payload/model/sampler prod (`buildOllamaPayload` + cấu hình `chat-context-window`/`poc-model-choice`) để đo **đúng điều kiện thật**. *Định vị chính xác hàm prod ở phase plan* (hiện dựng trong route adapter, chưa export).
- **`stubDispatch(toolStubs)`** — `(name, args) => { log.push({name,args}); return toolStubs[name] ?? {} }`. Trả về cả hàm + `log`.
- **`unionToolSchemas(scenario)`** — schema model THẬT thấy = `[...internalReadSchemas, ...connectorSchemasMẫu, ...extraTools]`. Quan trọng cho realism của tool-selection (đúng "schema bloat" thực tế). Ca F2 nạp `extraTools:["geo_directions"]` (stub) để đo selection ngay cả khi tool đó **chưa có ở prod** → baseline.
- **k-runs** — mặc định `k=5` (cfg qua env `EVAL_K`), dùng **sampler prod** (KHÔNG ép temp=0 — đo độ tin cậy thật, variance là tín hiệu). Gom pass-rate `passed/total` mỗi chiều.
- **Ràng buộc (`agent-ops`):** host-only, **user tự chạy** (như `db:migrate`); không service ngầm; CLI cờ `--scenario=<id>` để chạy lẻ, `--k=N`.

---

## 9. Scorecard (`.serena/qa/eval-<date>.md`)

```
# Eval Scorecard — qwen3-vl:8b-instruct-q8_0 — 2026-06-05 (k=5)
Sampler: <prod> · Ollama: <host> · maxRounds=4 · tổng 10 scenario / 50 lần chạy

| Scenario            | Chiều chính   | sel | args | ground | restraint | term | write | block | avg ms | tok_out |
|---------------------|---------------|-----|------|--------|-----------|------|-------|-------|--------|---------|
| stuck-basic         | tool-selection| 5/5 | —    | 5/5    | 5/5       | 5/5  | —     | —     | 820    | 95      |
| tokens-today        | tool-selection| 4/5 | —    | 3/5 ⚠ | 5/5       | 5/5  | —     | —     | 910    | 120     |
| agent-detail        | args          | 5/5 | 2/5 ⚠| 2/5 ⚠ | —         | 4/5  | —     | —     | 1340   | 150     |
| geo-directions (F2) | tool-selection| 0/5 ✗| —   | —      | —         | —    | —     | 0/5 ✗| 760    | 80      |
| write-intent-trello | write-intent  | 5/5 | 5/5  | —      | —         | —    | 5/5   | —     | 880    | 60      |
| …                                                                                                      |
| **TỔNG (pass-rate)**|               | 78% | 64%  | 71%    | 100%      | 92%  | 100%  | 0%    |        |         |
```

Kèm mục **"Trượt & vì sao"** liệt kê `detail` từng lần trượt (vd "agent-detail: gọi `get_agent({id:'agent-frontend'})` — dùng **tên** làm id thay vì id `a1` từ lượt list"). Đây là đầu vào trực tiếp cho phase fix.

---

## 10. Bộ scenario hạt giống (~10, tôi tự chốt — user bổ sung sau khi chạy)

| id | chiều chính | input (rút gọn) | điểm nhấn |
|----|-------------|-----------------|-----------|
| `stuck-basic` | tool-selection | "Agent nào đang kẹt?" | `find_stuck` + ground tên |
| `tokens-today` | tool-selection | "Token tiêu hôm nay?" | `query_stats` + ground số — ca "AI mù dữ liệu LAAM" |
| `agent-detail` | args | "Chi tiết agent agent-frontend" | chuỗi `list_agents`→`get_agent({id thật})` — **ca khó nhất** |
| `machines-online` | tool-selection | "Máy nào đang online?" | `list_machines` |
| `greeting-restraint` | restraint | "Xin chào" | 0 tool |
| `chitchat-restraint` | restraint | "Bạn làm được gì?" | 0 tool (trả lời từ persona, không gọi tool) |
| `geo-directions` | tool-selection | "Chỉ đường Hồ Gươm → Văn Miếu" | F2 baseline (extraTools geo) |
| `chart-render` | rich-block | "Vẽ biểu đồ cột 12,19,9,15" | F2 baseline (`emitsBlock:"chart"`) |
| `write-intent-trello` | write-intent | "Tạo card Trello…" | dim 6, không bịa success |
| `loop-guard` | termination | hỏi mà `find_stuck` trả `[]` | phải dừng + trả lời "không có", không lặp |

---

## 11. Decision log

| # | Quyết định | Lý do |
|---|-----------|-------|
| A | **Stub tool-output, KHÔNG seed-DB.** Model thấy schema thật, output do ta đặt. | Tách "harness/query đúng chưa" (unit-test sẵn) khỏi "model tin được không" (eval). Sidestep flakiness DB. Grounding chấm được nhờ sự-thật cố định. |
| B | **k-runs (k=5) + pass-rate, sampler PROD.** | 8B không tất định; 1 lần = dối lòng. Variance chính là tín hiệu reliability. Đo điều kiện thật, không phải lab temp=0. |
| C | **Script riêng `npm run eval`, KHÔNG trong `npm test`.** | Hit Ollama sống ⟹ host-only (`agent-ops`). Giữ 498-test nhanh & tất định. |
| D | **Runner = vitest project riêng (không thêm `tsx`).** | Zero devDep mới (`harness-lockfile-hygiene` + lock đang dirty); tái dùng alias/TS transform; graders unit-test được. |
| E | **Dim-6 = stub thuần (selection+args+không-bịa), KHÔNG vòng confirm.** | Gate→pending_write là harness tất định (đã test). Giữ lát mỏng, integration eval sau. |
| F | **Đưa ca F2/chart vào dù biết fail (baseline 0%).** | Rule 12 (fail loud): biến lỗ hổng vô hình thành con số bám theo được qua các phase. |

---

## 12. Success criteria (lát cắt này XONG khi)

1. `npm run eval` chạy trên host, không service ngầm, không đụng `npm test`.
2. Sinh `.serena/qa/eval-<date>.md` + `.json` với **6 chiều cốt lõi + rich-block × 10 scenario**, mỗi ô pass-rate/k + avg ms/tok.
3. Mỗi lần trượt có `detail` giải thích (đủ để phase sau biết sửa gì).
4. Graders có **unit-test riêng** (chấm đúng trên trace giả) — eval-of-the-eval, chạy trong `npm test` (tất định, không cần Ollama).
5. Có **baseline số thật** cho F2 (kỳ vọng ~0%) và 5 internal tool.

---

## 13. Open questions / Future (chốt sau, KHÔNG trong lát này)

- **Promote → replay-gate:** snapshot trace các scenario quan trọng → assert tất định trong `npm test` (chống regression khi thêm tool). Khi nào: sau khi baseline ổn định.
- **Seed-DB integration eval:** chạy qua dispatch THẬT trên DB seed nhỏ → đo cả query + model.
- **Write end-to-end:** vòng `pending_write`→confirm→execute-1-lần (kéo SP-2 thật).
- **Dogfood:** harness tự ghi run vào pipeline transcript LAAM → hiện trong dashboard chính nó (observability sống).
- **LLM-judge** cho answer-quality mờ (cần judge mạnh hơn 8B / human).
- **Fix F2** (đăng ký geo-tool + dạy emit chart/map) → **phase tools/skills**, không phải phase này.

---

## 14. File layout (additive thuần)

```
scripts/eval/
  run.ts                 # entry: đọc scenarios, gọi runner, gọi report
  runner.ts              # drive runToolRounds k lần (real Ollama + stub dispatch)
  ollama.ts              # realOllama(prodPayload) — non-streaming callOllama
  stub-dispatch.ts       # stubDispatch(toolStubs) → {dispatch, log}
  union-tools.ts         # unionToolSchemas(scenario)
  types.ts               # Scenario/Expect/RunTrace/GraderResult/Scorecard
  report.ts              # render md + json → .serena/qa/
  graders/
    index.ts  tool-selection.ts  args.ts  grounding.ts
    restraint.ts  termination.ts  write-intent.ts  rich-block.ts
    *.test.ts            # unit-test graders (chạy trong npm test)
  scenarios/
    read-tools.ts  restraint.ts  rich-render.ts  write-gate.ts  termination.ts
vitest.eval.config.ts    # project "eval", chỉ match scripts/eval/**, timeout lớn
package.json             # +1 script "eval" (không thêm dependency)
```

## 15. Ràng buộc & coordination

- **Pure additive:** KHÔNG đụng `src/app/api/chat/route.ts`, `src/components/chat/*`, schema, connectors. Chỉ **đọc** `src/lib/agent/orchestrator.ts` (import `runToolRounds`) + tái dùng tool schema + payload prod.
- **`agent-ops`:** host-only, user tự chạy; agent chỉ viết code + verify bằng `npm test` (graders) — KHÔNG tự chạy `npm run eval` (cần Ollama sống).
- **Cô lập:** nên làm trên worktree/branch riêng (Phase 3 — Isolate) vì thêm thư mục + 1 script; merge ~zero-conflict (additive).
