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

const mockRouterPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
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
  schedPatchOk?: boolean;
  schedPatchBody?: Partial<WorkflowSchedule>;
  schedDeleteOk?: boolean;
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
    // PATCH schedules/[id]
    if (u.match(/\/api\/workflows\/schedules\/\w/) && opts?.method === "PATCH") {
      const ok = setup.schedPatchOk ?? true;
      return {
        ok,
        json: async () => ok ? { ...mkSchedule(), ...(setup.schedPatchBody ?? {}) } : {},
      } as Response;
    }
    // DELETE schedules/[id]
    if (u.match(/\/api\/workflows\/schedules\/\w/) && opts?.method === "DELETE") {
      const ok = setup.schedDeleteOk ?? true;
      return { ok, json: async () => ({}) } as Response;
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

describe("WorkflowDetailClient — schedule actions", () => {
  test("toggle success: enabled → disabled", async () => {
    mockFetch({
      workflows: [mkWorkflow()],
      runs: [],
      schedules: [mkSchedule({ enabled: true })],
      schedPatchBody: { enabled: false },
    });
    ui();
    await waitFor(() => screen.getByText("My WF"));

    // When enabled=true, toggle button aria-label is "Đã tắt" (click to disable)
    fireEvent.click(screen.getByRole("button", { name: "Đã tắt" }));

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
      const patchCall = calls.find(([u, o]) =>
        String(u).match(/\/api\/workflows\/schedules\/\w/) && o?.method === "PATCH",
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1].body as string) as { enabled: boolean };
      expect(body.enabled).toBe(false);
    });

    // After successful PATCH, badge in enabled column must reflect new state
    await waitFor(() =>
      expect(screen.getByText("Đã tắt")).toBeTruthy(),
    );
  });

  test("toggle failure: shows error banner", async () => {
    mockFetch({
      workflows: [mkWorkflow()],
      runs: [],
      schedules: [mkSchedule({ enabled: true })],
      schedPatchOk: false,
    });
    ui();
    await waitFor(() => screen.getByText("My WF"));

    fireEvent.click(screen.getByRole("button", { name: "Đã tắt" }));

    await waitFor(() => {
      expect(screen.getByText("Đổi trạng thái thất bại.")).toBeTruthy();
    });
  });

  test("delete confirmed → success: row removed from DOM", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch({
      workflows: [mkWorkflow()],
      runs: [],
      schedules: [mkSchedule()],
    });
    ui();
    await waitFor(() => screen.getByText("0 9 * * 1-5"));

    fireEvent.click(screen.getByRole("button", { name: "Xoá lịch" }));

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
      const delCall = calls.find(([u, o]) =>
        String(u).match(/\/api\/workflows\/schedules\/\w/) && o?.method === "DELETE",
      );
      expect(delCall).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.queryByText("0 9 * * 1-5")).toBeNull();
    });
  });

  test("delete cancelled: no DELETE call, row stays in DOM", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockFetch({
      workflows: [mkWorkflow()],
      runs: [],
      schedules: [mkSchedule()],
    });
    ui();
    await waitFor(() => screen.getByText("0 9 * * 1-5"));

    fireEvent.click(screen.getByRole("button", { name: "Xoá lịch" }));

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
      const delCall = calls.find(
        ([u, o]) => String(u).match(/\/api\/workflows\/schedules\/\w/) && (o as RequestInit)?.method === "DELETE",
      );
      expect(delCall).toBeUndefined();
      expect(screen.getByText("0 9 * * 1-5")).toBeTruthy();
    });
  });

  test("delete failure: shows error banner", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch({
      workflows: [mkWorkflow()],
      runs: [],
      schedules: [mkSchedule()],
      schedDeleteOk: false,
    });
    ui();
    await waitFor(() => screen.getByText("0 9 * * 1-5"));

    fireEvent.click(screen.getByRole("button", { name: "Xoá lịch" }));

    await waitFor(() => {
      expect(screen.getByText("Xoá lịch thất bại.")).toBeTruthy();
    });
  });

  test("cron inline edit success: PATCH called, row shows new cron", async () => {
    mockFetch({
      workflows: [mkWorkflow()],
      runs: [],
      schedules: [mkSchedule({ cron: "0 9 * * 1-5" })],
      schedPatchBody: { cron: "0 12 * * *" },
    });
    ui();
    await waitFor(() => screen.getByText("0 9 * * 1-5"));

    // Click cron cell button to open inline editor
    fireEvent.click(screen.getByTitle("Click để sửa"));

    // Input should appear
    await waitFor(() => screen.getByRole("textbox"));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "0 12 * * *" } });
    fireEvent.blur(screen.getByRole("textbox"));

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
      const patchCall = calls.find(([u, o]) =>
        String(u).match(/\/api\/workflows\/schedules\/\w/) && o?.method === "PATCH",
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall![1].body as string) as { cron: string };
      expect(body.cron).toBe("0 12 * * *");
    });
    await waitFor(() => {
      expect(screen.getByText("0 12 * * *")).toBeTruthy();
    });
  });

  test("cron inline edit failure: shows error banner", async () => {
    mockFetch({
      workflows: [mkWorkflow()],
      runs: [],
      schedules: [mkSchedule({ cron: "0 9 * * 1-5" })],
      schedPatchOk: false,
    });
    ui();
    await waitFor(() => screen.getByText("0 9 * * 1-5"));

    fireEvent.click(screen.getByTitle("Click để sửa"));
    await waitFor(() => screen.getByRole("textbox"));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "0 12 * * *" } });
    fireEvent.blur(screen.getByRole("textbox"));

    await waitFor(() => {
      expect(screen.getByText("Lưu cron thất bại.")).toBeTruthy();
    });
  });
});
