# Design: HIGH-blast connector writes trong Workflow (eval-readiness gate)

**Ngày:** 2026-06-08 · **Vai trò:** technical consultant · **Trạng thái:** 🟡 spec viết xong, chờ user review → CTO sign-off (risk R1–R3) trước khi flip tool đầu tiên.

> **TL;DR:** Hôm nay workflow chỉ chạy `BLAST_LOW` (đúng 1 tool: `demo_create_task`); mọi HIGH-blast write (gửi mail, tạo card/issue…) **fail-closed**. Spec này thay `Set` hardcoded bằng **field tự-khai `workflowSafe` trên từng connector tool** (mặc định fail-closed), gate suy-từ-registry. Manual + scheduled chạy HIGH write **không xác nhận per-action** (user đã chọn); dry-run là affordance preview. *Cơ chế* ship được sau review; *bật tool cụ thể* bị chặn trên **CTO eval-gate** (tool-subsetting + eval-recovery) và phải bật **theo lô ≤ cap eval-cleared**.

---

## 1. Vấn đề & bối cảnh

LAAM workflow engine (xây trên Agent Harness) cho phép node connector ghi ra app ngoài. Hiện **mọi write blast-cao bị chặn cứng**:

- [`policy.ts:39`](../../src/lib/agent/safety/policy.ts) — `BLAST_LOW = new Set(["demo_create_task"])`, hardcoded 1 chỗ.
- [`policy.ts:43`](../../src/lib/agent/safety/policy.ts) — `resolveBlast(name)` → mọi tool ngoài `BLAST_LOW` = `"high"` (fail-closed).
- [`blast.ts:9`](../../src/lib/workflow/blast.ts) — `assertConnectorAllowed`: nếu `kind=write` **VÀ** `blast=high` → `throw`.
- [`runtime.ts:22`](../../src/lib/workflow/runtime.ts) — gate wire vào `buildRunNode` **trước** `connectorExecute`, áp **cả manual lẫn scheduled**, cả dry-run.

Hệ quả: `gmail_send` (khai `kind:"write"`, [`gmail.ts:147`](../../src/lib/connectors/gmail.ts)) → không trong `BLAST_LOW` → `blast=high` → **throw**. Toàn bộ 11 write tool (gmail/trello/github/jira/gcal/gdrive) ở trạng thái này. Agent node trong workflow cũng read-only ([`runtime.ts:18,33`](../../src/lib/workflow/runtime.ts)) — không bao giờ được cầm write tool.

**Mục tiêu:** cho phép chạy HIGH-blast connector write trong workflow (manual + scheduled), một cách có kiểm soát rollout, **không** dựng runtime mới và **không** over-engineer những lớp an toàn user đã từ chối.

### Vì sao gate này tồn tại (đừng vô tình bỏ trọn)

Gate `BLAST_LOW`-only là **placeholder cố ý** từ G2 scheduler: nó chặn HIGH write cho tới khi *actor được chứng minh đủ tin*. Dữ liệu eval (slice tool-subsetting): **write-tool selection sụp 100%@8 tool → 0%@16+ tool** (CI non-overlap). Tức model 8B là **reader đáng tin / actor đa-bước không đáng tin**. Việc nới gate này vì vậy **bị chặn ở tầng tổ chức** (CTO gate: "connector-write-GA blocked ON tool-subsetting + eval-recovery"), không phải ở tầng code.

---

## 2. Quyết định lõi (decision log từ brainstorming 2026-06-08)

User chốt 6 lựa chọn, dồn về phương án **tối-thiểu-friction**:

| # | Trục | Chốt |
|---|---|---|
| D1 | Use case | **Tổng quát** — mọi HIGH write, không bó 1 kịch bản |
| D2 | Quyết định đích đến | **Template từ upstream read** (`to={{lookup.email}}`), không agent tự-bịa đích |
| D3 | Scheduled auth | **Eval-gated autonomy** (không approval per-run) |
| D4 | Guard đích autonomous | **Không allowlist — chấp nhận rủi ro** |
| D5 | Manual UX | **Không confirm per-action; dùng dry-run xem trước** |
| D6 | Cách hiện thực | **Eval-readiness flag tự-khai** (Cách 1) |

**Hệ quả thẳng thắn (Rule 7/12):** D1+D3+D4+D5 cộng lại ≈ phương án "gỡ gate nhanh" mà user **đã từ chối** ở câu mở đầu — khác ở chỗ giờ **buộc vào eval-gate** thay vì gỡ vô điều kiện. Runtime behavior: HIGH write chạy không xác nhận per-action, y như LOW write, **một khi eval cho phép**. Ghi lại để không lặng lẽ build ngược phát biểu trước.

**Hệ quả tích cực (YAGNI, Rule 2/3):** vì bỏ confirm + bỏ allowlist + bỏ suspend-mid-run → **KHÔNG** xây bộ máy suspend/resume-for-confirmation, **KHÔNG** xây allowlist engine. Thiết kế nhỏ đi, không to ra.

---

## 3. Mô hình policy

### 3.1 Field tự-khai (thay `Set` hardcoded)

Thêm field optional trên `ConnectorTool` ([`connectors/types.ts:28`](../../src/lib/connectors/types.ts)) — **mặc định vắng = `false` = fail-closed**:

```ts
export type ConnectorTool = {
  type: "function";
  kind: "read" | "write";
  // Eval-readiness gate cho workflow autonomy. VẮNG = false = fail-closed:
  // tool KHÔNG được chạy trong workflow run cho tới khi eval chứng minh đủ tin
  // (tool-subsetting + eval-recovery) và operator flip cờ này. Trực giao với kind:
  // reads không bị gate này. (Đổi tên ý niệm cũ "blast: low" — xem §8.)
  workflowSafe?: boolean;
  function: { name: string; description: string; parameters: object };
};
```

`policy.ts` suy từ registry thay cho `Set` hardcoded (đúng idiom "kind tự-khai, policy suy từ registry"):

```ts
// policy.ts — thay BLAST_LOW + resolveBlast
const WORKFLOW_SAFE: ReadonlySet<string> = new Set(
  CONNECTORS.flatMap((c) => c.tools.filter((t) => t.workflowSafe).map((t) => t.function.name)),
);
export function isWorkflowSafe(name: string): boolean {
  return WORKFLOW_SAFE.has(name);
}
```

`demo_create_task` ([`demo.ts:33`](../../src/lib/connectors/demo.ts)) khai `workflowSafe: true` → **bảo toàn hành vi hôm nay** (đúng 1 tool chạy được).

### 3.2 Gate giữ nguyên hình dạng

[`blast.ts`](../../src/lib/workflow/blast.ts) `assertConnectorAllowed` chỉ đổi **nguồn**, không đổi cấu trúc:

```ts
export function assertConnectorAllowed(action: string, internal: Tool[]): void {
  if (resolveKind(action, internal) !== "write") return;      // reads luôn qua
  if (!isWorkflowSafe(action)) {                              // write chưa-cleared
    throw new Error(`workflow: '${action}' chưa được eval-clear cho workflow (fail-closed)`);
  }
}
```

### 3.3 Trigger uniformity

D3+D5 (cả manual lẫn scheduled đều không-confirm) → gate **không cần** tham số trigger. Cả hai đường đi qua cùng `buildRunNode` ([`runtime.ts:16`](../../src/lib/workflow/runtime.ts)) → cùng một verdict. Không phân nhánh manual/scheduled trong gate.

---

## 4. Dry-run preview refinement

Hôm nay gate throw **trước cả** dry-run mock ([`runtime.ts:22`](../../src/lib/workflow/runtime.ts) chạy trước [`runtime.ts:26`](../../src/lib/workflow/runtime.ts)) → tool **chưa** cleared thì dry-run **cũng** lỗi → không xem trước được cái sắp bật. Để "dùng dry-run làm preview" (D5) thật sự khả dụng:

- **Dry-run:** bỏ qua readiness throw cho write — **mock + trả args đã resolve** (`{dryRun:true, wouldHaveCalled, args}`). Preview mọi write, kể cả chưa-cleared.
- **Real-run:** enforce `assertConnectorAllowed` như §3.2.

Cụ thể: chuyển thứ tự trong `buildRunNode` để readiness gate chỉ chặn nhánh **không-dry-run**; nhánh dry-run write luôn mock. `kind=write` vẫn xác định qua `resolveKind` (đã có). Gate vẫn fail-loud trên real-run.

> **Lưu ý:** dry-run đọc (read) vẫn execute THẬT (local model $0, đúng spec dry-run hiện hành); chỉ write bị mock.

---

## 5. Rollout & phụ thuộc eval (cái thật sự chặn)

Tách rõ **cơ chế** vs **bật tool**:

| Phần | Trạng thái |
|---|---|
| Field `workflowSafe` + gate suy-từ-registry + dry-run preview + tests | Ship được sau user/CTO review — **không** đụng eval |
| Flip `gmail_send`/`trello_update_card`/… → `workflowSafe:true` | **Chặn trên CTO eval-gate** |

**Tiêu chí flip một tool (hard gate):** chỉ bật khi
1. CTO eval-gate xanh (tool-subsetting + eval-recovery clear), **VÀ**
2. toolset write đang-bật vẫn trong **cap eval-cleared**. Cap = `knee − margin` đo bởi slice #1a (`eval:scale`, plan `2026-06-08-confirm-eval-knee.md`). Reliability data buộc bật **theo lô**, không all-at-once.

CTO ký nhận R1–R3 (§6) **trước** khi flip tool đầu tiên — qua `comms/active/consultant-to-cto-workflow-high-blast.md`.

---

## 6. 🔴 Rủi ro đã chấp nhận (user quyết — Rule 12; CTO có thể override)

- **R1 — Không xác nhận per-action** ở cả manual lẫn scheduled: HIGH write chạy không người gác (D3+D5).
- **R2 — Không allowlist đích:** đích có thể data-derived từ upstream read (`to={{read.x}}`) → **injection vector** (read đọc nguồn bị thao túng → đích do kẻ tấn công kiểm soát). Chấp nhận (D2+D4).
- **R3 — Control tin-cậy duy nhất = eval/tool-subsetting**, vốn chứng minh *chọn đúng tool*, **không** chứng minh *đích an toàn* — hai trục vuông góc; khoảng hở được chấp nhận (D4).

### Phòng thủ còn lại (không mất)
Fail-closed mặc định (tool mới không tự mở) · write-idempotency WAL ([`idempotency.ts`](../../src/lib/workflow/idempotency.ts) — không double-send khi crash-resume) · dry-run preview (tùy chọn) · `audit_log` ghi mọi write ([`agent/safety/audit.ts`](../../src/lib/agent/safety/audit.ts)) · kill-switch per-tool (flip cờ off) · snapshot-on-run + output capped 256KB.

---

## 7. Phạm vi chạm

**Không** migration · **không** route mới · **không** schema đổi · **không** suspend/resume mới.

| File | Đổi |
|---|---|
| `src/lib/connectors/types.ts` | +field `workflowSafe?: boolean` trên `ConnectorTool` |
| `src/lib/agent/safety/policy.ts` | thay `BLAST_LOW`+`resolveBlast` → `WORKFLOW_SAFE` (registry-derived) + `isWorkflowSafe` |
| `src/lib/workflow/blast.ts` | `assertConnectorAllowed` dùng `isWorkflowSafe` (hình dạng giữ nguyên) |
| `src/lib/workflow/runtime.ts` | dry-run preview: readiness gate chỉ chặn nhánh non-dry-run |
| `src/lib/connectors/demo.ts` | `demo_create_task` khai `workflowSafe: true` (bảo toàn hành vi) |
| tests | `blast.test.ts` · `policy.test.ts` · `runtime.test.ts` (§9) |

**Khi flip tool (rollout, sau eval — KHÔNG trong slice cơ chế này):** thêm `workflowSafe: true` vào tool tương ứng trong file connector của nó.

---

## 8. Đổi tên `blast` → `workflowSafe` (ghi chú migration ý niệm)

Ý niệm cũ `blast: "low"|"high"` mô tả *impact radius*. Quyết định của user reframe nó: gate không còn nghĩa "chặn tác-động-cao" mà là "chặn tới khi eval-cleared". Tên `workflowSafe` nói đúng intent (gmail_send **vẫn** tác-động-cao thật; nó chỉ trở nên *workflow-safe* sau khi eval chứng minh actor đủ tin). Xóa sạch `BLAST_LOW`/`resolveBlast`/`BLAST_HIGH` references; cập nhật comment đầu [`blast.ts`](../../src/lib/workflow/blast.ts). Tier vẫn **code-defined, không user-editable** (PIN D2 giữ nguyên).

---

## 9. Testing (Rule 9 — test mã hóa *vì sao*)

| Test | Intent | File |
|---|---|---|
| write không cờ → throw | write mới không bao giờ lặng lẽ chạy không-người-gác | `blast.test.ts` |
| write `workflowSafe:true` → pass | tool eval-cleared được chạy | `blast.test.ts` |
| read luôn pass (bất kể cờ) | read không bị gate này | `blast.test.ts` |
| tool lạ → fail-closed | registry-miss không mở được write | `policy.test.ts` |
| **default fail-closed** (cờ vắng = false) | thuộc tính an-toàn load-bearing: test FAIL nếu ai default true | `policy.test.ts` |
| dry-run: write chưa-cleared → mock+args, không throw | dry-run chỉ preview | `runtime.test.ts` |
| real-run: cùng write → throw | real-run enforce | `runtime.test.ts` |
| verdict giống nhau manual ∥ scheduled | 2 trigger hợp nhất, không trigger nào lách | `blast.test.ts` |

---

## 10. Non-goals (cố ý KHÔNG làm — YAGNI)

- ❌ Suspend-mid-run + confirm card cho workflow (user chọn no-confirm) — bộ máy này **không** xây.
- ❌ Allowlist/bounds đích đến (user chấp nhận rủi ro).
- ❌ Async approval queue.
- ❌ Agent node tự soạn đích (spec #3 giữ: agent read-only).
- ❌ Bật cả 11 tool cùng lúc (reliability cap buộc theo lô).

---

## 11. Liên quan

[[workflow-orchestration-architecture]] (gate gốc, PIN D2) · [[connectors-oauth]] (write surface 11 tool, kind tự-khai) · [[harness-write-tool-subsetting]] (CTO gate + reliability crater) · [[harness-reliability-eval]] (eval scaffold) · plan `2026-06-08-confirm-eval-knee.md` (đo knee → cap rollout) · [[agent-harness-sp2-actions-safety]] (chat write-gate, các mảnh `preview.ts`/`token.ts`/`resume.ts` — **không** tái dùng trong slice này vì no-confirm).
