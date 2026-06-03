import { expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import type { Stats } from "@/lib/stats.types";

// Mock the export helpers so the test asserts what the buttons hand them,
// without touching Blob/anchor download machinery.
const downloadCsv = vi.fn();
const downloadPdf = vi.fn();
vi.mock("@/lib/export", () => ({
  downloadCsv: (...args: unknown[]) => downloadCsv(...args),
  downloadPdf: (...args: unknown[]) => downloadPdf(...args),
}));

// Import after the mock is registered.
import { DashboardExport } from "./DashboardExport";

const stats: Stats = {
  totals: {
    sessions: 7,
    running: 1,
    idle: 2,
    done: 4,
    messages: 120,
    toolCalls: 333,
    subAgents: 5,
    tokensIn: 10000,
    tokensOut: 5000,
    costUsd: 12.5,
    avgDurationMs: 60000,
  },
  byStatus: {},
  byModel: {},
  byBranch: {},
  byProject: [],
  toolLeaderboard: [
    { name: "Bash", count: 200, errors: 1, errorRate: 0.005, avgDurationMs: 1200 },
    { name: "Read", count: 80, errors: 0, errorRate: 0, avgDurationMs: 300 },
  ],
  modelComparison: [
    {
      model: "claude-opus-4-20250101",
      sessions: 7,
      tokens: 15000,
      costUsd: 12.5,
      avgDurationMs: 60000,
      tokensPerMin: 250,
      doneRate: 0.57,
    },
  ],
  heatmap: [],
  activity: [],
  topByDuration: [],
  topByTokens: [],
};

function wrap() {
  return render(
    <I18nProvider lang="vi">
      <DashboardExport stats={stats} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  downloadCsv.mockClear();
  downloadPdf.mockClear();
});

test("CSV button exports model-comparison rows with the locked columns", () => {
  wrap();
  fireEvent.click(screen.getByText("CSV session"));
  expect(downloadCsv).toHaveBeenCalledTimes(1);
  const [filename, rows, columns] = downloadCsv.mock.calls[0];
  expect(filename).toBe("dashboard.csv");
  expect(rows).toBe(stats.modelComparison);
  expect(columns).toEqual([
    "model",
    "sessions",
    "tokens",
    "costUsd",
    "avgDurationMs",
    "tokensPerMin",
    "doneRate",
  ]);
});

test("PDF button exports a summary body covering totals and top items", () => {
  wrap();
  fireEvent.click(screen.getByText("PDF báo cáo"));
  expect(downloadPdf).toHaveBeenCalledTimes(1);
  const [filename, title, body] = downloadPdf.mock.calls[0];
  expect(filename).toBe("dashboard.pdf");
  expect(title).toBe("LAAM — Báo cáo");
  // body mentions the cost total, the top model (shortened), and a top tool
  expect(body).toContain("$12.50");
  expect(body).toContain("opus-4");
  expect(body).toContain("Bash");
});
