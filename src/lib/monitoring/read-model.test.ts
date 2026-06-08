import { describe, expect, test } from "vitest";
import {
  normalizeAgentSession,
  normalizeChatConversation,
  normalizeWorkflowRun,
  isVisible,
  mergeAndSort,
  type MonitoredRun,
  type Viewer,
} from "./read-model";

const viewer: Viewer = { userId: "u1", role: "member" };

describe("normalizeAgentSession", () => {
  test("maps source/principal/dates; latestActivity → title; machineId kept", () => {
    const r = normalizeAgentSession({
      id: "s1",
      source: "local",
      userId: null,
      status: "running",
      latestActivity: "Editing foo.ts",
      machineId: "m1",
      startedAt: new Date("2026-06-07T01:00:00Z"),
      lastActivity: new Date("2026-06-07T02:00:00Z"),
      tokensIn: 10,
      tokensOut: 20,
      costUsd: 0.5,
    });
    expect(r).toEqual<MonitoredRun>({
      id: "s1",
      source: "local",
      title: "Editing foo.ts",
      principal: null,
      status: "running",
      startedAt: "2026-06-07T01:00:00.000Z",
      lastActivity: "2026-06-07T02:00:00.000Z",
      tokensIn: 10,
      tokensOut: 20,
      costUsd: 0.5,
      machineId: "m1",
    });
  });

  test("mcp session carries principal (provenance) and falls back to id for title", () => {
    const r = normalizeAgentSession({
      id: "s2",
      source: "mcp",
      userId: "u9",
      status: null,
      latestActivity: null,
      machineId: null,
      startedAt: null,
      lastActivity: null,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    });
    expect(r.source).toBe("mcp");
    expect(r.principal).toBe("u9");
    expect(r.title).toBe("s2");
  });
});

describe("normalizeChatConversation", () => {
  test("source chat, principal=userId, cost 0 (local model free), tokens from agg", () => {
    const r = normalizeChatConversation(
      {
        id: "c1",
        userId: "u1",
        title: "Hỏi về deploy",
        createdAt: new Date("2026-06-06T00:00:00Z"),
        updatedAt: new Date("2026-06-06T03:00:00Z"),
      },
      { tokensIn: 100, tokensOut: 200 },
    );
    expect(r.source).toBe("chat");
    expect(r.principal).toBe("u1");
    expect(r.title).toBe("Hỏi về deploy");
    expect(r.costUsd).toBe(0);
    expect(r.tokensIn).toBe(100);
    expect(r.tokensOut).toBe(200);
    expect(r.lastActivity).toBe("2026-06-06T03:00:00.000Z");
  });

  test("missing token agg → zeros", () => {
    const r = normalizeChatConversation(
      { id: "c2", userId: "u1", title: "x", createdAt: null, updatedAt: null },
      undefined,
    );
    expect(r.tokensIn).toBe(0);
    expect(r.tokensOut).toBe(0);
  });
});

describe("normalizeWorkflowRun", () => {
  test("source workflow, title from workflow name, lastActivity prefers finishedAt", () => {
    const r = normalizeWorkflowRun({
      id: "r1",
      userId: "u1",
      workflowName: "Daily digest",
      status: "succeeded",
      startedAt: new Date("2026-06-05T08:00:00Z"),
      finishedAt: new Date("2026-06-05T08:05:00Z"),
      createdAt: new Date("2026-06-05T07:59:00Z"),
      tokensIn: 5,
      tokensOut: 7,
      costUsd: 0.01,
    });
    expect(r.source).toBe("workflow");
    expect(r.title).toBe("Daily digest");
    expect(r.principal).toBe("u1");
    expect(r.lastActivity).toBe("2026-06-05T08:05:00.000Z");
  });

  test("falls back to createdAt when not started/finished", () => {
    const r = normalizeWorkflowRun({
      id: "r2",
      userId: "u1",
      workflowName: null,
      status: "queued",
      startedAt: null,
      finishedAt: null,
      createdAt: new Date("2026-06-05T07:00:00Z"),
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    });
    expect(r.title).toBe("r2");
    expect(r.lastActivity).toBe("2026-06-05T07:00:00.000Z");
  });
});

describe("isVisible — Q2 invariant (visibility per source, NOT flattened)", () => {
  const mk = (source: MonitoredRun["source"], principal: string | null): MonitoredRun => ({
    id: "x",
    source,
    title: "x",
    principal,
    status: null,
    startedAt: null,
    lastActivity: null,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    machineId: null,
  });

  test("org-shared sources visible to everyone regardless of principal", () => {
    for (const s of ["local", "claude", "api", "mcp"] as const) {
      expect(isVisible(mk(s, "someone-else"), viewer)).toBe(true);
      expect(isVisible(mk(s, null), viewer)).toBe(true);
    }
  });

  test("chat/workflow visible ONLY to their principal", () => {
    expect(isVisible(mk("chat", "u1"), viewer)).toBe(true);
    expect(isVisible(mk("chat", "u2"), viewer)).toBe(false);
    expect(isVisible(mk("workflow", "u1"), viewer)).toBe(true);
    expect(isVisible(mk("workflow", "u2"), viewer)).toBe(false);
  });
});

describe("mergeAndSort", () => {
  const row = (id: string, lastActivity: string | null): MonitoredRun => ({
    id,
    source: "local",
    title: id,
    principal: null,
    status: null,
    startedAt: null,
    lastActivity,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    machineId: null,
  });

  test("sorts by lastActivity desc, nulls last, applies limit", () => {
    const out = mergeAndSort(
      [row("a", "2026-06-01T00:00:00Z"), row("b", null), row("c", "2026-06-03T00:00:00Z")],
      2,
    );
    expect(out.map((r) => r.id)).toEqual(["c", "a"]);
  });
});
