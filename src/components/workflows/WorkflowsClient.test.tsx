// RTL behaviour tests for WorkflowsClient.
// Mocks: fetch, useWorkflowEvents, next/link
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import type { Workflow, WorkflowRun } from "@/db/schema";

// ---- Mocks (hoisted by vitest before imports) ----

const wfEventsState = {
  steps: [] as unknown[],
  runStatus: null as string | null,
  activeRunId: null as string | null,
};

vi.mock("@/hooks/useWorkflowEvents", () => ({
  useWorkflowEvents: () => wfEventsState,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-label": ariaLabel,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-label"?: string;
    [k: string]: unknown;
  }) => (
    <a href={href} className={className} aria-label={ariaLabel} {...rest}>
      {children}
    </a>
  ),
}));

import { WorkflowsClient } from "./WorkflowsClient";

// ---- Helpers ----

function mkWorkflow(over: Partial<Workflow> = {}): Workflow {
  return {
    id: "w1",
    userId: "u1",
    name: "Demo Workflow",
    description: "desc",
    graph: { nodes: [], edges: [] },
    isTemplate: false,
    status: "active",
    version: 1,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...over,
  };
}

function mkRun(over: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "r1",
    workflowId: "w1",
    userId: "u1",
    trigger: "manual",
    status: "succeeded",
    dryRun: false,
    graphSnapshot: { nodes: [], edges: [] },
    context: null,
    error: null,
    scheduleId: null,
    scheduledFor: null,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    startedAt: new Date("2026-01-01"),
    finishedAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    ...over,
  };
}

function mockFetch(wfs: Workflow[], runs: WorkflowRun[], templates: unknown[] = []) {
  globalThis.fetch = vi.fn(async (url: RequestInfo, opts?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/workflows/runs")) {
      return { ok: true, json: async () => runs } as Response;
    }
    if (u.includes("/api/workflows/templates") && opts?.method === "POST") {
      return { ok: true, json: async () => ({ id: "new-wf" }) } as Response;
    }
    if (u.includes("/api/workflows/templates")) {
      return { ok: true, json: async () => templates } as Response;
    }
    if (u.endsWith("/api/workflows")) {
      return { ok: true, json: async () => wfs } as Response;
    }
    if (u.includes("/run")) {
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }
    if (u.includes("/clone")) {
      return { ok: true, json: async () => ({ id: "w2" }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

function ui() {
  return render(
    <I18nProvider lang="vi">
      <WorkflowsClient />
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

describe("WorkflowsClient — renders list", () => {
  test("shows workflow name and last-run status badge", async () => {
    mockFetch([mkWorkflow()], [mkRun({ status: "succeeded" })]);
    ui();
    await waitFor(() => expect(screen.getByText("Demo Workflow")).toBeTruthy());
    expect(screen.getByText("Thành công")).toBeTruthy();
  });

  test("empty state when no workflows", async () => {
    mockFetch([], []);
    ui();
    await waitFor(() => expect(screen.getByText("Chưa có workflow nào")).toBeTruthy());
  });

  test("needs-attention badge for failed last run", async () => {
    mockFetch([mkWorkflow()], [mkRun({ status: "failed" })]);
    ui();
    await waitFor(() => expect(screen.getByText("Demo Workflow")).toBeTruthy());
    expect(screen.getByLabelText("Cần xem lại")).toBeTruthy();
    expect(screen.getByText("Thất bại")).toBeTruthy();
  });
});

describe("WorkflowsClient — button actions", () => {
  test("Run now button POSTs to /api/workflows/[id]/run", async () => {
    mockFetch([mkWorkflow()], []);
    ui();
    await waitFor(() => expect(screen.getByLabelText("Chạy ngay")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Chạy ngay"));
    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
      // The run call is POST /api/workflows/w1/run
      const runCall = calls.find(([u]) => String(u).includes("/w1/run"));
      expect(runCall).toBeTruthy();
      expect(String(runCall![0])).toContain("/run");
    });
  });

  test("Clone button POSTs to /api/workflows/[id]/clone", async () => {
    mockFetch([mkWorkflow()], []);
    ui();
    await waitFor(() => screen.getByText("Demo Workflow"));
    // Open the row actions dropdown
    fireEvent.click(screen.getByLabelText("Thao tác"));
    await waitFor(() => expect(screen.getByLabelText("Nhân bản")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Nhân bản"));
    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
      const cloneCall = calls.find(([u]) => String(u).includes("/clone"));
      expect(cloneCall).toBeTruthy();
      expect(cloneCall![1]?.method).toBe("POST");
    });
  });

  test("New-from-template opens modal and lists templates", async () => {
    const tpls = [{ id: "t1", name: "Digest đêm", description: "desc t1", moatLeaning: true }];
    mockFetch([], [], tpls);
    ui();
    await waitFor(() => screen.getByText("Từ mẫu"));
    fireEvent.click(screen.getByText("Từ mẫu"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    // Matte Dark design: overlays dim, they never blur (no glassmorphism — QA A2).
    expect(screen.getByRole("dialog").className).not.toMatch(/backdrop-blur/);
    expect(screen.getByText("Digest đêm")).toBeTruthy();
  });

  test("Use template POSTs to /api/workflows/templates", async () => {
    const tpls = [{ id: "t1", name: "Digest đêm", description: "desc t1", moatLeaning: true }];
    mockFetch([], [], tpls);
    ui();
    await waitFor(() => screen.getByText("Từ mẫu"));
    fireEvent.click(screen.getByText("Từ mẫu"));
    await waitFor(() => screen.getByText("Dùng mẫu này"));
    fireEvent.click(screen.getByText("Dùng mẫu này"));
    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
      const tplCall = calls.find(([u, opts]) =>
        String(u).includes("/api/workflows/templates") && opts?.method === "POST",
      );
      expect(tplCall).toBeTruthy();
    });
  });

  test("View button links to /workflows/[id]", async () => {
    mockFetch([mkWorkflow({ id: "w42" })], []);
    ui();
    await waitFor(() => screen.getByText("Demo Workflow"));
    // Open the row actions dropdown
    fireEvent.click(screen.getByLabelText("Thao tác"));
    await waitFor(() => expect(screen.getByLabelText("Xem chi tiết")).toBeTruthy());
    const link = screen.getByLabelText("Xem chi tiết") as HTMLAnchorElement;
    expect(link.href).toContain("/workflows/w42");
  });
});
