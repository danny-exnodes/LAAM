# Thiết kế: Workflow Engine song song (DAG) lấy cảm hứng ComfyUI

> Ngày: 2026-07-10 · Trạng thái: chốt để implement (1 PR) · Nguồn: biên bản "họp team"
> (Engine Architect · UX Lead · Demo/PM · Risk Reviewer → CTO synthesis).
>
> Phạm vi 1 PR = **engine song song opt-in** + **validator nới lỏng** + **template demo
> báo-cáo→email** + **điểm chạm UI P0**. Phần còn lại ở mục **Lộ trình**.

## 0. Quyết định phạm vi (chốt các open-questions của meeting)

Các quyết định điều hành cho PR này (Rule 2 Simplicity / Rule 3 Surgical):

| Câu hỏi mở | Quyết định cho PR này |
|---|---|
| Lưu cờ `parallel:true` ở đâu | **Field cấp-graph `parallel?: boolean` trong `WorkflowGraph`**. Cột `graph` là `jsonb` → **KHÔNG cần migration**. |
| Engine tuyến tính vs song song | **Giữ `walkGraph` nguyên vẹn cho graph tuyến tính** (mặc định). Chỉ khi `graph.parallel===true` mới đi scheduler DAG mới. Rủi ro cô lập, hoàn nguyên được. |
| `ref_not_ancestor` enforce ở đâu | **Chỉ khi `parallel:true`** (graph tuyến tính đã thỏa theo cấu trúc). Tránh phá graph cũ. |
| Wall-clock run timeout | **Hoãn (P2)**. Deadlock detector (thuần, tất định) đã đóng lỗ "join treo do prune-propagation lỗi"; call I/O treo do connector đã có timeout riêng (`AbortController`). Engine giữ thuần, không phụ thuộc `Date`. |
| Toggle `parallel` trong editor | **Có** — toggle nhỏ ở toolbar editor + set sẵn trong template. |
| Node skipped/pruned dimmed | **Hoãn P1** (demo là diamond thuần, KHÔNG có condition → không có nhánh prune vô hình). |
| `ollamaSem` / `ioSem` / width cap | Mặc định cụ thể: **agent(ollama)=2**, **io=6**, **fan-out width cap=12**, `maxConcurrency` tổng. |

## 1. Bối cảnh

Engine hiện tại (`src/lib/workflow/engine.ts` → `walkGraph`) **thuần tuyến tính**: đúng 1 start
(in-degree 0), một con trỏ `cur`, mỗi node đi **đúng một** cạnh ra, `await runNode` tuần tự.
`assertRunnable` (`validate.ts`) **từ chối** fan-in (>1 cạnh vào), fan-out (>1 cạnh ra trừ
condition true/false), yêu cầu đúng 1 start.

Nghịch lý cần gỡ: **editor React Flow đã cho người dùng vẽ DAG** (`addEdge` không chặn
fan-in/fan-out), nhưng khi chạy thì `assertRunnable` bác. Người dùng vẽ được thứ engine
không chạy được. Đây chính là năng lực **DAG đã bị hoãn** (`decisions/workflow-orchestration-architecture`
ghi rõ *"engine tuyến tính A0 → +condition/foreach (hoãn DAG)"*) — và là đúng thứ user cần:
**nhiều agent research/MCP chạy song song**.

Tài sản durable đã có và **tái dùng gần như nguyên vẹn**: snapshot-on-run, journal `run_step`
(`run.ts` `onStep` giữ `Map<nodeId,rowId>`), WAL ghi-idempotent (`idempotency.ts`,
`INSERT … ON CONFLICT DO NOTHING RETURNING` — vốn đã an toàn concurrency), crash-resume
(`resume.ts`/`resume-context.ts` dựng lại ctx **không phụ thuộc thứ tự** — điểm mạnh nhất cho
song song), scheduler cron, gate recipient allowlist (`recipient.ts`), gate connector-readiness
(`blast.ts`), RBAC route (`requireMutator`).

**Đã xác minh trên mã nguồn** (không phải suy đoán): cổng acyclic trong `assertRunnable`
(validate.ts:92-99) là DFS *thăm-lại-thì-throw*. Với diamond `brief→A, brief→B, A→join, B→join`,
`join` bị push 2 lần; lần pop thứ hai `seen.has(join)` → **throw "cycle" NHẦM** — chính là hình
dạng của demo. Ngược lại, `collectIssues` (validate.ts:192-205) đã có **bộ dò Kahn đúng**. ⟹
**Bắt buộc thay** cổng acyclic của `assertRunnable` bằng Kahn cho nhánh parallel.

## 2. Ý tưởng ComfyUI áp dụng (lấy gì, bỏ gì)

| Ý tưởng ComfyUI | Quyết định | Lý do |
|---|---|---|
| Thực thi DAG: nhánh độc lập chạy song song, node chạy khi đủ input | **LẤY (P0)** — lõi engine mới | Đúng mô hình; JS đơn luồng làm concurrency dễ kiểm soát |
| Highlight thực thi trực tiếp per-node | **LẤY (P0)** — vòng pulsing + chip đếm | SSE fan-in đã cho nhiều node cùng "running" MIỄN PHÍ |
| Kéo link ra khỏi slot → spawn node | **LẤY (P1)** | Cạnh của ta không có kiểu → "tương thích" = mọi kind, rẻ hơn ComfyUI |
| Group/lane container di chuyển | **BỎ** | Cần đổi schema graph; "Tidy" (longest-path) đã tách nhánh sẵn |
| Reroute node | **BỎ** | Không primitive React Flow; nhiễm graph engine |
| Bypass reroute-through | **BỎ**, thay **mute** (P2) | `steps[nodeId].output` không có hợp đồng passthrough theo kiểu |
| 40+ phím tắt | **Một phần (P2)**: Cmd/Ctrl+S, +D, F, `?` | Không nhồi 40 phím |
| Save/load JSON reproducible | **Đã có** (templates + snapshot-on-run) | — |

## 3. Kiến trúc engine song song

### 3.1 Nguyên tắc nền (chốt xung đột — Rule 7)

- **KHÔNG có data race bộ nhớ trên `ctx.steps`.** Node đơn luồng; `ctx.steps[nodeId]={output}`
  và vòng interpolate là atomic giữa hai `await`. **Không thêm mutex** (bác đề xuất mutex — sai
  mô hình). Hiểm họa thật là **thứ tự đọc logic**, không phải hỏng bộ nhớ.
- **`ctx.vars` phải branch-local** (copy-on-write mỗi nhánh); `ctx.steps` là kênh cross-branch
  DUY NHẤT. (foreach hiện đã copy vars per-iteration.)
- **"Mỗi node chỉ ghi key của mình" là CẦN, KHÔNG ĐỦ.** An toàn đến từ scheduler thiết lập
  *happens-before* bằng cách chờ upstream + **validator `ref_not_ancestor`** cho phía đọc.
- **Cờ opt-in `parallel:true` cấp graph.** Mặc định vẫn `walkGraph`. Validator nới lỏng +
  scheduler DAG CHỈ kích hoạt khi `parallel:true` → graph fan-in lưu sẵn vẫn báo lỗi tới khi
  opt-in tường minh.

### 3.2 Validator nới lỏng (`validate.ts`, chỉ nhánh `parallel:true`)

1. Cổng acyclic = **Kahn** (bê từ `collectIssues`). DFS revisit-throws và fan-in loại trừ nhau.
2. Reachability/orphan = **union DFS từ MỌI node in-degree-0**.
3. **Bỏ** reject fan-in + single-start. **Giữ**: id duy nhất, edge trỏ node tồn tại, acyclic
   (Kahn), no-orphan (union DFS), condition đúng cặp true+false, đệ quy foreach body.
4. **THÊM `ref_not_ancestor`**: mọi `{{steps.<ID>...}}` trong `prompt`/`args`/`items`/`when`
   phải **backward-reachable qua cạnh** từ node tham chiếu. Fail loud ở save+run. *Bất biến còn
   thiếu quan trọng nhất* — scheduler chờ theo CẠNH nhưng interpolate đọc theo THAM CHIẾU; trong
   DAG hai đồ thị phân kỳ. Thiếu nó demo sẽ **thỉnh thoảng email báo cáo trống mục mà không lỗi**.
5. **THÊM `concurrent_write`**: cấm WRITE node có anh-em WRITE chạy song song (write chỉ nằm
   **sau mọi join**). Về cấu trúc né bài toán "fail-stop không atomic cho write".
6. **THÊM fan-out width cap** (≤12 cạnh ra) chống tự-DoS.

`collectIssues` giữ **đồng bộ** với `assertRunnable` (drift-guard test) cho cả 2 nhánh.

### 3.3 Bộ lập lịch topological (`engine.ts` — `scheduleGraph`, dùng khi `parallel:true`)

- **Tri-state node**: `pending → done | pruned`. Node pruned ghi journal `'skipped'`.
- **Hai semaphore** (bác "một pool 6-8"): `ollamaSem`=2 (agent node — GPU cục bộ), `ioSem`=6
  (connector/mcp/foreach). `foreach` body vẫn **tuần tự** (dùng lại `walkGraph`).
- **seq toàn cục gán lúc DISPATCH**; ready-queue sắp theo `(topoRank, nodeId)` → concurrency=1
  tái tạo **thứ tự tuyến tính chính xác**; seq duy nhất + hợp lệ topo.
- **Fail-stop/cancel/budget HỢP TÁC**: cờ `aborted` dùng chung, kiểm trước mỗi dispatch VÀ
  trước mỗi write. `counter.steps++`+check là **điểm serialize đồng bộ** set `aborted` (KHÔNG
  raw-throw vào Promise.all). Khi `aborted`: ngừng dispatch, `await Promise.allSettled(inFlight)`
  để **drain**, rồi finalize `failed` (lỗi đầu tiên theo seq). Giữ WAL settle, không write đáp
  sau finalize, không idempotency row kẹt `claimed`.
- **Join** = bộ đếm cạnh-vào **resolved-hoặc-pruned** + prune-propagation. `remaining[m]--`;
  `activeIn[m]++` nếu active. `remaining===0`: `activeIn≥1`→enqueue; else `prune(m)` lan xuống.
- **Liveness (fail loud)**: deadlock detector — `inFlight` rỗng + `ready` rỗng + còn node
  reachable `pending` ⟹ **throw**. (Wall-clock timeout → Lộ trình P2.)
- **Lỗi từng phần**: **mặc định fail-stop, KHÔNG gửi mail**. v1 **không degrade**. Không âm
  thầm gửi báo cáo thiếu nguồn ra kênh ngoài (Rule 12).
- **Budget mềm** (±concurrency) + `maxConcurrency`.

### 3.4 Vì sao lớp durable sống sót gần nguyên vẹn

`run.ts` `onStep` `Map<nodeId,rowId>` đúng cho nodeId **phân biệt** chạy song song. `idempotency.ts`
đã concurrency-safe. `resume-context.rebuildContext` **không phụ thuộc thứ tự**. **Cổng tương
đương** (trước khi lật mặc định): replay mọi fixture tuyến tính/foreach/condition qua scheduler
mới ở concurrency=1, assert **byte-identical** journal + ctx. **Không xóa `walkGraph`** trong PR này.

## 4. UI/UX (P0 — đi kèm engine)

- **Sửa auto-pan giật (BUG)** `WorkflowEditor.tsx`: hiện `setCenter()` lên MỘT node running
  mỗi tick → viewport nhảy loạn khi nhiều node chạy. Fix: >1 running → `fitView(runningNodes)`
  một lần/lần chuyển trạng thái; giữ `setCenter` cho 1 runner (tuyến tính → byte-identical).
- **Vòng pulsing "running"** — class `wf-node-running` + `@keyframes` CSS. Fan-out N node tự sáng.
- **Chip "N đang chạy song song"** — `<Panel position="top-center">`, hiện khi `runningCount>1`.
- **Toggle `parallel`** ở toolbar editor.
- **i18n** vi/en/zh: `wf.run.parallelCount`, `wf.editor.parallelMode`, message
  `wf.validate.ref_not_ancestor` + `wf.validate.concurrent_write`.

## 5. Demo workflow (template ship kèm)

Template `multi-source-report-email` — **"Soạn báo cáo đa nguồn → gửi mail"**, `parallel:true`,
`moatLeaning:true`. Diamond **1 start → fan-out 3 → fan-in → gmail_send**:

- **brief** (agent) → fan-out 3 nhánh **song song, offline $0**:
  - **research_laam** (agent) gọi `laam_metrics_digest`, trả **NGUYÊN VĂN** `summary` (Rule 13).
  - **research_web** (agent) gọi `web_search`, chỉ dùng URL có thật.
  - **fetch_tasks** (connector `demo/demo_list_tasks`, auth:none → luôn "connected", READ).
- **synthesis** (agent, fan-in 3) đọc `{{steps.research_laam.output}}` +
  `{{steps.research_web.output}}` + `{{steps.fetch_tasks.output}}`.
- **send** (connector `gmail/gmail_send`): `to` **TĨNH** (gated bởi `WORKFLOW_RECIPIENT_ALLOWLIST`),
  body = `{{steps.synthesis.output}}` **+ nối trực tiếp** `{{steps.research_laam.output}}` để khối
  số liệu ground-truth đi **một hop** (Rule 13).

**Chạy được KHÔNG cần Gmail OAuth** qua dry-run: `POST /api/workflows/[id]/run {dryRun:true}` →
`gmail_send` trả mock TRƯỚC gate recipient. Live send = connect Gmail + thêm domain vào allowlist
+ chạy không dryRun.

**Bác**: `gmail_search` mặc định (dry-run READ chạy thật → throw khi chưa OAuth → fail-stop cả
run); MCP node per-user trong template mặc định (slug đa số user không có → fail-loud). Cả hai
chỉ nêu như biến thể "advanced/requires connect".

## 6. Must-fix (đã gấp vào §3/§5)

Xem danh sách 14 must-fix trong biên bản họp; các điểm load-bearing đã hiện thực trong PR này:
false-cycle→Kahn · `ref_not_ancestor` · fail-stop hợp tác (`Promise.allSettled`) · join
resolved-or-pruned + deadlock detector · hai semaphore · seq toàn cục dispatch-order · fail-stop-no-email
· `ctx.vars` branch-local · `concurrent_write` rule · gmail_send recipient tĩnh · Rule-13 verbatim +
test mock-đổi-chữ-số · golden equivalence (giữ `walkGraph`).

## 7. Lộ trình (defer, có nhãn)

- **P1**: node skipped/pruned dimmed (suy diễn client); minimap tô theo run-status; RunWaterfall
  stat `maxConcurrency`; drag-off-slot spawn; cờ per-node `optional` + gap/coverage note; resume
  seq theo topo-rank; hardening recipient (cấm steps-derived cho tool exfil); **lật mặc định
  parallel + xóa `walkGraph` sau soak**.
- **P2**: phím tắt + `?` overlay; node **mute** (cần cờ `disabled` schema + engine skip); node
  kind "metrics" zero-model-hop; re-check role owner lúc scheduled-run/resume; **wall-clock run
  timeout**; live waterfall (cần timestamp trong SSE step-frame).
- **Bác dứt điểm**: group container di chuyển; reroute node; bypass reroute-through; mutex quanh
  `ctx.steps`.
