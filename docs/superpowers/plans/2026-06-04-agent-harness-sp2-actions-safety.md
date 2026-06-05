# Agent Harness SP-2 — Actions & Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate every model-initiated *write* action behind a code-enforced user confirmation, and run all tool calls through a full guardrail layer (redact secrets, bound connector output), without changing any SP-1 contract.

**Architecture:** A composable `withSafety` wrapper around SP-1's `dispatch` classifies each call; an unconfirmed write throws `PendingWriteSignal` which propagates through `runToolRounds` to the route, suspending the turn. The route streams a code-built confirmation preview + a `pending_write` frame. On confirm, the route opens an encrypted stateless token, executes the **signed** write exactly once, and runs a **text-only** completion to report the result. Zero edits to `types.ts` / `registry.ts` / `orchestrator.ts` / `guardrails.ts`.

**Tech Stack:** TypeScript, Next.js 16 route handler, Vitest, Drizzle (existing `audit_log`), `lib/connectors/crypto` (AES-256-GCM, reused for the token). No new deps, no schema migration.

**Reference spec:** `docs/superpowers/specs/2026-06-04-agent-harness-sp2-actions-safety-design.md` (§ numbers cited below). **Execute in an isolated worktree** (create via `superpowers:using-git-worktrees` at execution start).

---

## File Structure

| File | Responsibility | Tested |
|---|---|---|
| `src/lib/agent/safety/redact.ts` | Scrub credential-shaped substrings (deep) | pure |
| `src/lib/agent/safety/policy.ts` | Classify tool name → read/write (fail-closed) | pure |
| `src/lib/agent/safety/token.ts` | Seal/open the encrypted pending-write token | pure (real crypto) |
| `src/lib/agent/safety/preview.ts` | Code-built confirm preview (Rule 13) | pure |
| `src/lib/agent/safety/audit.ts` | `audit_log` record + replay-dedupe (pure cores) | pure cores |
| `src/lib/agent/safety/gate.ts` | `withSafety` wrapper + `PendingWriteSignal` | pure |
| `src/lib/agent/safety/resume.ts` | Turn-2 resume logic (DI) + synthetic convo | pure (DI) |
| `src/app/api/chat/route.ts` | Wire: union body, suspend path, confirm path | glue + helper |

**Dependency order (implement top-down):** redact → policy → token → preview → audit → gate → resume → route.

**Convention reminders:** mock `@/db` as `{ db: {} }` *only* in tests whose module-under-test imports the pg pool. The `safety/*` modules deliberately avoid importing `@/db` at runtime (audit uses a type-only `@/db` import + value import of `@/db/schema`, which is pool-free), so their tests need **no** db mock. Test descriptions in Vietnamese, matching existing tests.

---

## Task 1: redact — scrub secrets

**Files:**
- Create: `src/lib/agent/safety/redact.ts`
- Test: `src/lib/agent/safety/redact.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agent/safety/redact.test.ts
import { describe, expect, test } from "vitest";
import { redact, redactString } from "./redact";

describe("redactString", () => {
  test("scrub Trello key+token trong query string (rủi ro trello.ts:15)", () => {
    const s = "https://api.trello.com/1/cards?key=abcd1234&token=secretTok99";
    const r = redactString(s);
    expect(r).not.toContain("abcd1234");
    expect(r).not.toContain("secretTok99");
    expect(r).toContain("key=‹redacted›");
    expect(r).toContain("token=‹redacted›");
  });
  test("scrub Bearer token", () => {
    expect(redactString("Authorization: Bearer ey.Jh.zzz")).toBe("Authorization: Bearer ‹redacted›");
  });
  test("scrub GitHub PAT", () => {
    expect(redactString("dùng ghp_0123456789abcdefghijABCDEF nhé")).toContain("‹redacted›");
  });
  test("giữ nguyên text thường", () => {
    expect(redactString('tạo card "Mua sữa"')).toBe('tạo card "Mua sữa"');
  });
});

describe("redact (deep)", () => {
  test("redact string lồng trong object/array, giữ số", () => {
    const v = { url: "x?token=abc123def456", items: ["Bearer zzzxxxccc"], n: 5 };
    const r = redact(v);
    expect(r.url).toContain("‹redacted›");
    expect(r.items[0]).toContain("‹redacted›");
    expect(r.n).toBe(5);
  });
  test("không mutate input", () => {
    const v = { a: "key=secret123456" };
    redact(v);
    expect(v.a).toBe("key=secret123456");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/safety/redact.test.ts`
Expected: FAIL — cannot find module `./redact`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/agent/safety/redact.ts
// Scrub credential-looking substrings before tool output/args reach model
// context, the confirm preview, or the audit log. Trello passes key+token in the
// query string (lib/connectors/trello.ts:15) — an echoed URL would leak creds.

const PLACEHOLDER = "‹redacted›";

export function redactString(s: string): string {
  return s
    .replace(/([?&](?:key|token|api_key|access_token|password|secret)=)[^&\s"']+/gi, (_m, p1) => `${p1}${PLACEHOLDER}`)
    .replace(/(Bearer\s+)[\w.\-]+/gi, (_m, p1) => `${p1}${PLACEHOLDER}`)
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, () => PLACEHOLDER);
}

// Deep-redact every string inside an object/array. Returns a NEW value; never
// mutates the input. Non-string leaves pass through unchanged.
export function redact<T>(value: T): T {
  if (typeof value === "string") return redactString(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redact(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redact(v);
    return out as T;
  }
  return value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agent/safety/redact.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/safety/redact.ts src/lib/agent/safety/redact.test.ts
git commit -m "feat(agent): SP-2 redact secret-shaped substrings (deep)"
```

---

## Task 2: policy — read/write classification (fail-closed)

**Files:**
- Create: `src/lib/agent/safety/policy.ts`
- Test: `src/lib/agent/safety/policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agent/safety/policy.test.ts
import { describe, expect, test, vi } from "vitest";
import { resolveKind, CONNECTOR_WRITES, CONNECTOR_READS } from "./policy";
import type { Tool } from "../types";

const internal: Tool[] = [
  { name: "laam_list_agents", description: "", kind: "read", parameters: {}, handler: async () => ({}) },
];

describe("resolveKind", () => {
  test("internal tool dùng Tool.kind", () => {
    expect(resolveKind("laam_list_agents", internal)).toBe("read");
  });
  test("connector write → write", () => {
    expect(resolveKind("trello_create_card", internal)).toBe("write");
  });
  test("connector read → read", () => {
    expect(resolveKind("github_list_repos", internal)).toBe("read");
  });
  test("tool lạ → write (FAIL-CLOSED) + cảnh báo loud", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveKind("evil_unknown_tool", internal)).toBe("write");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  test("đúng 1 connector write (trello_create_card); không nằm trong READS", () => {
    expect([...CONNECTOR_WRITES]).toEqual(["trello_create_card"]);
    expect(CONNECTOR_READS.has("trello_create_card")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/safety/policy.test.ts`
Expected: FAIL — cannot find module `./policy`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/agent/safety/policy.ts
// Classify a tool call as read or write so the gate knows whether to require
// confirmation. Internal tools self-declare via Tool.kind. Connector tools have
// no kind → classified by name here. Unknown connector tools FAIL CLOSED (treated
// as write/gated) + warn: a new write can never be silently ungated; worst case a
// new read is gated until added to CONNECTOR_READS. (Spec §3.)
import type { Tool } from "../types";

export const CONNECTOR_WRITES: ReadonlySet<string> = new Set(["trello_create_card"]);

export const CONNECTOR_READS: ReadonlySet<string> = new Set([
  "demo_list_tasks",
  "github_list_repos", "github_list_issues", "github_search_issues",
  "trello_list_boards", "trello_list_cards",
  "jira_search_issues", "jira_my_issues",
  "gdrive_list_files", "gdrive_search",
  "gcal_list_events",
  "gmail_list_messages", "gmail_search",
]);

export function resolveKind(name: string, internal: Tool[]): "read" | "write" {
  const tool = internal.find((t) => t.name === name);
  if (tool) return tool.kind;
  if (CONNECTOR_WRITES.has(name)) return "write";
  if (CONNECTOR_READS.has(name)) return "read";
  console.warn(`[safety] tool chưa phân loại, mặc định GATE (write): ${name}`);
  return "write";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agent/safety/policy.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/safety/policy.ts src/lib/agent/safety/policy.test.ts
git commit -m "feat(agent): SP-2 read/write tool classification (fail-closed)"
```

---

## Task 3: token — encrypted stateless pending-write token

**Files:**
- Create: `src/lib/agent/safety/token.ts`
- Test: `src/lib/agent/safety/token.test.ts`

Note: tests use the REAL `lib/connectors/crypto` (no mock). With no `CONNECTOR_KEY`/`AUTH_SECRET` in the test env it falls back to the documented dev key, which round-trips fine.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agent/safety/token.test.ts
import { describe, expect, test } from "vitest";
import { sealPendingWrite, openPendingWrite, type PendingWrite } from "./token";

const base: PendingWrite = {
  v: 1, name: "trello_create_card", args: { idList: "l1", name: "Mua sữa" },
  conversationId: "c1", userId: "u1", iat: 1000, exp: 1000 + 5 * 60_000, nonce: "n1",
};

describe("token seal/open", () => {
  test("round-trip giữ nguyên payload", () => {
    const r = openPendingWrite(sealPendingWrite(base), 2000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("trello_create_card");
      expect(r.value.args).toEqual({ idList: "l1", name: "Mua sữa" });
      expect(r.value.userId).toBe("u1");
      expect(r.value.nonce).toBe("n1");
    }
  });
  test("token mờ — không lộ args/tool dạng plaintext", () => {
    const tok = sealPendingWrite(base);
    expect(tok).not.toContain("Mua sữa");
    expect(tok).not.toContain("trello_create_card");
  });
  test("sửa token (hỏng iv) → reject", () => {
    const tok = sealPendingWrite(base);
    const tampered = (tok[0] === "A" ? "B" : "A") + tok.slice(1);
    expect(openPendingWrite(tampered, 2000).ok).toBe(false);
  });
  test("hết hạn → reject", () => {
    expect(openPendingWrite(sealPendingWrite(base), base.exp + 1).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/safety/token.test.ts`
Expected: FAIL — cannot find module `./token`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/agent/safety/token.ts
// Seal a pending write into an opaque, tamper-evident token the client echoes
// back to confirm. Reuses lib/connectors/crypto (AES-256-GCM) → integrity (GCM
// auth tag) AND confidentiality (args invisible to the client). Stateless: no DB
// row. (Spec §5.)
import { encryptJson, decryptJson } from "@/lib/connectors/crypto";

export type PendingWrite = {
  v: 1;
  name: string;
  args: Record<string, unknown>;
  conversationId: string;
  userId: string;
  iat: number; // epoch ms
  exp: number; // epoch ms
  nonce: string;
};

export function sealPendingWrite(p: PendingWrite): string {
  return encryptJson(p);
}

export function openPendingWrite(
  token: string,
  now: number,
): { ok: true; value: PendingWrite } | { ok: false; error: string } {
  let p: PendingWrite;
  try {
    p = decryptJson<PendingWrite>(token);
  } catch {
    return { ok: false, error: "token không hợp lệ" };
  }
  if (p?.v !== 1 || typeof p.exp !== "number" || typeof p.name !== "string") {
    return { ok: false, error: "token sai định dạng" };
  }
  if (now > p.exp) return { ok: false, error: "token đã hết hạn" };
  return { ok: true, value: p };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agent/safety/token.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/safety/token.ts src/lib/agent/safety/token.test.ts
git commit -m "feat(agent): SP-2 encrypted stateless pending-write token"
```

---

## Task 4: preview — code-built confirm preview (Rule 13)

**Files:**
- Create: `src/lib/agent/safety/preview.ts`
- Test: `src/lib/agent/safety/preview.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agent/safety/preview.test.ts
import { describe, expect, test } from "vitest";
import { buildPreview } from "./preview";

describe("buildPreview", () => {
  test("trello_create_card → title/summary/fields đúng", () => {
    const p = buildPreview("trello_create_card", { idList: "l1", name: "Mua sữa" });
    expect(p.title).toBe("Tạo card Trello");
    expect(p.summary).toContain("Mua sữa");
    expect(p.fields).toEqual([
      { label: "Danh sách", value: "l1" },
      { label: "Tiêu đề", value: "Mua sữa" },
    ]);
  });
  test("desc tuỳ chọn được thêm khi có", () => {
    const p = buildPreview("trello_create_card", { idList: "l1", name: "X", desc: "ghi chú" });
    expect(p.fields.some((f) => f.label === "Mô tả" && f.value === "ghi chú")).toBe(true);
  });
  test("tool lạ → preview tổng quát liệt kê args", () => {
    const p = buildPreview("future_write", { a: "1" });
    expect(p.title).toBe("Hành động ghi");
    expect(p.fields).toEqual([{ label: "a", value: "1" }]);
  });
  test("redact arg nhạy cảm trong field (không lộ secret lên card)", () => {
    const p = buildPreview("future_write", { url: "x?token=abc123def456ghi" });
    expect(p.fields[0].value).toContain("‹redacted›");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/safety/preview.test.ts`
Expected: FAIL — cannot find module `./preview`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/agent/safety/preview.ts
// Build a human-readable, CODE-DERIVED description of a pending write for the
// confirm card. Never uses the model's prose (Rule 13: the card must reflect
// exactly what the code will run). All field values are redacted. (Spec §7.2.)
import { redact } from "./redact";

export type WritePreview = {
  title: string;
  summary: string;
  fields: { label: string; value: string }[];
};

export function buildPreview(name: string, args: Record<string, unknown>): WritePreview {
  const safe = redact(args);
  const str = (v: unknown) => (v == null ? "" : String(v));
  switch (name) {
    case "trello_create_card": {
      const card = str(safe.name);
      const list = str(safe.idList);
      const fields = [
        { label: "Danh sách", value: list },
        { label: "Tiêu đề", value: card },
      ];
      if (safe.desc) fields.push({ label: "Mô tả", value: str(safe.desc) });
      return { title: "Tạo card Trello", summary: `Tạo card "${card}" trong danh sách ${list}.`, fields };
    }
    default:
      return {
        title: "Hành động ghi",
        summary: `Chạy ${name} với tham số đã cho.`,
        fields: Object.entries(safe).map(([k, v]) => ({ label: k, value: str(v) })),
      };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agent/safety/preview.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/safety/preview.ts src/lib/agent/safety/preview.test.ts
git commit -m "feat(agent): SP-2 code-built confirm preview"
```

---

## Task 5: audit — audit_log record + replay-dedupe (pure cores)

**Files:**
- Create: `src/lib/agent/safety/audit.ts`
- Test: `src/lib/agent/safety/audit.test.ts`

Note: only the pure cores (`buildAuditRecord`, `nonceUsedInRows`) are unit-tested — mirroring the project convention (e.g. `get-agent.ts` tests `shapeAgentDetail`, not the db handler). `audit.ts` imports `@/db/schema` (table defs only — pool-free) and a TYPE-only `@/db`, so the test needs no db mock.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agent/safety/audit.test.ts
import { describe, expect, test } from "vitest";
import { buildAuditRecord, nonceUsedInRows, WRITE_ACTION } from "./audit";

describe("buildAuditRecord", () => {
  test("action=agent_write, target chứa nonce+tool, args redacted", () => {
    const rec = buildAuditRecord("u1", {
      nonce: "n1", tool: "trello_create_card", args: { name: "X", url: "a?token=abc123def456" },
    });
    expect(rec.action).toBe(WRITE_ACTION);
    expect(rec.userId).toBe("u1");
    const parsed = JSON.parse(rec.target);
    expect(parsed.nonce).toBe("n1");
    expect(parsed.tool).toBe("trello_create_card");
    expect(JSON.stringify(parsed.args)).toContain("‹redacted›");
  });
});

describe("nonceUsedInRows", () => {
  const rows = [{ target: buildAuditRecord("u", { nonce: "used1", tool: "t", args: {} }).target }];
  test("true khi nonce đã có (replay)", () => {
    expect(nonceUsedInRows(rows, "used1")).toBe(true);
  });
  test("false khi nonce mới", () => {
    expect(nonceUsedInRows(rows, "fresh2")).toBe(false);
  });
  test("target null bỏ qua an toàn", () => {
    expect(nonceUsedInRows([{ target: null }], "x")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/safety/audit.test.ts`
Expected: FAIL — cannot find module `./audit`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/agent/safety/audit.ts
// Record each confirmed write into the existing audit_log table (no schema change)
// and use it for replay-dedupe. Pure cores are unit-tested; the thin db wrappers
// follow the project convention (direct db I/O, logic in pure shapers). (Spec §8.4.)
//
// audit_log columns: id, userId, action(text notNull), target(text), createdAt.
// Residual: no unique index → a concurrent double-submit of the same nonce can
// theoretically slip (accepted for the internal POC; durable fix = SP-3 schema).
import { and, eq, gt } from "drizzle-orm";
import { auditLog } from "@/db/schema";
import { redact } from "./redact";

export const WRITE_ACTION = "agent_write";

export type AuditInput = { nonce: string; tool: string; args: Record<string, unknown> };

export function buildAuditRecord(
  userId: string,
  x: AuditInput,
): { userId: string; action: string; target: string } {
  return {
    userId,
    action: WRITE_ACTION,
    target: JSON.stringify({ nonce: x.nonce, tool: x.tool, args: redact(x.args) }),
  };
}

export function nonceUsedInRows(rows: { target: string | null }[], nonce: string): boolean {
  const needle = `"nonce":${JSON.stringify(nonce)}`;
  return rows.some((r) => (r.target ?? "").includes(needle));
}

// --- thin db wrappers (not unit-tested; logic lives in the pure cores above) ---
type DB = typeof import("@/db").db;

export async function recordWrite(db: DB, userId: string, x: AuditInput): Promise<void> {
  await db.insert(auditLog).values(buildAuditRecord(userId, x));
}

export async function isNonceUsed(
  db: DB,
  nonce: string,
  now: number,
  windowMs = 10 * 60_000,
): Promise<boolean> {
  const rows = await db
    .select({ target: auditLog.target })
    .from(auditLog)
    .where(and(eq(auditLog.action, WRITE_ACTION), gt(auditLog.createdAt, new Date(now - windowMs))));
  return nonceUsedInRows(rows, nonce);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agent/safety/audit.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/safety/audit.ts src/lib/agent/safety/audit.test.ts
git commit -m "feat(agent): SP-2 audit_log write record + nonce replay-dedupe"
```

---

## Task 6: gate — withSafety wrapper + PendingWriteSignal

**Files:**
- Create: `src/lib/agent/safety/gate.ts`
- Test: `src/lib/agent/safety/gate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agent/safety/gate.test.ts
import { describe, expect, test, vi } from "vitest";
import { withSafety, PendingWriteSignal } from "./gate";
import type { Tool } from "../types";

const internal: Tool[] = [
  { name: "laam_list_agents", description: "", kind: "read", parameters: {}, handler: async () => ({}) },
];

describe("withSafety", () => {
  test("read tool → gọi inner, kết quả redacted (vá lỗ hổng connector)", async () => {
    const inner = vi.fn(async () => ({ url: "x?token=abc123def456ghi" }));
    const d = withSafety(inner, { internal });
    const r = (await d("github_list_repos", {})) as { url: string };
    expect(inner).toHaveBeenCalledOnce();
    expect(r.url).toContain("‹redacted›");
  });
  test("write chưa confirm → throw PendingWriteSignal, inner KHÔNG gọi", async () => {
    const inner = vi.fn(async () => ({ ok: true }));
    const d = withSafety(inner, { internal });
    await expect(d("trello_create_card", { idList: "l1", name: "X" })).rejects.toBeInstanceOf(PendingWriteSignal);
    expect(inner).not.toHaveBeenCalled();
  });
  test("PendingWriteSignal mang tool + args đã parse (kể cả args dạng chuỗi JSON)", async () => {
    const d = withSafety(async () => ({}), { internal });
    await expect(
      d("trello_create_card", JSON.stringify({ idList: "l1", name: "X" })),
    ).rejects.toMatchObject({ tool: "trello_create_card", args: { idList: "l1", name: "X" } });
  });
  test("write đã confirm (confirmedAction khớp tên) → gọi inner đúng 1 lần", async () => {
    const inner = vi.fn(async () => ({ card: { id: "c1" } }));
    const d = withSafety(inner, {
      internal,
      confirmedAction: { name: "trello_create_card", args: { idList: "l1", name: "X" } },
    });
    const r = await d("trello_create_card", { idList: "l1", name: "X" });
    expect(inner).toHaveBeenCalledOnce();
    expect(r).toEqual({ card: { id: "c1" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/safety/gate.test.ts`
Expected: FAIL — cannot find module `./gate`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/agent/safety/gate.ts
// L4 write-gate: a composable wrapper around SP-1's dispatch. Read / confirmed
// writes pass through, then get redacted + bounded (closing the SP-1 gap where
// connector results skip guard()/boundOutput). An unconfirmed write THROWS
// PendingWriteSignal, which propagates through runToolRounds (it calls dispatch
// with no try/catch) up to the route, which suspends the turn. Zero change to
// SP-1 contracts. (Spec §4.)
import type { Tool } from "../types";
import { boundOutput } from "../guardrails";
import { resolveKind } from "./policy";
import { redact } from "./redact";

export class PendingWriteSignal extends Error {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  constructor(tool: string, args: Record<string, unknown>) {
    super(`pending write: ${tool}`);
    this.name = "PendingWriteSignal";
    this.tool = tool;
    this.args = args;
  }
}

function parseArgs(args: unknown): Record<string, unknown> {
  let a: unknown = args;
  if (typeof a === "string") {
    try { a = JSON.parse(a); } catch { a = {}; }
  }
  return (a ?? {}) as Record<string, unknown>;
}

export type SafetyOptions = {
  internal: Tool[];
  // one-shot allowance used only by resume; matched by NAME (resume supplies the
  // exact signed args, so name-match is sufficient and avoids deep-equality risk).
  confirmedAction?: { name: string; args: Record<string, unknown> };
};

export function withSafety(
  inner: (name: string, args: unknown) => Promise<unknown>,
  opts: SafetyOptions,
): (name: string, args: unknown) => Promise<unknown> {
  return async (name, args) => {
    const kind = resolveKind(name, opts.internal);
    const confirmed = opts.confirmedAction?.name === name;
    if (kind === "write" && !confirmed) {
      throw new PendingWriteSignal(name, parseArgs(args));
    }
    const result = await inner(name, args);
    return redact(boundOutput(result));
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agent/safety/gate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/safety/gate.ts src/lib/agent/safety/gate.test.ts
git commit -m "feat(agent): SP-2 withSafety write-gate wrapper"
```

---

## Task 7: resume — Turn-2 resume logic (the §6.3 Critical)

**Files:**
- Create: `src/lib/agent/safety/resume.ts`
- Test: `src/lib/agent/safety/resume.test.ts`

This module makes the lead's four resume invariants unit-testable in isolation: execute exactly once with signed args, no execute on replayed nonce, no execute on deny, and a structurally text-only final request.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agent/safety/resume.test.ts
import { describe, expect, test, vi } from "vitest";
import { runResume, buildResumeMessages, buildResumeRequest } from "./resume";
import type { PendingWrite } from "./token";

const signed: PendingWrite = {
  v: 1, name: "trello_create_card", args: { idList: "l1", name: "Mua sữa" },
  conversationId: "c1", userId: "u1", iat: 0, exp: 9e15, nonce: "n1",
};
const system = "SYS";
const history = [
  { role: "user", content: "tạo card Mua sữa" },
  { role: "assistant", content: 'Tạo card "Mua sữa" trong danh sách l1.' },
];

function makeDeps(nonceUsed = false) {
  return {
    dispatch: vi.fn(async () => ({ card: { id: "c9" } })),
    isNonceUsed: vi.fn(async () => nonceUsed),
    recordWrite: vi.fn(async () => {}),
  };
}

describe("runResume", () => {
  test("approve + nonce mới → execute ĐÚNG 1 LẦN với signed args + audit", async () => {
    const d = makeDeps();
    const out = await runResume(signed, true, system, history, d);
    expect(d.dispatch).toHaveBeenCalledTimes(1);
    expect(d.dispatch).toHaveBeenCalledWith("trello_create_card", { idList: "l1", name: "Mua sữa" });
    expect(d.recordWrite).toHaveBeenCalledOnce();
    expect(out.status).toBe("executed");
    if (out.status === "executed") {
      expect(out.messages.at(-2)?.tool_calls?.[0]).toMatchObject({ function: { name: "trello_create_card" } });
      expect(out.messages.at(-1)?.role).toBe("tool");
    }
  });
  test("nonce đã dùng → rejected, KHÔNG execute (chống replay)", async () => {
    const d = makeDeps(true);
    const out = await runResume(signed, true, system, history, d);
    expect(out.status).toBe("rejected");
    expect(d.dispatch).not.toHaveBeenCalled();
  });
  test("approve:false → cancelled, KHÔNG execute", async () => {
    const d = makeDeps();
    const out = await runResume(signed, false, system, history, d);
    expect(out.status).toBe("cancelled");
    expect(d.dispatch).not.toHaveBeenCalled();
  });
});

describe("buildResumeMessages", () => {
  test("kết thúc bằng assistant(tool_call) + tool(result); bỏ READ Turn 1", () => {
    const msgs = buildResumeMessages(system, history, signed, { card: { id: "c9" } });
    expect(msgs[0]).toEqual({ role: "system", content: "SYS" });
    expect(msgs.at(-2)?.tool_calls?.[0]).toMatchObject({
      function: { name: "trello_create_card", arguments: { idList: "l1", name: "Mua sữa" } },
    });
    expect(msgs.at(-1)).toEqual({ role: "tool", content: JSON.stringify({ card: { id: "c9" } }) });
  });
});

describe("buildResumeRequest", () => {
  test("KHÔNG có field tools (text-only về cấu trúc)", () => {
    const body = buildResumeRequest("gemma4:e4b", [], { temperature: 0.7 });
    expect(body).not.toHaveProperty("tools");
    expect(body.stream).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/safety/resume.test.ts`
Expected: FAIL — cannot find module `./resume`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/agent/safety/resume.ts
// Turn-2 resume after the user confirms a pending write. Executes the SIGNED
// write exactly once in code (never re-asks the model — Rule 13), then builds a
// synthetic conversation for a final TEXT-ONLY completion that reports the
// result. Turn-1 reads are intentionally dropped (they only served to propose the
// write). Double-execute is structurally impossible: a single direct dispatch +
// a tools-less request (no loop). (Spec §6.3.)
import type { ChatMessage } from "../orchestrator";
import type { PendingWrite } from "./token";

// history already ends with the persisted proposal assistant message (never empty
// — see route suspend). We append the executed write as an assistant tool_call +
// its tool result so the model, given NO tools, just narrates the outcome.
export function buildResumeMessages(
  system: string,
  history: ChatMessage[],
  signed: PendingWrite,
  result: unknown,
): ChatMessage[] {
  return [
    { role: "system", content: system },
    ...history,
    { role: "assistant", content: "", tool_calls: [{ function: { name: signed.name, arguments: signed.args } }] },
    { role: "tool", content: JSON.stringify(result) },
  ];
}

// The resume final request carries NO tools field → structurally cannot dispatch
// another tool_call (text-only). Mirrors the normal stream payload otherwise.
export function buildResumeRequest(model: string, messages: ChatMessage[], options: Record<string, unknown>) {
  return { model, messages, options, stream: true as const };
}

export type ResumeDeps = {
  dispatch: (name: string, args: Record<string, unknown>) => Promise<unknown>; // withSafety + confirmedAction
  isNonceUsed: (nonce: string) => Promise<boolean>;
  recordWrite: (x: { nonce: string; tool: string; args: Record<string, unknown> }) => Promise<void>;
};

export type ResumeOutcome =
  | { status: "rejected"; reason: string }
  | { status: "cancelled" }
  | { status: "executed"; messages: ChatMessage[]; result: unknown };

export async function runResume(
  signed: PendingWrite,
  approve: boolean,
  system: string,
  history: ChatMessage[],
  deps: ResumeDeps,
): Promise<ResumeOutcome> {
  if (!approve) return { status: "cancelled" };
  if (await deps.isNonceUsed(signed.nonce)) return { status: "rejected", reason: "hành động đã được xử lý" };
  const result = await deps.dispatch(signed.name, signed.args);
  await deps.recordWrite({ nonce: signed.nonce, tool: signed.name, args: signed.args });
  return { status: "executed", messages: buildResumeMessages(system, history, signed, result), result };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agent/safety/resume.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/safety/resume.ts src/lib/agent/safety/resume.test.ts
git commit -m "feat(agent): SP-2 deterministic Turn-2 resume logic"
```

---

## Task 8: shared frame encoder (`src/lib/chat/frames.ts`)

**Why:** SP-4 froze the chat-stream frame contract (`ChatFrame` + the `U+001E`-pair envelope, their spec §2.2) but hasn't landed `frames.ts` yet. Per the lead's "one source, whoever lands first" rule, SP-2 lands the minimal shared piece it needs to *emit* the `pending_write` frame: the `ChatFrame` type + `encodeFrame`. SP-4 adds `splitFrames` (the client-side partial-frame guard, D-SP4-2) to this same file when they implement. **Schema is SP-4-owned — implement it verbatim, do not redesign.**

**Files:**
- Create: `src/lib/chat/frames.ts`
- Test: `src/lib/chat/frames.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/chat/frames.test.ts
import { describe, expect, test } from "vitest";
import { encodeFrame, SEP, type ChatFrame } from "./frames";

describe("encodeFrame", () => {
  test("bọc JSON-1-dòng trong cặp U+001E (envelope SP-4 §2.2)", () => {
    const f: ChatFrame = { t: "pending_write", token: "tok", tool: "trello_create_card", title: "Tạo card Trello", summary: "x" };
    const enc = encodeFrame(f);
    expect(enc.startsWith(SEP)).toBe(true);
    expect(enc.endsWith(SEP)).toBe(true);
    expect(JSON.parse(enc.slice(1, -1))).toEqual(f);
  });
  test("tokens frame round-trips", () => {
    expect(encodeFrame({ t: "tokens", i: 3, o: 5 })).toBe(SEP + '{"t":"tokens","i":3,"o":5}' + SEP);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/frames.test.ts`
Expected: FAIL — cannot find module `./frames`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/chat/frames.ts
// Shared chat-stream frame envelope. SCHEMA FROZEN by SP-4 (spec §2.2): each frame
// = U+001E + one-line JSON + U+001E; the displayed text is every byte OUTSIDE the
// pairs. SP-2 landed the type + encodeFrame (server emit, "land-first" per lead).
// SP-4 adds splitFrames (client parse + D-SP4-2 partial-frame guard) to this file.
export const SEP = ""; // U+001E record separator (the literal control char — see note below)

export type ChatFrame =
  | { t: "tokens"; i: number; o: number }
  | { t: "tool"; phase: "call" | "result"; c: number; name: string; args?: string; ok?: boolean }
  | { t: "cite"; names: string[] }
  | { t: "pending_write"; token: string; tool: string; title: string; summary: string; fields?: unknown };

// The single emit path (always JSON.stringify → no raw SEP can leak into the JSON).
export function encodeFrame(f: ChatFrame): string {
  return SEP + JSON.stringify(f) + SEP;
}
```

> **Note on `SEP`:** it is the single **U+001E** control character (char code 30) — invisible in most editors, *not* two adjacent quotes. If copy-paste strips it, write it as `String.fromCharCode(0x1e)` or the Unicode escape (backslash-u-zero-zero-one-e). The existing `route.ts` / `ChatClient.tsx` already use this exact character, so it round-trips through the stream.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/chat/frames.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/frames.ts src/lib/chat/frames.test.ts
git commit -m "feat(chat): shared frame envelope (ChatFrame + encodeFrame) per SP-4 §2.2"
```

---

## Task 9: route wiring — union body, suspend, confirm

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Test: `src/app/api/chat/route.test.ts` (extend)

The route becomes thin glue over the already-tested units. Logic is covered by Tasks 1–7; here we add one tested pure helper (`isConfirmBody`) plus the I/O wiring. Full streaming behavior is verified by composition + a manual smoke checklist (the ops rules forbid starting the server here).

- [ ] **Step 1: Write the failing test (pure branch helper + wiring smoke)**

Add to `src/app/api/chat/route.test.ts`:

```ts
import { isConfirmBody } from "./route";

describe("SP-2 confirm body detection", () => {
  test("nhận diện body confirm", () => {
    expect(isConfirmBody({ confirm: { token: "t", approve: true } })).toBe(true);
  });
  test("body message thường → không phải confirm", () => {
    expect(isConfirmBody({ message: "hi" })).toBe(false);
    expect(isConfirmBody({})).toBe(false);
    expect(isConfirmBody({ confirm: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/chat/route.test.ts`
Expected: FAIL — `isConfirmBody` is not exported.

- [ ] **Step 3a: Add imports + the pure helper**

At the top of `src/app/api/chat/route.ts`, extend the agent imports and add the helper:

```ts
import { INTERNAL_TOOLS, modelToolSchemas, makeDispatch } from "@/lib/agent/registry";
import { runToolRounds, type ChatMessage, type OllamaChatResponse } from "@/lib/agent/orchestrator";
import { withSafety, PendingWriteSignal } from "@/lib/agent/safety/gate";
import { sealPendingWrite, openPendingWrite, type PendingWrite } from "@/lib/agent/safety/token";
import { buildPreview } from "@/lib/agent/safety/preview";
import { runResume, buildResumeRequest } from "@/lib/agent/safety/resume";
import { recordWrite, isNonceUsed } from "@/lib/agent/safety/audit";
import { encodeFrame, type ChatFrame } from "@/lib/chat/frames";

const PENDING_TTL_MS = 5 * 60_000; // §5: token expiry
const RS = ""; // U+001E record separator for the legacy tokens frame

// Discriminate the union request body: { message } | { confirm:{token,approve} }.
export function isConfirmBody(body: unknown): body is { confirm: { token: string; approve: boolean } } {
  const c = (body as { confirm?: unknown } | null)?.confirm;
  return !!c && typeof (c as { token?: unknown }).token === "string";
}
```

- [ ] **Step 3b: Branch the POST handler to the confirm path**

In `POST`, immediately after `const userId = session.user.id;` and parsing `body`, add the branch (before the existing `message` handling):

```ts
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (isConfirmBody(body)) return handleConfirm(req, body.confirm, userId);
```

- [ ] **Step 3c: Wrap the dispatch with the gate + catch the suspend signal**

Replace the existing dispatch + tool-loop block (`const dispatch = makeDispatch(...)` through the `try { ... } catch { ... }` around `runToolRounds`) with:

```ts
  const ctx = { userId, now, lang };
  const dispatch = withSafety(makeDispatch(INTERNAL_TOOLS, ctx), { internal: INTERNAL_TOOLS });
  const callOllama = async (messages: ChatMessage[], roundTools: typeof tools): Promise<OllamaChatResponse> => {
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
  } catch (e) {
    if (e instanceof PendingWriteSignal) {
      return suspendForConfirm(e, convId, userId, now, payload.messages[0].content);
    }
    // real tool-loop error → fall through, stream a normal answer (fail-soft as before)
  }
```

- [ ] **Step 3d: Add the suspend + confirm handlers + a shared streamer**

Add these module-level functions (below `POST`). `streamOllama` is the existing in-`POST` `ReadableStream` block extracted verbatim into a reusable function — when extracting, replace the old inline block in `POST` with `return streamOllama(ollamaRes, convId);`.

```ts
// Stream Ollama tokens to the client, persist the assistant message, emit the
// trailing {i,o} token-usage frame. Extracted from POST so the resume path reuses
// it. (Behavior identical to SP-1's inline stream.)
function streamOllama(ollamaRes: Response, convId: string): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const reader = ollamaRes.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buf = "";
      let full = "";
      let tokensIn = 0;
      let tokensOut = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            try {
              const j = JSON.parse(t);
              const tok = j?.message?.content ?? "";
              if (tok) { full += tok; controller.enqueue(encoder.encode(tok)); }
              if (j?.done) {
                if (typeof j.prompt_eval_count === "number") tokensIn = j.prompt_eval_count;
                if (typeof j.eval_count === "number") tokensOut = j.eval_count;
              }
            } catch { /* skip partial line */ }
          }
        }
      } finally {
        if (full) {
          await db.insert(chatMessages).values({ conversationId: convId, role: "assistant", content: full, tokensIn, tokensOut });
          try { controller.enqueue(encoder.encode(RS + JSON.stringify({ i: tokensIn, o: tokensOut }))); } catch { /* aborted */ }
        }
        await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, convId));
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "x-conversation-id": convId, "cache-control": "no-cache" },
  });
}

// Stream a code-built text + an optional trailing JSON frame, persisting the
// assistant message. Used for the suspend (proposal + pending_write) and
// cancel/reject (plain text) turns.
function streamText(convId: string, text: string, frame?: ChatFrame): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(enc.encode(text));
      if (frame) controller.enqueue(enc.encode(encodeFrame(frame))); // SP-4 §2.2 paired-U+001E envelope
      await db.insert(chatMessages).values({ conversationId: convId, role: "assistant", content: text });
      await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, convId));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "x-conversation-id": convId, "cache-control": "no-cache" },
  });
}

// Turn 1 suspend: a write was proposed. Build a code preview, persist it as the
// (never-empty) proposal assistant message, seal the token, emit the frame.
async function suspendForConfirm(
  sig: PendingWriteSignal,
  convId: string,
  userId: string,
  now: number,
  system: string,
): Promise<Response> {
  const preview = buildPreview(sig.tool, sig.args);
  const token = sealPendingWrite({
    v: 1, name: sig.tool, args: sig.args, conversationId: convId, userId,
    iat: now, exp: now + PENDING_TTL_MS, nonce: crypto.randomUUID(),
  });
  void system; // system prompt is rebuilt on resume from history; not needed here
  return streamText(convId, preview.summary, {
    t: "pending_write", token, tool: sig.tool, title: preview.title, summary: preview.summary, fields: preview.fields,
  });
}

// Turn 2 confirm: open the token, run resume, stream the result (or cancel/reject).
async function handleConfirm(
  req: Request,
  confirm: { token: string; approve: boolean },
  userId: string,
): Promise<Response> {
  const now = Date.now();
  const opened = openPendingWrite(confirm.token, now);
  if (!opened.ok) {
    console.warn(`[safety] confirm token rejected: ${opened.error}`);
    return new Response(`Yêu cầu xác nhận không hợp lệ: ${opened.error}.`, { status: 400 });
  }
  const signed = opened.value;
  if (signed.userId !== userId) {
    console.warn("[safety] confirm token userId mismatch");
    return new Response("Yêu cầu xác nhận không hợp lệ.", { status: 403 });
  }
  const convId = signed.conversationId;

  const history = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, convId))
    .orderBy(asc(chatMessages.createdAt));
  const lang = readLang(req); // tri-lingual: narrate the result in the user's language (lead pre-flight fix)
  const system = buildSystemPrompt({ lang, now, toolNames: [] });

  const gated = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now, lang }), {
    internal: INTERNAL_TOOLS,
    confirmedAction: { name: signed.name, args: signed.args },
  });
  const outcome = await runResume(signed, confirm.approve, system, history.map((m) => ({ role: m.role, content: m.content })), {
    dispatch: (name, args) => gated(name, args),
    isNonceUsed: (nonce) => isNonceUsed(db, nonce, now),
    recordWrite: (x) => recordWrite(db, userId, x),
  });

  if (outcome.status === "cancelled") return streamText(convId, "Đã huỷ hành động.");
  if (outcome.status === "rejected") return streamText(convId, `Không thực hiện được: ${outcome.reason}.`);

  // executed → final text-only completion, streamed + persisted via the shared streamer.
  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildResumeRequest(MODEL, outcome.messages, {})),
    });
  } catch {
    return new Response(`Đã thực hiện hành động nhưng không tạo được phản hồi (Ollama).`, {
      status: 502, headers: { "x-conversation-id": convId },
    });
  }
  if (!ollamaRes.ok || !ollamaRes.body) {
    return new Response(`Đã thực hiện hành động. (Ollama lỗi ${ollamaRes.status}.)`, {
      status: 502, headers: { "x-conversation-id": convId },
    });
  }
  return streamOllama(ollamaRes, convId);
}
```

> **Wiring notes for the implementer:**
> - `crypto.randomUUID()` is already used elsewhere in this file — no import needed.
> - `buildSystemPrompt` is already imported in `route.ts`. `asc`, `eq`, `db`, `chatMessages`, `chatConversations`, `MODEL`, `OLLAMA_URL` are already in scope.
> - The resume uses `signed.conversationId` (tamper-proof) to load history — no need to trust a client-sent id.
> - The confirm path uses `readLang(req)` (the existing route helper) so the result is narrated in the user's language — the app is tri-lingual (lead pre-flight fix).
> - The `pending_write` frame is emitted via the shared `encodeFrame` (Task 8; SP-4 §2.2 paired-U+001E envelope). The legacy `{i,o}` tokens frame in `streamOllama` stays as SP-1 had it — its migration to `encodeFrame({t:"tokens"})` is SP-4-owned (their §3). **Interim-graceful (verified):** today's ChatClient does `indexOf(U+001E)` → shows the text before it, hides the rest → the paired `pending_write` frame is hidden and the proposal text renders (no card until SP-4's `splitFrames` router lands). **`route.ts` is co-touched by SP-4** (onEvent + trailing tool/cite frames) — additive & non-overlapping; whoever merges second rebases.

- [ ] **Step 4: Run the full suite + typecheck**

Run: `npx vitest run`
Expected: PASS — baseline 398 + SP-2 tests (redact 6, policy 5, token 4, preview 4, audit 4, gate 4, resume 5, frames 2, route confirm 2) = **434**.

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts src/app/api/chat/route.test.ts
git commit -m "feat(agent): SP-2 wire write-gate suspend/confirm into /api/chat"
```

- [ ] **Step 6: Manual smoke checklist (for the user to run when ready — NOT in this session)**

The ops rules forbid starting the dev server here. When the user runs it: (a) ask the model to "tạo card Trello tên X trong list <id>" → expect proposal text + no card created (check Trello); (b) confirm via the FE card (once FE lands) or by POSTing `{confirm:{token,approve:true}}` → expect the card created exactly once + a result message; (c) re-POST the same token → expect "đã được xử lý" (no second card); (d) a normal read ("liệt kê repo GitHub") → unchanged.

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| §3 read/write classification (fail-closed) | Task 2 |
| §4 withSafety gate + PendingWriteSignal | Task 6 |
| §5 encrypted stateless token | Task 3 |
| §6.2 suspend (preview, persist, frame) | Task 9 (`suspendForConfirm`) |
| §6.3 resume (execute-once, text-only, drop reads) | Task 7 + Task 9 (`handleConfirm`) |
| §7 wire contract (frame envelope, union body) | Task 8 (`encodeFrame`) + Task 9 + FE handoff backlog |
| §8.1 redact (result+args+preview+audit) | Task 1, applied in Tasks 4/5/6 |
| §8.2 bound connector output | Task 6 (`withSafety` calls `boundOutput`) |
| §8.3 ground-truth (connector = code preview) | Task 4 |
| §8.4 audit + replay-dedupe | Task 5 |
| §9 multi-step bounded (1 write/turn) | structural: Task 6 throws on first write; Task 7 has no loop |

No gaps.

**2. Placeholder scan:** none — every step has complete code and exact commands.

**3. Type consistency:** `PendingWrite` shape identical in token.ts / resume.ts / route.ts. `resolveKind(name, internal)` signature consistent across policy/gate. `withSafety(inner, opts)` + `confirmedAction.name` consistent across gate/route. `buildResumeMessages`/`buildResumeRequest`/`runResume`/`ResumeDeps` consistent across resume/route. `WRITE_ACTION` / `recordWrite` / `isNonceUsed` consistent across audit/route. Frame key `t:"pending_write"` matches the FE handoff backlog and spec §7.1.

**Refinement vs spec (flagged):** the plan adds `resume.ts` (spec §11 listed 6 files; this is the 7th) so §6.3 is unit-testable, and implements resume as a **single tools-less completion** rather than `runToolRounds([])` — strictly safer (cannot dispatch any tool_call). Both are improvements within the approved design intent; surfaced here per AGENTS Rule 7.

**Lead pre-flight (2026-06-05, applied to this plan):**
1. `handleConfirm` uses `readLang(req)`, not a hardcoded `"vi"` — the app is tri-lingual.
2. The `pending_write` frame is emitted through the shared `src/lib/chat/frames.ts` `encodeFrame` (SP-4's frozen §2.2 envelope), added as **Task 8**. SP-2 lands the `ChatFrame` type + `encodeFrame` (land-first, one source); SP-4 adds `splitFrames`. Interim-graceful on today's ChatClient (verified). `frames.ts` schema is **SP-4-owned** — implemented verbatim, coordinated via `comms/active/sp2-to-sp4-frames.md`.
