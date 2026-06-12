# Chat Quick-Tools Picker · Workflow MCP Node · Custom Agent · Mobile Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tool-calling reliable by letting the user *pick* the tool + fill required args (P1), expose MCP tools as a workflow node kind (P2), add per-user Custom Agent presets for the workflow Agent node (P3), and bring the mobile node-bar to desktop parity (P4).

**Architecture:** P1 = a per-user grouped tool-catalog endpoint + slash-menu upgrade in `Composer` + a **deterministic pre-dispatch** of the picked tool in `/api/chat` (code calls the tool through the existing `withSafety` gate — no prompt tuning, write-gate intact). P2 = new `WfMcpNode` kind flowing through the existing `buildRunNode` seam with MCP-write **fail-closed** (only `readAllow` reads run). P3 = additive `custom_agent` table + CRUD + resolution at `buildRunNode` (fail-loud if preset missing). P4 = mobile palette derives from the same `NODE_TYPES` array as desktop.

**Tech Stack:** Next.js 16 App Router · Drizzle (migration 0015) · Vitest + Testing Library · i18n vi/en/zh.

**Spec:** `.serena/memories/decisions/chat-mcp-quicktools-workflow-e2e.md` (P1–P4). Related PINs: MCP write = HIGH-blast fail-closed in workflows ([[connectors-mcp-client]]); KHÔNG prompt-tune trên 1-probe ([[chat-tool-selection]]); workflow agent = local model only.

**Constraints:** worktree `quicktools-mcp-agent` (đã tạo, baseline 1791 test xanh) · KHÔNG npm install trong worktree · không tự chạy dev server (E2E live = handoff user) · commit-per-task.

---

## Verified facts the plan builds on (file:line refs from baseline `ac1f07a`)

- `Tool` type `{name, description, parameters(JSON Schema), kind, handler}`; `INTERNAL_TOOLS` (11) — `src/lib/agent/types.ts:12`, `src/lib/agent/registry.ts:13`.
- `chatTools(userId): Promise<ConnectorTool[]>` (connected connectors + MCP discovery); `mcpReadAllow(userId)`; `execute(userId, name, args)` routes `mcp__` — `src/lib/connectors/index.ts:191-246`.
- `ConnectorTool = {type:"function", kind, workflowSafe?, function:{name, description, parameters}}`; `ConnectorListItem.tools: ConnectorToolInfo[] {name, description, parameters}`; `list(userId)` exported — `src/lib/connectors/types.ts:69-96`, `index.ts:89`.
- MCP namespacing `mcp__<slug>__<tool>`; `discoverForUser` → `{tools, readAllow, route}` 30s cache; `listServers(userId)` — `src/lib/connectors/mcp/discovery.ts:30-74`.
- `parseArgSchema(schema) → {fields: ArgField[], propCount, flat}`; **no** `"use client"` → server-importable — `src/components/workflows/editor/schemaForm.ts:25`.
- Chat route: body parse `:211`, tools `:318`, `readAllow :321`, `streamMainTurn(opts) :387`, dispatch (withSafety+makeDispatch, onEvent emits tool frames) `:522`, `runToolRounds :549`, `PendingWriteSignal` catch `:553`.
- `runToolRounds(messages, tools, {callOllama, dispatch}, maxRounds)` — tool turn shape: assistant msg `{role:"assistant", content, tool_calls}` + per call `{role:"tool", content: JSON.stringify(result)}` — `src/lib/agent/orchestrator.ts:39-71`.
- Workflow types/engine/executors/runtime: `WfNodeKind :6`, engine routes non-{foreach,condition} kinds to `deps.runNode`; `buildRunNode` dispatches kind — `src/lib/workflow/{types,engine,executors,runtime}.ts`. `assertConnectorAllowed(action, internal)` — `blast.ts:8`. `interpolateArgs` — `interpolate.ts`. `coerceGraph` KINDS=4 — `generate.ts:12,116`.
- Editor: `NODE_TYPES` (4) + `NODE_KIND_MIME` — `NodesLibraryPanel.tsx:17-24`; `defaultNode :227`, `PaletteBtn :238`, mobile palette row `:1028-1035`, `WfNodeCard :104-223`, `KIND_COLORS` ~`:454`; `NodeConfigPanel` switch + `/api/connectors` fetch + test-inject `connectors?` prop — `NodeConfigPanel.tsx:809-882`.
- `/api/connectors/mcp` GET returns `servers[]` with `tools: string[]` (namespaced names only) — `src/app/api/connectors/mcp/route.ts:15-39`.
- DB per-user pattern + migration flow (`npm run db:generate`, latest = `0014`) — `src/db/schema.ts`, `drizzle/`.
- i18n: `Dict` entries `{vi,en,zh}`, `useT(namespace)` — `src/i18n/*`; chat keys in `dictionaries/chat.ts`, workflow keys in `dictionaries/workflows.ts`.
- Test patterns: Composer/ChatClient (I18nProvider + vi.fn + global-fetch mock), WorkflowEditor (ReactFlow mock + assertRunnable spy), engine/executors (DI vi.fn), API routes (mock auth + db).

---

# P1 — Quick-tools picker (chat)

### Task P1.1: Tool-catalog lib (pure) — `buildCatalogGroups`

**Files:**
- Create: `src/lib/chat/toolCatalog.ts`
- Test: `src/lib/chat/toolCatalog.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/chat/toolCatalog.test.ts
import { describe, expect, test } from "vitest";
import { buildCatalogGroups } from "./toolCatalog";
import type { Tool } from "@/lib/agent/types";
import type { ConnectorListItem, ConnectorTool } from "@/lib/connectors/types";

const internal: Tool[] = [
  { name: "laam_list_agents", description: "liệt kê agent", kind: "read",
    parameters: { type: "object", properties: { sort: { type: "string", enum: ["recent", "cost"] } } },
    handler: async () => ({}) },
];
const connectors = [
  { id: "demo", name: "Demo", connected: true,
    tools: [{ name: "demo_create_task", description: "tạo task", parameters: { type: "object", properties: { title: { type: "string", description: "tên task" } }, required: ["title"] } }] },
  { id: "trello", name: "Trello", connected: false, tools: [{ name: "trello_create_card", description: "x", parameters: {} }] },
] as unknown as ConnectorListItem[];
const chatToolsArr: ConnectorTool[] = [
  { type: "function", kind: "write", function: { name: "demo_create_task", description: "tạo task", parameters: {} } },
  { type: "function", kind: "read",
    function: { name: "mcp__daab__kg_query", description: "truy vấn KG", parameters: { type: "object", properties: { project_id: { type: "string", description: "UUID dự án" } }, required: ["project_id"] } } },
] as ConnectorTool[];

describe("buildCatalogGroups", () => {
  const groups = buildCatalogGroups({ internal, connectors, chatTools: chatToolsArr, servers: [{ slug: "daab", name: "DAAB" }] });

  test("internal group đứng đầu, kind tự khai, args từ schema", () => {
    expect(groups[0]).toMatchObject({ id: "internal", type: "internal" });
    expect(groups[0].tools[0]).toMatchObject({ name: "laam_list_agents", kind: "read" });
    expect(groups[0].tools[0].args[0]).toMatchObject({ key: "sort", kind: "enum", required: false });
  });
  test("chỉ connector ĐÃ kết nối; kind lấy từ chatTools; required args đúng", () => {
    const demo = groups.find((g) => g.id === "connector:demo")!;
    expect(demo.label).toBe("Demo");
    expect(demo.tools[0]).toMatchObject({ name: "demo_create_task", kind: "write" });
    expect(demo.tools[0].args[0]).toMatchObject({ key: "title", required: true });
    expect(groups.find((g) => g.id === "connector:trello")).toBeUndefined();
  });
  test("MCP group theo server, label = tên server, tool giữ tên namespaced", () => {
    const daab = groups.find((g) => g.id === "mcp:daab")!;
    expect(daab.label).toBe("DAAB");
    expect(daab.tools[0]).toMatchObject({ name: "mcp__daab__kg_query", kind: "read" });
    expect(daab.tools[0].args[0]).toMatchObject({ key: "project_id", required: true, description: "UUID dự án" });
  });
  test("connector tool thiếu trong chatTools → kind fail-closed write", () => {
    const g = buildCatalogGroups({ internal: [], connectors: [connectors[0]], chatTools: [], servers: [] });
    expect(g.find((x) => x.id === "connector:demo")!.tools[0].kind).toBe("write");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/chat/toolCatalog.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
// src/lib/chat/toolCatalog.ts
// Catalog tool theo NHÓM cho quick-tools picker (P1). Pure — route chỉ làm I/O.
// kind connector/MCP lấy từ chatTools() (tự khai); thiếu → fail-closed "write".
import type { Tool } from "@/lib/agent/types";
import type { ConnectorListItem, ConnectorTool } from "@/lib/connectors/types";
import { parseArgSchema, type ArgField } from "@/components/workflows/editor/schemaForm";

export type CatalogTool = { name: string; description: string; kind: "read" | "write"; args: ArgField[] };
export type CatalogGroup = { id: string; type: "internal" | "connector" | "mcp"; label: string; tools: CatalogTool[] };

const MCP_NS = "mcp__";

export function mcpSlugOf(name: string): string | null {
  if (!name.startsWith(MCP_NS)) return null;
  const rest = name.slice(MCP_NS.length);
  const i = rest.indexOf("__");
  return i > 0 ? rest.slice(0, i) : null;
}

export function buildCatalogGroups(opts: {
  internal: Tool[];
  connectors: ConnectorListItem[];
  chatTools: ConnectorTool[];
  servers: { slug: string; name: string }[];
}): CatalogGroup[] {
  const kinds = new Map(opts.chatTools.map((t) => [t.function.name, t.kind] as const));
  const groups: CatalogGroup[] = [];

  groups.push({
    id: "internal", type: "internal", label: "LAAM",
    tools: opts.internal.map((t) => ({ name: t.name, description: t.description, kind: t.kind, args: parseArgSchema(t.parameters).fields })),
  });

  for (const c of opts.connectors) {
    if (!c.connected) continue;
    groups.push({
      id: `connector:${c.id}`, type: "connector", label: c.name,
      tools: c.tools.map((ti) => ({ name: ti.name, description: ti.description, kind: kinds.get(ti.name) ?? "write", args: parseArgSchema(ti.parameters).fields })),
    });
  }

  const serverName = new Map(opts.servers.map((s) => [s.slug, s.name]));
  const bySlug = new Map<string, CatalogTool[]>();
  for (const t of opts.chatTools) {
    const slug = mcpSlugOf(t.function.name);
    if (!slug) continue;
    const arr = bySlug.get(slug) ?? [];
    arr.push({ name: t.function.name, description: t.function.description, kind: t.kind, args: parseArgSchema(t.function.parameters).fields });
    bySlug.set(slug, arr);
  }
  for (const [slug, tools] of bySlug) {
    groups.push({ id: `mcp:${slug}`, type: "mcp", label: serverName.get(slug) ?? slug, tools });
  }
  return groups;
}
```

- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Commit** `feat(chat): tool-catalog lib — grouped internal/connector/MCP với required-args (P1.1)`

### Task P1.2: `GET /api/chat/tools` route

**Files:**
- Create: `src/app/api/chat/tools/route.ts`
- Test: `src/app/api/chat/tools/route.test.ts`

- [ ] **Step 1: Failing test** — mock `@/auth`, `@/lib/connectors` (`list`, `chatTools`), `@/lib/connectors/mcp/store` (`listServers`): 401 khi chưa auth; 200 trả `{groups}` với internal group; lỗi discovery/list → vẫn 200 nhóm internal (fail-soft như chatTools).

```typescript
// src/app/api/chat/tools/route.test.ts
import { describe, expect, test, vi, beforeEach } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/connectors", () => ({ list: vi.fn(async () => []), chatTools: vi.fn(async () => []) }));
vi.mock("@/lib/connectors/mcp/store", () => ({ listServers: vi.fn(async () => []) }));
import { auth } from "@/auth";
import { list, chatTools } from "@/lib/connectors";
import { GET } from "./route";
const mockAuth = vi.mocked(auth);

describe("GET /api/chat/tools", () => {
  beforeEach(() => vi.clearAllMocks());
  test("401 chưa đăng nhập", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
  });
  test("200 → groups, internal luôn có", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const j = (await res.json()) as { groups: { id: string }[] };
    expect(j.groups[0].id).toBe("internal");
  });
  test("list/chatTools ném → fail-soft, vẫn 200 internal", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(list).mockRejectedValue(new Error("db down"));
    vi.mocked(chatTools).mockRejectedValue(new Error("down"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { groups: unknown[] }).groups.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**

```typescript
// src/app/api/chat/tools/route.ts
// Catalog tool per-user cho quick-tools picker. Read-only — không cần requireMutator.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { INTERNAL_TOOLS } from "@/lib/agent/registry";
import { list, chatTools } from "@/lib/connectors";
import { listServers } from "@/lib/connectors/mcp/store";
import { buildCatalogGroups } from "@/lib/chat/toolCatalog";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  // Best-effort từng nguồn — một nguồn sập không được làm mất picker.
  const [connectors, tools, servers] = await Promise.all([
    list(userId).catch(() => []),
    chatTools(userId).catch(() => []),
    listServers(userId).catch(() => []),
  ]);
  return NextResponse.json({
    groups: buildCatalogGroups({ internal: INTERNAL_TOOLS, connectors, chatTools: tools, servers: servers.map((s) => ({ slug: s.slug, name: s.name })) }),
  });
}
```

- [ ] **Step 4: Run test** → PASS. **Step 5: Commit** `feat(chat): GET /api/chat/tools — catalog per-user (P1.2)`

### Task P1.3: Deterministic pre-dispatch — `seedRequestedTool` + route wiring

**Files:**
- Modify: `src/lib/agent/orchestrator.ts` (append), `src/app/api/chat/route.ts` (POST + `streamMainTurn`)
- Test: `src/lib/agent/orchestrator.test.ts` (append)

- [ ] **Step 1: Failing tests** (orchestrator.test.ts append):

```typescript
import { seedRequestedTool } from "./orchestrator";
import { PendingWriteSignal } from "@/lib/agent/safety/gate";

describe("seedRequestedTool (P1 — user picked tool, code dispatches)", () => {
  test("append đúng shape tool-turn của runToolRounds + dispatch đúng args", async () => {
    const convo = [{ role: "user", content: "tra cứu cá hồi" }];
    const dispatch = vi.fn(async () => ({ rows: [] }));
    await seedRequestedTool(convo, { name: "mcp__daab__kg_query", args: { project_id: "1f991b74-x" } }, dispatch);
    expect(dispatch).toHaveBeenCalledWith("mcp__daab__kg_query", { project_id: "1f991b74-x" });
    expect(convo[1]).toMatchObject({ role: "assistant", tool_calls: [{ function: { name: "mcp__daab__kg_query", arguments: { project_id: "1f991b74-x" } } }] });
    expect(convo[2]).toEqual({ role: "tool", content: JSON.stringify({ rows: [] }) });
  });
  test("write tool → PendingWriteSignal propagate (gate giữ nguyên), KHÔNG append result", async () => {
    const convo = [{ role: "user", content: "tạo task" }];
    const dispatch = vi.fn(async () => { throw new PendingWriteSignal("demo_create_task", { title: "x" }); });
    await expect(seedRequestedTool(convo, { name: "demo_create_task", args: { title: "x" } }, dispatch)).rejects.toBeInstanceOf(PendingWriteSignal);
    expect(convo.some((m) => m.role === "tool")).toBe(false);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (orchestrator.ts append):

```typescript
// P1 quick-tools: user đã CHỌN tool tường minh trên UI → code dispatch deterministic
// (Rule 5 — không bắt model đoán selection/args). Đi qua CÙNG dispatch withSafety:
// write vẫn ném PendingWriteSignal → confirm-card y hệt. Shape message GIỐNG HỆT
// tool-turn của runToolRounds để extractToolTurns/deriveCitations/persist thấy như nhau.
export type RequestedTool = { name: string; args: Record<string, unknown> };

export async function seedRequestedTool(
  convo: ChatMessage[],
  rt: RequestedTool,
  dispatch: ToolRoundsDeps["dispatch"],
): Promise<void> {
  convo.push({ role: "assistant", content: "", tool_calls: [{ function: { name: rt.name, arguments: rt.args } }] });
  const result = await dispatch(rt.name, rt.args);
  convo.push({ role: "tool", content: JSON.stringify(result) });
}
```

Route wiring (`src/app/api/chat/route.ts`):
1. `ChatBody` type += `requestedTool?: { name?: unknown; args?: unknown }`.
2. Sau `const readAllow = …` (line ~321), parse + validate:

```typescript
// P1 quick-tools: user picked tool → validate SỚM, fail-loud (Rule 12).
let requestedTool: RequestedTool | null = null;
{
  const rt = body.requestedTool;
  if (rt && typeof rt === "object") {
    const name = typeof rt.name === "string" ? rt.name : "";
    const args = rt.args && typeof rt.args === "object" && !Array.isArray(rt.args) ? (rt.args as Record<string, unknown>) : {};
    if (!name || !tools.some((t) => t.function.name === name)) {
      return new Response(JSON.stringify({ error: `Tool không khả dụng: ${name || "(thiếu tên)"}` }), { status: 400 });
    }
    if (isClaudeModel(model)) {
      return new Response(JSON.stringify({ error: "requestedTool không hỗ trợ với model Claude (MVS không tool)" }), { status: 400 });
    }
    requestedTool = { name, args };
  }
}
```
3. `streamMainTurn` opts += `requestedTool: RequestedTool | null`; bên trong `try` (trước `runToolRounds` line ~549):

```typescript
if (requestedTool) await seedRequestedTool(payload.messages, requestedTool, dispatch);
convo = await runToolRounds(payload.messages, tools, { callOllama, dispatch });
```
(`dispatch` qua `makeDispatch` chokepoint → tool frames tự emit; `PendingWriteSignal` rơi vào catch sẵn có; `baseLen` chụp TRƯỚC seed → `extractToolTurns` nhặt được turn này.)

- [ ] **Step 4: Run** `npx vitest run src/lib/agent/orchestrator.test.ts` → PASS; `npx tsc --noEmit` sạch.
- [ ] **Step 5: Commit** `feat(chat): requestedTool pre-dispatch deterministic qua withSafety (P1.3)`

### Task P1.4: Composer picker UI + ChatClient state

**Files:**
- Modify: `src/components/chat/Composer.tsx`, `src/components/chat/ChatClient.tsx`, `src/i18n/dictionaries/chat.ts`
- Test: `src/components/chat/Composer.test.tsx`, `src/components/chat/ChatClient.test.tsx` (append)

Contract:
- `ChatClient` fetch `/api/chat/tools` on mount → `toolGroups`; state `toolPick: { tool: CatalogTool; groupLabel: string; args: Record<string, unknown> } | null`.
- `Composer` props += `toolGroups: CatalogGroup[]`, `toolPick`, `onToolPick(tool: CatalogTool & { groupLabel: string } | null)`, `onToolArg(key: string, value: unknown)`.
- Slash menu: dưới section LỆNH NHANH thêm section CÔNG CỤ — flatten groups, filter theo `slashQuery` (match name/description, cap 12), header nhóm = `group.label`, badge kind (`chat.toolKindRead`/`chat.toolKindWrite`).
- Chọn tool → `onToolPick({...tool, groupLabel})` + `onChange("")` → chip phía trên textarea: tên tool + badge + nút ✕ + **required args inputs** (string/number/boolean/enum theo `ArgField.kind`, description làm placeholder/hint — đây là chỗ user dán UUID `project_id`). Optional args: bỏ qua (model tự suy từ text).
- Send bị disable khi `toolPick` có required arg còn trống (`chat.toolReqMissing` hint). Message rỗng + có toolPick → tự thay bằng `t("chat.toolDefaultMsg", {name})`.
- `ChatClient.send()`: body += `requestedTool: toolPick ? { name: toolPick.tool.name, args: cleanArgs(toolPick.args) } : undefined` (cleanArgs bỏ `undefined`/`""`); clear `toolPick` sau khi gửi.

i18n keys (3 ngữ, thêm vào `chat.ts`): `chat.toolsMenuHead` (vi "Công cụ"), `chat.toolKindRead` ("đọc"), `chat.toolKindWrite` ("ghi · cần xác nhận"), `chat.toolPickedHint` ("Điền tham số bắt buộc — model sẽ gọi đúng tool này"), `chat.toolReqMissing` ("Thiếu tham số bắt buộc: {keys}"), `chat.toolClearAria` ("Bỏ chọn công cụ"), `chat.toolDefaultMsg` ("Gọi công cụ {name} với tham số đã nhập."), `chat.toolNoTools` ("Chưa có công cụ — kết nối connector/MCP trong Kết nối").

- [ ] **Step 1: Failing tests** — Composer: gõ "/" hiện section Công cụ + tên tool; gõ "/kg" filter; click tool → `onToolPick` được gọi; có `toolPick` (required `project_id`) → render input + send disabled khi trống, enabled khi điền; ✕ → `onToolPick(null)`. ChatClient: mockFetch thêm `/api/chat/tools` → groups fixture; flow pick → fill → send → assert `fetch("/api/chat", …)` body chứa `requestedTool`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** theo contract trên (giữ style listbox menu hiện có, `role="option"`).
- [ ] **Step 4: Run cả 2 test file** → PASS. **Step 5: Commit** `feat(chat): quick-tools picker — group menu + required-args chip (P1.4)`

### Task P1.5: P1 wrap — full suite + tsc

- [ ] `npm test` → 100% pass; `npx tsc --noEmit` sạch; cập nhật `CHANGELOG.md` [Unreleased] (vi). Commit `chore(chat): P1 wrap — changelog`.

---

# P2 — Workflow MCP node

### Task P2.1: Types + executor + blast gate

**Files:**
- Modify: `src/lib/workflow/types.ts`, `src/lib/workflow/executors.ts`, `src/lib/workflow/blast.ts`
- Test: `src/lib/workflow/executors.test.ts`, `src/lib/workflow/blast.test.ts` (append)

- [ ] **Step 1: Failing tests**

```typescript
// executors.test.ts (append)
describe("runMcpNode", () => {
  test("interpolate args + compose tên namespaced + trả output", async () => {
    const ctx = emptyContext({});
    ctx.steps["n0"] = { output: { pid: "1f99" } };
    const node: WfMcpNode = { id: "m1", kind: "mcp", server: "daab", tool: "kg_query", args: { project_id: "{{steps.n0.output.pid}}" } };
    const execute = vi.fn(async () => ({ rows: [1] }));
    const out = await runMcpNode(node, ctx, { execute });
    expect(execute).toHaveBeenCalledWith("mcp__daab__kg_query", { project_id: "1f99" });
    expect(out).toEqual({ rows: [1] });
  });
  test("execute trả {error} → throw fail-stop", async () => {
    const node: WfMcpNode = { id: "m1", kind: "mcp", server: "daab", tool: "kg_query", args: {} };
    const execute = vi.fn(async () => ({ error: "project_id sai" }));
    await expect(runMcpNode(node, emptyContext({}), { execute })).rejects.toThrow(/project_id sai/);
  });
});

// blast.test.ts (append)
describe("assertMcpAllowed — MCP write fail-closed trong workflow", () => {
  test("tool trong readAllow → qua", () => {
    expect(() => assertMcpAllowed("mcp__daab__kg_query", new Set(["mcp__daab__kg_query"]))).not.toThrow();
  });
  test("tool ngoài readAllow (write fail-closed) → throw", () => {
    expect(() => assertMcpAllowed("mcp__daab__kg_store", new Set())).toThrow(/fail-closed/);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**

`types.ts`: `WfNodeKind` += `"mcp"`; thêm + union:
```typescript
export type WfMcpNode = {
  id: string;
  kind: "mcp";
  server: string; // slug MCP server (per-user)
  tool: string;   // tên tool THẬT trên server (không namespace)
  args: Record<string, unknown>; // string values hỗ trợ {{...}} (sink:"arg")
};
```

`executors.ts`:
```typescript
export function mcpActionName(server: string, tool: string): string {
  return `mcp__${server}__${tool}`;
}
export async function runMcpNode(node: WfMcpNode, ctx: RunContext, deps: ConnectorDeps): Promise<unknown> {
  const args = interpolateArgs(node.args ?? {}, ctx);
  const result = await deps.execute(mcpActionName(node.server, node.tool), args);
  if (result && typeof result === "object" && "error" in (result as Record<string, unknown>)) {
    throw new Error(String((result as { error: unknown }).error));
  }
  return result;
}
```

`blast.ts`:
```typescript
// MCP trong workflow: KHÔNG có đường workflowSafe — chỉ read (user trustReadHints +
// readOnlyHint, tức nằm trong readAllow) được chạy; còn lại fail-closed (HIGH blast).
export function assertMcpAllowed(name: string, readAllow: ReadonlySet<string>): void {
  if (readAllow.has(name)) return;
  throw new Error(`workflow: MCP tool '${name}' là write/chưa-trust — fail-closed trong workflow`);
}
```

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit** `feat(workflow): WfMcpNode + runMcpNode + assertMcpAllowed fail-closed (P2.1)`

### Task P2.2: runtime.ts mcp branch (+ dry-run semantics)

**Files:** Modify `src/lib/workflow/runtime.ts`; Test `src/lib/workflow/runtime.test.ts` (append). Mock `@/lib/connectors` (`execute`, `mcpReadAllow`).

- [ ] **Step 1: Failing tests**: (a) mcp read (trong readAllow) real-run → connectors execute được gọi với tên namespaced; (b) mcp ngoài readAllow real-run → reject fail-closed, KHÔNG gọi execute; (c) dry-run + ngoài readAllow → `{dryRun:true, wouldHaveCalled}` mock, KHÔNG execute; (d) dry-run + read → execute THẬT (đồng nhất connector read).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — thêm trước nhánh agent:

```typescript
if (node.kind === "mcp") {
  return (async () => {
    const readAllow = await mcpReadAllow(userId);
    const name = mcpActionName(node.server, node.tool);
    if (!dryRun) assertMcpAllowed(name, readAllow);
    const execute = (action: string, args: Record<string, unknown>): Promise<unknown> => {
      if (dryRun && !readAllow.has(action)) {
        return Promise.resolve({ dryRun: true, wouldHaveCalled: action, args });
      }
      return connectorExecute(userId, action, args);
    };
    return runMcpNode(node, ctx, { execute });
  })();
}
```
(import `mcpReadAllow` từ `@/lib/connectors`, `assertMcpAllowed` từ `./blast`, `runMcpNode, mcpActionName` từ `./executors`.)

- [ ] **Step 4: Run** → PASS (+ engine.test sanity: graph với node mcp chạy qua runNode mock — thêm 1 test nhỏ nếu chưa covered). **Step 5: Commit** `feat(workflow): buildRunNode nhánh mcp — read qua readAllow, write fail-closed, dry-run mock (P2.2)`

### Task P2.3: `/api/connectors/mcp` GET += `toolDetails`

**Files:** Modify `src/app/api/connectors/mcp/route.ts`; Test append route test.

- [ ] **Step 1: Failing test**: GET trả mỗi server thêm `toolDetails: [{name(real), nsName, description, parameters, kind}]` (giữ `tools: string[]` nguyên — backward compat).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — trong GET, thay `route`-only bằng cả `tools`:

```typescript
const toolsBySlug: Record<string, string[]> = {};
const detailsBySlug: Record<string, { name: string; nsName: string; description: string; parameters: object; kind: "read" | "write" }[]> = {};
try {
  const { route, tools } = await discoverForUser(userId);
  const bySlugReal = new Map([...route].map(([ns, r]) => [ns, r] as const));
  for (const [name, r] of route) (toolsBySlug[r.slug] ??= []).push(name);
  for (const t of tools) {
    const r = bySlugReal.get(t.function.name);
    if (!r) continue;
    (detailsBySlug[r.slug] ??= []).push({ name: r.realName, nsName: t.function.name, description: t.function.description, parameters: t.function.parameters, kind: t.kind });
  }
} catch { /* best-effort */ }
// … servers.map: thêm toolDetails: detailsBySlug[s.slug] ?? []
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(connectors): mcp GET toolDetails — schema+kind cho editor form (P2.3)`

### Task P2.4: Editor — NODE_TYPES + defaultNode + WfNodeCard + McpForm + i18n

**Files:**
- Modify: `NodesLibraryPanel.tsx` (NODE_TYPES + export), `WorkflowEditor.tsx` (defaultNode, KIND_COLORS, WfNodeCard label), `NodeConfigPanel.tsx` (KIND_LABELS, switch + McpForm + fetch `/api/connectors/mcp` với test-inject prop `mcpServers?`), `src/i18n/dictionaries/workflows.ts`
- Test: `WorkflowEditor.test.tsx`, `NodeConfigPanel.test.tsx` (append)

- [ ] **Step 1: Failing tests**: defaultNode("mcp") shape; WfNodeCard label `daab.kg_query`; NodeConfigPanel kind mcp render: select server (từ `mcpServers` inject) → select tool (từ `toolDetails`) → `SchemaArgsForm` với schema của tool đã chọn; đổi server reset tool+args.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**:
  - `NODE_TYPES` += `{ kind: "mcp", Icon: Server, color: "#e879f9" }` (lucide `Server`); export `NODE_TYPES`.
  - `defaultNode`: `if (kind === "mcp") return { id, kind, server: "", tool: "", args: {} };`
  - `KIND_COLORS` += `mcp: "#c026d3"`; `WfNodeCard` label nhánh mcp: `` `${wf.server}.${wf.tool}` ``.
  - `NodeConfigPanel`: `KIND_LABELS` += mcp; props += `mcpServers?: McpServerItem[]` (`{slug,name,toolDetails:[...]}`), fetch `/api/connectors/mcp` on mount (pattern y hệt connectors fetch + injectedRef); `McpForm` clone ConnectorForm: select server → select tool (option title=description) → `SchemaArgsForm` (chỉnh `SchemaArgsForm`/`ArgFieldInput` nhận node `WfConnectorNode | WfMcpNode` — cả hai có `args`).
  - i18n `workflows.ts` += `wf.lib.mcp.name` (vi "MCP", en "MCP", zh "MCP") + `.desc` (vi "Gọi tool từ MCP server (chỉ read)", …), `wf.node.mcp.serverLabel`, `.toolLabel`, `.selectServer`, `.selectTool`, `.noServers` ("Chưa có MCP server — thêm trong Kết nối"), `.writeBlocked` ("Tool write/chưa-trust sẽ fail-closed khi chạy").
  - Hiển thị cảnh báo `.writeBlocked` khi tool đã chọn có `kind === "write"`.
- [ ] **Step 4: Run editor tests + tsc** → PASS (chú ý: `coerceGraph` KHÔNG đổi — AI generate không sinh node mcp, Rule 13 model không biết slug thật; `assertRunnable` generic đã cover mcp ≤1 out-edge — thêm 1 test validate graph chứa mcp pass).
- [ ] **Step 5: Commit** `feat(workflow-editor): MCP node — library + card + config form + i18n (P2.4)`

### Task P2.5: P2 wrap — suite + tsc + changelog. Commit `chore(workflow): P2 wrap`.

---

# P3 — Custom Agent presets

### Task P3.1: Schema + migration 0015 + lib CRUD

**Files:**
- Modify: `src/db/schema.ts`; Create: `src/lib/customAgents.ts`; generated `drizzle/0015_*.sql`
- Test: `src/lib/customAgents.test.ts` (fake db pattern như route tests)

- [ ] **Step 1: schema.ts** (sau notifications):

```typescript
// P3 custom agent preset (per-user) — Agent node trong workflow tham chiếu qua customAgentId.
export const customAgents = pgTable(
  "custom_agent",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    system: text("system").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("custom_agent_user_idx").on(t.userId)],
);
```

- [ ] **Step 2:** `npm run db:generate` → commit `drizzle/0015_*` (KHÔNG db:migrate — DB live là việc user/deploy).
- [ ] **Step 3: lib + failing tests trước:**

```typescript
// src/lib/customAgents.ts
import { db } from "@/db";
import { customAgents } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export type CustomAgent = typeof customAgents.$inferSelect;

export async function listCustomAgents(userId: string): Promise<CustomAgent[]> {
  return db.select().from(customAgents).where(eq(customAgents.userId, userId)).orderBy(desc(customAgents.updatedAt));
}
export async function getCustomAgent(userId: string, id: string): Promise<CustomAgent | null> {
  const rows = await db.select().from(customAgents).where(and(eq(customAgents.id, id), eq(customAgents.userId, userId))).limit(1);
  return rows[0] ?? null;
}
```
(create/update/delete nằm thẳng trong route — drizzle 1-liner, không cần lib indirection; lib chỉ giữ 2 hàm dùng chung route + runtime.)

- [ ] **Step 4: Commit** `feat(db): custom_agent table — migration 0015 + lib (P3.1)`

### Task P3.2: CRUD API routes

**Files:** Create `src/app/api/custom-agents/route.ts` (GET/POST) + `src/app/api/custom-agents/[id]/route.ts` (PATCH/DELETE); tests theo pattern `/api/conversations` (401 / viewer 403 / ownership 404 / thiếu name|system 400 / happy path).

- [ ] **Step 1: Failing tests** (mock auth + db chains như conversations.route.test). **Step 2:** FAIL.
- [ ] **Step 3: Implement** — auth → `requireMutator` (POST/PATCH/DELETE) → validate `name`/`system` non-empty (400) → ownership qua `getCustomAgent` (404) → drizzle insert/update/delete → `{ok:true, agent?}`.
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(api): custom-agents CRUD per-user + RBAC (P3.2)`

### Task P3.3: Runtime resolution + Agent node reference

**Files:** Modify `src/lib/workflow/types.ts` (`WfAgentNode.customAgentId?: string`), `src/lib/workflow/runtime.ts`; Test `runtime.test.ts` (mock `@/lib/customAgents`).

- [ ] **Step 1: Failing tests**: (a) agent node có customAgentId + preset tồn tại → `runAgentNode` nhận `system` = preset.system (override node.system); (b) preset không tồn tại/khác user → reject fail-loud `custom agent`; (c) không có customAgentId → behavior cũ nguyên vẹn.
- [ ] **Step 2:** FAIL. **Step 3: Implement** — nhánh agent trong `buildRunNode`:

```typescript
if (node.kind === "agent") {
  return (async () => {
    let effective = node;
    if (node.customAgentId) {
      const preset = await getCustomAgent(userId, node.customAgentId);
      if (!preset) throw new Error(`workflow: custom agent "${node.customAgentId}" không tồn tại hoặc không thuộc user (fail-loud)`);
      effective = { ...node, system: preset.system };
    }
    const dispatch = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now: Date.now(), lang: "vi" }), { internal: INTERNAL_TOOLS });
    return runAgentNode(effective, ctx, { runRounds: runToolRounds, callOllama: callOllamaChat, dispatch, tools });
  })();
}
```
(+ test khẳng định `coerceGraph` STRIP customAgentId từ AI-generate — Rule 13 model không biết id thật; hành vi hiện tại đã strip, test chốt anti-regression.)

- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(workflow): agent node customAgentId — resolve per-user, fail-loud (P3.3)`

### Task P3.4: UI — AgentForm preset select + Settings management + i18n

**Files:**
- Modify: `NodeConfigPanel.tsx` (AgentForm + fetch `/api/custom-agents` + inject prop `customAgents?`), `src/components/settings/SettingsMenu.tsx` (+1 row)
- Create: `src/app/settings/custom-agents/page.tsx`, `src/components/settings/CustomAgentsClient.tsx`, `src/i18n/dictionaries/customAgents.ts` (namespace `ca.*`, vi/en/zh)
- Test: `NodeConfigPanel.test.tsx` + `CustomAgentsClient.test.tsx`

- [ ] **Step 1: Failing tests**: AgentForm hiện select preset (inject `customAgents=[{id,name}]`), chọn → `onChange` set customAgentId + ẩn system textarea; CustomAgentsClient: render list, create form (name+system required), 3 nút template quick-fill, edit + delete (confirm).
- [ ] **Step 2:** FAIL. **Step 3: Implement** — clone pattern connectors-fetch/inject; Settings page clone page hiện có trong `src/app/settings/`; templates (i18n): `ca.tplSummarizer` ("Tóm tắt"), `ca.tplTriage` ("Đánh giá/phân loại"), `ca.tplWriter` ("Soạn nội dung") — mỗi cái name + system prompt vi/en/zh đầy đủ trong dictionary.
- [ ] **Step 4:** PASS + tsc. **Step 5: Commit** `feat(settings): Custom Agents CRUD UI + Agent-node preset select (P3.4)`

### Task P3.5: P3 wrap — suite + tsc + changelog. Commit `chore(custom-agents): P3 wrap`.

---

# P4 — Mobile node-bar parity

### Task P4.1: Mobile palette derives from NODE_TYPES

**Files:** Modify `WorkflowEditor.tsx` (mobile row + PaletteBtn icon), `NodesLibraryPanel.tsx` (export NODE_TYPES — đã làm ở P2.4), `src/i18n/dictionaries/workflows.ts` (XOÁ 4 key `wf.editor.add*` không còn dùng); Test `WorkflowEditor.test.tsx`.

- [ ] **Step 1: Failing test**: mobile palette render đủ `NODE_TYPES.length` nút (5, gồm mcp) với label `wf.lib.<kind>.name`; click nút mcp → node-count tăng.
- [ ] **Step 2:** FAIL. **Step 3: Implement**:

```tsx
{/* Row 2: palette — MOBILE ONLY (desktop dùng Nodes Library trái). Parity P4: derive từ NODE_TYPES. */}
<div className="flex items-center gap-2 overflow-x-auto border-t border-neutral-100 px-3 pb-2 pt-1.5 md:hidden dark:border-neutral-800">
  <span className="shrink-0 text-xs text-neutral-400">{t("wf.editor.palette")}</span>
  {NODE_TYPES.map(({ kind, Icon, color }) => (
    <PaletteBtn key={kind} icon={<Icon size={13} style={{ color }} aria-hidden />} label={t(`wf.lib.${kind}.name`)} onClick={() => addNode(kind)} />
  ))}
</div>
```
`PaletteBtn` += optional `icon?: React.ReactNode` render trước label (`inline-flex items-center gap-1.5`).

- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(workflow-editor): mobile palette parity — derive NODE_TYPES, +icon (P4.1)`

---

# Wrap-up (Phase 5–7)

- [ ] `npm test` toàn bộ + `npx tsc --noEmit` (bằng chứng dán vào checkpoint).
- [ ] Code-review pass (subagent) → xử lý findings.
- [ ] CHANGELOG [Unreleased] đủ 4 mục; README chỉ khi behavior user-facing đổi (picker + node mới → CÓ, mục ngắn).
- [ ] Serena: cập nhật decision `chat-mcp-quicktools-workflow-e2e.md` (status built), `services/workflows.md` (MCP node + custom agent), INDEX 1 dòng, checkpoint phiên.
- [ ] E2E live (Claude-in-Chrome, DAAB, Demo connector cho write-gate) = **chờ user chạy dev server với code mới** — không tự khởi động service.

## Self-review (đã chạy)
- Spec coverage: P1 picker+args ✓ (P1.1–P1.5) · P2 MCP node ✓ (P2.1–P2.5) · P3 custom agent + presets ✓ (P3.1–P3.5) · P4 mobile ✓ (P4.1) · dọn draft workflow ✓ (đã làm ngoài plan).
- Type consistency: `CatalogTool/CatalogGroup` (P1.1→P1.4), `RequestedTool` (P1.3→P1.4), `WfMcpNode {server,tool,args}` (P2.1→P2.4), `customAgentId` (P3.1→P3.4) — thống nhất.
- Fail-closed: MCP write trong workflow throw (P2.1/P2.2); requestedTool validate 400 (P1.3); preset missing fail-loud (P3.3).
