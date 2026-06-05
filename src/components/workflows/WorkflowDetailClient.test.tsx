// RTL behaviour tests for WorkflowDetailClient.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import type { Workflow, WorkflowRun, WorkflowRunStep, WorkflowSchedule } from "@/db/schema";

// ---- Mocks ----

const wfEventsState = {
  steps: [] as { nodeId: string; status: string; seq: number }[],
  runStatus: null as string | null,
  activeRunId: null as string | null,
};
vi.mock("@/hooks/useWorkflowEvents", () => ({
  useWorkflowEvents: () => wfEventsState,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import { WorkflowDetailClient } from "./WorkflowDetailClient";

// ---- Factories ----

function mkWorkflow(over: Partial<Workflow> = {}): Workflow {
  return {
    id: "wf1", userId: "u1", name: "My WF", description: "test wf",
    graph: { nodes: [], edges: [] }, isTemplate: false, status: "active",
    version: 1, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
    ...over,
  };
}

function mkRun(over: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "run1", workflowId: "wf1", userId: "u1", trigger: "manual",
    status: "succeeded", graphSnapshot: { nodes: [], edges: [] },
    context: null, error: null, scheduleId: null, scheduledFor: null,
    tokensIn: 0, tokensOut: 0, costUsd: 0,
    startedAt: new Date("2026-01-01T09:00:00Z"),
    finishedAt: new Date("2026-01-01T09:01:00Z"),
    createdAt: new Date("2026-01-01"),
    ...over,
  };
}

function mkStep(over: Partial<WorkflowRunStep> = {}): WorkflowRunStep {
  return {
    id: "s1", runId: "run1", nodeId: "n1", parentStepId: null, seq: 0, kind: "connector",
    status: "succeeded", input: null, output: { count: 3 }, error: null,
    tokensIn: 0, tokensOut: 0, costUsd: 0,
    startedAt: new Date("2026-01-01T09:00:00Z"),
    finishedAt: new Date("2026-01-01T09:00:30Z"),
    createdAt: new Date("2026-01-01"),
    ...over,
  };
}

function mkSchedule(over: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
  return {
    id: "sch1", workflowId: "wf1", userId: "u1", cron: "0 9 * * 1-5",
    timezone: "Asia/Ho_Chi_Minh", enabled: true, catchupPolicy: "skip",
    nextRunAt: new Date("2026-01-06T02:00:00Z"), lastRunAt: null,
    missedCount: 0, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
    ...over,
  };
}

type FetchSetup = {
  workflows?: Workflow[];
  runs?: WorkflowRun[];
  schedules?: WorkflowSchedule[];
  runDetail?: { run: WorkflowRun; steps: WorkflowRunStep[] };
};

function mockFetch(setup: FetchSetup) {
  const { workflows = [], runs = [], schedules = [], runDetail } = setup;
  globalThis.fetch = vi.fn(async (url: RequestInfo, opts?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/workflows/runs/")) {
      return { ok: true, json: async () => runDetail ?? { run: runs[0], steps: [] } } as Response;
    }
    if (u.includes("/api/workflows/runs")) {
      return { ok: true, json: async () => runs } as Response;
    }
    if (u.includes("/api/workflows/schedules") && opts?.method === "POST") {
      return { ok: true, json: async () => ({ id: "sch-new", nextRunAt: new Date() }) } as Response;
    }
    if (u.includes("/api/workflows/schedules")) {
      return { ok: true, json: async () => schedules } as Response;
    }
    if (u.includes("/api/workflows") && !u.includes("/run") && !u.includes("/clone") && !u.includes("/schedules") && !u.includes("/runs")) {
      return { ok: true, json: async () => workflows } as Response;
    }
    if (u.includes("/run") && opts?.method === "POST") {
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

function ui(id = "wf1") {
  return render(
    <I18nProvider lang="vi">
      <WorkflowDetailClient workflowId={id} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  wfEventsState.steps = [];
  wfEventsState.runStatus = null;
  wfEventsState.activeRunId = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---- Tests ----

describe("WorkflowDetailClient — renders run history", () => {
  test("shows workflow name and run rows", async () => {
    mockFetch({ workflows: [mkWorkflow()], runs: [mkRun()] });
    ui();
    await waitFor(() => expect(screen.getByText("My WF")).toBeTruthy());
    expect(screen.getByText("Thủ công")).toBeTruthy();
    expect(screen.getByText("Thành công")).toBeTruthy();
  });

  test("no-runs empty state", async () => {
    mockFetch({ workflows: [mkWorkflow()], runs: [] });
    ui();
    await waitFor(() => expect(screen.getByText("Chưa có lần chạy nào.")).toBeTruthy());
  });

  test("not-found shows error", async () => {
    mockFetch({ workflows: [] });
    ui("nonexistent");
    await waitFor(() => expect(screen.getByText("Không tìm thấy workflow.")).toBeTruthy());
  });
});

describe("WorkflowDetailClient — expand run → steps", () => {
  test("clicking run row fetches and shows steps", async () => {
    const run = mkRun();
    const step = mkStep();
    mockFetch({
      workflows: [mkWorkflow()],
      runs: [run],
      runDetail: { run, steps: [step] },
    });
    ui();
    await waitFor(() => screen.getByText("Thủ công"));
    // Click the row to expand
    fireEvent.click(screen.getByText("Thủ công").closest("tr")!);
    await waitFor(() => {
      // Step row should appear (aria-label on the ol)
      expect(screen.getByRole("list", { name: "run steps" })).toBeTruthy();
    });
    // nodeId "n1" should be visible
    expect(screen.getByText("n1")).toBeTruthy();
  });

  test("clicking step row expands output", async () => {
    const run = mkRun();
    const step = mkStep({ output: { count: 3 } });
    mockFetch({ workflows: [mkWorkflow()], runs: [run], runDetail: { run, steps: [step] } });
    ui();
    await waitFor(() => screen.getByText("Thủ công"));
    fireEvent.click(screen.getByText("Thủ công").closest("tr")!);
    await waitFor(() => screen.getByText("n1"));
    // click step row button to expand output
    fireEvent.click(screen.getByRole("button", { name: /n1/ }));
    await waitFor(() => {
      expect(screen.getByText(/count/)).toBeTruthy();
    });
  });
});

describe("WorkflowDetailClient — Run now button", () => {
  test("POSTs to /api/workflows/[id]/run", async () => {
    mockFetch({ workflows: [mkWorkflow()], runs: [] });
    ui();
    await waitFor(() => screen.getByText("Chạy ngay"));
    fireEvent.click(screen.getByText("Chạy ngay"));
    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
      const runCall = calls.find(([u, o]) => String(u).includes("/run") && o?.method === "POST");
      expect(runCall).toBeTruthy();
    });
  });
});

describe("WorkflowDetailClient — schedule section", () => {
  test("shows schedules when present", async () => {
    mockFetch({ workflows: [mkWorkflow()], runs: [], schedules: [mkSchedule()] });
    ui();
    await waitFor(() => screen.getByText("My WF"));
    expect(screen.getByText("0 9 * * 1-5")).toBeTruthy();
  });

  test("Add schedule form POSTs cron to /api/workflows/schedules", async () => {
    mockFetch({ workflows: [mkWorkflow()], runs: [], schedules: [] });
    ui();
    await waitFor(() => screen.getByText("Thêm lịch"));
    fireEvent.click(screen.getByText("Thêm lịch"));
    await waitFor(() => screen.getByLabelText("Cron (5 trường)"));
    fireEvent.change(screen.getByLabelText("Cron (5 trường)"), {
      target: { value: "0 9 * * 1-5" },
    });
    fireEvent.click(screen.getByText("Lưu lịch"));
    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
      const schCall = calls.find(([u, o]) =>
        String(u).includes("/api/workflows/schedules") && o?.method === "POST",
      );
      expect(schCall).toBeTruthy();
      const body = JSON.parse(schCall![1].body as string) as { workflowId: string; cron: string };
      expect(body.cron).toBe("0 9 * * 1-5");
    });
  });
});
