# AI Workflow — G3 Templates (Phase C) Plan

> subagent-driven, TDD. Backend only. Branch `feat/wf-templates` (base = local HEAD with A0+G1+G2).

**Goal:** A static **template catalog** (≥2 moat-leaning templates that read LAAM's own monitoring data via the SP-1 internal tools — the success metric) + **instantiate-from-catalog** + **clone-existing** endpoints (credential-free: graphs reference connector *actions*, never creds; the instantiating user becomes owner). No UI.

**Design decisions (autonomous, for review):**
- Templates are **static code definitions** (`src/lib/workflow/templates.ts`), NOT DB rows owned by a user — avoids a system-user. Instantiating copies a template's graph into a new user-owned `workflow` row (isTemplate=false, status='draft').
- **Moat = the metric:** ≥2 of 3 templates are agent nodes that call the existing internal LAAM read-tools (laam_list_agents / laam_find_stuck / laam_query_stats) — they read `agent_sessions`/`stats`, the differentiation no generic tool has.
- All template graphs MUST pass `assertRunnable` (a test asserts this for every catalog entry).
- Connector-write templates use only LOW blast (demo_create_task) per G2 gate. (Real external sinks = future connector-write tools.)

---

## Task 1: Template catalog (`src/lib/workflow/templates.ts`) + validity test
```ts
import type { WorkflowGraph } from "./types";
export type WorkflowTemplate = { id: string; name: string; description: string; moatLeaning: boolean; graph: WorkflowGraph };

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "digest-overnight-agents",
    name: "Digest agent chạy đêm qua",
    description: "Tóm tắt các agent đã chạy trong 24h, flag con kẹt/đốt token (đọc dữ liệu LAAM).",
    moatLeaning: true,
    graph: {
      nodes: [{ id: "summarize", kind: "agent",
        system: "Bạn là trợ lý vận hành nội bộ. Dùng các tool LAAM để đọc dữ liệu agent.",
        prompt: "Liệt kê các agent đã chạy trong 24h qua; chỉ ra con nào đang kẹt (stuck) hoặc tốn token bất thường; tóm tắt thành một digest ngắn gọn bằng tiếng Việt." }],
      edges: [],
    },
  },
  {
    id: "flag-stuck-agents",
    name: "Cảnh báo agent đang kẹt",
    description: "Tìm các agent kẹt lâu và liệt kê (đọc dữ liệu LAAM).",
    moatLeaning: true,
    graph: {
      nodes: [{ id: "stuck", kind: "agent",
        system: "Bạn giám sát agent.",
        prompt: "Dùng tool để tìm các agent đang kẹt (stuck) lâu hơn 10 phút. Nếu có, liệt kê tên + thời lượng kẹt. Nếu không có, trả lời đúng câu: 'Không có agent kẹt.'" }],
      edges: [],
    },
  },
  {
    id: "summarize-demo-tasks",
    name: "Tóm tắt công việc (demo)",
    description: "Lấy danh sách công việc từ connector Demo rồi tóm tắt — mẫu connector→agent.",
    moatLeaning: false,
    graph: {
      nodes: [
        { id: "fetch", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
        { id: "summarize", kind: "agent", system: "Bạn tóm tắt danh sách công việc.", prompt: "Tóm tắt danh sách công việc sau bằng 1-2 câu tiếng Việt: {{steps.fetch.output}}" },
      ],
      edges: [{ from: "fetch", to: "summarize" }],
    },
  },
];

export function getTemplate(id: string): WorkflowTemplate | undefined { return TEMPLATES.find((t) => t.id === id); }
```
- [ ] Test `templates.test.ts`: (1) ≥2 templates `moatLeaning===true`; (2) **every** template's `graph` passes `assertRunnable` (import from validate); (3) ids unique; (4) `getTemplate` works.
- [ ] Commit `feat(workflow): G3 template catalog (2 moat + 1 demo)`.

## Task 2: instantiate-from-catalog endpoint
- `POST /api/workflows/templates/[id]/instantiate` (session): `getTemplate(id)` → 404 if none; create `workflow` row {id: uuid, userId: session, name: template.name, description: template.description, graph: template.graph, isTemplate:false, status:'draft'}. Return `{id}`. (assertRunnable already guaranteed by the catalog test, but call it defensively → 400 on the impossible case.)
- `GET /api/workflows/templates` (session): return TEMPLATES mapped to `{id,name,description,moatLeaning}` (NOT the full graph — keep list light; or include graph, your call).
- [ ] Test (mock db, like run.test.ts fakeDb / route patterns used in A0): instantiate creates a workflow with the template's graph + isTemplate=false + the caller's userId; unknown id → 404; unauth → 401.
- [ ] Commit `feat(workflow): G3 instantiate-from-template + list templates`.

## Task 3: clone-existing endpoint
- `POST /api/workflows/[id]/clone` (session): load workflow `id`; allow if `wf.userId === session.user.id` OR `wf.isTemplate === true` (can clone own or a template-flagged workflow); else 404. Deep-copy `graph` into a NEW workflow {new uuid, userId: session, name: wf.name + " (bản sao)", graph: structuredClone(wf.graph), isTemplate:false, status:'draft'}. **No creds copied** (graph has none). Return `{id}`.
- [ ] Test: clone own workflow → new id, copied graph, isTemplate=false, caller owns it; clone other-user non-template → 404; clone a template-flagged → allowed.
- [ ] Commit `feat(workflow): G3 clone existing workflow`.

## Task 4: Verify
- [ ] `npx tsc --noEmit` → 0. `npx vitest run src/lib/workflow` → all green (+ A0/G1/G2). Report count.
- [ ] No schema change (no migration). No new deps.

## Self-review
≥2 moat templates? all template graphs valid (assertRunnable test)? instantiate/clone credential-free + ownership-checked? tsc 0 + suite green?
