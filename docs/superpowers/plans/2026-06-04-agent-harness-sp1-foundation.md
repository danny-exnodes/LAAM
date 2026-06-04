# Agent Harness SP-1 Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho trợ lý chat của LAAM gọi được các *internal read-only tool* trên dữ liệu giám sát (agent_session / machine / stats), đồng thời tách logic harness thành `src/lib/agent/*` thuần + test được — làm nền (đóng băng hợp đồng) cho SP-2/3/4.

**Architecture:** Tách `runToolRounds` khỏi `/api/chat` vào `src/lib/agent/orchestrator.ts`; thêm L1 context động, L2 union-schema + một điểm `dispatch` (route internal↔connector), L3 năm internal tool (prefix `laam_`), L4 guardrail tối thiểu (validate args + bound output, không thêm dependency). Mọi *logic* là hàm thuần (handler = fetch DB mỏng + **pure shaper**); test nhắm shaper, không cần Ollama/DB sống.

**Tech Stack:** Next.js 16 route handler · Drizzle (`db.select`) · vitest · Ollama native tool-calling · không thêm npm dep.

**Spec:** `docs/superpowers/specs/2026-06-04-agent-harness-sp1-foundation-design.md` (hợp đồng §2 là nguồn chân lý).

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/lib/agent/types.ts` | Hợp đồng: `ToolContext`, `ToolKind`, `Tool`, `ToolEvent` |
| `src/lib/agent/guardrails.ts` | `validateArgs`, `boundOutput`, `guard` |
| `src/lib/agent/context.ts` | `buildSystemPrompt` (thuần) |
| `src/lib/agent/orchestrator.ts` | `runToolRounds` (chuyển từ route, `execute`→`dispatch`) + types Ollama |
| `src/lib/agent/registry.ts` | `INTERNAL_TOOLS`, `modelToolSchemas`, `makeDispatch` |
| `src/lib/agent/tools/laam/list-agents.ts` | `shapeAgents` + tool `laam_list_agents` |
| `src/lib/agent/tools/laam/get-agent.ts` | `shapeAgentDetail` + tool `laam_get_agent` |
| `src/lib/agent/tools/laam/query-stats.ts` | `shapeStatsSummary` + tool `laam_query_stats` |
| `src/lib/agent/tools/laam/list-machines.ts` | `shapeMachines` + tool `laam_list_machines` |
| `src/lib/agent/tools/laam/find-stuck.ts` | tool `laam_find_stuck` (tái dùng `shapeAgents`) |
| `src/lib/agent/tools/laam/index.ts` | `LAAM_TOOLS: Tool[]` |
| `src/app/api/chat/route.ts` | **Modify:** dùng lib/agent; xoá `runToolRounds` cục bộ |
| `*.test.ts` colocated | Test vitest cạnh mỗi file (theo convention repo) |

---

## Task 0: Isolation (worktree)

**Files:** none (git).

- [ ] **Step 1: Tạo worktree** — Invoke `superpowers:using-git-worktrees`. Nhánh `feat/agent-harness-sp1`, vd `D:\Projects\personal_projects\LAAM-harness`. Lý do: dev server `:3000` chạy từ cây chính theo dõi `src/` — sửa `route.ts` ở đó sẽ recompile/ngắt; worktree cô lập (xem `agent-ops-rules`, không tự chạy service).
- [ ] **Step 2: Xác nhận** — `git -C "D:\Projects\personal_projects\LAAM" worktree list` → thấy worktree mới. Mọi path dưới đây tương đối theo gốc worktree.

---

## Task 1: Contracts (`types.ts`)

**Files:**
- Create: `src/lib/agent/types.ts`

- [ ] **Step 1: Tạo file** (types thuần — không cần test runtime)

```ts
// Hợp đồng đóng băng cho Agent Harness. SP-2/3/4 trích dẫn file này;
// đổi gì phải round-trip về chủ SP-1 (AGENTS.md Rule 7).
import type { ConnectorTool } from "@/lib/connectors/types";

// Ngữ cảnh chạy 1 tool. KHÔNG có creds (internal tool không cần) và KHÔNG có db
// (giữ ctx gọn); handler tự import db. Connectors quản creds riêng qua execute().
export type ToolContext = {
  userId: string; // người đang chat — dùng cho connector dispatch + audit/RBAC sau
  now: number; // epoch ms, inject để test ổn định (không gọi Date.now trong core)
  lang: string; // 'vi' | 'en' | 'zh'
};

export type ToolKind = "read" | "write"; // SP-1: mọi internal tool = "read"

// Internal tool. `parameters` dùng đúng shape JSON-schema mà connector dùng để
// model thấy đồng nhất giữa internal & connector.
export type Tool = {
  name: string; // tiền tố 'laam_' để chống trùng tên connector
  description: string;
  parameters: object; // JSON schema {type:'object', properties, required?}
  kind: ToolKind;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

// Trace 1 lượt tool — SP-1 chỉ thu thập (sẵn cho SP-4 stream ra UI).
export type ToolEvent =
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; ok: boolean; bytes: number };

// Re-export cho tiện consumer.
export type { ConnectorTool };
```

- [ ] **Step 2: Kiểm tsc** — Run: `npx tsc --noEmit`. Expected: không lỗi mới ở file này.
- [ ] **Step 3: Commit** — `git add src/lib/agent/types.ts && git commit -m "feat(agent): contracts for harness (Tool/ToolContext/ToolEvent)"`

---

## Task 2: Guardrails (`guardrails.ts`)

**Files:**
- Create: `src/lib/agent/guardrails.ts`
- Test: `src/lib/agent/guardrails.test.ts`

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, test } from "vitest";
import { validateArgs, boundOutput, guard } from "./guardrails";
import type { Tool } from "./types";

const params = {
  type: "object",
  properties: { id: { type: "string" }, limit: { type: "number" } },
  required: ["id"],
};

describe("validateArgs", () => {
  test("ok khi đủ required + đúng kiểu", () => {
    const r = validateArgs(params, { id: "a", limit: 5 });
    expect(r.ok).toBe(true);
  });
  test("lỗi khi thiếu required", () => {
    const r = validateArgs(params, { limit: 5 });
    expect(r.ok).toBe(false);
  });
  test("lỗi khi sai kiểu", () => {
    const r = validateArgs(params, { id: "a", limit: "x" });
    expect(r.ok).toBe(false);
  });
  test("args không phải object → lỗi", () => {
    expect(validateArgs(params, 42).ok).toBe(false);
  });
});

describe("boundOutput", () => {
  test("giữ nguyên khi nhỏ", () => {
    expect(boundOutput({ a: 1 })).toEqual({ a: 1 });
  });
  test("cắt + đánh dấu khi quá ngưỡng", () => {
    const big = { s: "x".repeat(20) };
    const out = boundOutput(big, 10) as { _truncated?: boolean };
    expect(out._truncated).toBe(true);
  });
});

describe("guard", () => {
  test("chặn args sai trước khi gọi handler", async () => {
    let called = false;
    const t: Tool = {
      name: "laam_x", description: "", kind: "read",
      parameters: params,
      handler: async () => { called = true; return { ok: true }; },
    };
    const res = (await guard(t).handler({}, { userId: "u", now: 0, lang: "vi" })) as { error?: string };
    expect(called).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Chạy để thấy FAIL** — Run: `npx vitest run src/lib/agent/guardrails.test.ts`. Expected: FAIL ("cannot find module ./guardrails").

- [ ] **Step 3: Implement**

```ts
// Guardrail tối thiểu cho internal tools. KHÔNG thêm dependency (tự viết validator)
// — khớp tinh thần "pure Node, no new deps" của src/app/api/ocr/route.ts.
import type { Tool } from "./types";

type JsonSchema = {
  type?: string;
  properties?: Record<string, { type?: string }>;
  required?: string[];
};

export function validateArgs(
  parameters: object,
  args: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (args != null && typeof args !== "object") return { ok: false, error: "args phải là object" };
  const obj = (args ?? {}) as Record<string, unknown>;
  const schema = (parameters ?? {}) as JsonSchema;
  for (const key of schema.required ?? []) {
    const v = obj[key];
    if (v === undefined || v === null || v === "") return { ok: false, error: `thiếu tham số bắt buộc: ${key}` };
  }
  for (const [key, def] of Object.entries(schema.properties ?? {})) {
    const v = obj[key];
    if (v === undefined || v === null) continue;
    const want = def.type;
    if (!want) continue;
    const okType =
      (want === "string" && typeof v === "string") ||
      (want === "number" && typeof v === "number") ||
      (want === "boolean" && typeof v === "boolean") ||
      (want === "array" && Array.isArray(v)) ||
      (want === "object" && typeof v === "object" && !Array.isArray(v));
    if (!okType) return { ok: false, error: `tham số ${key} phải là ${want}` };
  }
  return { ok: true, value: obj };
}

export function boundOutput(result: unknown, maxBytes = 8192): unknown {
  let json: string;
  try {
    json = JSON.stringify(result);
  } catch {
    return { error: "kết quả không serialize được" };
  }
  if (json == null || json.length <= maxBytes) return result;
  return { _truncated: true, preview: json.slice(0, maxBytes) };
}

// Bọc handler: validateArgs → handler → boundOutput. Áp 1 lần khi dựng registry.
export function guard(tool: Tool): Tool {
  return {
    ...tool,
    handler: async (args, ctx) => {
      const v = validateArgs(tool.parameters, args);
      if (!v.ok) return { error: v.error };
      const out = await tool.handler(v.value, ctx);
      return boundOutput(out);
    },
  };
}
```

- [ ] **Step 4: Chạy PASS** — Run: `npx vitest run src/lib/agent/guardrails.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/agent/guardrails.ts src/lib/agent/guardrails.test.ts && git commit -m "feat(agent): minimal guardrails (validateArgs/boundOutput/guard)"`

---

## Task 3: Context (`context.ts`)

**Files:**
- Create: `src/lib/agent/context.ts`
- Test: `src/lib/agent/context.test.ts`

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, test } from "vitest";
import { buildSystemPrompt } from "./context";

describe("buildSystemPrompt", () => {
  const now = Date.UTC(2026, 5, 4); // 2026-06-04
  test("có ngày, danh sách tool, chỉ dẫn ngôn ngữ", () => {
    const p = buildSystemPrompt({ lang: "vi", now, toolNames: ["laam_list_agents"] });
    expect(p).toContain("2026-06-04");
    expect(p).toContain("laam_list_agents");
    expect(p).toContain("tiếng Việt");
  });
  test("không có tool → không có cụm gọi công cụ", () => {
    const p = buildSystemPrompt({ lang: "en", now, toolNames: [] });
    expect(p).not.toContain("công cụ");
    expect(p).toContain("English");
  });
});
```

- [ ] **Step 2: Chạy FAIL** — Run: `npx vitest run src/lib/agent/context.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// L1 — dựng system prompt động (thuần). `now` inject để test ổn định.
const BASE =
  "Bạn là LAAM, trợ lý nội bộ thân thiện. Trả lời ngắn gọn, chính xác, hữu ích. " +
  "Dùng tiếng Việt khi người dùng dùng tiếng Việt.";

const LANG_HINT: Record<string, string> = {
  vi: "Trả lời bằng tiếng Việt.",
  en: "Reply in English.",
  zh: "用中文回答。",
};

export function buildSystemPrompt(input: {
  lang: string;
  now: number;
  toolNames: string[];
  base?: string;
}): string {
  const base = input.base ?? BASE;
  const date = new Date(input.now).toISOString().slice(0, 10);
  const langHint = LANG_HINT[input.lang] ?? "";
  const tools = input.toolNames.length
    ? `Bạn có thể gọi các công cụ sau khi cần dữ liệu thực: ${input.toolNames.join(", ")}. ` +
      "Chỉ gọi công cụ khi câu hỏi cần dữ liệu thật; nếu không, trả lời trực tiếp."
    : "";
  return [base, `Hôm nay là ${date}.`, langHint, tools].filter(Boolean).join(" ");
}
```

- [ ] **Step 4: Chạy PASS** — Run: `npx vitest run src/lib/agent/context.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/agent/context.* && git commit -m "feat(agent): dynamic system prompt (L1 context)"`

---

## Task 4: Orchestrator (`orchestrator.ts`)

**Files:**
- Create: `src/lib/agent/orchestrator.ts`
- Test: `src/lib/agent/orchestrator.test.ts`

> Chuyển nguyên `runToolRounds` từ `route.ts`, đổi `deps.execute(name,args)` → `deps.dispatch(name,args)`. Logic vòng lặp/bounded/echo giữ y nguyên.

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, test, vi } from "vitest";
// MIGRATED từ src/app/api/chat/tool-loop.test.ts: runToolRounds nay ở đây và nhận
// deps.dispatch (trước là deps.execute). orchestrator.ts chỉ import 1 TYPE từ
// @/lib/connectors → không cần mock module nào. (File cũ bị xoá ở Task 7.)
import { runToolRounds } from "./orchestrator";
import type { ChatMessage } from "./orchestrator";

const tools = [
  { type: "function" as const, function: { name: "github_list_repos", description: "list repos", parameters: {} } },
];
const baseMessages: ChatMessage[] = [
  { role: "system", content: "SYS" },
  { role: "user", content: "list my repos" },
];

describe("runToolRounds", () => {
  test("chạy tool_call, nối kết quả, trả messages cuối", async () => {
    const callOllama = vi
      .fn()
      .mockResolvedValueOnce({
        message: { content: "", tool_calls: [{ function: { name: "github_list_repos", arguments: { visibility: "public" } } }] },
      })
      .mockResolvedValueOnce({ message: { content: "Here are your repos." } });
    const dispatch = vi.fn(async () => [{ name: "laam" }]);

    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("github_list_repos", { visibility: "public" });
    expect(callOllama).toHaveBeenCalledTimes(2);
    expect(out.slice(0, 2)).toEqual(baseMessages);
    expect(out.find((m) => m.role === "assistant")).toBeTruthy();
    const toolMsg = out.find((m) => m.role === "tool");
    expect(toolMsg!.content).toBe(JSON.stringify([{ name: "laam" }]));
  });

  test("không tool_calls → trả nguyên, không gọi dispatch", async () => {
    const callOllama = vi.fn(async () => ({ message: { content: "Hi there." } }));
    const dispatch = vi.fn(async () => ({}));
    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch });
    expect(dispatch).not.toHaveBeenCalled();
    expect(callOllama).toHaveBeenCalledTimes(1);
    expect(out).toEqual(baseMessages);
  });

  test("bounded — dừng sau maxRounds dù model cứ gọi tool", async () => {
    const callOllama = vi.fn(async () => ({
      message: { content: "", tool_calls: [{ function: { name: "github_list_repos", arguments: {} } }] },
    }));
    const dispatch = vi.fn(async () => ({ ok: true }));
    const out = await runToolRounds(baseMessages, tools, { callOllama, dispatch }, 4);
    expect(callOllama).toHaveBeenCalledTimes(4);
    const lastCall = callOllama.mock.calls[callOllama.mock.calls.length - 1];
    expect(lastCall[1]).toEqual([]);
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(out.slice(0, 2)).toEqual(baseMessages);
  });
});
```

- [ ] **Step 2: Chạy FAIL** — Run: `npx vitest run src/lib/agent/orchestrator.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// L0 — vòng tool-call (bounded, non-streaming). Chuyển từ /api/chat, đổi
// execute→dispatch. onEvent phát ở makeDispatch (chokepoint), không lặp ở đây.
import type { ConnectorTool } from "@/lib/connectors/types";

export type ChatMessage = { role: string; content: string; tool_calls?: unknown[] };
type OllamaToolCall = { function?: { name?: string; arguments?: unknown } };
type OllamaChatMessage = { role?: string; content?: string; tool_calls?: OllamaToolCall[] };
export type OllamaChatResponse = { message?: OllamaChatMessage };

export type ToolRoundsDeps = {
  // Gọi Ollama /api/chat non-streaming. `tools` rỗng ở vòng cuối (ép ra text).
  callOllama: (messages: ChatMessage[], tools: ConnectorTool[]) => Promise<OllamaChatResponse>;
  dispatch: (name: string, args: unknown) => Promise<unknown>;
};

export async function runToolRounds(
  messages: ChatMessage[],
  tools: ConnectorTool[],
  deps: ToolRoundsDeps,
  maxRounds = 4,
): Promise<ChatMessage[]> {
  const convo: ChatMessage[] = messages.slice();
  for (let i = 0; i < maxRounds; i++) {
    const allowTools = i < maxRounds - 1; // vòng cuối phải ra text
    const res = await deps.callOllama(convo, allowTools ? tools : []);
    const msg = res?.message ?? {};
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (allowTools && calls.length) {
      convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
      for (const tc of calls) {
        const name = tc.function?.name ?? "";
        const result = await deps.dispatch(name, tc.function?.arguments);
        convo.push({ role: "tool", content: JSON.stringify(result) });
      }
      continue;
    }
    break;
  }
  return convo;
}
```

- [ ] **Step 4: Chạy PASS** — Run: `npx vitest run src/lib/agent/orchestrator.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/agent/orchestrator.* && git commit -m "feat(agent): orchestrator runToolRounds (dispatch-based, moved from route)"`

---

## Task 5: Registry + dispatch (`registry.ts`)

**Files:**
- Create: `src/lib/agent/registry.ts`
- Test: `src/lib/agent/registry.test.ts`

> Phụ thuộc `tools/laam/index` (Task 6). Để test Task 5 độc lập, tạm tạo `tools/laam/index.ts` rỗng ở Step 0; Task 6 sẽ fill.

- [ ] **Step 0: Tạo stub** `src/lib/agent/tools/laam/index.ts`:

```ts
import type { Tool } from "../../types";
export const LAAM_TOOLS: Tool[] = [];
```

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, test, vi } from "vitest";

// Mock connectors.execute để kiểm route fallback (tên không phải internal).
vi.mock("@/lib/connectors", () => ({ execute: vi.fn(async () => ({ from: "connector" })) }));
// registry → tools/laam → @/db (pg Pool) sau Task 6; stub để load dưới jsdom.
vi.mock("@/db", () => ({ db: {} }));

import { modelToolSchemas, makeDispatch } from "./registry";
import { execute } from "@/lib/connectors";
import type { Tool, ToolEvent } from "./types";

const internal: Tool[] = [
  {
    name: "laam_ping", description: "", kind: "read",
    parameters: { type: "object", properties: {} },
    handler: async () => ({ from: "internal" }),
  },
];
const connTool = { type: "function" as const, function: { name: "github_list_repos", description: "", parameters: {} } };

describe("modelToolSchemas", () => {
  test("ghép internal (đã map) + connector", () => {
    const out = modelToolSchemas(internal, [connTool]);
    expect(out.map((t) => t.function.name)).toEqual(["laam_ping", "github_list_repos"]);
  });
});

describe("makeDispatch", () => {
  const ctx = { userId: "u1", now: 0, lang: "vi" };
  test("tên internal → handler nội bộ, có onEvent", async () => {
    const events: ToolEvent[] = [];
    const d = makeDispatch(internal, ctx, (e) => events.push(e));
    expect(await d("laam_ping", {})).toEqual({ from: "internal" });
    expect(events[0].type).toBe("tool_call");
    expect(events[1].type).toBe("tool_result");
  });
  test("tên lạ → fallback connectors.execute(userId,...)", async () => {
    const d = makeDispatch(internal, ctx);
    expect(await d("github_list_repos", { a: 1 })).toEqual({ from: "connector" });
    expect(execute).toHaveBeenCalledWith("u1", "github_list_repos", { a: 1 });
  });
});
```

- [ ] **Step 2: Chạy FAIL** — Run: `npx vitest run src/lib/agent/registry.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// L2 — union schema cho model + một điểm dispatch (route internal↔connector).
// onEvent phát ở đây (chokepoint), L4 đã bọc handler internal qua guard() lúc dựng.
import type { ConnectorTool } from "@/lib/connectors/types";
import { execute } from "@/lib/connectors";
import type { Tool, ToolContext, ToolEvent } from "./types";
import { guard } from "./guardrails";
import { LAAM_TOOLS } from "./tools/laam";

// Guard 1 lần khi load module → dispatch luôn đi qua validate + bound.
export const INTERNAL_TOOLS: Tool[] = LAAM_TOOLS.map(guard);

export function modelToolSchemas(internal: Tool[], connectorTools: ConnectorTool[]): ConnectorTool[] {
  const internalSchemas: ConnectorTool[] = internal.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  return [...internalSchemas, ...connectorTools];
}

export function makeDispatch(
  internal: Tool[],
  ctx: ToolContext,
  onEvent?: (e: ToolEvent) => void,
): (name: string, args: unknown) => Promise<unknown> {
  const byName = new Map(internal.map((t) => [t.name, t]));
  return async (name, args) => {
    onEvent?.({ type: "tool_call", name, args });
    let result: unknown;
    let ok = true;
    try {
      const tool = byName.get(name);
      if (tool) {
        // model có thể gửi arguments dạng chuỗi JSON — parse như execute() làm.
        let a: unknown = args;
        if (typeof a === "string") {
          try { a = JSON.parse(a); } catch { a = {}; }
        }
        result = await tool.handler((a ?? {}) as Record<string, unknown>, ctx);
      } else {
        result = await execute(ctx.userId, name, args);
      }
    } catch (e) {
      ok = false;
      result = { error: e instanceof Error ? e.message : String(e) };
    }
    let bytes = 0;
    try { bytes = JSON.stringify(result).length; } catch { bytes = 0; }
    onEvent?.({ type: "tool_result", name, ok, bytes });
    return result;
  };
}
```

- [ ] **Step 4: Chạy PASS** — Run: `npx vitest run src/lib/agent/registry.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/agent/registry.* src/lib/agent/tools/laam/index.ts && git commit -m "feat(agent): tool registry + unified dispatch (L2)"`

---

## Task 6: Internal LAAM tools (L3)

**Files:**
- Create: `list-agents.ts`, `get-agent.ts`, `query-stats.ts`, `list-machines.ts`, `find-stuck.ts` + tests, under `src/lib/agent/tools/laam/`
- Modify: `src/lib/agent/tools/laam/index.ts`

> Mẫu: handler = fetch DB mỏng + **pure shaper**. Test nhắm shaper (không cần DB).

### 6a — `list-agents.ts`

- [ ] **Step 1: Test thất bại** — `src/lib/agent/tools/laam/list-agents.test.ts`

```ts
import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} })); // module nhập @/db (pg Pool) — stub cho jsdom; shaper không cần DB
import { shapeAgents, type AgentRow } from "./list-agents";

const now = Date.UTC(2026, 5, 4, 12, 0, 0);
const base: AgentRow = {
  id: "s1", projectId: "p1", machineId: "m1", model: "qwen", status: "running",
  startedAt: new Date(now - 30 * 60000), lastActivity: new Date(now - 1 * 60000),
  latestActivity: "Editing file", tokensIn: 100, tokensOut: 50, costUsd: 0.1,
};

describe("shapeAgents", () => {
  test("tính durationMin + stuck=false khi mới hoạt động", () => {
    const [a] = shapeAgents([base], now);
    expect(a.durationMin).toBe(29);
    expect(a.stuck).toBe(false);
    expect(a.latestActivity).toBe("Editing file");
  });
  test("stuck=true khi quá ngưỡng 10' và chưa done", () => {
    const old = { ...base, lastActivity: new Date(now - 20 * 60000) };
    expect(shapeAgents([old], now)[0].stuck).toBe(true);
  });
  test("done → không stuck", () => {
    const done = { ...base, status: "done", lastActivity: new Date(now - 60 * 60000) };
    expect(shapeAgents([done], now)[0].stuck).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL** — Run: `npx vitest run src/lib/agent/tools/laam/list-agents.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** — `src/lib/agent/tools/laam/list-agents.ts`

```ts
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { isStuck } from "@/lib/stuck";
import type { Tool } from "../../types";

const STUCK_MIN = 10;

export type AgentRow = {
  id: string;
  projectId: string | null;
  machineId: string | null;
  model: string | null;
  status: string | null;
  startedAt: Date | null;
  lastActivity: Date | null;
  latestActivity: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
};

export function shapeAgents(rows: AgentRow[], now: number) {
  return rows.map((r) => ({
    id: r.id,
    project: r.projectId,
    machineId: r.machineId,
    model: r.model,
    status: r.status,
    stuck: isStuck({ status: r.status ?? "", lastActivity: r.lastActivity }, STUCK_MIN, now),
    latestActivity: r.latestActivity,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    durationMin:
      r.startedAt && r.lastActivity
        ? Math.round((r.lastActivity.getTime() - r.startedAt.getTime()) / 60000)
        : null,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costUsd: r.costUsd,
  }));
}

export const listAgents: Tool = {
  name: "laam_list_agents",
  description:
    "Liệt kê các agent (phiên giám sát) cùng trạng thái, việc đang làm, token, chi phí. " +
    "Có thể lọc theo status (running/idle/done) hoặc machineId.",
  kind: "read",
  parameters: {
    type: "object",
    properties: {
      status: { type: "string", description: "running | idle | done (tuỳ chọn)" },
      machineId: { type: "string", description: "lọc theo máy (tuỳ chọn)" },
      limit: { type: "number", description: "số tối đa, mặc định 20" },
    },
  },
  async handler(args, ctx) {
    const limit = Math.min(Number(args.limit) || 20, 50);
    const conds = [];
    if (typeof args.status === "string") conds.push(eq(agentSessions.status, args.status));
    if (typeof args.machineId === "string") conds.push(eq(agentSessions.machineId, args.machineId));
    const rows = await db
      .select()
      .from(agentSessions)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(agentSessions.lastActivity))
      .limit(limit);
    return { agents: shapeAgents(rows as unknown as AgentRow[], ctx.now) };
  },
};
```

- [ ] **Step 4: PASS** — Run: `npx vitest run src/lib/agent/tools/laam/list-agents.test.ts`. Expected: PASS.

### 6b — `get-agent.ts` (Rule 13: id không tồn tại → error, thuần)

- [ ] **Step 1: Test thất bại** — `get-agent.test.ts`

```ts
import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} })); // get-agent.ts nhập @/db (pg Pool) — stub cho jsdom
import { shapeAgentDetail } from "./get-agent";

const now = Date.UTC(2026, 5, 4);
describe("shapeAgentDetail", () => {
  test("id không tồn tại (row undefined) → error có id (Rule 13)", () => {
    const r = shapeAgentDetail(undefined, now, "missing") as { error?: string };
    expect(r.error).toContain("missing");
  });
  test("có row → trả agent với tools/subAgents", () => {
    const row = {
      id: "s1", projectId: "p1", machineId: "m1", model: "qwen", status: "done",
      startedAt: new Date(now - 60000), lastActivity: new Date(now),
      latestActivity: null, tokensIn: 1, tokensOut: 2, costUsd: 0,
      tools: [{ name: "Edit", count: 3, errors: 0, avgDurationMs: null }],
      subAgents: [], histo: null,
    };
    const r = shapeAgentDetail(row, now, "s1") as { agent?: { id: string; tools: unknown[] } };
    expect(r.agent?.id).toBe("s1");
    expect(r.agent?.tools).toHaveLength(1);
  });
});
```

- [ ] **Step 2: FAIL** — Run: `npx vitest run src/lib/agent/tools/laam/get-agent.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** — `get-agent.ts`

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions, type SubAgentJson, type ToolJson } from "@/db/schema";
import { isStuck } from "@/lib/stuck";
import type { Tool } from "../../types";

type DetailRow = {
  id: string;
  projectId: string | null;
  machineId: string | null;
  model: string | null;
  status: string | null;
  startedAt: Date | null;
  lastActivity: Date | null;
  latestActivity: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  tools: ToolJson[] | null;
  subAgents: SubAgentJson[] | null;
  histo: Record<string, number> | null;
};

export function shapeAgentDetail(row: DetailRow | undefined, now: number, id: string) {
  if (!row) return { error: "không tìm thấy agent: " + id };
  return {
    agent: {
      id: row.id,
      project: row.projectId,
      machineId: row.machineId,
      model: row.model,
      status: row.status,
      stuck: isStuck({ status: row.status ?? "", lastActivity: row.lastActivity }, 10, now),
      latestActivity: row.latestActivity,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      lastActivity: row.lastActivity ? row.lastActivity.toISOString() : null,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costUsd: row.costUsd,
      tools: row.tools ?? [],
      subAgents: row.subAgents ?? [],
    },
  };
}

export const getAgent: Tool = {
  name: "laam_get_agent",
  description: "Lấy chi tiết một agent theo id: trạng thái, việc đang làm, danh sách tool đã dùng, sub-agent.",
  kind: "read",
  parameters: {
    type: "object",
    properties: { id: { type: "string", description: "id phiên agent" } },
    required: ["id"],
  },
  async handler(args, ctx) {
    const id = String(args.id);
    const rows = await db.select().from(agentSessions).where(eq(agentSessions.id, id)).limit(1);
    return shapeAgentDetail(rows[0] as unknown as DetailRow | undefined, ctx.now, id);
  },
};
```

- [ ] **Step 4: PASS** — Run: `npx vitest run src/lib/agent/tools/laam/get-agent.test.ts`. Expected: PASS.

### 6c — `query-stats.ts`

- [ ] **Step 1: Test thất bại** — `query-stats.test.ts`

```ts
import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} })); // query-stats.ts nhập @/db (pg Pool) — stub cho jsdom
import { shapeStatsSummary } from "./query-stats";
import { computeStats } from "@/lib/stats";
import type { SessionRow } from "@/lib/stats.types";

const rows: SessionRow[] = [
  {
    id: "s1", status: "running", model: "qwen", gitBranch: "main", project: "LAAM",
    startedAt: 1000, lastActivity: 61000, messageCount: 3, toolCount: 2, subAgentCount: 0,
    tokensIn: 100, tokensOut: 50, costUsd: 0.2, tools: null, histo: null,
  },
];

describe("shapeStatsSummary", () => {
  test("trả totals + byModel + topProjects/topTools (compact)", () => {
    const s = shapeStatsSummary(computeStats(rows));
    expect(s.totals.sessions).toBe(1);
    expect(s.byModel.qwen).toBe(1);
    expect(Array.isArray(s.topProjects)).toBe(true);
    expect(Array.isArray(s.topTools)).toBe(true);
  });
});
```

- [ ] **Step 2: FAIL** — Run: `npx vitest run src/lib/agent/tools/laam/query-stats.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** — `query-stats.ts`

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions, projects } from "@/db/schema";
import { computeStats } from "@/lib/stats";
import type { SessionRow, Stats } from "@/lib/stats.types";
import type { Tool } from "../../types";

// Trả bản TÓM TẮT (không gửi heatmap/activity dài → tránh tràn context model).
export function shapeStatsSummary(stats: Stats) {
  return {
    totals: stats.totals,
    byStatus: stats.byStatus,
    byModel: stats.byModel,
    topProjects: stats.byProject.slice(0, 5),
    topTools: stats.toolLeaderboard.slice(0, 5),
  };
}

// Lưu ý: select+map dưới đây nhân bản từ src/app/api/stats/route.ts (nguồn chân lý).
// Cố ý không refactor route đang chạy ở SP-1 (surgical). Nếu đổi shape, sửa cả 2.
async function loadSessionRows(): Promise<SessionRow[]> {
  const rows = await db
    .select({
      id: agentSessions.id,
      status: agentSessions.status,
      model: agentSessions.model,
      gitBranch: agentSessions.gitBranch,
      project: projects.name,
      startedAt: agentSessions.startedAt,
      lastActivity: agentSessions.lastActivity,
      messageCount: agentSessions.messageCount,
      toolCount: agentSessions.toolCount,
      subAgentCount: agentSessions.subAgentCount,
      tokensIn: agentSessions.tokensIn,
      tokensOut: agentSessions.tokensOut,
      costUsd: agentSessions.costUsd,
      tools: agentSessions.tools,
      histo: agentSessions.histo,
    })
    .from(agentSessions)
    .leftJoin(projects, eq(agentSessions.projectId, projects.id));
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    model: r.model,
    gitBranch: r.gitBranch,
    project: r.project,
    startedAt: r.startedAt ? r.startedAt.getTime() : null,
    lastActivity: r.lastActivity ? r.lastActivity.getTime() : null,
    messageCount: r.messageCount,
    toolCount: r.toolCount,
    subAgentCount: r.subAgentCount,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costUsd: r.costUsd,
    tools: r.tools ?? null,
    histo: r.histo ?? null,
  }));
}

export const queryStats: Tool = {
  name: "laam_query_stats",
  description: "Tổng hợp số liệu toàn bộ agent: tổng phiên/đang chạy, token, chi phí, theo model, top project, top tool.",
  kind: "read",
  parameters: { type: "object", properties: {} },
  async handler() {
    return shapeStatsSummary(computeStats(await loadSessionRows()));
  },
};
```

- [ ] **Step 4: PASS** — Run: `npx vitest run src/lib/agent/tools/laam/query-stats.test.ts`. Expected: PASS.

### 6d — `list-machines.ts`

- [ ] **Step 1: Test thất bại** — `list-machines.test.ts`

```ts
import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} })); // list-machines.ts nhập @/db (pg Pool) — stub cho jsdom
import { shapeMachines, type MachineRow } from "./list-machines";

const now = Date.UTC(2026, 5, 4, 12, 0, 0);
describe("shapeMachines", () => {
  test("online=true khi lastSeen trong 5'", () => {
    const rows: MachineRow[] = [
      { id: "m1", name: "PC", hostname: "pc", lastSeen: new Date(now - 60000) },
      { id: "m2", name: "Old", hostname: "old", lastSeen: new Date(now - 10 * 60000) },
    ];
    const out = shapeMachines(rows, now);
    expect(out[0].online).toBe(true);
    expect(out[1].online).toBe(false);
  });
});
```

- [ ] **Step 2: FAIL** — Run: `npx vitest run src/lib/agent/tools/laam/list-machines.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** — `list-machines.ts`

```ts
import { db } from "@/db";
import { machines } from "@/db/schema";
import type { Tool } from "../../types";

const ONLINE_MIN = 5;

export type MachineRow = {
  id: string;
  name: string;
  hostname: string | null;
  lastSeen: Date | null;
};

export function shapeMachines(rows: MachineRow[], now: number) {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    hostname: r.hostname,
    lastSeen: r.lastSeen ? r.lastSeen.toISOString() : null,
    online: r.lastSeen ? now - r.lastSeen.getTime() <= ONLINE_MIN * 60000 : false,
  }));
}

export const listMachines: Tool = {
  name: "laam_list_machines",
  description: "Liệt kê các máy đang được giám sát và trạng thái online (theo lastSeen).",
  kind: "read",
  parameters: { type: "object", properties: {} },
  async handler(_args, ctx) {
    const rows = await db.select().from(machines);
    return { machines: shapeMachines(rows as unknown as MachineRow[], ctx.now) };
  },
};
```

- [ ] **Step 4: PASS** — Run: `npx vitest run src/lib/agent/tools/laam/list-machines.test.ts`. Expected: PASS.

### 6e — `find-stuck.ts` (tái dùng `shapeAgents`)

- [ ] **Step 1: Test thất bại** — `find-stuck.test.ts`

```ts
import { describe, expect, test, vi } from "vitest";
vi.mock("@/db", () => ({ db: {} })); // find-stuck.ts (và ./list-agents) nhập @/db — stub cho jsdom
import { filterStuck } from "./find-stuck";
import type { AgentRow } from "./list-agents";

const now = Date.UTC(2026, 5, 4, 12, 0, 0);
const mk = (id: string, status: string, minAgo: number): AgentRow => ({
  id, projectId: null, machineId: null, model: null, status,
  startedAt: new Date(now - 60 * 60000), lastActivity: new Date(now - minAgo * 60000),
  latestActivity: null, tokensIn: 0, tokensOut: 0, costUsd: 0,
});

describe("filterStuck", () => {
  test("chỉ giữ phiên chưa done & quá ngưỡng", () => {
    const rows = [mk("a", "running", 20), mk("b", "running", 2), mk("c", "done", 99)];
    const out = filterStuck(rows, 10, now);
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: FAIL** — Run: `npx vitest run src/lib/agent/tools/laam/find-stuck.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** — `find-stuck.ts`

```ts
import { ne } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { isStuck } from "@/lib/stuck";
import type { Tool } from "../../types";
import { shapeAgents, type AgentRow } from "./list-agents";

export function filterStuck(rows: AgentRow[], thresholdMin: number, now: number): AgentRow[] {
  return rows.filter((r) => isStuck({ status: r.status ?? "", lastActivity: r.lastActivity }, thresholdMin, now));
}

export const findStuck: Tool = {
  name: "laam_find_stuck",
  description: "Tìm các agent đang bị kẹt (chưa done nhưng không hoạt động quá ngưỡng phút, mặc định 10).",
  kind: "read",
  parameters: {
    type: "object",
    properties: { thresholdMin: { type: "number", description: "ngưỡng phút, mặc định 10" } },
  },
  async handler(args, ctx) {
    const thr = Number(args.thresholdMin) || 10;
    const rows = (await db
      .select()
      .from(agentSessions)
      .where(ne(agentSessions.status, "done"))) as unknown as AgentRow[];
    const stuck = filterStuck(rows, thr, ctx.now);
    return { thresholdMin: thr, stuck: shapeAgents(stuck, ctx.now) };
  },
};
```

- [ ] **Step 4: PASS** — Run: `npx vitest run src/lib/agent/tools/laam/find-stuck.test.ts`. Expected: PASS.

### 6f — Fill registry index

- [ ] **Step 1: Cập nhật** `src/lib/agent/tools/laam/index.ts`

```ts
import type { Tool } from "../../types";
import { listAgents } from "./list-agents";
import { getAgent } from "./get-agent";
import { queryStats } from "./query-stats";
import { listMachines } from "./list-machines";
import { findStuck } from "./find-stuck";

export const LAAM_TOOLS: Tool[] = [listAgents, getAgent, queryStats, listMachines, findStuck];
```

- [ ] **Step 2: Chạy lại registry test** (giờ có 5 tool thật) — Run: `npx vitest run src/lib/agent/registry.test.ts`. Expected: PASS (test dùng `internal` cục bộ nên không phụ thuộc số tool).
- [ ] **Step 3: Commit** — `git add src/lib/agent/tools/laam && git commit -m "feat(agent): 5 internal read tools (agents/stats/machines/stuck) [L3]"`

---

## Task 7: Wire into `/api/chat/route.ts`

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 0: Xoá test cũ trỏ vào route** — `git rm src/app/api/chat/tool-loop.test.ts`. Test này import `runToolRounds` từ `./route`; Step 1 gỡ symbol đó nên file sẽ vỡ. Coverage đã được MIGRATE sang `src/lib/agent/orchestrator.test.ts` (Task 4) — không mất độ phủ.

- [ ] **Step 1: Xoá khối `runToolRounds` cục bộ + types Ollama trùng** trong `route.ts` (dòng định nghĩa `OllamaToolCall/OllamaChatMessage/OllamaChatResponse/ToolRoundsDeps/runToolRounds` và comment "Connector tool-calling loop"). Chúng nay nằm ở `orchestrator.ts`.

- [ ] **Step 2: Sửa imports** (đầu file) — thay dòng `import { chatTools, execute } ...` và type import bằng:

```ts
import { eq, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { chatTools } from "@/lib/connectors";
import { buildSystemPrompt } from "@/lib/agent/context";
import { INTERNAL_TOOLS, modelToolSchemas, makeDispatch } from "@/lib/agent/registry";
import { runToolRounds, type ChatMessage, type OllamaChatResponse } from "@/lib/agent/orchestrator";
```

(Bỏ `import type { ConnectorTool } ...` nếu không còn dùng trực tiếp; giữ `type ChatMessage` cục bộ KHÔNG còn cần — dùng từ orchestrator.)

- [ ] **Step 3: Thêm helper đọc cookie ngôn ngữ** (trên `export async function POST`):

```ts
// Đọc ngôn ngữ từ cookie laam_lang (i18n) — không phụ thuộc API next/headers async.
function readLang(req: Request): string {
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)laam_lang=([^;]+)/);
  const v = m ? decodeURIComponent(m[1]) : "vi";
  return ["vi", "en", "zh"].includes(v) ? v : "vi";
}
```

- [ ] **Step 4: Trong `POST`, sau khi có `history` + `payload`** (sau dòng `const payload = buildOllamaPayload(...)`), thay đoạn `let tools ... if (tools.length) {...}` bằng:

```ts
  // Internal tools (LAAM) LUÔN có; connector tools nếu user đã kết nối.
  const now = Date.now();
  const lang = readLang(req);
  let connectorTools = [] as Awaited<ReturnType<typeof chatTools>>;
  try {
    connectorTools = await chatTools(userId);
  } catch {
    connectorTools = [];
  }
  const tools = modelToolSchemas(INTERNAL_TOOLS, connectorTools);

  // System prompt động (ghi đè default tĩnh trong buildOllamaPayload).
  payload.messages[0] = {
    role: "system",
    content:
      (typeof body.system === "string" && body.system.trim()
        ? body.system
        : buildSystemPrompt({ lang, now, toolNames: tools.map((t) => t.function.name) })),
  };

  // Một lượt chat luôn chạy tool-loop (do internal tools luôn bật) — D-SP1-1.
  const dispatch = makeDispatch(INTERNAL_TOOLS, { userId, now, lang });
  const callOllama = async (
    messages: ChatMessage[],
    roundTools: typeof tools,
  ): Promise<OllamaChatResponse> => {
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: payload.model,
        messages,
        ...(roundTools.length ? { tools: roundTools } : {}),
        options: payload.options,
        stream: false,
      }),
    });
    if (!r.ok) throw new Error(`Ollama ${r.status}`);
    return (await r.json()) as OllamaChatResponse;
  };
  try {
    payload.messages = await runToolRounds(payload.messages, tools, { callOllama, dispatch });
  } catch {
    // Tool loop lỗi (Ollama/connector) — stream trả lời thường từ payload gốc.
  }
```

> Phần stream câu cuối + persistence BÊN DƯỚI giữ NGUYÊN.

- [ ] **Step 5: tsc** — Run: `npx tsc --noEmit`. Expected: sạch (sửa import thừa nếu báo).
- [ ] **Step 6: Commit** — `git add src/app/api/chat/route.ts && git commit -m "feat(agent): wire harness into /api/chat (internal tools + dynamic context) [L0-L4]"`

---

## Task 8: Route test bổ sung

**Files:**
- Modify/Create: `src/app/api/chat/route.test.ts`

- [ ] **Step 1: Thêm test** — `modelToolSchemas` luôn chứa internal tools (đơn vị, không cần Ollama):

```ts
import { describe, expect, test } from "vitest";
import { INTERNAL_TOOLS, modelToolSchemas } from "@/lib/agent/registry";

describe("harness wiring", () => {
  test("internal laam tools luôn có trong schema cho model (kể cả 0 connector)", () => {
    const names = modelToolSchemas(INTERNAL_TOOLS, []).map((t) => t.function.name);
    expect(names).toContain("laam_list_agents");
    expect(names).toContain("laam_find_stuck");
    expect(names.every((n) => typeof n === "string")).toBe(true);
  });
});
```

> Nếu `route.test.ts` đã tồn tại: APPEND describe block này, giữ test cũ. Nếu chưa: tạo file với block trên.

- [ ] **Step 2: Chạy** — Run: `npx vitest run src/app/api/chat/route.test.ts`. Expected: PASS (cả test cũ nếu có).
- [ ] **Step 3: Commit** — `git add src/app/api/chat/route.test.ts && git commit -m "test(agent): internal tools always exposed to model"`

---

## Task 9: Verify toàn bộ + docs/Serena

**Files:**
- Modify: `.serena/memories/services/v2-app.md`, `.serena/checkpoint/<agent>-2026-06-04.md`

- [ ] **Step 1: Full test** — Run: `npm test` (hoặc `npx vitest run`). Expected: **baseline 375 + test SP-1 đều xanh**. Nếu đỏ: STOP, sửa (đây là defect thật).
- [ ] **Step 2: Build** — Run: `npm run build`. Expected: compile thành công, route table có `/api/chat`. (Theo `agent-ops-rules`: KHÔNG `build` in-place khi prod đang chạy — chạy trong worktree này, không đụng cây dev.)
- [ ] **Step 3: Smoke thủ công (cần user đồng ý chạy dev)** — nếu user cho phép: đăng nhập `/chat`, hỏi "những agent nào đang chạy?" → trả lời có dữ liệu thật; hỏi agent id sai → "không tìm thấy"; "liệt kê repo GitHub" (nếu connect) → vẫn chạy. **Không tự khởi động dev** (agent-ops-rules).
- [ ] **Step 4: Cập nhật Serena** — Trong `services/v2-app.md` thêm mục "Agent Harness SP-1": module `src/lib/agent/*`, 5 internal tool, dispatch hợp nhất. Viết checkpoint `.serena/checkpoint/<agent>-2026-06-04.md` (what/files/state/next/risks). Đánh dấu SP-1 xong ở `decisions/agent-harness-architecture.md` nếu phù hợp.
- [ ] **Step 5: Commit** — `git add .serena && git commit -m "docs(serena): record Agent Harness SP-1 (foundation) done"`
- [ ] **Step 6: Finish** — Invoke `superpowers:finishing-a-development-branch` (PR/merge worktree `feat/agent-harness-sp1`). Phối hợp: SP-1 chỉ đụng `/api/chat` + thêm `src/lib/agent/*` — không đụng `components/chat/*` (an toàn với session FE).

---

## Success Criteria (từ spec §1)
- [ ] Hỏi "agent nào đang chạy / kẹt / token hôm nay" → trả lời đúng số liệu từ `agent_session` (không bịa).
- [ ] `laam_get_agent` id sai → "không tìm thấy" (Rule 13).
- [ ] Connector path cũ (GitHub) vẫn chạy.
- [ ] Logic ở `src/lib/agent/*` thuần + DI; baseline 375 + test SP-1 xanh; `next build` xanh; `tsc` sạch.
- [ ] Lỗi tool/Ollama → fail-soft (trả lời thường), có log.
- [ ] Không đụng schema; không thêm npm dep; không đụng `components/chat/*`.
```
